import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateReportDefinitionDto,
  GenerateReportRunDto,
  ReportOutputFormat,
  REPORT_OUTPUT_FORMATS,
  ReportsListQueryDto,
  RunDueSchedulesDto,
  UpdateReportDefinitionDto
} from './dto/reports.dto';

@Injectable()
export class ReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async overview() {
    const [orders, employees, invoices, purchaseOrders, projects, assets] = await Promise.all([
      this.prisma.client.order.findMany({ select: { totalAmount: true, status: true } }),
      this.prisma.client.employee.count(),
      this.prisma.client.invoice.findMany({ select: { status: true } }),
      this.prisma.client.purchaseOrder.findMany({ select: { status: true } }),
      this.prisma.client.project.findMany({ select: { status: true, forecastPercent: true } }),
      this.prisma.client.asset.findMany({ select: { status: true, lifecycleStatus: true } })
    ]);

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount ?? 0), 0);
    const pendingInvoices = invoices.filter((i) => i.status !== 'APPROVED').length;
    const activePOs = purchaseOrders.filter((p) => p.status === 'PENDING').length;
    const activeProjects = projects.filter((project) => project.status === GenericStatus.ACTIVE).length;
    const avgForecastPercent = projects.length > 0
      ? Number(
          (
            projects.reduce((sum, project) => sum + Number(project.forecastPercent ?? 0), 0) / projects.length
          ).toFixed(2)
        )
      : 0;
    const activeAssets = assets.filter((asset) => asset.status === GenericStatus.ACTIVE).length;
    const maintenanceAssets = assets.filter((asset) => asset.lifecycleStatus === 'MAINTENANCE').length;

    return {
      totalRevenue,
      totalEmployees: employees,
      pendingInvoices,
      activePurchaseOrders: activePOs,
      activeProjects,
      avgForecastPercent,
      activeAssets,
      maintenanceAssets
    };
  }

  async byModule(module: string, limit = 50): Promise<unknown[]> {
    const normalized = module.trim().toLowerCase();
    const take = Math.min(Math.max(limit, 1), 200);

    switch (normalized) {
      case 'sales':
        return this.prisma.client.order.findMany({ orderBy: { createdAt: 'desc' }, take });
      case 'hr':
        return this.prisma.client.employee.findMany({ orderBy: { createdAt: 'desc' }, take });
      case 'finance':
        return this.prisma.client.invoice.findMany({ orderBy: { createdAt: 'desc' }, take });
      case 'scm':
        return this.prisma.client.purchaseOrder.findMany({ orderBy: { createdAt: 'desc' }, take });
      case 'projects':
        return this.prisma.client.project.findMany({ orderBy: { createdAt: 'desc' }, take });
      case 'assets':
        return this.prisma.client.asset.findMany({ orderBy: { createdAt: 'desc' }, take });
      case 'catalog':
        return this.prisma.client.product.findMany({ orderBy: { createdAt: 'desc' }, take });
      case 'crm':
        return this.prisma.client.customer.findMany({ orderBy: { createdAt: 'desc' }, take });
      case 'workflows':
        return this.prisma.client.workflowInstance.findMany({ orderBy: { createdAt: 'desc' }, take });
      default:
        throw new BadRequestException(`Unsupported report module: ${module}`);
    }
  }

  async listDefinitions(query: ReportsListQueryDto) {
    const where: Prisma.ReportWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.moduleName ? { moduleName: query.moduleName } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { reportType: { contains: query.q, mode: 'insensitive' } },
              { templateCode: { contains: query.q, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    return this.prisma.client.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async getDefinition(id: string) {
    return this.ensureDefinition(id);
  }

  async createDefinition(payload: CreateReportDefinitionDto) {
    const outputFormat = this.resolveOutputFormat(payload.outputFormat ?? 'JSON');

    return this.prisma.client.report.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        reportType: payload.reportType,
        name: payload.name,
        moduleName: payload.moduleName ?? null,
        templateCode: payload.templateCode ?? null,
        outputFormat,
        scheduleRule: payload.scheduleRule ?? null,
        nextRunAt: payload.nextRunAt ? this.parseDate(payload.nextRunAt, 'nextRunAt') : null,
        status: payload.status ?? GenericStatus.ACTIVE,
        configJson: (payload.configJson ?? Prisma.DbNull) as Prisma.InputJsonValue
      }
    });
  }

  async updateDefinition(id: string, payload: UpdateReportDefinitionDto) {
    await this.ensureDefinition(id);

    await this.prisma.client.report.updateMany({
      where: { id },
      data: {
        reportType: payload.reportType,
        name: payload.name,
        moduleName: payload.moduleName,
        templateCode: payload.templateCode,
        outputFormat: payload.outputFormat ? this.resolveOutputFormat(payload.outputFormat) : undefined,
        scheduleRule: payload.scheduleRule,
        nextRunAt: payload.nextRunAt ? this.parseDate(payload.nextRunAt, 'nextRunAt') : undefined,
        status: payload.status,
        configJson: payload.configJson ? (payload.configJson as Prisma.InputJsonValue) : undefined
      }
    });

    return this.ensureDefinition(id);
  }

  async listRuns(reportId: string, query: PaginationQueryDto) {
    await this.ensureDefinition(reportId);

    return this.prisma.client.reportRun.findMany({
      where: { reportId },
      orderBy: { createdAt: 'desc' },
      take: this.take(query.limit)
    });
  }

  async generateReportRun(reportId: string, payload: GenerateReportRunDto) {
    const report = await this.ensureDefinition(reportId);
    const outputFormat = this.resolveOutputFormat(
      payload.outputFormat ?? (report.outputFormat as ReportOutputFormat | null) ?? 'JSON'
    );
    const moduleName = report.moduleName ?? 'sales';
    const rows = await this.byModule(moduleName, payload.limit ?? 100);
    const generatedAt = new Date();

    const summary = {
      generatedAt: generatedAt.toISOString(),
      moduleName,
      templateCode: report.templateCode,
      rowCount: rows.length,
      filters: payload.filters ?? null,
      preview: rows.slice(0, 5)
    };

    const outputPath = `/reports/${reportId}/${generatedAt.toISOString().replace(/[:.]/g, '-')}.${outputFormat.toLowerCase()}`;

    const run = await this.prisma.client.reportRun.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        reportId,
        outputFormat,
        outputPath,
        summaryJson: summary as Prisma.InputJsonValue,
        status: GenericStatus.APPROVED,
        generatedAt
      }
    });

    const nextRunAt = this.computeNextRunAt(report.scheduleRule, generatedAt);
    await this.prisma.client.report.updateMany({
      where: { id: reportId },
      data: {
        outputFormat,
        lastRunAt: generatedAt,
        nextRunAt,
        generatedAt
      }
    });

    await this.prisma.client.notification.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        title: `Report generated: ${report.name}`,
        content: `${outputFormat} / ${rows.length} rows / run ${run.id}`,
        isRead: false
      }
    });

    return {
      run,
      summary
    };
  }

  async runDueSchedules(payload: RunDueSchedulesDto) {
    const now = new Date();
    const dueReports = await this.prisma.client.report.findMany({
      where: {
        status: GenericStatus.ACTIVE,
        scheduleRule: { not: null },
        nextRunAt: { lte: now }
      },
      orderBy: { nextRunAt: 'asc' },
      take: this.take(payload.limit ?? 20)
    });

    const runs: Array<{ reportId: string; runId: string; outputFormat: string }> = [];
    for (const report of dueReports) {
      const generated = await this.generateReportRun(report.id, {
        outputFormat: (report.outputFormat as ReportOutputFormat | null) ?? undefined,
        limit: 100
      });

      runs.push({
        reportId: report.id,
        runId: generated.run.id,
        outputFormat: generated.run.outputFormat
      });
    }

    return {
      processed: runs.length,
      reportIds: dueReports.map((report) => report.id),
      runs
    };
  }

  private async ensureDefinition(id: string) {
    const report = await this.prisma.client.report.findFirst({
      where: { id },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });
    if (!report) {
      throw new NotFoundException(`Report definition not found: ${id}`);
    }
    return report;
  }

  private resolveOutputFormat(value: string): ReportOutputFormat {
    const normalized = value.trim().toUpperCase();
    if (REPORT_OUTPUT_FORMATS.includes(normalized as ReportOutputFormat)) {
      return normalized as ReportOutputFormat;
    }
    throw new BadRequestException(`Unsupported output format: ${value}`);
  }

  private computeNextRunAt(scheduleRule: string | null, base: Date) {
    if (!scheduleRule) {
      return null;
    }

    const normalized = scheduleRule.trim().toUpperCase();
    if (normalized.startsWith('HOURLY')) {
      const match = normalized.match(/^HOURLY(?::(\d+))?$/);
      const interval = match && match[1] ? Math.max(1, Number(match[1])) : 1;
      return new Date(base.getTime() + interval * 60 * 60 * 1000);
    }
    if (normalized.startsWith('DAILY')) {
      const match = normalized.match(/^DAILY(?::(\d+))?$/);
      const interval = match && match[1] ? Math.max(1, Number(match[1])) : 1;
      return new Date(base.getTime() + interval * 24 * 60 * 60 * 1000);
    }
    if (normalized.startsWith('WEEKLY')) {
      const match = normalized.match(/^WEEKLY(?::(\d+))?$/);
      const interval = match && match[1] ? Math.max(1, Number(match[1])) : 1;
      return new Date(base.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
    }
    return null;
  }

  private parseDate(value: string, fieldName: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date for ${fieldName}`);
    }
    return parsed;
  }

  private take(limit?: number) {
    if (!limit || limit <= 0) {
      return 100;
    }
    return Math.min(limit, 250);
  }
}
