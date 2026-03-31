import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from './settings.service';

@Injectable()
export class SettingsMaintenanceSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettingsMaintenanceSchedulerService.name);
  private runTimeout: NodeJS.Timeout | null = null;
  private runInterval: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(SettingsService) private readonly settingsService: SettingsService
  ) {}

  onModuleInit() {
    if (!this.toBool(this.config.get<string>('AUDIT_MAINTENANCE_SCHEDULER_ENABLED'), true)) {
      this.logger.log('Audit maintenance scheduler disabled.');
      return;
    }

    const targetUtcHour = this.toInt(this.config.get<string>('AUDIT_MAINTENANCE_SCHEDULER_UTC_HOUR'), 19, 0, 23);
    const delayMs = this.computeDelayToNextHour(targetUtcHour);
    this.logger.log(`Audit maintenance scheduler enabled. nextRunInMs=${delayMs} targetUtcHour=${targetUtcHour}`);

    this.runTimeout = setTimeout(() => {
      this.execute();
      this.runInterval = setInterval(() => this.execute(), 24 * 60 * 60 * 1000);
    }, delayMs);
  }

  onModuleDestroy() {
    if (this.runTimeout) {
      clearTimeout(this.runTimeout);
      this.runTimeout = null;
    }
    if (this.runInterval) {
      clearInterval(this.runInterval);
      this.runInterval = null;
    }
  }

  private execute() {
    void this.settingsService
      .runDataGovernanceMaintenance({
        dryRun: false,
        triggeredBy: 'system-scheduler'
      })
      .then((result) => {
        this.logger.log(
          `Audit maintenance completed. archived=${result.summary.archivedAuditLogs ?? 0} deletedAuditLogs=${result.summary.deletedAuditLogs}`
        );
      })
      .catch((error) => {
        this.logger.error(`Audit maintenance scheduler failed: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  private computeDelayToNextHour(targetUtcHour: number) {
    const now = new Date();
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(targetUtcHour);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return Math.max(1_000, next.getTime() - now.getTime());
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
