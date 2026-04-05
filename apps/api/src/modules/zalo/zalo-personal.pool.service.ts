import { ServiceUnavailableException, Injectable, Logger } from '@nestjs/common';
import { ConversationChannel, ConversationSenderType } from '@prisma/client';
import { createRequire } from 'node:module';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../../prisma/prisma.service';

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

@Injectable()
export class ZaloPersonalPoolService {
  private readonly logger = new Logger(ZaloPersonalPoolService.name);
  private readonly instances = new Map<string, PersonalInstance>();
  private readonly reconnectFailuresByAccount = new Map<string, ReconnectFailureMetric>();
  private reconnectFailureTotal = 0;
  private readonly require = createRequire(import.meta.url);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService
  ) {}

  async startQrLogin(accountId: string): Promise<void> {
    const ZaloCtor = this.resolveZaloCtor();
    const zalo = new ZaloCtor({ logging: false });

    this.instances.set(accountId, {
      zalo,
      api: null,
      status: 'QR_PENDING',
      updatedAt: new Date()
    });

    await this.updateAccountStatus(accountId, 'QR_PENDING');

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
          }
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
      throw error;
    }
  }

  async reconnectWithSavedSession(accountId: string, session: SavedSession): Promise<void> {
    const ZaloCtor = this.resolveZaloCtor();
    const zalo = new ZaloCtor({ logging: false });

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
      throw error;
    }
  }

  async sendMessage(accountId: string, externalThreadId: string, content: string, threadType: 'user' | 'group' = 'user') {
    const inst = this.instances.get(accountId);
    if (!inst?.api) {
      throw new ServiceUnavailableException('Tài khoản Zalo cá nhân chưa kết nối.');
    }

    const threadId = externalThreadId.trim();
    if (!threadId) {
      throw new ServiceUnavailableException('Thiếu externalThreadId.');
    }

    await inst.api.sendMessage({ msg: content }, threadId, threadType === 'group' ? 1 : 0);

    await this.conversationsService.ingestExternalMessage({
      channel: ConversationChannel.ZALO_PERSONAL,
      channelAccountId: accountId,
      externalThreadId: threadId,
      senderType: ConversationSenderType.AGENT,
      senderName: 'Staff',
      content,
      contentType: 'TEXT',
      sentAt: new Date()
    });

    return { success: true };
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
    await this.updateAccountStatus(accountId, 'DISCONNECTED');
  }

  getStatus(accountId: string): PersonalPoolStatus {
    return this.instances.get(accountId)?.status ?? 'DISCONNECTED';
  }

  getQrImage(accountId: string): string | null {
    return this.instances.get(accountId)?.lastQrImage ?? null;
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

  private resolveZaloCtor(): new (opts: { logging: boolean }) => any {
    try {
      const loaded = this.require('zca-js') as { Zalo?: new (opts: { logging: boolean }) => any };
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

    listener.on('message', async (message: any) => {
      try {
        const senderExternalId = String(message?.data?.uidFrom ?? '');
        const externalThreadId = String(message?.threadId ?? senderExternalId).trim();
        if (!externalThreadId) {
          return;
        }

        const senderName = typeof message?.data?.dName === 'string'
          ? message.data.dName
          : senderExternalId;

        const rawContent = message?.data?.content;
        const content = typeof rawContent === 'string'
          ? rawContent
          : JSON.stringify(rawContent ?? '');

        const ts = Number(message?.data?.ts ?? Date.now());
        const sentAt = Number.isFinite(ts) ? new Date(ts) : new Date();

        const isGroup = Number(message?.type ?? 0) === 1;
        const senderType = message?.isSelf ? ConversationSenderType.AGENT : ConversationSenderType.CUSTOMER;

        await this.conversationsService.ingestExternalMessage({
          channel: ConversationChannel.ZALO_PERSONAL,
          channelAccountId: accountId,
          externalThreadId,
          externalMessageId: String(message?.data?.msgId ?? ''),
          senderType,
          senderExternalId: senderExternalId || undefined,
          senderName: senderName || undefined,
          content,
          contentType: this.detectContentType(rawContent),
          sentAt,
          customerDisplayName: isGroup ? String(message?.data?.gName ?? '') : senderName
        });
      } catch (error) {
        this.logger.error(`Listener message error for ${accountId}: ${(error as Error).message}`);
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
    });

    listener.on('closed', async () => {
      await this.updateAccountStatus(accountId, 'DISCONNECTED');
      const inst = this.instances.get(accountId);
      if (inst) {
        inst.status = 'DISCONNECTED';
        inst.updatedAt = new Date();
        this.instances.set(accountId, inst);
      }
    });

    listener.start({ retryOnClose: true });
  }

  private detectContentType(rawContent: unknown): string {
    if (typeof rawContent === 'string') {
      return 'TEXT';
    }
    if (rawContent && typeof rawContent === 'object') {
      return 'RICH';
    }
    return 'TEXT';
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
}
