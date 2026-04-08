import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConversationChannel, ConversationMessageOrigin, ConversationSenderType } from '@prisma/client';
import { createRequire } from 'node:module';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ZaloAutomationRealtimeService } from './zalo-automation-realtime.service';
import { ZaloAiJobsService } from './zalo-ai-jobs.service';
import { ZaloAiRoutingService } from './zalo-ai-routing.service';
import { buildFriendAlias, normalizeAliasPhone } from './zalo-friend-alias.util';
import { ZaloAutoReplyService } from './zalo-auto-reply.service';
import { patchZaloAutoReplyThreadState, readZaloAutoReplyThreadState } from './zalo-auto-reply-state.util';

type PersonalPoolStatus = 'DISCONNECTED' | 'QR_PENDING' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

type PersonalInstance = {
  zalo: any;
  api: any | null;
  status: PersonalPoolStatus;
  lastQrImage?: string;
  updatedAt: Date;
};

type SavedSession = {
  cookie?: unknown;
  imei?: string;
  userAgent?: string;
};

type ReconnectFailureMetric = {
  count: number;
  lastFailureAt: Date | null;
  lastErrorMessage: string | null;
};

type ListenerDebugSnapshot = {
  lastRawEventAt: Date | null;
  lastRawEvent: {
    threadId: string | null;
    senderExternalId: string | null;
    messageId: string | null;
    messageType: number | null;
    isSelf: boolean | null;
    topLevelKeys: string[];
  } | null;
  lastIngestedAt: Date | null;
  lastIngestedThreadId: string | null;
  lastIngestedSenderType: string | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  lastConnectedAt: Date | null;
  lastClosedAt: Date | null;
  lastCloseReason: string | null;
};

type StickerPayloadSnapshot = {
  id: number;
  catId: number | null;
  type: number | null;
  raw: Record<string, unknown>;
};

type StickerDetailSnapshot = {
  id: number;
  cateId: number | null;
  type: number | null;
  text: string | null;
  stickerUrl: string | null;
  stickerWebpUrl: string | null;
  stickerSpriteUrl: string | null;
};

type NormalizedInboundContent = {
  content: string;
  contentType: string;
  attachmentsJson?: Record<string, unknown>;
};

type InboundSource = 'message' | 'old_messages';

@Injectable()
export class ZaloPersonalPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZaloPersonalPoolService.name);
  private readonly instances = new Map<string, PersonalInstance>();
  private readonly reconnectFailuresByAccount = new Map<string, ReconnectFailureMetric>();
  private readonly listenerDebugByAccount = new Map<string, ListenerDebugSnapshot>();
  private readonly stickerDetailCache = new Map<number, StickerDetailSnapshot>();
  private readonly autoReplyTimerByThread = new Map<string, NodeJS.Timeout>();
  private reconnectFailureTotal = 0;
  private readonly orgIdByAccount = new Map<string, string>();
  private readonly require = createRequire(import.meta.url);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly zaloRealtime: ZaloAutomationRealtimeService,
    private readonly autoReplyService: ZaloAutoReplyService,
    private readonly aiRoutingService: ZaloAiRoutingService,
    private readonly aiJobsService: ZaloAiJobsService
  ) {}

  onModuleInit() {
    if (!this.isPrismaReady()) {
      this.logger.warn('Skip restoring personal sessions: Prisma service is not ready.');
      return;
    }

    void this.restoreConnectedPersonalSessions()
      .catch((error) => {
        this.logger.warn(`Failed restoring personal sessions on init: ${this.normalizeErrorMessage(error)}`);
      });
  }

  onModuleDestroy() {
    for (const timer of this.autoReplyTimerByThread.values()) {
      clearTimeout(timer);
    }
    this.autoReplyTimerByThread.clear();
  }

  async startQrLogin(accountId: string): Promise<void> {
    const ZaloCtor = this.resolveZaloCtor();
    const zalo = new ZaloCtor({ logging: false, selfListen: true });
    const orgId = await this.resolveOrgId(accountId);

    this.instances.set(accountId, {
      zalo,
      api: null,
      status: 'QR_PENDING',
      updatedAt: new Date()
    });

    await this.updateAccountStatus(accountId, 'QR_PENDING');
    this.zaloRealtime.emitScoped({
      orgId,
      accountId,
      event: 'zalo:qr',
      payload: {
        accountId,
        status: 'QR_PENDING'
      }
    });

    try {
      const api = await zalo.loginQR({}, (event: any) => {
        const type = Number(event?.type ?? -1);
        if (type === 0) {
          const qrImage = typeof event?.data?.image === 'string' ? event.data.image : '';
          if (qrImage) {
            const inst = this.instances.get(accountId);
            if (inst) {
              inst.lastQrImage = qrImage;
              inst.updatedAt = new Date();
              this.instances.set(accountId, inst);
            }
            this.zaloRealtime.emitScoped({
              orgId,
              accountId,
              event: 'zalo:qr',
              payload: {
                accountId,
                qrImage
              }
            });
          }
          return;
        }

        if (type === 1) {
          this.zaloRealtime.emitScoped({
            orgId,
            accountId,
            event: 'zalo:qr-expired',
            payload: {
              accountId
            }
          });
          return;
        }

        if (type === 2) {
          this.zaloRealtime.emitScoped({
            orgId,
            accountId,
            event: 'zalo:scanned',
            payload: {
              accountId,
              displayName: String(event?.data?.display_name ?? event?.data?.zaloName ?? '').trim() || undefined,
              avatar: String(event?.data?.avatar ?? '').trim() || undefined
            }
          });
          return;
        }

        if (type === 4) {
          const session: SavedSession = {
            cookie: event?.data?.cookie,
            imei: event?.data?.imei,
            userAgent: event?.data?.userAgent
          };
          void this.persistSession(accountId, session);
        }
      });

      const inst = this.instances.get(accountId);
      if (!inst) {
        return;
      }

      inst.api = api;
      inst.status = 'CONNECTED';
      inst.updatedAt = new Date();
      this.instances.set(accountId, inst);

      const ownId = await this.safeGetOwnId(api);
      await this.prisma.client.zaloAccount.updateMany({
        where: { id: accountId },
        data: {
          status: 'CONNECTED',
          zaloUid: ownId ?? undefined,
          lastConnectedAt: new Date()
        }
      });
      this.zaloRealtime.emitScoped({
        orgId,
        accountId,
        event: 'zalo:connected',
        payload: {
          accountId,
          zaloUid: ownId ?? null
        }
      });

      this.attachListener(accountId, api);
    } catch (error) {
      this.logger.error(`startQrLogin failed for ${accountId}: ${(error as Error).message}`);
      await this.updateAccountStatus(accountId, 'ERROR');
      const inst = this.instances.get(accountId);
      if (inst) {
        inst.status = 'ERROR';
        inst.updatedAt = new Date();
        this.instances.set(accountId, inst);
      }
      this.zaloRealtime.emitScoped({
        orgId,
        accountId,
        event: 'zalo:error',
        payload: {
          accountId,
          error: this.normalizeErrorMessage(error)
        }
      });
      throw error;
    }
  }

  async reconnectWithSavedSession(accountId: string, session: SavedSession): Promise<void> {
    const ZaloCtor = this.resolveZaloCtor();
    const zalo = new ZaloCtor({ logging: false, selfListen: true });
    const orgId = await this.resolveOrgId(accountId);

    this.instances.set(accountId, {
      zalo,
      api: null,
      status: 'CONNECTING',
      updatedAt: new Date()
    });

    await this.updateAccountStatus(accountId, 'CONNECTING');

    try {
      const api = await zalo.login({
        cookie: session.cookie,
        imei: session.imei,
        userAgent: session.userAgent
      });

      const inst = this.instances.get(accountId);
      if (!inst) {
        return;
      }

      inst.api = api;
      inst.status = 'CONNECTED';
      inst.updatedAt = new Date();
      this.instances.set(accountId, inst);

      const ownId = await this.safeGetOwnId(api);
      await this.prisma.client.zaloAccount.updateMany({
        where: { id: accountId },
        data: {
          status: 'CONNECTED',
          zaloUid: ownId ?? undefined,
          lastConnectedAt: new Date()
        }
      });
      this.zaloRealtime.emitScoped({
        orgId,
        accountId,
        event: 'zalo:connected',
        payload: {
          accountId,
          zaloUid: ownId ?? null
        }
      });

      this.attachListener(accountId, api);
    } catch (error) {
      this.recordReconnectFailure(accountId, error);
      this.logger.error(`reconnectWithSavedSession failed for ${accountId}: ${(error as Error).message}`);
      await this.updateAccountStatus(accountId, 'ERROR');
      const inst = this.instances.get(accountId);
      if (inst) {
        inst.status = 'ERROR';
        inst.updatedAt = new Date();
        this.instances.set(accountId, inst);
      }
      this.zaloRealtime.emitScoped({
        orgId,
        accountId,
        event: 'zalo:reconnect-failed',
        payload: {
          accountId,
          error: this.normalizeErrorMessage(error)
        }
      });
      throw error;
    }
  }

  async sendMessage(
    accountId: string,
    externalThreadId: string,
    content: string,
    threadType: 'user' | 'group' = 'user',
    senderName?: string,
    origin: ConversationMessageOrigin = ConversationMessageOrigin.USER
  ) {
    const inst = this.instances.get(accountId);
    if (!inst?.api) {
      throw new ServiceUnavailableException('Tài khoản Zalo cá nhân chưa kết nối.');
    }

    const threadId = externalThreadId.trim();
    if (!threadId) {
      throw new ServiceUnavailableException('Thiếu externalThreadId.');
    }

    const sendResult = await inst.api.sendMessage({ msg: content }, threadId, threadType === 'group' ? 1 : 0);
    const externalMessageId = this.resolveOutboundMessageId(sendResult);
    if (!externalMessageId) {
      this.logger.warn(
        `Skip optimistic personal ingest for ${accountId} thread ${threadId}: missing externalMessageId from send response; waiting listener sync.`
      );
      return { success: true };
    }

    const normalizedSenderName = String(senderName ?? '').trim();

    await this.conversationsService.ingestExternalMessage({
      channel: ConversationChannel.ZALO_PERSONAL,
      channelAccountId: accountId,
      externalThreadId: threadId,
      externalMessageId: externalMessageId || undefined,
      senderType: ConversationSenderType.AGENT,
      origin,
      senderName: normalizedSenderName || 'Staff',
      content,
      contentType: 'TEXT',
      sentAt: new Date()
    });

    return { success: true };
  }

  cancelAutoReplyForThread(threadId: string) {
    const normalizedThreadId = String(threadId ?? '').trim();
    if (!normalizedThreadId) {
      return;
    }
    const timer = this.autoReplyTimerByThread.get(normalizedThreadId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.autoReplyTimerByThread.delete(normalizedThreadId);
  }

  async disconnect(accountId: string): Promise<void> {
    const inst = this.instances.get(accountId);
    if (inst?.api?.listener) {
      try {
        inst.api.listener.stop();
      } catch (error) {
        this.logger.warn(`Failed to stop listener for ${accountId}: ${(error as Error).message}`);
      }
    }

    this.instances.delete(accountId);
    const accountThreads = await this.prisma.client.conversationThread.findMany({
      where: {
        channel: ConversationChannel.ZALO_PERSONAL,
        channelAccountId: accountId
      },
      select: { id: true }
    });
    for (const thread of accountThreads) {
      this.cancelAutoReplyForThread(thread.id);
    }
    await this.updateAccountStatus(accountId, 'DISCONNECTED');
    const orgId = await this.resolveOrgId(accountId);
    this.zaloRealtime.emitScoped({
      orgId,
      accountId,
      event: 'zalo:disconnected',
      payload: {
        accountId
      }
    });
  }

  getStatus(accountId: string): PersonalPoolStatus {
    return this.instances.get(accountId)?.status ?? 'DISCONNECTED';
  }

  getQrImage(accountId: string): string | null {
    return this.instances.get(accountId)?.lastQrImage ?? null;
  }

  getConnectedApi(accountId: string) {
    const inst = this.instances.get(accountId);
    if (!inst || inst.status !== 'CONNECTED') {
      return null;
    }
    return inst.api ?? null;
  }

  getListenerDebug(accountId: string) {
    const inst = this.instances.get(accountId);
    const listener = inst?.api?.listener;
    const wsState = Number(listener?.ws?.readyState);
    const wsStateLabel = wsState === 0
      ? 'CONNECTING'
      : wsState === 1
        ? 'OPEN'
        : wsState === 2
          ? 'CLOSING'
          : wsState === 3
            ? 'CLOSED'
            : 'UNKNOWN';

    const snapshot = this.listenerDebugByAccount.get(accountId) ?? this.createEmptyListenerSnapshot();

    return {
      accountId,
      poolStatus: inst?.status ?? 'DISCONNECTED',
      hasApi: Boolean(inst?.api),
      hasListener: Boolean(listener),
      wsState,
      wsStateLabel,
      ...snapshot
    };
  }

  requestOldMessages(accountId: string) {
    const inst = this.instances.get(accountId);
    const listener = inst?.api?.listener;
    if (!listener || typeof listener.requestOldMessages !== 'function') {
      return {
        accountId,
        triggered: false,
        reason: 'LISTENER_NOT_READY'
      };
    }

    try {
      listener.requestOldMessages(0);
      listener.requestOldMessages(1);
      return {
        accountId,
        triggered: true
      };
    } catch (error) {
      return {
        accountId,
        triggered: false,
        reason: this.normalizeErrorMessage(error)
      };
    }
  }

  getReconnectFailureMetrics(accountIds?: string[]) {
    const scopedAccountIds = accountIds && accountIds.length > 0 ? new Set(accountIds) : null;
    const byAccount = [...this.reconnectFailuresByAccount.entries()]
      .filter(([accountId]) => !scopedAccountIds || scopedAccountIds.has(accountId))
      .map(([accountId, metric]) => ({
        accountId,
        count: metric.count,
        lastFailureAt: metric.lastFailureAt,
        lastErrorMessage: metric.lastErrorMessage
      }))
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return a.accountId.localeCompare(b.accountId);
      });

    const totalFailures = scopedAccountIds
      ? byAccount.reduce((sum, row) => sum + row.count, 0)
      : this.reconnectFailureTotal;

    return {
      totalFailures,
      byAccount
    };
  }

  private resolveZaloCtor(): new (opts: { logging: boolean; selfListen?: boolean }) => any {
    try {
      const loaded = this.require('zca-js') as { Zalo?: new (opts: { logging: boolean; selfListen?: boolean }) => any };
      if (!loaded?.Zalo) {
        throw new Error('zca-js does not export Zalo');
      }
      return loaded.Zalo;
    } catch (error) {
      this.logger.error(`Cannot load zca-js: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Thiếu dependency zca-js. Hãy cài đặt trước khi bật Zalo cá nhân.');
    }
  }

  private attachListener(accountId: string, api: any) {
    const listener = api?.listener;
    if (!listener) {
      return;
    }

    listener.on('connected', () => {
      this.updateListenerDebug(accountId, {
        lastConnectedAt: new Date()
      });
    });

    listener.on('message', async (message: any) => {
      this.updateListenerDebug(accountId, {
        lastRawEventAt: new Date(),
        lastRawEvent: {
          threadId: this.pickFirstNonEmptyString(
            message?.threadId,
            message?.thread_id,
            message?.data?.threadId,
            message?.data?.thread_id,
            message?.conversationId,
            message?.conversation_id,
            message?.data?.conversationId,
            message?.data?.conversation_id
          ) || null,
          senderExternalId: this.pickFirstNonEmptyString(
            message?.data?.uidFrom,
            message?.data?.uid_from,
            message?.data?.fromUid,
            message?.data?.from_uid,
            message?.uidFrom,
            message?.uid_from,
            message?.fromUid,
            message?.from_uid,
            message?.data?.uid,
            message?.uid
          ) || null,
          messageId: this.pickFirstNonEmptyString(
            message?.data?.msgId,
            message?.data?.msg_id,
            message?.msgId,
            message?.msg_id,
            message?.data?.messageId,
            message?.data?.message_id
          ) || null,
          messageType: Number.isFinite(Number(message?.type ?? message?.data?.type))
            ? Number(message?.type ?? message?.data?.type)
            : null,
          isSelf: typeof message?.isSelf === 'boolean' ? message.isSelf : null,
          topLevelKeys: Object.keys(message ?? {})
        }
      });

      await this.handleInboundMessage(accountId, api, message, 'message');
    });

    listener.on('old_messages', async (messages: any[] = []) => {
      for (const message of messages) {
        await this.handleInboundMessage(accountId, api, message, 'old_messages');
      }
    });

    listener.on('undo', async (payload: any) => {
      const externalMessageId = String(payload?.data?.msgId ?? payload?.msgId ?? '').trim();
      if (!externalMessageId) {
        return;
      }
      await this.prisma.client.conversationMessage.updateMany({
        where: {
          externalMessageId
        },
        data: {
          isDeleted: true,
          deletedAt: new Date()
        }
      });
      const orgId = await this.resolveOrgId(accountId);
      this.zaloRealtime.emitScoped({
        orgId,
        accountId,
        event: 'chat:deleted',
        payload: {
          accountId,
          msgId: externalMessageId
        }
      });
    });

    listener.on('closed', async (code?: number, reason?: string) => {
      await this.updateAccountStatus(accountId, 'DISCONNECTED');
      const inst = this.instances.get(accountId);
      if (inst) {
        inst.status = 'DISCONNECTED';
        inst.updatedAt = new Date();
        this.instances.set(accountId, inst);
      }
      const orgId = await this.resolveOrgId(accountId);
      this.zaloRealtime.emitScoped({
        orgId,
        accountId,
        event: 'zalo:disconnected',
        payload: {
          accountId,
          code: Number.isFinite(code) ? code : undefined,
          reason: reason ? String(reason) : undefined
        }
      });
      this.updateListenerDebug(accountId, {
        lastClosedAt: new Date(),
        lastCloseReason: reason ? String(reason) : (Number.isFinite(code) ? `CLOSE_CODE_${code}` : 'UNKNOWN')
      });
    });

    listener.on('error', async (error: unknown) => {
      this.updateListenerDebug(accountId, {
        lastErrorAt: new Date(),
        lastErrorMessage: this.normalizeErrorMessage(error)
      });
      const orgId = await this.resolveOrgId(accountId);
      this.zaloRealtime.emitScoped({
        orgId,
        accountId,
        event: 'zalo:error',
        payload: {
          accountId,
          error: this.normalizeErrorMessage(error)
        }
      });
    });

    listener.start({ retryOnClose: true });
  }

  private resolveOutboundMessageId(sendResponse: unknown): string {
    if (sendResponse === null || sendResponse === undefined) {
      return '';
    }

    if (typeof sendResponse === 'string' || typeof sendResponse === 'number') {
      return String(sendResponse).trim();
    }

    if (Array.isArray(sendResponse)) {
      for (const item of sendResponse) {
        const resolved = this.resolveOutboundMessageId(item);
        if (resolved) {
          return resolved;
        }
      }
      return '';
    }

    const payload = sendResponse as Record<string, unknown>;
    const fromNestedMessage = this.resolveOutboundMessageId(payload.message);
    if (fromNestedMessage) {
      return fromNestedMessage;
    }
    const fromNestedAttachment = this.resolveOutboundMessageId(payload.attachment);
    if (fromNestedAttachment) {
      return fromNestedAttachment;
    }
    const fromNestedResponse = this.resolveOutboundMessageId(payload.response);
    if (fromNestedResponse) {
      return fromNestedResponse;
    }
    const fromNestedResult = this.resolveOutboundMessageId(payload.result);
    if (fromNestedResult) {
      return fromNestedResult;
    }

    return this.pickFirstNonEmptyString(
      payload.msgId,
      payload.msg_id,
      payload.messageId,
      payload.message_id,
      payload.cliMsgId,
      payload.cli_msg_id,
      (payload.data as Record<string, unknown> | undefined)?.msgId,
      (payload.data as Record<string, unknown> | undefined)?.msg_id,
      (payload.data as Record<string, unknown> | undefined)?.messageId,
      (payload.data as Record<string, unknown> | undefined)?.message_id
    );
  }

  private async handleInboundMessage(accountId: string, api: any, message: any, source: InboundSource) {
    try {
      const senderExternalId = this.pickFirstNonEmptyString(
        message?.data?.uidFrom,
        message?.data?.uid_from,
        message?.data?.fromUid,
        message?.data?.from_uid,
        message?.uidFrom,
        message?.uid_from,
        message?.fromUid,
        message?.from_uid,
        message?.data?.uid,
        message?.uid
      );

      const externalThreadId = this.pickFirstNonEmptyString(
        message?.threadId,
        message?.thread_id,
        message?.data?.threadId,
        message?.data?.thread_id,
        message?.conversationId,
        message?.conversation_id,
        message?.data?.conversationId,
        message?.data?.conversation_id,
        senderExternalId
      );

      if (!externalThreadId) {
        this.logger.warn(
          `Skip inbound ${source} for ${accountId}: cannot resolve externalThreadId (keys=${Object.keys(message ?? {}).join(',')})`
        );
        return;
      }

      const rawContent = message?.data?.content ?? message?.content ?? message?.data?.message ?? message?.message ?? '';
      const normalizedContent = await this.normalizeIncomingContent(rawContent, message, api);
      const contentType = normalizedContent.contentType || this.detectContentType(rawContent);
      const phoneFromPayload = this.extractInboundPhoneCandidate(message);
      const senderName = this.pickFirstNonEmptyString(
        message?.data?.dName,
        message?.data?.displayName,
        message?.data?.fromDisplayName,
        message?.senderName,
        senderExternalId
      );
      const sentAt = this.parseZaloSentAt(
        message?.data?.ts ??
          message?.data?.timestamp ??
          message?.ts ??
          message?.timestamp ??
          Date.now()
      );
      const isGroup = Number(message?.type ?? message?.data?.type ?? 0) === 1;
      const senderType = message?.isSelf ? ConversationSenderType.AGENT : ConversationSenderType.CUSTOMER;
      const externalMessageId = this.pickFirstNonEmptyString(
        message?.data?.msgId,
        message?.data?.msg_id,
        message?.data?.messageId,
        message?.data?.message_id,
        message?.msgId,
        message?.msg_id,
        message?.messageId,
        message?.message_id
      );
      const customerDisplayName = isGroup
        ? this.pickFirstNonEmptyString(message?.data?.gName, message?.data?.groupName, message?.groupName)
        : senderName;

      const ingestedMessage = await this.conversationsService.ingestExternalMessage({
        channel: ConversationChannel.ZALO_PERSONAL,
        channelAccountId: accountId,
        externalThreadId,
        externalMessageId: externalMessageId || undefined,
        senderType,
        senderExternalId: senderExternalId || undefined,
        senderName: senderName || undefined,
        content: normalizedContent.content,
        contentType,
        attachmentsJson: normalizedContent.attachmentsJson as any,
        sentAt,
        customerDisplayName: customerDisplayName || undefined
      });

      if (!isGroup && senderType === ConversationSenderType.CUSTOMER) {
        await this.tryUpdateInboundFriendAlias({
          accountId,
          api,
          externalThreadId,
          threadId: this.pickFirstNonEmptyString((ingestedMessage as { threadId?: unknown })?.threadId) || undefined,
          senderName: senderName || customerDisplayName || undefined,
          phone: phoneFromPayload || undefined
        });

        await this.handleAutoReplyAfterInboundCustomerMessage({
          accountId,
          externalThreadId,
          threadId: this.pickFirstNonEmptyString((ingestedMessage as { threadId?: unknown })?.threadId) || undefined,
          messageId: this.pickFirstNonEmptyString((ingestedMessage as { id?: unknown })?.id) || undefined,
          sentAt
        });
      }

      this.updateListenerDebug(accountId, {
        lastIngestedAt: new Date(),
        lastIngestedThreadId: externalThreadId,
        lastIngestedSenderType: senderType
      });
    } catch (error) {
      const errorMessage = this.normalizeErrorMessage(error);
      this.updateListenerDebug(accountId, {
        lastErrorAt: new Date(),
        lastErrorMessage: errorMessage
      });
      this.logger.error(`Listener ${source} error for ${accountId}: ${errorMessage}`);
    }
  }

  private async handleAutoReplyAfterInboundCustomerMessage(input: {
    accountId: string;
    externalThreadId: string;
    threadId?: string;
    messageId?: string;
    sentAt: Date;
  }) {
    const threadId = this.pickFirstNonEmptyString(input.threadId);
    const customerMessageId = this.pickFirstNonEmptyString(input.messageId);
    if (!threadId || !customerMessageId) {
      return;
    }

    const account = await this.prisma.client.zaloAccount.findFirst({
      where: {
        id: input.accountId,
        accountType: 'PERSONAL'
      },
      select: {
        id: true,
        aiAutoReplyEnabled: true,
        aiAutoReplyTakeoverMinutes: true
      }
    });
    if (!account?.aiAutoReplyEnabled) {
      return;
    }

    const thread = await this.prisma.client.conversationThread.findFirst({
      where: {
        id: threadId,
        channel: ConversationChannel.ZALO_PERSONAL,
        channelAccountId: account.id
      },
      select: {
        id: true,
        externalThreadId: true,
        metadataJson: true
      }
    });
    if (!thread) {
      return;
    }

    const state = readZaloAutoReplyThreadState(thread.metadataJson);
    if (state.lastHandledCustomerMessageId === customerMessageId) {
      return;
    }

    const routingRuntime = await this.aiRoutingService.getRuntimeConfig();
    const debounceMs = Math.max(1_000, routingRuntime.debounceSeconds * 1_000);
    const takeoverMinutes = this.normalizeTakeoverMinutes(account.aiAutoReplyTakeoverMinutes);
    const pauseUntil = this.readDateSafely(state.pauseUntil);
    const dueAt = new Date(
      Math.max(
        input.sentAt.getTime() + debounceMs,
        pauseUntil ? pauseUntil.getTime() : 0,
        pauseUntil ? input.sentAt.getTime() + takeoverMinutes * 60_000 : 0
      )
    );

    await this.prisma.client.conversationThread.updateMany({
      where: { id: thread.id },
      data: {
        metadataJson: patchZaloAutoReplyThreadState(thread.metadataJson, {
          pendingCustomerMessageId: customerMessageId,
          pendingCustomerSentAt: input.sentAt.toISOString(),
          pendingDueAt: dueAt.toISOString(),
          lastHandledCustomerMessageId: customerMessageId
        })
      }
    });

    this.scheduleDeferredAutoReply(thread.id, dueAt);
  }

  private async runDeferredAutoReplyByThread(threadId: string) {
    this.autoReplyTimerByThread.delete(threadId);

    const thread = await this.prisma.client.conversationThread.findFirst({
      where: {
        id: threadId,
        channel: ConversationChannel.ZALO_PERSONAL
      },
      select: {
        id: true,
        channelAccountId: true,
        externalThreadId: true,
        metadataJson: true
      }
    });
    if (!thread?.channelAccountId) {
      return;
    }

    const account = await this.prisma.client.zaloAccount.findFirst({
      where: {
        id: thread.channelAccountId,
        accountType: 'PERSONAL'
      },
      select: {
        id: true,
        aiAutoReplyEnabled: true,
        aiAutoReplyTakeoverMinutes: true
      }
    });
    if (!account?.aiAutoReplyEnabled) {
      await this.prisma.client.conversationThread.updateMany({
        where: { id: thread.id },
        data: {
          metadataJson: patchZaloAutoReplyThreadState(thread.metadataJson, {
            clearPending: true
          })
        }
      });
      return;
    }

    const state = readZaloAutoReplyThreadState(thread.metadataJson);
    const pendingCustomerMessageId = this.pickFirstNonEmptyString(state.pendingCustomerMessageId);
    if (!pendingCustomerMessageId) {
      return;
    }

    const takeoverMinutes = this.normalizeTakeoverMinutes(account.aiAutoReplyTakeoverMinutes);
    const pendingSentAt = this.readDateSafely(state.pendingCustomerSentAt);
    const dueAt = this.resolvePendingDueAt(state.pendingDueAt, pendingSentAt, takeoverMinutes);
    if (!dueAt) {
      await this.prisma.client.conversationThread.updateMany({
        where: { id: thread.id },
        data: {
          metadataJson: patchZaloAutoReplyThreadState(thread.metadataJson, {
            clearPending: true
          })
        }
      });
      return;
    }

    const now = Date.now();
    if (dueAt.getTime() > now) {
      this.scheduleDeferredAutoReply(thread.id, dueAt);
      return;
    }

    const pendingCustomerMessage = await this.prisma.client.conversationMessage.findFirst({
      where: {
        id: pendingCustomerMessageId,
        threadId: thread.id,
        senderType: ConversationSenderType.CUSTOMER
      },
      select: {
        id: true,
        sentAt: true
      }
    });
    if (!pendingCustomerMessage) {
      await this.prisma.client.conversationThread.updateMany({
        where: { id: thread.id },
        data: {
          metadataJson: patchZaloAutoReplyThreadState(thread.metadataJson, {
            clearPending: true
          })
        }
      });
      return;
    }

    const hasAgentReply = await this.autoReplyService.hasAgentReplyAfter(thread.id, pendingCustomerMessage.sentAt);
    if (hasAgentReply) {
      await this.prisma.client.conversationThread.updateMany({
        where: { id: thread.id },
        data: {
          metadataJson: patchZaloAutoReplyThreadState(thread.metadataJson, {
            clearPending: true
          })
        }
      });
      return;
    }

    try {
      await this.sendAutoReplyNow({
        accountId: account.id,
        threadId: thread.id,
        externalThreadId: thread.externalThreadId,
        customerMessageId: pendingCustomerMessage.id,
        customerSentAt: pendingCustomerMessage.sentAt
      });
    } catch (error) {
      this.logger.warn(
        `Deferred auto-reply failed for thread ${thread.id}: ${this.normalizeErrorMessage(error)}`
      );
      const retryAt = new Date(Date.now() + 60_000);
      this.scheduleDeferredAutoReply(thread.id, retryAt);
    }
  }

  private scheduleDeferredAutoReply(threadId: string, dueAt: Date) {
    this.cancelAutoReplyForThread(threadId);

    const delayMs = Math.max(dueAt.getTime() - Date.now(), 0);
    const timer = setTimeout(() => {
      void this.runDeferredAutoReplyByThread(threadId).catch((error) => {
        this.logger.warn(
          `runDeferredAutoReplyByThread failed for ${threadId}: ${this.normalizeErrorMessage(error)}`
        );
      });
    }, delayMs);

    this.autoReplyTimerByThread.set(threadId, timer);
  }

  private resolvePendingDueAt(
    pendingDueAtRaw: string | null,
    pendingSentAt: Date | null,
    takeoverMinutes: number
  ) {
    const parsedDueAt = this.readDateSafely(pendingDueAtRaw);
    if (parsedDueAt) {
      return parsedDueAt;
    }
    if (!pendingSentAt) {
      return null;
    }
    return new Date(pendingSentAt.getTime() + takeoverMinutes * 60_000);
  }

  private async sendAutoReplyNow(input: {
    accountId: string;
    threadId: string;
    externalThreadId: string;
    customerMessageId: string;
    customerSentAt: Date;
  }) {
    const routingRuntime = await this.aiRoutingService.getRuntimeConfig();

    if (routingRuntime.mode === 'n8n' || routingRuntime.mode === 'shadow') {
      await this.aiJobsService.enqueueN8nJob({
        threadId: input.threadId,
        customerMessageId: input.customerMessageId,
        customerSentAt: input.customerSentAt
      });

      if (routingRuntime.mode === 'n8n') {
        const thread = await this.prisma.client.conversationThread.findFirst({
          where: { id: input.threadId },
          select: { metadataJson: true }
        });
        if (thread) {
          await this.prisma.client.conversationThread.updateMany({
            where: { id: input.threadId },
            data: {
              metadataJson: patchZaloAutoReplyThreadState(thread.metadataJson, {
                clearPending: true
              })
            }
          });
        }
        return;
      }
    }

    const reply = await this.autoReplyService.generateReplyForThread(input.threadId);
    if (!reply) {
      const thread = await this.prisma.client.conversationThread.findFirst({
        where: { id: input.threadId },
        select: {
          metadataJson: true
        }
      });
      if (thread) {
        await this.prisma.client.conversationThread.updateMany({
          where: { id: input.threadId },
          data: {
            metadataJson: patchZaloAutoReplyThreadState(thread.metadataJson, {
              clearPending: true
            })
          }
        });
      }
      return;
    }

    await this.sendMessage(
      input.accountId,
      input.externalThreadId,
      reply,
      'user',
      'AI Assistant',
      ConversationMessageOrigin.AI
    );

    const thread = await this.prisma.client.conversationThread.findFirst({
      where: { id: input.threadId },
      select: {
        metadataJson: true
      }
    });
    if (!thread) {
      return;
    }

    await this.prisma.client.conversationThread.updateMany({
      where: { id: input.threadId },
      data: {
        metadataJson: patchZaloAutoReplyThreadState(thread.metadataJson, {
          clearPending: true,
          pauseUntil: null,
          lastAiReplyAt: new Date().toISOString()
        })
      }
    });
  }

  private readDateSafely(value: string | null | undefined) {
    const normalized = this.pickFirstNonEmptyString(value);
    if (!normalized) {
      return null;
    }
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private normalizeTakeoverMinutes(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 5;
    }
    if (parsed < 1) {
      return 1;
    }
    if (parsed > 120) {
      return 120;
    }
    return Math.round(parsed);
  }

  private async tryUpdateInboundFriendAlias(args: {
    accountId: string;
    api: any;
    externalThreadId: string;
    threadId?: string;
    senderName?: string;
    phone?: string;
  }) {
    if (!args.api || typeof args.api.changeFriendAlias !== 'function') {
      return;
    }

    let displayName = this.pickFirstNonEmptyString(args.senderName);
    let phone = normalizeAliasPhone(args.phone);
    if (!displayName || !phone) {
      const thread = await this.prisma.client.conversationThread.findFirst({
        where: {
          tenant_Id: this.prisma.getTenantId(),
          ...(args.threadId
            ? { id: args.threadId }
            : {
                channel: ConversationChannel.ZALO_PERSONAL,
                channelAccountId: args.accountId,
                externalThreadId: args.externalThreadId
              })
        },
        select: {
          customerDisplayName: true,
          customer: {
            select: {
              fullName: true,
              phone: true,
              phoneNormalized: true
            }
          }
        }
      });
      if (!displayName) {
        displayName = this.pickFirstNonEmptyString(
          thread?.customerDisplayName,
          thread?.customer?.fullName
        );
      }
      if (!phone) {
        phone = normalizeAliasPhone(thread?.customer?.phoneNormalized ?? thread?.customer?.phone);
      }
    }

    const alias = buildFriendAlias(displayName, phone);
    if (!alias) {
      return;
    }

    try {
      await args.api.changeFriendAlias(alias, args.externalThreadId);
    } catch (error) {
      this.logger.warn(
        `Skip inbound alias update for ${args.accountId}/${args.externalThreadId}: ${this.normalizeErrorMessage(error)}`
      );
    }
  }

  private extractInboundPhoneCandidate(message: any) {
    return this.pickFirstNonEmptyString(
      message?.data?.phoneNumber,
      message?.data?.phone_number,
      message?.data?.phone,
      message?.phoneNumber,
      message?.phone_number,
      message?.phone
    );
  }

  private detectContentType(rawContent: unknown): string {
    const stickerPayload = this.extractStickerPayload(rawContent, null);
    if (stickerPayload) {
      return 'STICKER';
    }
    if (typeof rawContent === 'string') {
      return 'TEXT';
    }
    if (rawContent && typeof rawContent === 'object') {
      return 'RICH';
    }
    return 'TEXT';
  }

  private async normalizeIncomingContent(rawContent: unknown, message: any, api: any): Promise<NormalizedInboundContent> {
    if (typeof rawContent === 'string') {
      return {
        content: rawContent,
        contentType: 'TEXT'
      };
    }

    const stickerPayload = this.extractStickerPayload(rawContent, message);
    if (stickerPayload) {
      const stickerDetail = await this.fetchStickerDetail(api, stickerPayload.id);
      const fallbackLabel = `[Sticker #${stickerPayload.id}]`;
      const stickerText = this.pickFirstNonEmptyString(stickerDetail?.text, fallbackLabel) || fallbackLabel;
      const previewUrl = this.pickFirstNonEmptyString(
        stickerDetail?.stickerWebpUrl,
        stickerDetail?.stickerUrl,
        stickerDetail?.stickerSpriteUrl
      );

      return {
        content: stickerText,
        contentType: 'STICKER',
        attachmentsJson: {
          kind: 'sticker',
          provider: 'ZALO_PERSONAL',
          sticker: {
            id: stickerPayload.id,
            catId: stickerPayload.catId,
            type: stickerPayload.type,
            text: stickerDetail?.text ?? null,
            stickerUrl: stickerDetail?.stickerUrl ?? null,
            stickerWebpUrl: stickerDetail?.stickerWebpUrl ?? null,
            stickerSpriteUrl: stickerDetail?.stickerSpriteUrl ?? null,
            previewUrl: previewUrl || null
          },
          rawContent: stickerPayload.raw
        }
      };
    }

    if (rawContent && typeof rawContent === 'object') {
      return {
        content: JSON.stringify(rawContent),
        contentType: 'RICH'
      };
    }

    return {
      content: '',
      contentType: 'TEXT'
    };
  }

  private extractStickerPayload(rawContent: unknown, message?: any): StickerPayloadSnapshot | null {
    if (!rawContent || typeof rawContent !== 'object' || Array.isArray(rawContent)) {
      return null;
    }

    const payload = rawContent as Record<string, unknown>;
    const stickerId = this.parseOptionalInteger(
      payload.id,
      payload.stickerId,
      payload.sticker_id,
      payload.sid,
      payload.stickerID
    );
    if (stickerId === null) {
      return null;
    }

    const msgType = this.pickFirstNonEmptyString(message?.data?.msgType, message?.msgType).toLowerCase();
    const catId = this.parseOptionalInteger(payload.catId, payload.cateId, payload.cate_id, payload.categoryId);
    const stickerType = this.parseOptionalInteger(payload.type, payload.stickerType, payload.sticker_type);
    const hasStickerSignature = msgType.includes('sticker') || catId !== null || stickerType !== null;
    if (!hasStickerSignature) {
      return null;
    }

    return {
      id: stickerId,
      catId,
      type: stickerType,
      raw: payload
    };
  }

  private parseOptionalInteger(...values: unknown[]): number | null {
    for (const value of values) {
      if (value === null || value === undefined || value === '') {
        continue;
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        continue;
      }
      return Math.trunc(parsed);
    }
    return null;
  }

  private async fetchStickerDetail(api: any, stickerId: number): Promise<StickerDetailSnapshot | null> {
    const cached = this.stickerDetailCache.get(stickerId);
    if (cached) {
      return cached;
    }

    if (!api || typeof api.getStickersDetail !== 'function') {
      return null;
    }

    try {
      const rawResponse = await api.getStickersDetail(stickerId);
      const rawDetail = Array.isArray(rawResponse) ? rawResponse[0] : rawResponse;
      if (!rawDetail || typeof rawDetail !== 'object') {
        return null;
      }

      const detailPayload = rawDetail as Record<string, unknown>;
      const resolvedId = this.parseOptionalInteger(detailPayload.id, detailPayload.sticker_id) ?? stickerId;
      const detail: StickerDetailSnapshot = {
        id: resolvedId,
        cateId: this.parseOptionalInteger(detailPayload.cateId, detailPayload.cate_id, detailPayload.categoryId),
        type: this.parseOptionalInteger(detailPayload.type),
        text: this.pickFirstNonEmptyString(detailPayload.text) || null,
        stickerUrl: this.pickFirstNonEmptyString(detailPayload.stickerUrl, detailPayload.url) || null,
        stickerWebpUrl: this.pickFirstNonEmptyString(detailPayload.stickerWebpUrl, detailPayload.webp) || null,
        stickerSpriteUrl: this.pickFirstNonEmptyString(detailPayload.stickerSpriteUrl) || null
      };
      this.stickerDetailCache.set(stickerId, detail);
      return detail;
    } catch (error) {
      this.logger.warn(`Cannot resolve sticker detail #${stickerId}: ${this.normalizeErrorMessage(error)}`);
      const fallback: StickerDetailSnapshot = {
        id: stickerId,
        cateId: null,
        type: null,
        text: null,
        stickerUrl: null,
        stickerWebpUrl: null,
        stickerSpriteUrl: null
      };
      this.stickerDetailCache.set(stickerId, fallback);
      return fallback;
    }
  }

  private pickFirstNonEmptyString(...values: unknown[]): string {
    for (const value of values) {
      if (value === null || value === undefined) {
        continue;
      }
      const normalized = String(value).trim();
      if (normalized) {
        return normalized;
      }
    }
    return '';
  }

  private parseZaloSentAt(rawTimestamp: unknown): Date {
    const timestampNumber = Number(rawTimestamp);
    if (!Number.isFinite(timestampNumber)) {
      return new Date();
    }

    const absolute = Math.abs(timestampNumber);
    let normalizedMilliseconds = timestampNumber;

    if (absolute > 0 && absolute < 1_000_000_000_000) {
      normalizedMilliseconds = timestampNumber * 1_000;
    } else if (absolute >= 10_000_000_000_000_000) {
      normalizedMilliseconds = Math.trunc(timestampNumber / 1_000_000);
    } else if (absolute >= 1_000_000_000_000_000) {
      normalizedMilliseconds = Math.trunc(timestampNumber / 1_000);
    }

    const parsed = new Date(normalizedMilliseconds);
    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }
    return parsed;
  }

  private createEmptyListenerSnapshot(): ListenerDebugSnapshot {
    return {
      lastRawEventAt: null,
      lastRawEvent: null,
      lastIngestedAt: null,
      lastIngestedThreadId: null,
      lastIngestedSenderType: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastConnectedAt: null,
      lastClosedAt: null,
      lastCloseReason: null
    };
  }

  private updateListenerDebug(accountId: string, patch: Partial<ListenerDebugSnapshot>) {
    const current = this.listenerDebugByAccount.get(accountId) ?? this.createEmptyListenerSnapshot();
    const next: ListenerDebugSnapshot = {
      ...current,
      ...patch
    };
    this.listenerDebugByAccount.set(accountId, next);
  }

  private async safeGetOwnId(api: any): Promise<string | undefined> {
    if (!api || typeof api.getOwnId !== 'function') {
      return undefined;
    }

    try {
      const ownId = await api.getOwnId();
      return typeof ownId === 'string' ? ownId : undefined;
    } catch {
      return undefined;
    }
  }

  private async persistSession(accountId: string, session: SavedSession) {
    await this.prisma.client.zaloAccount.updateMany({
      where: { id: accountId },
      data: {
        sessionData: session as any
      }
    });
  }

  private async updateAccountStatus(accountId: string, status: string) {
    await this.prisma.client.zaloAccount.updateMany({
      where: { id: accountId },
      data: {
        status
      }
    });
  }

  private recordReconnectFailure(accountId: string, error: unknown) {
    const existing = this.reconnectFailuresByAccount.get(accountId);
    this.reconnectFailuresByAccount.set(accountId, {
      count: (existing?.count ?? 0) + 1,
      lastFailureAt: new Date(),
      lastErrorMessage: this.normalizeErrorMessage(error)
    });
    this.reconnectFailureTotal += 1;
  }

  private normalizeErrorMessage(error: unknown) {
    const raw = error instanceof Error ? error.message : String(error ?? 'Unknown reconnect error');
    const normalized = raw.trim();
    return normalized.length > 240 ? normalized.slice(0, 240) : normalized;
  }

  private async resolveOrgId(accountId: string) {
    if (!this.isPrismaReady()) {
      return '';
    }

    const cached = this.orgIdByAccount.get(accountId);
    if (cached) {
      return cached;
    }

    const row = await this.prisma.client.zaloAccount.findFirst({
      where: { id: accountId },
      select: { tenant_Id: true }
    });
    const orgId = String(row?.tenant_Id ?? this.prisma.getTenantId()).trim();
    if (orgId) {
      this.orgIdByAccount.set(accountId, orgId);
    }
    return orgId;
  }

  private async restoreConnectedPersonalSessions() {
    if (!this.isPrismaReady()) {
      return;
    }

    const tenantId = this.prisma.getTenantId();
    const accounts = await this.prisma.client.zaloAccount.findMany({
      where: {
        tenant_Id: tenantId,
        accountType: 'PERSONAL',
        status: 'CONNECTED'
      },
      select: {
        id: true,
        sessionData: true
      }
    });

    if (accounts.length === 0) {
      return;
    }

    for (const account of accounts) {
      const session = (account.sessionData ?? null) as SavedSession | null;
      if (!session?.imei) {
        this.logger.warn(`Skip restore for ${account.id}: missing saved IMEI session.`);
        continue;
      }
      try {
        await this.reconnectWithSavedSession(account.id, session);
        this.logger.log(`Restored personal listener for account ${account.id}.`);
      } catch (error) {
        this.logger.warn(`Failed restoring personal listener for ${account.id}: ${this.normalizeErrorMessage(error)}`);
      }
    }
  }

  private isPrismaReady() {
    return Boolean(
      this.prisma
      && this.prisma.client
      && typeof this.prisma.getTenantId === 'function',
    );
  }
}
