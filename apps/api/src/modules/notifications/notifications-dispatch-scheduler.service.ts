import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsDispatchSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsDispatchSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(NotificationsService) private readonly notificationsService: NotificationsService
  ) {}

  onModuleInit() {
    if (!this.toBool(this.config.get<string>('NOTIFICATIONS_DISPATCH_SCHEDULER_ENABLED'), true)) {
      this.logger.log('Notifications dispatch scheduler disabled.');
      return;
    }

    const intervalMinutes = this.toInt(
      this.config.get<string>('NOTIFICATIONS_DISPATCH_INTERVAL_MINUTES'),
      2,
      1,
      60
    );
    const intervalMs = intervalMinutes * 60 * 1000;

    this.logger.log(`Notifications dispatch scheduler enabled. intervalMinutes=${intervalMinutes}`);
    this.timer = setInterval(() => this.execute(), intervalMs);
    setTimeout(() => this.execute(), 10_000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private execute() {
    const limit = this.toInt(this.config.get<string>('NOTIFICATIONS_DISPATCH_BATCH_LIMIT'), 200, 1, 1_000);
    void this.notificationsService
      .runDueDispatch({
        limit,
        triggeredBy: 'system-scheduler'
      })
      .then((summary) => {
        if (summary.scanned > 0) {
          this.logger.log(
            `Notifications dispatch completed. scanned=${summary.scanned} sent=${summary.sentCount} retry=${summary.retryCount} failed=${summary.failedCount}`
          );
        }
      })
      .catch((error) => {
        this.logger.error(
          `Notifications dispatch failed: ${error instanceof Error ? error.message : String(error)}`
        );
      });
  }

  private toBool(value: unknown, fallback: boolean) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  private toInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }
}
