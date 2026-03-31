import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

type DispatchStatus = 'PENDING' | 'RETRY' | 'SENT' | 'FAILED';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  async list(query: PaginationQueryDto, userId?: string, unreadOnly?: string) {
    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (unreadOnly === 'true') where.isRead = false;

    return this.prisma.client.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(query.limit ?? 100, 1), 200)
    });
  }

  async create(payload: Record<string, unknown>) {
    const tenantId = this.prisma.getTenantId();
    const runtime = await this.runtimeSettings.getNotificationsTemplateRuntime();

    const notification = await this.prisma.client.notification.create({
      data: {
        tenant_Id: tenantId,
        userId: payload.userId ? String(payload.userId) : null,
        title: String(payload.title ?? ''),
        content: payload.content ? String(payload.content) : payload.message ? String(payload.message) : null,
        templateVersion: this.readString(payload.templateVersion, runtime.templatesVersion),
        isRead: false
      }
    });

    const channels = this.resolveEnabledChannels(runtime.channelPolicy);
    if (channels.length > 0) {
      await this.prisma.client.notificationDispatch.createMany({
        data: channels.map((channel) => ({
          tenant_Id: tenantId,
          notificationId: notification.id,
          channel,
          status: 'PENDING',
          attemptCount: 0,
          maxAttempts: runtime.retry.maxAttempts,
          payloadJson: {
            title: notification.title,
            content: notification.content,
            userId: notification.userId,
            templateVersion: notification.templateVersion
          }
        }))
      });
    }

    return notification;
  }

  async runDueDispatch(payload: Record<string, unknown>) {
    const limit = this.toInt(payload.limit, 100, 1, 500);
    const now = new Date();
    const runtime = await this.runtimeSettings.getNotificationsTemplateRuntime();
    const enabledChannels = new Set(this.resolveEnabledChannels(runtime.channelPolicy));
    const forceFailChannels = new Set(this.toStringArray(payload.forceFailChannels).map((value) => value.toUpperCase()));

    const dueDispatches = await this.prisma.client.notificationDispatch.findMany({
      where: {
        status: { in: ['PENDING', 'RETRY'] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }]
      },
      include: {
        notification: true
      },
      orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }],
      take: limit
    });

    let sentCount = 0;
    let retryCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const dispatch of dueDispatches) {
      const channel = String(dispatch.channel ?? '').toUpperCase();
      const attemptCount = Number(dispatch.attemptCount ?? 0);
      const nextAttempt = attemptCount + 1;
      const maxAttempts = Number(dispatch.maxAttempts ?? runtime.retry.maxAttempts);

      if (!enabledChannels.has(channel)) {
        await this.prisma.client.notificationDispatch.updateMany({
          where: { id: dispatch.id },
          data: {
            status: 'FAILED',
            attemptCount: nextAttempt,
            nextRetryAt: null,
            lastError: `Channel ${channel} đang bị tắt theo settings.notifications_templates.channelPolicy.`
          }
        });
        failedCount += 1;
        results.push({
          id: dispatch.id,
          channel,
          status: 'FAILED',
          reason: 'channel-disabled'
        });
        continue;
      }

      const failureReason = this.shouldForceFail(channel, forceFailChannels)
        ? `Forced failure for channel ${channel}.`
        : null;

      if (!failureReason) {
        await this.prisma.client.notificationDispatch.updateMany({
          where: { id: dispatch.id },
          data: {
            status: 'SENT',
            attemptCount: nextAttempt,
            dispatchedAt: now,
            nextRetryAt: null,
            lastError: null
          }
        });
        sentCount += 1;
        results.push({
          id: dispatch.id,
          channel,
          status: 'SENT'
        });
        continue;
      }

      const willRetry = nextAttempt < maxAttempts;
      if (willRetry) {
        const nextRetryAt = new Date(now.getTime() + runtime.retry.backoffSeconds * 1000 * nextAttempt);
        await this.prisma.client.notificationDispatch.updateMany({
          where: { id: dispatch.id },
          data: {
            status: 'RETRY',
            attemptCount: nextAttempt,
            nextRetryAt,
            lastError: failureReason
          }
        });
        retryCount += 1;
        results.push({
          id: dispatch.id,
          channel,
          status: 'RETRY',
          nextRetryAt: nextRetryAt.toISOString()
        });
      } else {
        await this.prisma.client.notificationDispatch.updateMany({
          where: { id: dispatch.id },
          data: {
            status: 'FAILED',
            attemptCount: nextAttempt,
            nextRetryAt: null,
            lastError: failureReason
          }
        });
        failedCount += 1;
        results.push({
          id: dispatch.id,
          channel,
          status: 'FAILED'
        });
      }
    }

    if (dueDispatches.length === 0) {
      skippedCount = 1;
    }

    return {
      scanned: dueDispatches.length,
      sentCount,
      retryCount,
      failedCount,
      skippedCount,
      policy: runtime,
      results
    };
  }

  async markRead(id: string) {
    await this.prisma.client.notification.updateMany({
      where: { id },
      data: { isRead: true }
    });
    return this.prisma.client.notification.findFirst({ where: { id } });
  }

  private resolveEnabledChannels(policy: Record<string, boolean>) {
    const channels: string[] = [];
    if (policy.inApp) channels.push('IN_APP');
    if (policy.email) channels.push('EMAIL');
    if (policy.sms) channels.push('SMS');
    if (policy.zalo) channels.push('ZALO');
    return channels;
  }

  private shouldForceFail(channel: string, forceFailChannels: Set<string>) {
    return forceFailChannels.has(channel);
  }

  private readString(value: unknown, fallback = '') {
    if (value === null || value === undefined) {
      return fallback;
    }
    const normalized = String(value).trim();
    return normalized || fallback;
  }

  private toStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }

  private toInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }
}
