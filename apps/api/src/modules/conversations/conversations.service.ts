import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConversationChannel, ConversationSenderType, Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { PrismaService } from '../../prisma/prisma.service';
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

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly zaloAssignment: ZaloAccountAssignmentService,
    private readonly zaloRealtime: ZaloAutomationRealtimeService
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

    return {
      items: items.map((item) => ({
        ...item,
        tags: this.readThreadTags(item.metadataJson)
      })),
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

  async appendMessage(threadId: string, payload: Record<string, unknown>) {
    const thread = await this.prisma.client.conversationThread.findFirst({ where: { id: threadId } });
    if (!thread) {
      throw new NotFoundException('Không tìm thấy hội thoại.');
    }

    if (this.isZaloChannel(thread.channel) && thread.channelAccountId) {
      await this.zaloAssignment.assertCanChatAccount(thread.channelAccountId);
    }

    const senderType = this.parseSenderType(payload.senderType, ConversationSenderType.AGENT);
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
    const existing = await this.prisma.client.conversationThread.findFirst({
      where: {
        channel: payload.channel,
        channelAccountId: payload.channelAccountId ?? null,
        externalThreadId: payload.externalThreadId
      }
    });

    if (existing) {
      if (!existing.customerId && payload.customerId) {
        await this.prisma.client.conversationThread.updateMany({
          where: { id: existing.id },
          data: {
            customerId: payload.customerId,
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
        customerId: payload.customerId ?? null,
        customerDisplayName: payload.customerDisplayName ?? null,
        metadataJson: payload.metadataJson ?? undefined,
        lastMessageAt: payload.sentAt ?? new Date(),
        unreadCount: payload.senderType === ConversationSenderType.CUSTOMER ? 1 : 0,
        isReplied: payload.senderType !== ConversationSenderType.CUSTOMER
      }
    });
  }

  private async createOrReuseMessage(payload: IngestExternalMessagePayload, thread: { id: string; unreadCount: number; isReplied: boolean; }) {
    const sentAt = payload.sentAt ?? new Date();
    const contentType = payload.contentType?.trim().toUpperCase() || 'TEXT';

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
          senderExternalId: payload.senderExternalId ?? null,
          senderName: payload.senderName ?? null,
          content: payload.content ?? null,
          contentType,
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
