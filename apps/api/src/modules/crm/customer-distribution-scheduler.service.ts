import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerDistributionService } from './customer-distribution.service';

@Injectable()
export class CustomerDistributionSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CustomerDistributionSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(CustomerDistributionService) private readonly distributionService: CustomerDistributionService
  ) {}

  onModuleInit() {
    if (!this.toBool(this.config.get<string>('CUSTOMER_DISTRIBUTION_SCHEDULER_ENABLED'), true)) {
      this.logger.log('Customer distribution scheduler disabled.');
      return;
    }

    const intervalMinutes = this.toInt(
      this.config.get<string>('CUSTOMER_DISTRIBUTION_INTERVAL_MINUTES'),
      15,
      5,
      1440
    );
    const intervalMs = intervalMinutes * 60 * 1000;

    this.logger.log(`Customer distribution scheduler enabled. intervalMinutes=${intervalMinutes}`);
    this.timer = setInterval(() => {
      void this.execute();
    }, intervalMs);

    // First run after 20 seconds (give time for other modules to init)
    setTimeout(() => {
      void this.execute();
    }, 20_000);
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
      const result = await this.distributionService.runDistributionCycle();
      if (result.assigned > 0 || result.reclaimedIdle > 0 || result.reclaimedFailed > 0) {
        this.logger.log(
          `Distribution cycle completed. assigned=${result.assigned} reclaimedIdle=${result.reclaimedIdle} reclaimedFailed=${result.reclaimedFailed} rotated=${result.rotated}`
        );
      }
      if (result.errors.length > 0) {
        this.logger.warn(`Distribution cycle errors: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      this.logger.error(
        `Distribution cycle failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.isRunning = false;
    }
  }

  private toBool(value: unknown, fallback: boolean) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) return fallback;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
  }

  private toInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }
}
