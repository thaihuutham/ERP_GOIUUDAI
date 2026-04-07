import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZaloCampaignService } from './zalo-campaign.service';

@Injectable()
export class ZaloCampaignSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZaloCampaignSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly config: ConfigService,
    private readonly campaignService: ZaloCampaignService,
  ) {}

  onModuleInit() {
    if (!this.campaignService || typeof this.campaignService.runSchedulerTick !== 'function') {
      this.logger.warn('Skip starting scheduler: campaign service is not ready.');
      return;
    }

    const configGet = this.config && typeof this.config.get === 'function'
      ? this.config.get.bind(this.config)
      : null;
    const enabled = this.toBool(configGet?.('ZALO_CAMPAIGN_SCHEDULER_ENABLED'), true);
    if (!enabled) {
      this.logger.log('Zalo campaign scheduler disabled.');
      return;
    }

    const intervalSeconds = this.toInt(
      configGet?.('ZALO_CAMPAIGN_SCHEDULER_INTERVAL_SECONDS'),
      5,
      1,
      120,
    );

    const intervalMs = intervalSeconds * 1_000;
    this.logger.log(`Zalo campaign scheduler enabled. intervalSeconds=${intervalSeconds}`);

    this.timer = setInterval(() => {
      void this.executeTick();
    }, intervalMs);

    void this.executeTick();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async executeTick() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    try {
      const result = await this.campaignService.runSchedulerTick();
      if (result.processedCampaigns > 0 || result.sent > 0 || result.failed > 0 || result.skipped > 0) {
        this.logger.log(
          `tick scanned=${result.scannedCampaigns} processed=${result.processedCampaigns} sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`,
        );
      }
    } catch (error) {
      this.logger.error(`tick failed: ${error instanceof Error ? error.message : String(error)}`);
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
