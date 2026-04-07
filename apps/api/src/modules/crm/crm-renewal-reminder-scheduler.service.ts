import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrmContractsService } from './crm-contracts.service';

@Injectable()
export class CrmRenewalReminderSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrmRenewalReminderSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(CrmContractsService) private readonly crmContractsService: CrmContractsService
  ) {}

  onModuleInit() {
    if (!this.toBool(this.config.get<string>('CRM_RENEWAL_REMINDER_SCHEDULER_ENABLED'), true)) {
      this.logger.log('CRM renewal reminder scheduler disabled.');
      return;
    }

    const intervalMinutes = this.toInt(
      this.config.get<string>('CRM_RENEWAL_REMINDER_INTERVAL_MINUTES'),
      60,
      5,
      24 * 60
    );
    const intervalMs = intervalMinutes * 60 * 1000;

    this.logger.log(`CRM renewal reminder scheduler enabled. intervalMinutes=${intervalMinutes}`);
    this.timer = setInterval(() => {
      void this.execute();
    }, intervalMs);

    setTimeout(() => {
      void this.execute();
    }, 15_000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async execute() {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      const summary = await this.crmContractsService.runRenewalReminderSweep({
        limit: this.toInt(this.config.get<string>('CRM_RENEWAL_REMINDER_BATCH_LIMIT'), 1000, 10, 10000),
        pendingOnly: true,
        now: new Date().toISOString()
      });

      if (summary.created > 0 || summary.notified > 0) {
        this.logger.log(
          `CRM renewal reminder sweep completed. scanned=${summary.scanned} created=${summary.created} notified=${summary.notified} skipped=${summary.skipped}`
        );
      }
    } catch (error) {
      this.logger.error(
        `CRM renewal reminder sweep failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.isRunning = false;
    }
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
