import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  ConversationChannel,
  ConversationMessageOrigin,
  ConversationSenderType,
  CustomerCareStatus
} from '@prisma/client';
import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { normalizeVietnamPhone } from '../../common/validation/phone.validation';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { buildFriendAlias } from './zalo-friend-alias.util';
import { ZaloOaOutboundWorkerService } from './zalo-oa-outbound.worker';
import { ZaloAccountAssignmentService } from './zalo-account-assignment.service';
import { ZaloAutomationRealtimeService } from './zalo-automation-realtime.service';
import { patchZaloAutoReplyThreadState } from './zalo-auto-reply-state.util';
import { ZaloPersonalPoolService } from './zalo-personal.pool.service';

type AccountType = 'PERSONAL' | 'OA';
type PersonalSendOrigin = 'USER' | 'CAMPAIGN' | 'AI' | 'SYSTEM';

@Injectable()
export class ZaloService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cls: ClsService,
    private readonly conversationsService: ConversationsService,
    private readonly zaloAssignment: ZaloAccountAssignmentService,
    private readonly personalPool: ZaloPersonalPoolService,
    private readonly oaOutboundWorker: ZaloOaOutboundWorkerService,
    private readonly runtimeSettings: RuntimeSettingsService,
    private readonly zaloRealtime: ZaloAutomationRealtimeService
  ) {}

  async listAccounts(accountType?: AccountType | 'ALL') {
    const accessibleAccountIds = await this.zaloAssignment.resolveAccessibleAccountIds();
    if (accessibleAccountIds && accessibleAccountIds.length === 0) {
      return [];
    }

    const accounts = await this.prisma.client.zaloAccount.findMany({
      where: {
        ...(accountType && accountType !== 'ALL' ? { accountType } : {}),
        ...(accessibleAccountIds ? { id: { in: accessibleAccountIds } } : {})
      },
      orderBy: { createdAt: 'asc' }
    });

    const permissionMap = await this.zaloAssignment.resolvePermissionMapForAccounts(accounts.map((account) => account.id));
    return accounts.map((account) => {
      const normalizedType = String(account.accountType ?? '').toUpperCase();
      const listenerDebug = normalizedType === 'PERSONAL'
        ? this.personalPool.getListenerDebug(account.id)
        : null;
      const runtimeStatus = listenerDebug?.hasApi && listenerDebug.wsStateLabel === 'OPEN'
        ? 'CONNECTED'
        : undefined;

      return {
        ...account,
        status: runtimeStatus ?? account.status,
        currentPermissionLevel: permissionMap[account.id] ?? null
      };
    });
  }

  async createAccount(payload: Record<string, unknown>) {
    const accountType = this.parseAccountType(payload.accountType, 'PERSONAL');
    const displayName = this.requiredString(payload.displayName, 'Thiếu tên hiển thị tài khoản Zalo.');
    const phone = this.requiredString(payload.phone, 'Thiếu số điện thoại tài khoản Zalo.');
    const actor = this.resolveCurrentActorContext();
    const requestedOwnerUserId = this.optionalString(payload.ownerUserId);
    const ownerUserId =
      actor.role === 'ADMIN'
        ? (requestedOwnerUserId ?? actor.userId ?? null)
        : (actor.userId ?? null);

    const created = await this.prisma.client.zaloAccount.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        accountType,
        displayName,
        zaloUid: null,
        phone,
        aiAutoReplyEnabled: this.parseBoolean(payload.aiAutoReplyEnabled, false),
        aiAutoReplyTakeoverMinutes: this.parseInt(payload.aiAutoReplyTakeoverMinutes, 5, 1, 120),
        ownerUserId,
        status: 'DISCONNECTED',
        metadataJson: (payload.metadataJson as any) ?? undefined
      }
    });

    return created;
  }

  async updateAccount(id: string, payload: Record<string, unknown>) {
    const account = await this.prisma.client.zaloAccount.findFirst({ where: { id } });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản Zalo.');
    }

    await this.prisma.client.zaloAccount.updateMany({
      where: { id },
      data: {
        accountType: payload.accountType ? this.parseAccountType(payload.accountType, account.accountType as AccountType) : undefined,
        displayName: payload.displayName !== undefined ? this.optionalString(payload.displayName) ?? null : undefined,
        zaloUid: payload.zaloUid !== undefined ? this.optionalString(payload.zaloUid) ?? null : undefined,
        phone: payload.phone !== undefined ? this.optionalString(payload.phone) ?? null : undefined,
        aiAutoReplyEnabled: payload.aiAutoReplyEnabled !== undefined
          ? this.parseBoolean(payload.aiAutoReplyEnabled, account.aiAutoReplyEnabled ?? false)
          : undefined,
        aiAutoReplyTakeoverMinutes: payload.aiAutoReplyTakeoverMinutes !== undefined
          ? this.parseInt(payload.aiAutoReplyTakeoverMinutes, account.aiAutoReplyTakeoverMinutes ?? 5, 1, 120)
          : undefined,
        ownerUserId: payload.ownerUserId !== undefined ? this.optionalString(payload.ownerUserId) ?? null : undefined,
        status: payload.status !== undefined ? this.optionalString(payload.status)?.toUpperCase() : undefined,
        metadataJson: payload.metadataJson !== undefined ? (payload.metadataJson as any) : undefined
      }
    });

    return this.prisma.client.zaloAccount.findFirst({ where: { id } });
  }

  async softDeleteAccount(id: string) {
    const account = await this.requireAccount(id);

    if (String(account.accountType).toUpperCase() === 'PERSONAL') {
      await this.personalPool.disconnect(id);
    } else {
      await this.prisma.client.zaloAccount.updateMany({
        where: { id },
        data: {
          status: 'DISCONNECTED'
        }
      });
    }

    await this.prisma.client.zaloAccount.updateMany({
      where: { id },
      data: {
        status: 'INACTIVE'
      }
    });

    this.zaloRealtime.emitScoped({
      orgId: account.tenant_Id,
      accountId: account.id,
      event: 'zalo:disconnected',
      payload: {
        accountId: account.id,
        reason: 'SOFT_DELETED'
      }
    });

    return {
      success: true,
      message: 'Đã xóa mềm tài khoản Zalo và giữ nguyên dữ liệu hội thoại.',
      account: await this.prisma.client.zaloAccount.findFirst({ where: { id } })
    };
  }

  async syncContacts(id: string) {
    const account = await this.requirePersonalAccount(id);
    await this.zaloAssignment.assertCanChatAccount(id);

    const api = this.personalPool.getConnectedApi(id);
    if (!api) {
      throw new BadRequestException('Tài khoản Zalo cá nhân chưa kết nối.');
    }

    if (typeof api.getAllFriends !== 'function') {
      throw new BadRequestException('SDK zca-js hiện tại không hỗ trợ getAllFriends cho tài khoản này.');
    }

    const raw = await api.getAllFriends();
    const contacts = this.extractContactsFromZaloPayload(raw);
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    const defaultCustomerStage = this.resolveDefaultTaxonomyValue(salesPolicy.customerTaxonomy.stages);
    const defaultCustomerSource = this.resolveDefaultTaxonomyValue(salesPolicy.customerTaxonomy.sources);
    const preferredZaloSource = this.resolvePreferredSourceValue(
      salesPolicy.customerTaxonomy.sources,
      ['ZALO', 'ONLINE']
    ) ?? defaultCustomerSource;

    let created = 0;
    let updated = 0;
    let skippedNoPhone = 0;
    let skippedInvalidPhone = 0;

    for (const contact of contacts) {
      const rawPhone = this.resolveContactPhone(contact);
      const normalizedPhone = this.normalizePhoneForSync(rawPhone);
      if (!normalizedPhone) {
        skippedNoPhone += 1;
        continue;
      }
      if (!this.isViablePhone(normalizedPhone)) {
        skippedInvalidPhone += 1;
        continue;
      }

      const displayName = this.resolveContactDisplayName(contact) || `Khách ${normalizedPhone}`;
      const existing = await this.prisma.client.customer.findFirst({
        where: {
          tenant_Id: account.tenant_Id,
          phoneNormalized: normalizedPhone
        }
      });

      if (existing) {
        await this.prisma.client.customer.updateMany({
          where: { id: existing.id },
          data: {
            fullName: displayName || existing.fullName,
            phone: rawPhone ?? existing.phone,
            phoneNormalized: normalizedPhone,
            source: existing.source || preferredZaloSource || undefined,
            lastContactAt: new Date()
          }
        });
        updated += 1;
      } else {
        await this.prisma.client.customer.create({
          data: {
            tenant_Id: account.tenant_Id,
            fullName: displayName,
            phone: rawPhone ?? normalizedPhone,
            phoneNormalized: normalizedPhone,
            source: preferredZaloSource ?? null,
            customerStage: defaultCustomerStage ?? null,
            status: CustomerCareStatus.MOI_CHUA_TU_VAN,
            tags: ['zalo']
          }
        });
        created += 1;
      }
    }

    return {
      success: true,
      accountId: id,
      totalContacts: contacts.length,
      created,
      updated,
      skippedNoPhone,
      skippedInvalidPhone
    };
  }

  async resolvePersonalThreadsByPhones(accountIds: string[], phones: string[]) {
    const normalizedPhoneSet = new Set(
      phones
        .map((phone) => this.normalizePhoneForSync(phone))
        .filter((phone): phone is string => Boolean(phone))
    );
    if (normalizedPhoneSet.size === 0) {
      return {} as Record<string, Array<{ accountId: string; externalThreadId: string; displayName?: string }>>;
    }

    const uniqueAccountIds = Array.from(
      new Set(
        accountIds
          .map((accountId) => this.optionalString(accountId))
          .filter((accountId): accountId is string => Boolean(accountId))
      )
    );

    const byPhone = new Map<string, Array<{ accountId: string; externalThreadId: string; displayName?: string }>>();
    const normalizedPhones = [...normalizedPhoneSet];
    for (const accountId of uniqueAccountIds) {
      const api = this.personalPool.getConnectedApi(accountId);
      if (!api) {
        continue;
      }

      const unresolvedPhones = new Set(normalizedPhones);
      const consumeFoundPhone = (phone: string) => {
        unresolvedPhones.delete(phone);
      };

      if (typeof api.getMultiUsersByPhones === 'function' && unresolvedPhones.size > 0) {
        try {
          const mapped = await api.getMultiUsersByPhones([...unresolvedPhones]);
          const mappedRecord = mapped && typeof mapped === 'object' && !Array.isArray(mapped)
            ? (mapped as Record<string, unknown>)
            : {};
          for (const [phoneKey, userRow] of Object.entries(mappedRecord)) {
            const normalizedPhone = this.normalizePhoneForSync(phoneKey);
            if (!normalizedPhone || !normalizedPhoneSet.has(normalizedPhone)) {
              continue;
            }
            const externalThreadId = this.resolveUidFromLookupRecord(userRow);
            if (!externalThreadId) {
              continue;
            }
            const displayName = this.resolveDisplayNameFromLookupRecord(userRow);
            this.appendResolvedPhoneThread(byPhone, normalizedPhone, {
              accountId,
              externalThreadId,
              ...(displayName ? { displayName } : {})
            });
            consumeFoundPhone(normalizedPhone);
          }
        } catch {
          // Ignore multi-user lookup errors, fallback to findUser/getAllFriends.
        }
      }

      if (typeof api.findUser === 'function' && unresolvedPhones.size > 0) {
        for (const phone of [...unresolvedPhones]) {
          try {
            const foundUser = await api.findUser(phone);
            const externalThreadId = this.resolveUidFromLookupRecord(foundUser);
            if (!externalThreadId) {
              continue;
            }
            const displayName = this.resolveDisplayNameFromLookupRecord(foundUser);
            this.appendResolvedPhoneThread(byPhone, phone, {
              accountId,
              externalThreadId,
              ...(displayName ? { displayName } : {})
            });
            consumeFoundPhone(phone);
          } catch {
            // Ignore findUser errors per phone.
          }
        }
      }

      if (typeof api.getAllFriends !== 'function' || unresolvedPhones.size === 0) {
        continue;
      }

      try {
        const rawContacts = await api.getAllFriends();
        const contacts = this.extractContactsFromZaloPayload(rawContacts);
        for (const contact of contacts) {
          const normalizedPhone = this.normalizePhoneForSync(this.resolveContactPhone(contact));
          if (!normalizedPhone || !normalizedPhoneSet.has(normalizedPhone) || !unresolvedPhones.has(normalizedPhone)) {
            continue;
          }

          const externalThreadId = this.resolveContactUid(contact);
          if (!externalThreadId) {
            continue;
          }

          const displayName = this.resolveContactDisplayName(contact);
          this.appendResolvedPhoneThread(byPhone, normalizedPhone, {
            accountId,
            externalThreadId,
            ...(displayName ? { displayName } : {})
          });
          consumeFoundPhone(normalizedPhone);
        }
      } catch {
        // Ignore lookup errors for one account; campaign snapshot will fallback to existing thread data.
      }
    }

    const output: Record<string, Array<{ accountId: string; externalThreadId: string; displayName?: string }>> = {};
    for (const [phone, rows] of byPhone.entries()) {
      output[phone] = rows;
    }
    return output;
  }

  async resolvePersonalThreadByPhone(accountId: string, phone: string) {
    await this.requirePersonalAccount(accountId);

    const normalizedPhone = this.normalizePhoneForSync(phone);
    if (!normalizedPhone) {
      return null;
    }

    const mapped = await this.resolvePersonalThreadsByPhones([accountId], [normalizedPhone]);
    const rows = mapped[normalizedPhone] ?? [];
    const resolved = rows.find((row) => row.accountId === accountId) ?? rows[0] ?? null;
    if (!resolved) {
      return null;
    }
    return {
      externalThreadId: resolved.externalThreadId,
      displayName: resolved.displayName
    };
  }

  async startPersonalLogin(id: string) {
    const account = await this.requirePersonalAccount(id);
    void this.personalPool.startQrLogin(account.id);
    return {
      message: 'Đã khởi tạo đăng nhập QR cho Zalo cá nhân.',
      accountId: account.id
    };
  }

  async getPersonalQr(id: string) {
    await this.requirePersonalAccount(id);
    const qrImage = this.personalPool.getQrImage(id);
    return {
      accountId: id,
      status: this.personalPool.getStatus(id),
      qrImage
    };
  }

  async getPersonalListenerDebug(id: string) {
    await this.requirePersonalAccount(id);
    await this.zaloAssignment.assertCanReadAccount(id);
    return this.personalPool.getListenerDebug(id);
  }

  async requestPersonalOldMessages(id: string) {
    await this.requirePersonalAccount(id);
    await this.zaloAssignment.assertCanReadAccount(id);
    return this.personalPool.requestOldMessages(id);
  }

  async reconnectPersonal(id: string) {
    const account = await this.requirePersonalAccount(id);
    const session = (account.sessionData ?? null) as { cookie?: unknown; imei?: string; userAgent?: string } | null;

    if (!session?.imei) {
      throw new BadRequestException('Không có session đã lưu. Hãy đăng nhập QR trước.');
    }

    void this.personalPool.reconnectWithSavedSession(id, session);
    return {
      message: 'Đã khởi tạo reconnect cho Zalo cá nhân.',
      accountId: id
    };
  }

  async disconnectPersonal(id: string) {
    await this.requirePersonalAccount(id);
    await this.personalPool.disconnect(id);
    return {
      message: 'Đã ngắt kết nối tài khoản Zalo cá nhân.',
      accountId: id
    };
  }

  async sendPersonalMessage(id: string, payload: Record<string, unknown>) {
    const account = await this.requirePersonalAccount(id);
    await this.zaloAssignment.assertCanChatAccount(id);

    const requestedExternalThreadId = this.optionalString(payload.externalThreadId) ?? null;
    const requestedPhone = this.optionalString(payload.phone)
      ?? this.optionalString(payload.recipientPhone)
      ?? this.optionalString(payload.customerPhone)
      ?? null;
    const content = this.requiredString(payload.content, 'Thiếu nội dung tin nhắn.');
    const threadType = this.optionalString(payload.threadType)?.toLowerCase() === 'group' ? 'group' : 'user';
    const origin = this.parsePersonalSendOrigin(payload.origin, 'USER');
    const requestedSenderName = this.optionalString(payload.senderName);
    const senderName =
      requestedSenderName
      ?? (origin === 'AI' ? 'AI Assistant' : (await this.resolveCurrentSenderDisplayName()) ?? undefined);
    let externalThreadId = requestedExternalThreadId;
    let resolvedDisplayName: string | null = null;

    if (!externalThreadId && threadType === 'user' && requestedPhone) {
      const resolvedThread = await this.resolvePersonalThreadByPhone(id, requestedPhone);
      if (resolvedThread) {
        externalThreadId = resolvedThread.externalThreadId;
        resolvedDisplayName = resolvedThread.displayName ?? null;
      }
    }

    if (!externalThreadId) {
      if (threadType === 'group') {
        throw new BadRequestException('Thiếu externalThreadId cho hội thoại group.');
      }
      throw new BadRequestException('Không tìm được thread theo externalThreadId hoặc số điện thoại.');
    }

    const delivery = await this.personalPool.sendMessage(
      id,
      externalThreadId,
      content,
      threadType,
      senderName,
      this.toConversationMessageOrigin(origin)
    );

    if (threadType === 'user') {
      await this.upsertPersonalFriendAlias(id, {
        externalThreadId,
        phone: requestedPhone ?? undefined,
        zaloDisplayName:
          this.optionalString(payload.customerDisplayName)
          ?? this.optionalString(payload.zaloDisplayName)
          ?? this.optionalString(payload.zaloName)
          ?? resolvedDisplayName
          ?? undefined
      });

      if (origin === 'USER') {
        await this.markPersonalThreadManualTakeover(
          account.id,
          externalThreadId,
          this.parseInt(account.aiAutoReplyTakeoverMinutes, 5, 1, 120)
        );
      }
    }

    return {
      ...(delivery as Record<string, unknown>),
      externalThreadId,
      resolvedByPhone: !requestedExternalThreadId && Boolean(requestedPhone)
    };
  }

  private async markPersonalThreadManualTakeover(accountId: string, externalThreadId: string, takeoverMinutes: number) {
    const thread = await this.prisma.client.conversationThread.findFirst({
      where: {
        channel: ConversationChannel.ZALO_PERSONAL,
        channelAccountId: accountId,
        externalThreadId
      },
      select: {
        id: true,
        metadataJson: true
      }
    });
    if (!thread) {
      return;
    }

    const pauseUntil = new Date(Date.now() + takeoverMinutes * 60_000).toISOString();
    await this.prisma.client.conversationThread.updateMany({
      where: { id: thread.id },
      data: {
        metadataJson: patchZaloAutoReplyThreadState(thread.metadataJson, {
          pauseUntil,
          clearPending: true
        })
      }
    });

    this.personalPool.cancelAutoReplyForThread(thread.id);
  }

  async upsertPersonalFriendAlias(
    accountId: string,
    payload: {
      externalThreadId?: string | null;
      zaloDisplayName?: string | null;
      phone?: string | null;
    }
  ) {
    const externalThreadId = this.optionalString(payload.externalThreadId);
    const alias = buildFriendAlias(payload.zaloDisplayName, payload.phone);
    if (!externalThreadId || !alias) {
      return { success: false, reason: 'MISSING_ALIAS_DATA' as const };
    }

    const api = this.personalPool.getConnectedApi(accountId);
    if (!api || typeof api.changeFriendAlias !== 'function') {
      return { success: false, reason: 'ALIAS_API_UNAVAILABLE' as const };
    }

    try {
      await api.changeFriendAlias(alias, externalThreadId);
      return { success: true, alias };
    } catch (error) {
      return {
        success: false,
        reason: 'ALIAS_UPDATE_FAILED' as const,
        error: error instanceof Error ? error.message : String(error ?? 'UNKNOWN_ERROR')
      };
    }
  }

  async sendOaMessage(id: string, payload: Record<string, unknown>) {
    const account = await this.requireOaAccount(id);
    await this.zaloAssignment.assertCanChatAccount(account.id);
    const integrationRuntime = await this.runtimeSettings.getIntegrationRuntime();

    const externalThreadId = this.requiredString(payload.externalThreadId, 'Thiếu externalThreadId.');
    const content = this.requiredString(payload.content, 'Thiếu nội dung tin nhắn.');

    const delivery = await this.oaOutboundWorker.sendTextMessage({
      account: {
        id: account.id,
        accessTokenEnc: account.accessTokenEnc,
        metadataJson: account.metadataJson
      },
      runtimeConfig: {
        outboundUrl: integrationRuntime.zalo.outboundUrl,
        apiBaseUrl: integrationRuntime.zalo.apiBaseUrl,
        outboundTimeoutMs: integrationRuntime.zalo.outboundTimeoutMs,
        accessToken: integrationRuntime.zalo.accessToken
      },
      externalThreadId,
      content,
      recipientId: this.optionalString(payload.recipientId)
    });

    const message = await this.conversationsService.ingestExternalMessage({
      channel: ConversationChannel.ZALO_OA,
      channelAccountId: account.id,
      externalThreadId,
      externalMessageId: delivery.externalMessageId,
      senderType: ConversationSenderType.AGENT,
      senderExternalId: this.optionalString(payload.senderExternalId) ?? account.zaloUid ?? undefined,
      senderName: (await this.resolveCurrentSenderDisplayName()) ?? account.displayName ?? 'Staff',
      content,
      contentType: this.optionalString(payload.contentType) ?? 'TEXT',
      sentAt: payload.sentAt ? this.parseDate(payload.sentAt, 'sentAt') : new Date(),
      customerId: this.optionalString(payload.customerId),
      customerDisplayName: this.optionalString(payload.customerDisplayName),
      metadataJson: (payload.metadataJson as any) ?? undefined,
      attachmentsJson: (payload.attachmentsJson as any) ?? undefined
    });

    return {
      success: true,
      messageId: delivery.externalMessageId ?? message.id,
      message,
      delivery
    };
  }

  async ingestOaWebhook(
    payload: Record<string, unknown>,
    rawBody: string,
    signatureHeader?: string
  ) {
    await this.verifyOaWebhookSignature(rawBody, signatureHeader);

    const accountId = this.requiredString(payload.zaloAccountId, 'Thiếu zaloAccountId.');
    const account = await this.prisma.client.zaloAccount.findFirst({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản OA.');
    }
    if (String(account.accountType).toUpperCase() !== 'OA') {
      throw new BadRequestException('zaloAccountId không thuộc loại OA.');
    }

    const externalThreadId = this.requiredString(payload.externalThreadId, 'Thiếu externalThreadId.');
    const senderType = this.parseSenderType(payload.senderType, ConversationSenderType.CUSTOMER);

    const message = await this.conversationsService.ingestExternalMessage({
      channel: ConversationChannel.ZALO_OA,
      channelAccountId: accountId,
      externalThreadId,
      externalMessageId: this.optionalString(payload.externalMessageId),
      senderType,
      senderExternalId: this.optionalString(payload.senderExternalId),
      senderName: this.optionalString(payload.senderName),
      content: this.optionalString(payload.content) ?? '',
      contentType: this.optionalString(payload.contentType) ?? 'TEXT',
      sentAt: payload.sentAt ? this.parseDate(payload.sentAt, 'sentAt') : new Date(),
      customerId: this.optionalString(payload.customerId),
      customerDisplayName: this.optionalString(payload.customerDisplayName),
      metadataJson: (payload.metadataJson as any) ?? undefined,
      attachmentsJson: (payload.attachmentsJson as any) ?? undefined
    });

    return {
      success: true,
      message
    };
  }

  async listAccountAssignments(id: string) {
    await this.requireAccount(id);
    return this.zaloAssignment.listAssignmentsForAccount(id);
  }

  async upsertAccountAssignment(id: string, userId: string, payload: Record<string, unknown>) {
    await this.requireAccount(id);
    const permissionLevel = this.optionalString(payload.permissionLevel);
    return this.zaloAssignment.upsertAssignment(id, userId, permissionLevel);
  }

  async revokeAccountAssignment(id: string, userId: string) {
    await this.requireAccount(id);
    return this.zaloAssignment.revokeAssignment(id, userId);
  }

  async getOperationalMetrics() {
    await this.zaloAssignment.assertCanViewOperationalMetrics();
    const tenantId = this.prisma.getTenantId();
    const accounts = await this.prisma.client.zaloAccount.findMany({
      where: { tenant_Id: tenantId },
      select: {
        id: true,
        accountType: true,
        status: true
      }
    });

    const statusBreakdown: Record<string, number> = {};
    let personalTotalAccounts = 0;
    let oaTotalAccounts = 0;
    let personalActiveAccounts = 0;
    let oaActiveAccounts = 0;
    let activeAccounts = 0;

    for (const account of accounts) {
      const accountType = String(account.accountType ?? 'PERSONAL').toUpperCase();
      const status = String(account.status ?? 'DISCONNECTED').toUpperCase();
      statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1;

      const isActive = status === 'CONNECTED';
      if (isActive) {
        activeAccounts += 1;
      }

      if (accountType === 'OA') {
        oaTotalAccounts += 1;
        if (isActive) {
          oaActiveAccounts += 1;
        }
        continue;
      }

      personalTotalAccounts += 1;
      if (isActive) {
        personalActiveAccounts += 1;
      }
    }

    const reconnectMetrics = this.personalPool.getReconnectFailureMetrics(accounts.map((account) => account.id));
    const assignmentMetrics = await this.zaloAssignment.getAssignmentMismatchMetrics();

    return {
      generatedAt: new Date(),
      accountMetrics: {
        totalAccounts: accounts.length,
        activeAccounts,
        personalTotalAccounts,
        personalActiveAccounts,
        oaTotalAccounts,
        oaActiveAccounts,
        statusBreakdown
      },
      reconnectMetrics,
      assignmentMetrics
    };
  }

  private async verifyOaWebhookSignature(rawBody: string, signatureHeader?: string) {
    const integrationRuntime = await this.runtimeSettings.getIntegrationRuntime();
    const secret =
      integrationRuntime.zalo.webhookSecret.trim()
      || this.config.get<string>('ZALO_OA_WEBHOOK_SECRET', '').trim();
    if (!secret) {
      throw new UnauthorizedException('Thiếu cấu hình ZALO_OA_WEBHOOK_SECRET. Không thể xác thực webhook.');
    }

    if (!signatureHeader) {
      throw new UnauthorizedException('Thiếu chữ ký webhook.');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected !== signatureHeader.trim()) {
      throw new UnauthorizedException('Chữ ký webhook không hợp lệ.');
    }
  }

  private async requirePersonalAccount(id: string) {
    const account = await this.prisma.client.zaloAccount.findFirst({ where: { id } });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản Zalo.');
    }

    if (String(account.accountType).toUpperCase() !== 'PERSONAL') {
      throw new BadRequestException('Tài khoản không phải loại PERSONAL.');
    }

    return account;
  }

  private async requireAccount(id: string) {
    const account = await this.prisma.client.zaloAccount.findFirst({ where: { id } });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản Zalo.');
    }
    return account;
  }

  private async requireOaAccount(id: string) {
    const account = await this.prisma.client.zaloAccount.findFirst({ where: { id } });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản Zalo.');
    }

    if (String(account.accountType).toUpperCase() !== 'OA') {
      throw new BadRequestException('Tài khoản không phải loại OA.');
    }

    return account;
  }

  private extractContactsFromZaloPayload(payload: unknown) {
    if (Array.isArray(payload)) {
      return payload.filter((row) => row && typeof row === 'object') as Record<string, unknown>[];
    }
    if (!payload || typeof payload !== 'object') {
      return [];
    }
    return Object.values(payload as Record<string, unknown>)
      .filter((row) => row && typeof row === 'object')
      .map((row) => row as Record<string, unknown>);
  }

  private resolveContactDisplayName(contact: Record<string, unknown>) {
    const candidates = [
      contact.zaloName,
      contact.zalo_name,
      contact.displayName,
      contact.display_name,
      contact.fullName,
      contact.full_name
    ];
    for (const candidate of candidates) {
      const value = this.optionalString(candidate);
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  private resolveContactUid(contact: Record<string, unknown>) {
    const candidates = [
      contact.uid,
      contact.uidFrom,
      contact.uid_from,
      contact.userId,
      contact.user_id,
      contact.id,
      contact.profileId,
      contact.profile_id
    ];
    for (const candidate of candidates) {
      const value = this.optionalString(candidate);
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  private resolveUidFromLookupRecord(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return undefined;
    }
    const record = input as Record<string, unknown>;
    return this.optionalString(
      record.uid
      ?? record.userId
      ?? record.user_id
      ?? record.id
      ?? record.profileId
      ?? record.profile_id
    );
  }

  private resolveDisplayNameFromLookupRecord(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return undefined;
    }
    const record = input as Record<string, unknown>;
    return this.optionalString(
      record.display_name
      ?? record.displayName
      ?? record.zalo_name
      ?? record.zaloName
      ?? record.fullName
      ?? record.full_name
    );
  }

  private appendResolvedPhoneThread(
    byPhone: Map<string, Array<{ accountId: string; externalThreadId: string; displayName?: string }>>,
    normalizedPhone: string,
    row: { accountId: string; externalThreadId: string; displayName?: string }
  ) {
    const rows = byPhone.get(normalizedPhone) ?? [];
    const duplicated = rows.some(
      (item) => item.accountId === row.accountId && item.externalThreadId === row.externalThreadId
    );
    if (duplicated) {
      return;
    }
    rows.push(row);
    byPhone.set(normalizedPhone, rows);
  }

  private resolveContactPhone(contact: Record<string, unknown>) {
    const candidates = [
      contact.phoneNumber,
      contact.phone,
      contact.phone_number,
      contact.mobile,
      contact.mobileNumber
    ];
    for (const candidate of candidates) {
      const value = this.optionalString(candidate);
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  private normalizePhoneForSync(rawPhone?: string) {
    const normalized = normalizeVietnamPhone(rawPhone);
    if (!normalized) {
      return undefined;
    }

    const compact = normalized.replace(/[^\d+]/g, '');
    if (!compact) {
      return undefined;
    }

    if (compact.startsWith('+84')) {
      return `0${compact.slice(3)}`;
    }
    if (compact.startsWith('84')) {
      return `0${compact.slice(2)}`;
    }
    return compact;
  }

  private isViablePhone(phone: string) {
    return /^[0-9]{8,15}$/.test(phone);
  }

  private parsePersonalSendOrigin(input: unknown, fallback: PersonalSendOrigin): PersonalSendOrigin {
    const candidate = String(input ?? '').trim().toUpperCase();
    if (candidate === 'USER' || candidate === 'CAMPAIGN' || candidate === 'AI' || candidate === 'SYSTEM') {
      return candidate;
    }
    return fallback;
  }

  private toConversationMessageOrigin(origin: PersonalSendOrigin): ConversationMessageOrigin {
    if (origin === 'AI') {
      return ConversationMessageOrigin.AI;
    }
    if (origin === 'CAMPAIGN') {
      return ConversationMessageOrigin.CAMPAIGN;
    }
    if (origin === 'SYSTEM') {
      return ConversationMessageOrigin.SYSTEM;
    }
    return ConversationMessageOrigin.USER;
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

  private parseInt(input: unknown, fallback: number, min: number, max: number) {
    if (input === null || input === undefined || input === '') {
      return fallback;
    }
    const value = Number(input);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return Math.round(value);
  }

  private parseAccountType(input: unknown, fallback: AccountType): AccountType {
    const candidate = String(input ?? '').trim().toUpperCase();
    if (candidate === 'PERSONAL' || candidate === 'OA') {
      return candidate;
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

  private resolveDefaultTaxonomyValue(values: string[]) {
    for (const value of values) {
      const normalized = this.optionalString(value);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  private resolvePreferredSourceValue(values: string[], preferred: string[]) {
    const normalizedValues = values
      .map((value) => this.optionalString(value))
      .filter((value): value is string => Boolean(value));
    if (normalizedValues.length === 0) {
      return null;
    }
    for (const preferredValue of preferred) {
      const match = normalizedValues.find((item) => item.toLowerCase() === preferredValue.toLowerCase());
      if (match) {
        return match;
      }
    }
    return null;
  }

  private parseDate(input: unknown, fieldName: string) {
    const parsed = new Date(String(input));
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} không hợp lệ.`);
    }
    return parsed;
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

  private resolveCurrentActorContext() {
    const authUser = this.ensureRecord(this.cls.get(AUTH_USER_CONTEXT_KEY));
    const userId = this.cleanString(authUser.userId ?? authUser.sub) || null;
    const role = this.cleanString(authUser.role).toUpperCase();
    return {
      userId,
      role
    };
  }
}
