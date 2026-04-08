import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  ConversationChannel,
  ConversationMessageOrigin,
  ConversationSenderType,
  CustomerSocialPlatform,
  Prisma
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { normalizeVietnamPhone } from '../../common/validation/phone.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { CrmContractsService } from '../crm/crm-contracts.service';
import { ZaloAccountAssignmentService } from '../zalo/zalo-account-assignment.service';
import { ZaloAutomationRealtimeService } from '../zalo/zalo-automation-realtime.service';

type ThreadFilters = {
  channel?: ConversationChannel | 'ALL';
  channelAccountId?: string;
  customerId?: string;
  tags?: string[];
};

type IngestExternalMessagePayload = {
  channel: ConversationChannel;
  channelAccountId?: string;
  externalThreadId: string;
  externalMessageId?: string;
  senderType: ConversationSenderType;
  origin?: ConversationMessageOrigin;
  senderExternalId?: string;
  senderName?: string;
  content?: string;
  contentType?: string;
  sentAt?: Date;
  customerId?: string;
  customerDisplayName?: string;
  metadataJson?: Prisma.InputJsonValue;
  attachmentsJson?: Prisma.InputJsonValue;
};

type ThreadMatchStatus = 'matched' | 'unmatched' | 'suggested';

type ThreadSuggestion = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  ownerStaffId: string | null;
};

type ThreadIdentityHint = {
  platform: CustomerSocialPlatform;
  externalUserId: string;
};

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(ZaloAccountAssignmentService) private readonly zaloAssignment: ZaloAccountAssignmentService,
    @Inject(ZaloAutomationRealtimeService) private readonly zaloRealtime: ZaloAutomationRealtimeService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService,
    @Optional() @Inject(CrmContractsService) private readonly crmContractsService?: CrmContractsService
  ) {}

  async listThreads(query: PaginationQueryDto, filters: ThreadFilters = {}) {
    const take = Math.min(Math.max(query.limit ?? 30, 1), 200);
    const keyword = query.q?.trim();
    const filterTags = this.parseThreadTags(filters.tags);

    const where: Prisma.ConversationThreadWhereInput = {};

    if (filters.channel && filters.channel !== 'ALL') {
      where.channel = filters.channel;
    }

    if (filters.channelAccountId) {
      where.channelAccountId = filters.channelAccountId;
    }

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (keyword) {
      where.OR = [
        { customerDisplayName: { contains: keyword, mode: 'insensitive' } },
        { externalThreadId: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    if (filterTags.length > 0) {
      this.pushAndConstraint(where, {
        OR: filterTags.map((tag) => ({
          metadataJson: {
            path: ['tags'],
            array_contains: [tag]
          }
        }))
      });
    }

    const zaloScope = await this.resolveZaloThreadScope(filters);
    if (zaloScope.mode === 'DENY') {
      return {
        items: [],
        nextCursor: null,
        limit: take
      };
    }
    if (zaloScope.mode === 'WHERE') {
      this.pushAndConstraint(where, zaloScope.constraint);
    }

    const rows = await this.prisma.client.conversationThread.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true
          }
        },
        channelAccount: {
          select: {
            id: true,
            accountType: true,
            displayName: true,
            zaloUid: true,
            status: true
          }
        },
        evaluations: {
          orderBy: { evaluatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            verdict: true,
            score: true,
            summary: true,
            evaluatedAt: true
          }
        }
      },
      orderBy: { lastMessageAt: 'desc' },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const [threadSuggestions, threadIdentityMatches] = await Promise.all([
      this.resolveThreadSuggestions(items),
      this.resolveThreadIdentityMatches(items)
    ]);

    return {
      items: items.map((item) => this.toThreadListItem(item, threadSuggestions, threadIdentityMatches)),
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      limit: take
    };
  }

  async createThread(payload: Record<string, unknown>) {
    const channel = this.parseChannel(payload.channel, ConversationChannel.ZALO_PERSONAL);
    const externalThreadId = this.requiredString(payload.externalThreadId, 'Thiếu externalThreadId.');
    const channelAccountId = this.optionalString(payload.channelAccountId) ?? null;
    const tags = this.parseThreadTags(payload.tags);

    if (this.isZaloChannel(channel) && channelAccountId) {
      await this.zaloAssignment.assertCanChatAccount(channelAccountId);
    }

    const metadataJson = this.mergeThreadMetadata(payload.metadataJson as Prisma.InputJsonValue | undefined, tags);

    const created = await this.prisma.client.conversationThread.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        channel,
        channelAccountId,
        externalThreadId,
        customerId: this.optionalString(payload.customerId) ?? null,
        customerDisplayName: this.optionalString(payload.customerDisplayName) ?? null,
        metadataJson,
        lastMessageAt: payload.lastMessageAt ? this.parseDate(payload.lastMessageAt, 'lastMessageAt') : undefined,
        unreadCount: this.parseInt(payload.unreadCount, 0),
        isReplied: this.parseBoolean(payload.isReplied, true)
      }
    });

    return {
      ...created,
      tags: this.readThreadTags(created.metadataJson)
    };
  }

  async updateThreadTags(threadId: string, payload: Record<string, unknown>) {
    const thread = await this.prisma.client.conversationThread.findFirst({ where: { id: threadId } });
    if (!thread) {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    if (this.isZaloChannel(thread.channel) && thread.channelAccountId) {
      await this.zaloAssignment.assertCanChatAccount(thread.channelAccountId);
    }

    const tags = this.parseThreadTags(payload.tags);
    const metadataJson = this.mergeThreadMetadata(thread.metadataJson as Prisma.InputJsonValue | undefined, tags);
    const updated = await this.prisma.client.conversationThread.update({
      where: { id: threadId },
      data: {
        metadataJson
      }
    });

    return {
      ...updated,
      tags: this.readThreadTags(updated.metadataJson)
    };
  }

  async linkThreadCustomer(threadId: string, payload: Record<string, unknown>) {
    const id = this.requiredString(threadId, 'Thiếu threadId.');
    const customerId = this.optionalString(payload.customerId);
    const customerPhoneRaw = this.optionalString(payload.customerPhone);
    const normalizedCustomerPhone = customerPhoneRaw ? normalizeVietnamPhone(customerPhoneRaw) : null;
    if (customerPhoneRaw && !normalizedCustomerPhone) {
      throw new BadRequestException('Số điện thoại khách hàng không hợp lệ.');
    }
    if (!customerId && !normalizedCustomerPhone) {
      throw new BadRequestException('Thiếu customerPhone hoặc customerId.');
    }
    const thread = await this.prisma.client.conversationThread.findFirst({ where: { id } });
    if (!thread) {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    if (this.isZaloChannel(thread.channel) && thread.channelAccountId) {
      await this.zaloAssignment.assertCanChatAccount(thread.channelAccountId);
    }

    const customer = await this.prisma.client.customer.findFirst({
      where: customerId
        ? { id: customerId }
        : { phoneNormalized: normalizedCustomerPhone! },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        ownerStaffId: true
      }
    });
    if (!customer) {
      throw new NotFoundException('Không tìm thấy khách hàng.');
    }

    await this.prisma.client.$transaction(async (tx) => {
      const identityHint = this.resolveThreadIdentityHint(thread);
      if (identityHint) {
        await this.ensureThreadIdentityOwnership(tx, identityHint, customer.id, thread);
      }

      await tx.conversationThread.updateMany({
        where: { id },
        data: {
          customerId: customer.id,
          customerDisplayName: customer.fullName || thread.customerDisplayName
        }
      });
    });

    const responseThread = await this.loadThreadWithRelations(id);
    return this.toThreadListItem(responseThread);
  }

  async quickCreateCustomerFromThread(threadId: string, payload: Record<string, unknown>) {
    const id = this.requiredString(threadId, 'Thiếu threadId.');
    const currentThread = await this.prisma.client.conversationThread.findFirst({ where: { id } });
    if (!currentThread) {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    if (this.isZaloChannel(currentThread.channel) && currentThread.channelAccountId) {
      await this.zaloAssignment.assertCanChatAccount(currentThread.channelAccountId);
    }

    const inputPhone = this.optionalString(payload.phone);
    const normalizedPhone = normalizeVietnamPhone(inputPhone);
    if (inputPhone && !normalizedPhone) {
      throw new BadRequestException('Số điện thoại không hợp lệ.');
    }
    const normalizedEmail = this.normalizeEmail(this.optionalString(payload.email));
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    const defaultCustomerStage = this.resolveDefaultTaxonomyValue(salesPolicy.customerTaxonomy.stages);
    const defaultCustomerSource = this.resolveDefaultTaxonomyValue(salesPolicy.customerTaxonomy.sources);

    const quickCreateResult = await this.prisma.client.$transaction(async (tx) => {
      const thread = await tx.conversationThread.findFirst({
        where: { id },
        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
              ownerStaffId: true
            }
          }
        }
      });
      if (!thread) {
        throw new NotFoundException('Không tìm thấy hội thoại.');
      }

      if (thread.customerId && thread.customer) {
        return {
          deduplicated: true,
          customer: thread.customer
        };
      }

      const identityHint = this.resolveThreadIdentityHint(thread);
      if (identityHint) {
        const existingIdentity = await tx.customerSocialIdentity.findFirst({
          where: {
            platform: identityHint.platform,
            externalUserId: identityHint.externalUserId
          },
          select: {
            customerId: true
          }
        });

        if (existingIdentity?.customerId) {
          const existingCustomer = await tx.customer.findFirst({
            where: { id: existingIdentity.customerId },
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
              ownerStaffId: true
            }
          });
          if (existingCustomer) {
            await tx.conversationThread.updateMany({
              where: { id: thread.id },
              data: {
                customerId: existingCustomer.id,
                customerDisplayName: existingCustomer.fullName || thread.customerDisplayName
              }
            });
            return {
              deduplicated: true,
              customer: existingCustomer
            };
          }
        }
      }

      const existingCustomer = await this.findCustomerByContactTx(tx, normalizedPhone, normalizedEmail);
      const customer = existingCustomer ?? await tx.customer.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          fullName:
            this.optionalString(payload.fullName)
            || this.optionalString(thread.customerDisplayName)
            || `Khách từ ${this.formatChannelLabel(thread.channel)} ${thread.externalThreadId.slice(-6)}`,
          phone: normalizedPhone ?? null,
          phoneNormalized: normalizedPhone ?? null,
          email: normalizedEmail ?? null,
          emailNormalized: normalizedEmail ?? null,
          source: this.resolveConfiguredTaxonomyValue(
            this.optionalString(payload.source) ?? this.resolveCustomerSourceByChannel(thread.channel, defaultCustomerSource),
            salesPolicy.customerTaxonomy.sources
          ) ?? defaultCustomerSource ?? null,
          customerStage: this.resolveConfiguredTaxonomyValue(
            this.optionalString(payload.customerStage),
            salesPolicy.customerTaxonomy.stages
          ) ?? defaultCustomerStage ?? null,
          ownerStaffId: this.optionalString(payload.ownerStaffId) ?? null,
          segment: this.optionalString(payload.segment) ?? null,
          needsSummary: this.optionalString(payload.needsSummary) ?? null
        },
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          ownerStaffId: true
        }
      });

      if (identityHint) {
        await this.ensureThreadIdentityOwnership(tx, identityHint, customer.id, thread);
      }

      await tx.conversationThread.updateMany({
        where: { id: thread.id },
        data: {
          customerId: customer.id,
          customerDisplayName: customer.fullName || thread.customerDisplayName
        }
      });

      return {
        deduplicated: Boolean(existingCustomer),
        customer
      };
    });

    const linkedThread = await this.loadThreadWithRelations(id);
    return {
      deduplicated: quickCreateResult.deduplicated,
      customer: quickCreateResult.customer,
      thread: this.toThreadListItem(linkedThread)
    };
  }

  async listMessages(threadId: string, query: PaginationQueryDto) {
    const thread = await this.prisma.client.conversationThread.findFirst({ where: { id: threadId } });
    if (!thread) {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    if (this.isZaloChannel(thread.channel) && thread.channelAccountId) {
      await this.zaloAssignment.assertCanReadAccount(thread.channelAccountId);
    }

    const take = Math.min(Math.max(query.limit ?? 50, 1), 500);
    const keyword = query.q?.trim();

    const where: Prisma.ConversationMessageWhereInput = {
      threadId
    };

    if (keyword) {
      where.OR = [
        { content: { contains: keyword, mode: 'insensitive' } },
        { senderName: { contains: keyword, mode: 'insensitive' } }
      ];
    }

    const rows = await this.prisma.client.conversationMessage.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      limit: take
    };
  }

  async markThreadAsRead(threadId: string) {
    const id = this.requiredString(threadId, 'Thiếu threadId.');
    const thread = await this.prisma.client.conversationThread.findFirst({ where: { id } });
    if (!thread) {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    if (this.isZaloChannel(thread.channel) && thread.channelAccountId) {
      await this.zaloAssignment.assertCanReadAccount(thread.channelAccountId);
    }

    if ((thread.unreadCount ?? 0) > 0) {
      await this.prisma.client.conversationThread.updateMany({
        where: { id },
        data: {
          unreadCount: 0
        }
      });
    }

    return {
      threadId: id,
      unreadCount: 0
    };
  }

  async appendMessage(threadId: string, payload: Record<string, unknown>) {
    const thread = await this.prisma.client.conversationThread.findFirst({ where: { id: threadId } });
    if (!thread) {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    if (this.isZaloChannel(thread.channel) && thread.channelAccountId) {
      await this.zaloAssignment.assertCanChatAccount(thread.channelAccountId);
    }

    const senderType = this.parseSenderType(payload.senderType, ConversationSenderType.AGENT);
    const origin = this.parseMessageOrigin(payload.origin, this.defaultOriginBySenderType(senderType));
    let senderName = this.optionalString(payload.senderName) ?? undefined;
    if (senderType === ConversationSenderType.AGENT && !senderName) {
      senderName = (await this.resolveCurrentSenderDisplayName()) ?? undefined;
    }

    const message = await this.createOrReuseMessage({
      channel: thread.channel,
      channelAccountId: thread.channelAccountId ?? undefined,
      externalThreadId: thread.externalThreadId,
      externalMessageId: this.optionalString(payload.externalMessageId) ?? undefined,
      senderType,
      origin,
      senderExternalId: this.optionalString(payload.senderExternalId) ?? undefined,
      senderName,
      content: this.optionalString(payload.content) ?? '',
      contentType: this.optionalString(payload.contentType) ?? 'TEXT',
      sentAt: payload.sentAt ? this.parseDate(payload.sentAt, 'sentAt') : new Date(),
      attachmentsJson: (payload.attachmentsJson as Prisma.InputJsonValue | undefined) ?? undefined,
      customerDisplayName: thread.customerDisplayName ?? undefined,
      customerId: thread.customerId ?? undefined,
      metadataJson: (payload.metadataJson as Prisma.InputJsonValue | undefined) ?? undefined
    }, thread);

    return message;
  }

  async ingestExternalMessage(payload: IngestExternalMessagePayload) {
    const thread = await this.resolveThreadForIngestion(payload);
    return this.createOrReuseMessage(payload, thread);
  }

  async getLatestEvaluation(threadId: string) {
    const thread = await this.prisma.client.conversationThread.findFirst({ where: { id: threadId } });
    if (!thread) {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    if (this.isZaloChannel(thread.channel) && thread.channelAccountId) {
      await this.zaloAssignment.assertCanReadAccount(thread.channelAccountId);
    }

    const evaluation = await this.prisma.client.conversationEvaluation.findFirst({
      where: { threadId },
      orderBy: { evaluatedAt: 'desc' },
      include: {
        violations: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    return {
      thread,
      evaluation
    };
  }

  private async resolveZaloThreadScope(filters: ThreadFilters): Promise<
    | { mode: 'NONE' }
    | { mode: 'DENY' }
    | { mode: 'WHERE'; constraint: Prisma.ConversationThreadWhereInput }
  > {
    if (filters.channel && filters.channel !== 'ALL' && !this.isZaloChannel(filters.channel)) {
      return { mode: 'NONE' };
    }

    const accountFilter = filters.channelAccountId ? [filters.channelAccountId] : undefined;
    const accessibleAccountIds = await this.zaloAssignment.resolveAccessibleAccountIds(accountFilter);
    if (accessibleAccountIds === null) {
      return { mode: 'NONE' };
    }

    if (filters.channelAccountId && accessibleAccountIds.length === 0) {
      return { mode: 'DENY' };
    }

    if (filters.channel && filters.channel !== 'ALL') {
      if (accessibleAccountIds.length === 0) {
        return { mode: 'DENY' };
      }
      if (filters.channelAccountId) {
        return { mode: 'NONE' };
      }
      return {
        mode: 'WHERE',
        constraint: {
          channelAccountId: { in: accessibleAccountIds }
        }
      };
    }

    const zaloChannels: ConversationChannel[] = [ConversationChannel.ZALO_PERSONAL, ConversationChannel.ZALO_OA];
    if (accessibleAccountIds.length === 0) {
      return {
        mode: 'WHERE',
        constraint: {
          channel: {
            notIn: zaloChannels
          }
        }
      };
    }

    return {
      mode: 'WHERE',
      constraint: {
        OR: [
          {
            channel: {
              notIn: zaloChannels
            }
          },
          {
            channel: { in: zaloChannels },
            channelAccountId: { in: accessibleAccountIds }
          }
        ]
      }
    };
  }

  private pushAndConstraint(where: Prisma.ConversationThreadWhereInput, constraint: Prisma.ConversationThreadWhereInput) {
    if (!where.AND) {
      where.AND = [];
    }
    if (Array.isArray(where.AND)) {
      where.AND.push(constraint);
      return;
    }
    where.AND = [where.AND, constraint];
  }

  private async resolveThreadForIngestion(payload: IngestExternalMessagePayload) {
    const resolvedCustomerId = payload.customerId ?? await this.resolveCustomerIdByIdentity(payload);

    const existing = await this.prisma.client.conversationThread.findFirst({
      where: {
        channel: payload.channel,
        channelAccountId: payload.channelAccountId ?? null,
        externalThreadId: payload.externalThreadId
      }
    });

    if (existing) {
      if (!existing.customerId && resolvedCustomerId) {
        await this.prisma.client.conversationThread.updateMany({
          where: { id: existing.id },
          data: {
            customerId: resolvedCustomerId,
            customerDisplayName: payload.customerDisplayName ?? existing.customerDisplayName
          }
        });
      }
      return this.prisma.client.conversationThread.findFirstOrThrow({ where: { id: existing.id } });
    }

    return this.prisma.client.conversationThread.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        channel: payload.channel,
        channelAccountId: payload.channelAccountId ?? null,
        externalThreadId: payload.externalThreadId,
        customerId: resolvedCustomerId ?? null,
        customerDisplayName: payload.customerDisplayName ?? null,
        metadataJson: payload.metadataJson ?? undefined,
        lastMessageAt: payload.sentAt ?? new Date(),
        unreadCount: payload.senderType === ConversationSenderType.CUSTOMER ? 1 : 0,
        isReplied: payload.senderType !== ConversationSenderType.CUSTOMER
      }
    });
  }

  private async resolveCustomerIdByIdentity(payload: IngestExternalMessagePayload) {
    if (!this.crmContractsService) {
      return null;
    }
    return this.crmContractsService.resolveCustomerIdForExternalIdentity(
      payload.channel,
      payload.senderExternalId
    );
  }

  private async createOrReuseMessage(payload: IngestExternalMessagePayload, thread: { id: string; unreadCount: number; isReplied: boolean; }) {
    const sentAt = payload.sentAt ?? new Date();
    const contentType = payload.contentType?.trim().toUpperCase() || 'TEXT';
    const origin = this.parseMessageOrigin(payload.origin, this.defaultOriginBySenderType(payload.senderType));

    if (payload.externalMessageId) {
      const duplicated = await this.prisma.client.conversationMessage.findFirst({
        where: {
          threadId: thread.id,
          externalMessageId: payload.externalMessageId
        }
      });

      if (duplicated) {
        return duplicated;
      }
    }

    let message;
    try {
      message = await this.prisma.client.conversationMessage.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          threadId: thread.id,
          externalMessageId: payload.externalMessageId ?? null,
          senderType: payload.senderType,
          origin,
          senderExternalId: payload.senderExternalId ?? null,
          senderName: payload.senderName ?? null,
          content: payload.content ?? null,
          contentType,
          metadataJson: payload.metadataJson ?? undefined,
          attachmentsJson: payload.attachmentsJson ?? undefined,
          sentAt
        }
      });
    } catch (error) {
      const isUniqueConflict =
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
        && Boolean(payload.externalMessageId);
      if (!isUniqueConflict) {
        throw error;
      }
      const existing = await this.prisma.client.conversationMessage.findFirst({
        where: {
          threadId: thread.id,
          externalMessageId: payload.externalMessageId
        }
      });
      if (existing) {
        return existing;
      }
      throw error;
    }

    await this.touchThreadAfterMessage(thread.id, payload.senderType, sentAt);

    if (this.isZaloChannel(payload.channel) && payload.channelAccountId) {
      const orgId = String((message as { tenant_Id?: string }).tenant_Id ?? this.prisma.getTenantId());
      this.zaloRealtime.emitScoped({
        orgId,
        accountId: payload.channelAccountId,
        event: 'chat:message',
        payload: {
          accountId: payload.channelAccountId,
          conversationId: thread.id,
          message
        }
      });
    }

    return message;
  }

  private async touchThreadAfterMessage(threadId: string, senderType: ConversationSenderType, sentAt: Date) {
    if (senderType === ConversationSenderType.CUSTOMER) {
      await this.prisma.client.conversationThread.updateMany({
        where: { id: threadId },
        data: {
          lastMessageAt: sentAt,
          unreadCount: { increment: 1 },
          isReplied: false
        }
      });
      return;
    }

    if (senderType === ConversationSenderType.AGENT) {
      await this.prisma.client.conversationThread.updateMany({
        where: { id: threadId },
        data: {
          lastMessageAt: sentAt,
          unreadCount: 0,
          isReplied: true
        }
      });
      return;
    }

    await this.prisma.client.conversationThread.updateMany({
      where: { id: threadId },
      data: {
        lastMessageAt: sentAt
      }
    });
  }

  private async resolveThreadSuggestions(threads: Array<{ id: string; customerId?: string | null; metadataJson?: unknown; externalThreadId?: string | null; }>) {
    const threadPhoneMap = new Map<string, string>();
    for (const thread of threads) {
      if (thread.customerId) {
        continue;
      }
      const fallbackPhone = this.extractThreadFallbackPhoneCandidate(thread);
      if (fallbackPhone) {
        threadPhoneMap.set(thread.id, fallbackPhone);
      }
    }

    if (threadPhoneMap.size === 0) {
      return new Map<string, ThreadSuggestion>();
    }

    const phoneList = Array.from(new Set(threadPhoneMap.values()));
    const customers = await this.prisma.client.customer.findMany({
      where: {
        phoneNormalized: {
          in: phoneList
        }
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        ownerStaffId: true,
        phoneNormalized: true
      }
    });

    const customerByPhone = new Map<string, ThreadSuggestion>();
    for (const customer of customers) {
      const phoneNormalized = this.optionalString(customer.phoneNormalized);
      if (!phoneNormalized) {
        continue;
      }
      customerByPhone.set(phoneNormalized, {
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone ?? null,
        email: customer.email ?? null,
        ownerStaffId: customer.ownerStaffId ?? null
      });
    }

    const suggestionByThreadId = new Map<string, ThreadSuggestion>();
    for (const [threadId, phone] of threadPhoneMap.entries()) {
      const customer = customerByPhone.get(phone);
      if (customer) {
        suggestionByThreadId.set(threadId, customer);
      }
    }

    return suggestionByThreadId;
  }

  private async resolveThreadIdentityMatches(
    threads: Array<{ id: string; customerId?: string | null; channel: ConversationChannel; externalThreadId: string; metadataJson?: unknown; customerDisplayName?: string | null; }>
  ) {
    const identityByThreadId = new Map<string, ThreadIdentityHint>();
    for (const thread of threads) {
      if (thread.customerId) {
        continue;
      }
      const hint = this.resolveThreadIdentityHint(thread);
      if (hint) {
        identityByThreadId.set(thread.id, hint);
      }
    }

    if (identityByThreadId.size === 0) {
      return new Map<string, ThreadSuggestion>();
    }

    const uniqueIdentityMap = new Map<string, ThreadIdentityHint>();
    for (const hint of identityByThreadId.values()) {
      uniqueIdentityMap.set(this.identityKey(hint.platform, hint.externalUserId), hint);
    }

    const identities = await this.prisma.client.customerSocialIdentity.findMany({
      where: {
        OR: Array.from(uniqueIdentityMap.values()).map((item) => ({
          platform: item.platform,
          externalUserId: item.externalUserId
        }))
      },
      select: {
        platform: true,
        externalUserId: true,
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            ownerStaffId: true
          }
        }
      }
    });

    const customerByIdentity = new Map<string, ThreadSuggestion>();
    for (const identity of identities) {
      if (!identity.customer) {
        continue;
      }
      customerByIdentity.set(this.identityKey(identity.platform, identity.externalUserId), {
        id: identity.customer.id,
        fullName: identity.customer.fullName,
        phone: identity.customer.phone ?? null,
        email: identity.customer.email ?? null,
        ownerStaffId: identity.customer.ownerStaffId ?? null
      });
    }

    const matchedByThreadId = new Map<string, ThreadSuggestion>();
    for (const [threadId, hint] of identityByThreadId.entries()) {
      const customer = customerByIdentity.get(this.identityKey(hint.platform, hint.externalUserId));
      if (customer) {
        matchedByThreadId.set(threadId, customer);
      }
    }

    return matchedByThreadId;
  }

  private toThreadListItem(
    item: any,
    threadSuggestions: Map<string, ThreadSuggestion> = new Map(),
    threadIdentityMatches: Map<string, ThreadSuggestion> = new Map()
  ) {
    const identityMatchedCustomer = threadIdentityMatches.get(item.id);
    const suggestedCustomer = threadSuggestions.get(item.id) ?? null;
    const resolvedCustomer = item.customer ?? identityMatchedCustomer ?? null;
    const customerId = item.customerId ?? resolvedCustomer?.id ?? null;
    const matchStatus: ThreadMatchStatus = customerId
      ? 'matched'
      : suggestedCustomer
        ? 'suggested'
        : 'unmatched';

    return {
      ...item,
      customerId,
      customer: resolvedCustomer,
      tags: this.readThreadTags(item.metadataJson),
      matchStatus,
      suggestedCustomer: matchStatus === 'suggested' ? suggestedCustomer : null,
      identityHint: this.resolveThreadIdentityHint(item)
    };
  }

  private async loadThreadWithRelations(threadId: string) {
    return this.prisma.client.conversationThread.findFirstOrThrow({
      where: { id: threadId },
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true
          }
        },
        channelAccount: {
          select: {
            id: true,
            accountType: true,
            displayName: true,
            zaloUid: true,
            status: true
          }
        },
        evaluations: {
          orderBy: { evaluatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            verdict: true,
            score: true,
            summary: true,
            evaluatedAt: true
          }
        }
      }
    });
  }

  private resolveThreadIdentityHint(thread: {
    channel: ConversationChannel;
    externalThreadId?: string | null;
    metadataJson?: unknown;
  }): ThreadIdentityHint | null {
    const platform = this.mapConversationChannelToSocialPlatform(thread.channel);
    if (!platform) {
      return null;
    }

    const metadata = this.ensureRecord(thread.metadataJson);
    const externalUserId = this.optionalString(metadata.externalUserId)
      ?? this.optionalString(metadata.uidFrom)
      ?? this.optionalString(metadata.uid_from)
      ?? this.optionalString(metadata.fromUid)
      ?? this.optionalString(metadata.from_uid)
      ?? this.optionalString(metadata.uid)
      ?? this.optionalString(thread.externalThreadId);
    if (!externalUserId) {
      return null;
    }

    return {
      platform,
      externalUserId
    };
  }

  private async ensureThreadIdentityOwnership(
    tx: Prisma.TransactionClient,
    identityHint: ThreadIdentityHint,
    customerId: string,
    thread: { id: string; channel: ConversationChannel; customerDisplayName?: string | null; metadataJson?: unknown; externalThreadId?: string | null; }
  ) {
    const existing = await tx.customerSocialIdentity.findFirst({
      where: {
        platform: identityHint.platform,
        externalUserId: identityHint.externalUserId
      }
    });

    if (existing && existing.customerId !== customerId) {
      throw new BadRequestException('Định danh social đã được gán cho khách hàng khác.');
    }

    const now = new Date();
    const phoneHint = this.extractThreadFallbackPhoneCandidate(thread);
    const metadataRecord = {
      ...this.ensureRecord(thread.metadataJson),
      linkedFromThreadId: thread.id,
      linkedFromChannel: thread.channel
    } as Prisma.InputJsonValue;

    if (existing) {
      await tx.customerSocialIdentity.updateMany({
        where: { id: existing.id },
        data: {
          displayName: existing.displayName || this.optionalString(thread.customerDisplayName) || null,
          phoneHint: existing.phoneHint || phoneHint || null,
          lastSeenAt: now,
          metadataJson: existing.metadataJson ?? metadataRecord
        }
      });
      return;
    }

    await tx.customerSocialIdentity.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        customerId,
        platform: identityHint.platform,
        externalUserId: identityHint.externalUserId,
        displayName: this.optionalString(thread.customerDisplayName) ?? null,
        phoneHint: phoneHint ?? null,
        lastSeenAt: now,
        metadataJson: metadataRecord
      }
    });
  }

  private extractThreadFallbackPhoneCandidate(thread: {
    externalThreadId?: string | null;
    metadataJson?: unknown;
  }) {
    const metadata = this.ensureRecord(thread.metadataJson);
    const candidates = [
      this.optionalString(metadata.phone),
      this.optionalString(metadata.phoneNormalized),
      this.optionalString(metadata.customerPhone),
      this.optionalString(metadata.senderPhone),
      this.optionalString(thread.externalThreadId)
    ];

    for (const candidate of candidates) {
      const normalized = normalizeVietnamPhone(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private identityKey(platform: CustomerSocialPlatform, externalUserId: string) {
    return `${platform}::${externalUserId}`;
  }

  private mapConversationChannelToSocialPlatform(channel: ConversationChannel): CustomerSocialPlatform | null {
    if (channel === ConversationChannel.ZALO_PERSONAL || channel === ConversationChannel.ZALO_OA) {
      return CustomerSocialPlatform.ZALO;
    }
    if (channel === ConversationChannel.FACEBOOK) {
      return CustomerSocialPlatform.FACEBOOK;
    }
    return null;
  }

  private async findCustomerByContactTx(
    tx: Prisma.TransactionClient,
    normalizedPhone?: string | null,
    normalizedEmail?: string | null
  ) {
    const conditions: Prisma.CustomerWhereInput[] = [];
    if (normalizedPhone) {
      conditions.push({ phoneNormalized: normalizedPhone });
    }
    if (normalizedEmail) {
      conditions.push({ emailNormalized: normalizedEmail });
    }
    if (conditions.length === 0) {
      return null;
    }

    return tx.customer.findFirst({
      where: {
        OR: conditions
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        ownerStaffId: true
      }
    });
  }

  private normalizeEmail(email?: string) {
    const normalized = this.optionalString(email)?.toLowerCase() ?? '';
    if (!normalized) {
      return null;
    }
    return normalized;
  }

  private resolveCustomerSourceByChannel(_channel: ConversationChannel, fallbackSource?: string | null) {
    return fallbackSource ?? null;
  }

  private resolveConfiguredTaxonomyValue(input: string | null | undefined, allowedValues: string[]) {
    const candidate = this.optionalString(input);
    if (!candidate) {
      return null;
    }
    if (!Array.isArray(allowedValues) || allowedValues.length === 0) {
      return candidate;
    }
    const directMatch = allowedValues.find((item) => this.optionalString(item) === candidate);
    if (directMatch) {
      return directMatch;
    }
    const lower = candidate.toLowerCase();
    const caseInsensitiveMatch = allowedValues.find((item) => this.optionalString(item)?.toLowerCase() === lower);
    return caseInsensitiveMatch ?? null;
  }

  private resolveDefaultTaxonomyValue(values: string[]) {
    for (const value of values) {
      const normalized = this.optionalString(value);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  private formatChannelLabel(channel: ConversationChannel) {
    if (channel === ConversationChannel.ZALO_PERSONAL) {
      return 'Zalo cá nhân';
    }
    if (channel === ConversationChannel.ZALO_OA) {
      return 'Zalo OA';
    }
    if (channel === ConversationChannel.FACEBOOK) {
      return 'Facebook';
    }
    return 'kênh hội thoại';
  }

  private parseChannel(input: unknown, fallback: ConversationChannel): ConversationChannel {
    const candidate = String(input ?? '').trim().toUpperCase();
    if ((Object.values(ConversationChannel) as string[]).includes(candidate)) {
      return candidate as ConversationChannel;
    }
    return fallback;
  }

  private parseSenderType(input: unknown, fallback: ConversationSenderType): ConversationSenderType {
    const candidate = String(input ?? '').trim().toUpperCase();
    if ((Object.values(ConversationSenderType) as string[]).includes(candidate)) {
      return candidate as ConversationSenderType;
    }
    return fallback;
  }

  private parseMessageOrigin(input: unknown, fallback: ConversationMessageOrigin): ConversationMessageOrigin {
    const candidate = String(input ?? '').trim().toUpperCase();
    if ((Object.values(ConversationMessageOrigin) as string[]).includes(candidate)) {
      return candidate as ConversationMessageOrigin;
    }
    return fallback;
  }

  private defaultOriginBySenderType(senderType: ConversationSenderType): ConversationMessageOrigin {
    if (senderType === ConversationSenderType.CUSTOMER) {
      return ConversationMessageOrigin.EXTERNAL;
    }
    if (senderType === ConversationSenderType.AGENT) {
      return ConversationMessageOrigin.USER;
    }
    return ConversationMessageOrigin.SYSTEM;
  }

  private requiredString(input: unknown, message: string) {
    const value = this.optionalString(input);
    if (!value) {
      throw new BadRequestException(message);
    }
    return value;
  }

  private optionalString(input: unknown) {
    if (input === null || input === undefined) {
      return undefined;
    }
    const value = String(input).trim();
    return value || undefined;
  }

  private parseDate(input: unknown, fieldName: string) {
    const parsed = new Date(String(input));
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} không hợp lệ.`);
    }
    return parsed;
  }

  private parseInt(input: unknown, fallback: number) {
    if (input === null || input === undefined || input === '') {
      return fallback;
    }
    const value = Number(input);
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException('Giá trị số nguyên không hợp lệ.');
    }
    return value;
  }

  private parseBoolean(input: unknown, fallback: boolean) {
    if (input === null || input === undefined) {
      return fallback;
    }
    if (typeof input === 'boolean') {
      return input;
    }
    const normalized = String(input).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
    return fallback;
  }

  private isZaloChannel(channel: ConversationChannel) {
    return channel === ConversationChannel.ZALO_PERSONAL || channel === ConversationChannel.ZALO_OA;
  }

  private mergeThreadMetadata(metadataJson: Prisma.InputJsonValue | undefined, tags: string[]) {
    const base = this.ensureRecord(metadataJson);
    return {
      ...base,
      tags
    } as Prisma.InputJsonValue;
  }

  private readThreadTags(metadataJson: unknown) {
    const metadata = this.ensureRecord(metadataJson);
    return this.parseThreadTags(metadata.tags);
  }

  private parseThreadTags(input: unknown): string[] {
    if (Array.isArray(input)) {
      return Array.from(
        new Set(
          input
            .map((item) => this.cleanString(item).toLowerCase())
            .filter(Boolean)
        )
      );
    }

    if (typeof input === 'string') {
      return Array.from(
        new Set(
          input
            .split(/[\n,;]+/)
            .map((item) => this.cleanString(item).toLowerCase())
            .filter(Boolean)
        )
      );
    }

    return [];
  }

  private async resolveCurrentSenderDisplayName() {
    try {
      const authUser = this.ensureRecord(this.cls.get(AUTH_USER_CONTEXT_KEY));
      const tenantId = this.prisma.getTenantId();
      const userId = this.cleanString(authUser.userId ?? authUser.sub);
      let email = this.cleanString(authUser.email);
      let employeeId = this.cleanString(authUser.employeeId);

      if (!employeeId && userId) {
        const user = await this.prisma.client.user.findFirst({
          where: {
            id: userId,
            tenant_Id: tenantId
          },
          select: {
            employeeId: true,
            email: true
          }
        });
        employeeId = this.cleanString(user?.employeeId);
        if (!email) {
          email = this.cleanString(user?.email);
        }
      }

      if (employeeId) {
        const employee = await this.prisma.client.employee.findFirst({
          where: {
            id: employeeId,
            tenant_Id: tenantId
          },
          select: {
            fullName: true,
            email: true
          }
        });
        const fullName = this.cleanString(employee?.fullName);
        if (fullName) {
          return fullName;
        }
        if (!email) {
          email = this.cleanString(employee?.email);
        }
      }

      if (email) {
        return email;
      }
      if (userId) {
        return userId;
      }
      return null;
    } catch {
      return null;
    }
  }

  private ensureRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }
}
