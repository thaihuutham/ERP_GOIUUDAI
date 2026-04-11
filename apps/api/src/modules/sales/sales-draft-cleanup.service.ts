import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CheckoutOrderStatus } from '@prisma/client';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_DRAFT_EXPIRY_DAYS = 7;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run every hour

@Injectable()
export class SalesDraftCleanupService implements OnModuleInit {
  private readonly logger = new Logger(SalesDraftCleanupService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  onModuleInit() {
    // Start cleanup cron, initial delay 5 minutes after boot
    setTimeout(() => {
      void this.runCleanup();
      this.timer = setInterval(() => {
        void this.runCleanup();
      }, CLEANUP_INTERVAL_MS);
    }, 5 * 60 * 1000);
  }

  async runCleanup() {
    try {
      const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
      const draftExpiryDays = Number(
        (salesPolicy as Record<string, unknown>).draftExpiryDays ?? DEFAULT_DRAFT_EXPIRY_DAYS
      );

      if (draftExpiryDays <= 0) {
        this.logger.debug('Draft cleanup disabled (draftExpiryDays <= 0).');
        return { cancelled: 0 };
      }

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - draftExpiryDays);

      const expiredDrafts = await this.prisma.client.order.findMany({
        where: {
          checkoutStatus: CheckoutOrderStatus.DRAFT,
          createdAt: { lt: cutoff }
        },
        select: { id: true, orderNo: true, createdAt: true }
      });

      if (expiredDrafts.length === 0) {
        return { cancelled: 0 };
      }

      const expiredIds = expiredDrafts.map((row) => row.id);

      await this.prisma.client.order.updateMany({
        where: {
          id: { in: expiredIds },
          checkoutStatus: CheckoutOrderStatus.DRAFT
        },
        data: {
          checkoutStatus: CheckoutOrderStatus.CANCELLED
        }
      });

      this.logger.log(
        `Draft cleanup: cancelled ${expiredDrafts.length} expired DRAFT orders (cutoff: ${cutoff.toISOString()}).`
      );

      return { cancelled: expiredDrafts.length };
    } catch (error) {
      this.logger.error('Draft cleanup failed:', error);
      return { cancelled: 0, error: String(error) };
    }
  }
}
