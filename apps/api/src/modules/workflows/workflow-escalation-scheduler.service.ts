import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkflowsService } from './workflows.service';

@Injectable()
export class WorkflowEscalationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowEscalationSchedulerService.name);
  private runInterval: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(WorkflowsService) private readonly workflowsService: WorkflowsService
  ) {}

  onModuleInit() {
    if (!this.toBool(this.config.get<string>('WORKFLOW_ESCALATION_SCHEDULER_ENABLED'), true)) {
      this.logger.log('Workflow escalation scheduler disabled.');
      return;
    }

    const intervalMinutes = this.toInt(this.config.get<string>('WORKFLOW_ESCALATION_INTERVAL_MINUTES'), 5, 1, 60);
    const intervalMs = intervalMinutes * 60 * 1000;
    this.logger.log(`Workflow escalation scheduler enabled. intervalMinutes=${intervalMinutes}`);

    this.runInterval = setInterval(() => this.execute(), intervalMs);
    void this.execute();
  }

  onModuleDestroy() {
    if (this.runInterval) {
      clearInterval(this.runInterval);
      this.runInterval = null;
    }
  }

  private execute() {
    void this.workflowsService
      .runAutoEscalation(300)
      .then((result) => {
        this.logger.log(
          `Workflow auto escalation completed. scanned=${result.scanned} escalated=${result.escalated} skipped=${result.skipped}`
        );
      })
      .catch((error) => {
        this.logger.error(
          `Workflow auto escalation failed: ${error instanceof Error ? error.message : String(error)}`
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

