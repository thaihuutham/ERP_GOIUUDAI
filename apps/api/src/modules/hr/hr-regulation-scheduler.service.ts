import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HrRegulationService } from './hr-regulation.service';

@Injectable()
export class HrRegulationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HrRegulationSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(HrRegulationService) private readonly regulationService: HrRegulationService
  ) {}

  onModuleInit() {
    if (!this.toBool(this.config.get<string>('HR_SCORE_RECONCILE_SCHEDULER_ENABLED'), true)) {
      this.logger.log('HR regulation scheduler disabled.');
      return;
    }

    const intervalMinutes = this.toInt(this.config.get<string>('HR_SCORE_RECONCILE_INTERVAL_MINUTES'), 30, 1, 360);
    const intervalMs = intervalMinutes * 60 * 1000;

    this.logger.log(`HR regulation scheduler enabled. intervalMinutes=${intervalMinutes}`);
    this.timer = setInterval(() => this.execute(), intervalMs);

    // Warm-up shortly after app start.
    setTimeout(() => this.execute(), 20_000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private execute() {
    void this.regulationService
      .reconcileDailyScores({
        triggeredBy: 'system-scheduler',
        limit: 300
      })
      .then((summary) => {
        this.logger.log(`Daily score reconcile completed. processed=${summary.processed} finalized=${summary.finalized}`);
      })
      .catch((error) => {
        this.logger.error(`Daily score reconcile failed: ${error instanceof Error ? error.message : String(error)}`);
      });

    void this.regulationService
      .runAutoDraftPip({
        triggeredBy: 'system-scheduler',
        limit: 200
      })
      .then((summary) => {
        if (summary.createdCount > 0) {
          this.logger.log(`Auto PIP draft created. count=${summary.createdCount}`);
        }
      })
      .catch((error) => {
        this.logger.error(`Auto PIP draft run failed: ${error instanceof Error ? error.message : String(error)}`);
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
