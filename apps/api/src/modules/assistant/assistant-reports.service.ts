import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AssistantRunDecisionDto,
  AssistantRunsQueryDto,
  CreateAssistantRunDto
} from './dto/assistant.dto';
import { AssistantEffectiveAccess } from './assistant.types';
import { AssistantDispatchService } from './assistant-dispatch.service';
import { AssistantKnowledgeService } from './assistant-knowledge.service';
import { AssistantProxyService } from './assistant-proxy.service';
import { uniqueStringArray } from './assistant-scope.util';

type ReportPackResolver = {
  moduleKey: string;
  run: (access: AssistantEffectiveAccess) => Promise<Record<string, unknown>>;
};

@Injectable()
export class AssistantReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AssistantProxyService) private readonly proxyService: AssistantProxyService,
    @Inject(AssistantKnowledgeService) private readonly knowledgeService: AssistantKnowledgeService,
    @Inject(AssistantDispatchService) private readonly dispatchService: AssistantDispatchService
  ) {}

  async createRun(dto: CreateAssistantRunDto, access: AssistantEffectiveAccess) {
    const runType = this.normalizeRunType(dto.runType);
    const reportPacks = this.resolveReportPacks(dto.reportPacks, access);
    const dispatchChat = dto.dispatchChat === true;

    const snapshots = await this.collectSnapshots(reportPacks, access);
    const knowledge = await this.knowledgeService.retrieveContext(access, {
      query: reportPacks.join(' '),
      limit: 20
    });

    const now = new Date();
    const run = await this.prisma.client.assistantReportRun.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        runType,
        reportPacksJson: reportPacks as Prisma.InputJsonValue,
        status: GenericStatus.PENDING,
        requestedBy: access.actor.userId,
        accessSnapshotJson: {
          actor: access.actor,
          scope: access.scope,
          allowedModules: access.allowedModules,
          moduleActions: access.moduleActions
        } as Prisma.InputJsonValue,
        summaryJson: {
          reportPacks,
          snapshotModules: Object.keys(snapshots),
          knowledgeItems: knowledge.count
        } as Prisma.InputJsonValue,
        startedAt: now,
        completedAt: now
      }
    });

    const erpArtifact = await this.prisma.client.assistantReportArtifact.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        runId: run.id,
        artifactType: 'ERP',
        scopeType: access.scope.type,
        scopeRefIds: access.scope.scopeRefIds as Prisma.InputJsonValue,
        status: GenericStatus.PENDING,
        contentJson: {
          type: 'erp_artifact',
          reportPacks,
          snapshots,
          knowledge,
          generatedAt: now.toISOString()
        } as Prisma.InputJsonValue
      }
    });

    let chatArtifact: { id: string } | null = null;
    if (dispatchChat) {
      chatArtifact = await this.prisma.client.assistantReportArtifact.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          runId: run.id,
          artifactType: 'CHAT',
          scopeType: access.scope.type,
          scopeRefIds: access.scope.scopeRefIds as Prisma.InputJsonValue,
          status: GenericStatus.APPROVED,
          contentJson: {
            type: 'chat_artifact',
            reportPacks,
            summary: this.buildChatSummary(snapshots),
            knowledge,
            generatedAt: now.toISOString()
          } as Prisma.InputJsonValue,
          publishedAt: now
        }
      });

      await this.dispatchService.dispatchArtifactToChannels({
        artifactId: chatArtifact.id,
        reportPacks,
        access
      });
    }

    return {
      runId: run.id,
      runType,
      reportPacks,
      artifacts: {
        erpArtifactId: erpArtifact.id,
        chatArtifactId: chatArtifact?.id ?? null
      }
    };
  }

  async listRuns(query: AssistantRunsQueryDto, access: AssistantEffectiveAccess) {
    const take = this.take(query.limit);

    const where: Prisma.AssistantReportRunWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.runType ? { runType: String(query.runType).toUpperCase() } : {})
    };

    if (access.scope.type === 'self') {
      where.requestedBy = access.actor.userId;
    }

    const rows = await this.prisma.client.assistantReportRun.findMany({
      where,
      include: {
        artifacts: {
          select: {
            id: true,
            artifactType: true,
            status: true,
            publishedAt: true,
            approvedAt: true,
            rejectedAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take
    });

    return {
      items: rows,
      count: rows.length
    };
  }

  async getRun(runIdRaw: string, access: AssistantEffectiveAccess) {
    const runId = this.cleanString(runIdRaw);

    const run = await this.prisma.client.assistantReportRun.findFirst({
      where: {
        id: runId
      },
      include: {
        artifacts: {
          include: {
            dispatchAttempts: {
              orderBy: { createdAt: 'desc' },
              take: 20
            }
          }
        }
      }
    });

    if (!run) {
      throw new NotFoundException(`Assistant report run not found: ${runId}`);
    }

    if (access.scope.type === 'self' && run.requestedBy !== access.actor.userId) {
      throw new NotFoundException(`Assistant report run not found: ${runId}`);
    }

    return run;
  }

  async approveRun(runIdRaw: string, dto: AssistantRunDecisionDto, access: AssistantEffectiveAccess) {
    const run = await this.getRun(runIdRaw, access);

    const erpArtifact = run.artifacts.find((artifact) => artifact.artifactType === 'ERP');
    if (!erpArtifact) {
      throw new BadRequestException('Run hiện tại không có ERP artifact để duyệt.');
    }

    const now = new Date();

    await this.prisma.client.assistantReportArtifact.updateMany({
      where: {
        id: erpArtifact.id
      },
      data: {
        status: GenericStatus.APPROVED,
        approvedBy: access.actor.userId,
        approvedAt: now,
        publishedAt: now,
        contentJson: {
          ...(this.ensureRecord(erpArtifact.contentJson)),
          approval: {
            status: 'APPROVED',
            note: this.cleanString(dto.note),
            actor: access.actor.userId,
            actedAt: now.toISOString()
          }
        } as Prisma.InputJsonValue
      }
    });

    await this.prisma.client.assistantReportRun.updateMany({
      where: { id: run.id },
      data: {
        status: GenericStatus.APPROVED,
        summaryJson: {
          ...(this.ensureRecord(run.summaryJson)),
          approvalStatus: 'APPROVED',
          approvalBy: access.actor.userId,
          approvalAt: now.toISOString()
        } as Prisma.InputJsonValue
      }
    });

    return this.getRun(run.id, access);
  }

  async rejectRun(runIdRaw: string, dto: AssistantRunDecisionDto, access: AssistantEffectiveAccess) {
    const run = await this.getRun(runIdRaw, access);

    const erpArtifact = run.artifacts.find((artifact) => artifact.artifactType === 'ERP');
    if (!erpArtifact) {
      throw new BadRequestException('Run hiện tại không có ERP artifact để từ chối.');
    }

    const now = new Date();

    await this.prisma.client.assistantReportArtifact.updateMany({
      where: {
        id: erpArtifact.id
      },
      data: {
        status: GenericStatus.REJECTED,
        rejectedBy: access.actor.userId,
        rejectedAt: now,
        contentJson: {
          ...(this.ensureRecord(erpArtifact.contentJson)),
          approval: {
            status: 'REJECTED',
            note: this.cleanString(dto.note),
            actor: access.actor.userId,
            actedAt: now.toISOString()
          }
        } as Prisma.InputJsonValue
      }
    });

    await this.prisma.client.assistantReportRun.updateMany({
      where: { id: run.id },
      data: {
        status: GenericStatus.REJECTED,
        summaryJson: {
          ...(this.ensureRecord(run.summaryJson)),
          approvalStatus: 'REJECTED',
          approvalBy: access.actor.userId,
          approvalAt: now.toISOString(),
          rejectionNote: this.cleanString(dto.note)
        } as Prisma.InputJsonValue
      }
    });

    return this.getRun(run.id, access);
  }

  private async collectSnapshots(reportPacks: string[], access: AssistantEffectiveAccess) {
    const resolvers = this.getPackResolvers(access);

    const snapshots: Record<string, unknown> = {};
    for (const pack of reportPacks) {
      const resolver = resolvers[pack];
      if (!resolver) {
        continue;
      }
      snapshots[pack] = await resolver.run(access);
    }

    return snapshots;
  }

  private getPackResolvers(access: AssistantEffectiveAccess): Record<string, ReportPackResolver> {
    const runQuery = { limit: 100 } as const;

    const resolvers: Record<string, ReportPackResolver> = {
      sales: {
        moduleKey: 'sales',
        run: (actorAccess) => this.proxyService.getSalesSnapshot(runQuery, actorAccess) as Promise<Record<string, unknown>>
      },
      cskh: {
        moduleKey: 'crm',
        run: (actorAccess) => this.proxyService.getCustomerCareSnapshot(runQuery, actorAccess) as Promise<Record<string, unknown>>
      },
      hr: {
        moduleKey: 'hr',
        run: (actorAccess) => this.proxyService.getHrSnapshot(runQuery, actorAccess) as Promise<Record<string, unknown>>
      },
      workflow: {
        moduleKey: 'workflows',
        run: (actorAccess) => this.proxyService.getWorkflowSnapshot(runQuery, actorAccess) as Promise<Record<string, unknown>>
      },
      finance: {
        moduleKey: 'finance',
        run: (actorAccess) => this.proxyService.getFinanceSnapshot(runQuery, actorAccess) as Promise<Record<string, unknown>>
      }
    };

    return Object.fromEntries(
      Object.entries(resolvers).filter(([, resolver]) => access.allowedModules.includes(resolver.moduleKey))
    );
  }

  private resolveReportPacks(rawPacks: string[] | undefined, access: AssistantEffectiveAccess) {
    const normalized = uniqueStringArray(rawPacks).map((item) => item.toLowerCase());
    const defaultPacks = this.defaultReportPacks(access);
    const requested = normalized.length > 0 ? normalized : defaultPacks;

    const allowed = Array.from(new Set(requested.filter((item) => defaultPacks.includes(item))));
    if (allowed.length === 0) {
      throw new BadRequestException('Không có report packs hợp lệ trong phạm vi quyền hiện tại.');
    }

    return allowed;
  }

  private defaultReportPacks(access: AssistantEffectiveAccess) {
    const defaults: string[] = [];
    if (access.allowedModules.includes('sales')) {
      defaults.push('sales');
    }
    if (access.allowedModules.includes('crm')) {
      defaults.push('cskh');
    }
    if (access.allowedModules.includes('hr')) {
      defaults.push('hr');
    }
    if (access.allowedModules.includes('workflows')) {
      defaults.push('workflow');
    }
    if (access.allowedModules.includes('finance')) {
      defaults.push('finance');
    }
    return defaults;
  }

  private buildChatSummary(snapshots: Record<string, unknown>) {
    const summary: Record<string, unknown> = {};
    for (const [pack, payload] of Object.entries(snapshots)) {
      const snapshot = this.ensureRecord(payload);
      const data = this.ensureRecord(snapshot.snapshot);
      summary[pack] = {
        metrics: this.ensureRecord(data.metrics)
      };
    }
    return summary;
  }

  private normalizeRunType(raw: string | undefined) {
    const normalized = this.cleanString(raw).toUpperCase();
    if (normalized === 'HOURLY' || normalized === 'DAILY' || normalized === 'MANUAL') {
      return normalized;
    }
    return 'MANUAL';
  }

  private take(limitRaw: number | undefined) {
    const parsed = Number(limitRaw ?? 50);
    if (!Number.isFinite(parsed)) {
      return 50;
    }
    return Math.min(Math.max(Math.trunc(parsed), 1), 200);
  }

  private ensureRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }
}
