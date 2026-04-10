import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  buildCursorListResponse,
  resolvePageLimit,
  resolveSortQuery,
  sliceCursorItems
} from '../../common/pagination/pagination-response';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateReportDefinitionDto,
  GenerateReportRunDto,
  ModuleDataQueryDto,
  ReportOutputFormat,
  REPORT_OUTPUT_FORMATS,
  ReportsListQueryDto,
  ReportsOverviewQueryDto,
  RunDueSchedulesDto,
  UpdateReportDefinitionDto
} from './dto/reports.dto';
import { ReportExportService } from './report-export.service';
import {
  buildDailyBuckets,
  clampDateRange,
  formatBucketLabel,
  resolveReportDateRange,
  toBucketKey
} from './reports-range.util';

type RevenueBucketRow = {
  bucket: Date;
  revenue: Prisma.Decimal | number | null;
  orders: bigint | number;
};

type OrderStatusGroup = {
  status: GenericStatus;
  _count: {
    _all: number;
  };
};

@Injectable()
export class ReportsService {
  private readonly moduleSnapshotSortableFields = ['createdAt', 'status', 'id'] as const;
  private readonly reportDefinitionSortableFields = ['createdAt', 'name', 'moduleName', 'reportType', 'status', 'templateCode', 'id'] as const;
  private readonly reportRunSortableFields = ['createdAt', 'generatedAt', 'status', 'runStatus', 'outputFormat', 'id'] as const;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReportExportService) private readonly reportExport: ReportExportService
  ) {}

  async overview(query: ReportsOverviewQueryDto = {}) {
    const resolvedRange = this.resolveRange(query);
    const whereCreatedAt = {
      gte: resolvedRange.from,
      lt: resolvedRange.to
    } as const;
    const wherePreviousCreatedAt = {
      gte: resolvedRange.previousFrom,
      lt: resolvedRange.previousTo
    } as const;

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const [
      ordersAgg,
      previousOrdersAgg,
      employees,
      pendingInvoices,
      activePOs,
      activeProjects,
      avgProjectForecast,
      activeAssets,
      maintenanceAssets,
      orderStatusGroups,
      revenueSeries,
      // New dashboard KPI queries
      approvedInvoicesAgg,
      approvedPOsAgg,
      activeEmployeeCount,
      onLeaveTodayCount,
      pendingEmployeeCount,
      newCustomersCount,
      cashflowSeries
    ] = await Promise.all([
      this.prisma.client.order.aggregate({
        where: { createdAt: whereCreatedAt },
        _sum: { totalAmount: true },
        _count: { _all: true }
      }),
      this.prisma.client.order.aggregate({
        where: { createdAt: wherePreviousCreatedAt },
        _sum: { totalAmount: true }
      }),
      this.prisma.client.employee.count(),
      this.prisma.client.invoice.count({
        where: {
          status: { not: GenericStatus.APPROVED },
          createdAt: whereCreatedAt
        }
      }),
      this.prisma.client.purchaseOrder.count({
        where: {
          status: GenericStatus.PENDING,
          createdAt: whereCreatedAt
        }
      }),
      this.prisma.client.project.count({
        where: {
          status: GenericStatus.ACTIVE,
          createdAt: whereCreatedAt
        }
      }),
      this.prisma.client.project.aggregate({
        where: {
          status: GenericStatus.ACTIVE,
          createdAt: whereCreatedAt
        },
        _avg: {
          forecastPercent: true
        }
      }),
      this.prisma.client.asset.count({
        where: {
          status: GenericStatus.ACTIVE
        }
      }),
      this.prisma.client.asset.count({
        where: {
          lifecycleStatus: 'MAINTENANCE'
        }
      }),
      this.prisma.client.order.groupBy({
        by: ['status'],
        where: { createdAt: whereCreatedAt },
        _count: { _all: true }
      }),
      this.buildRevenueSeries(resolvedRange.from, resolvedRange.to),
      // Total collections: approved invoices sum
      this.prisma.client.invoice.aggregate({
        where: {
          status: GenericStatus.APPROVED,
          createdAt: whereCreatedAt
        },
        _sum: { totalAmount: true }
      }),
      // Total expenses: approved PO sum
      this.prisma.client.purchaseOrder.aggregate({
        where: {
          status: GenericStatus.APPROVED,
          createdAt: whereCreatedAt
        },
        _sum: { totalAmount: true }
      }),
      // Active employees
      this.prisma.client.employee.count({
        where: { status: GenericStatus.ACTIVE }
      }),
      // On leave today
      this.prisma.client.leaveRequest.count({
        where: {
          startDate: { lte: todayEnd },
          endDate: { gte: todayStart },
          status: { in: [GenericStatus.PENDING, GenericStatus.APPROVED] }
        }
      }),
      // Active recruitment (proxy: pending employees)
      this.prisma.client.employee.count({
        where: { status: GenericStatus.PENDING }
      }),
      // New customers in range
      this.prisma.client.customer.count({
        where: { createdAt: whereCreatedAt }
      }),
      // Cashflow series (monthly income vs expense)
      this.buildCashflowSeries(resolvedRange.from, resolvedRange.to)
    ]);

    const totalRevenue = this.toFiniteNumber(ordersAgg._sum.totalAmount);
    const previousRevenue = this.toFiniteNumber(previousOrdersAgg._sum.totalAmount);
    const totalOrders = Number(ordersAgg._count?._all ?? 0);
    const totalCollections = this.toFiniteNumber(approvedInvoicesAgg._sum.totalAmount);
    const totalExpenses = this.toFiniteNumber(approvedPOsAgg._sum.totalAmount);
    const budgetUsedPercent = totalRevenue > 0
      ? Number(((totalExpenses / totalRevenue) * 100).toFixed(1))
      : 0;

    return {
      range: {
        key: resolvedRange.key,
        label: resolvedRange.label,
        from: resolvedRange.from.toISOString(),
        to: resolvedRange.to.toISOString()
      },
      totalRevenue,
      totalEmployees: employees,
      pendingInvoices,
      activePurchaseOrders: activePOs,
      activeProjects,
      avgForecastPercent: Number((avgProjectForecast._avg.forecastPercent ?? 0).toFixed(2)),
      activeAssets,
      maintenanceAssets,
      totalOrders,
      revenueDeltaPercent: this.computeDeltaPercent(totalRevenue, previousRevenue),
      // New KPI fields
      totalCollections,
      totalExpenses,
      budgetUsedPercent,
      activeEmployees: activeEmployeeCount,
      onLeaveToday: onLeaveTodayCount,
      activeRecruitment: pendingEmployeeCount,
      newCustomersInRange: newCustomersCount,
      charts: {
        revenueSeries,
        orderStatusSeries: this.toOrderStatusSeries(orderStatusGroups),
        cashflowSeries
      }
    };
  }

  async byModule(query: ModuleDataQueryDto) {
    const normalized = query.name.trim().toLowerCase();
    const take = resolvePageLimit(query.limit, 25, 100);
    const { sortBy, sortDir, sortableFields } = resolveSortQuery(query, {
      sortableFields: this.moduleSnapshotSortableFields,
      defaultSortBy: 'createdAt',
      defaultSortDir: 'desc',
      errorLabel: `reports/module(${normalized})`
    });
    const createdAt = this.resolveCreatedAtFilter(query);

    const queryArgs = {
      where: createdAt ? { createdAt } : undefined,
      orderBy: this.buildModuleSortOrderBy(sortBy, sortDir),
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    };

    let rows: Array<{ id: string; [key: string]: unknown }> = [];
    switch (normalized) {
      case 'sales':
        rows = await this.prisma.client.order.findMany(queryArgs as Prisma.OrderFindManyArgs) as any;
        break;
      case 'hr':
        rows = await this.prisma.client.employee.findMany(queryArgs as Prisma.EmployeeFindManyArgs) as any;
        break;
      case 'finance':
        rows = await this.prisma.client.invoice.findMany(queryArgs as Prisma.InvoiceFindManyArgs) as any;
        break;
      case 'scm':
        rows = await this.prisma.client.purchaseOrder.findMany(queryArgs as Prisma.PurchaseOrderFindManyArgs) as any;
        break;
      case 'projects':
        rows = await this.prisma.client.project.findMany(queryArgs as Prisma.ProjectFindManyArgs) as any;
        break;
      case 'assets':
        rows = await this.prisma.client.asset.findMany(queryArgs as Prisma.AssetFindManyArgs) as any;
        break;
      case 'catalog':
        rows = await this.prisma.client.product.findMany(queryArgs as Prisma.ProductFindManyArgs) as any;
        break;
      case 'crm':
        rows = await this.prisma.client.customer.findMany(queryArgs as Prisma.CustomerFindManyArgs) as any;
        break;
      case 'workflows':
        rows = await this.prisma.client.workflowInstance.findMany(queryArgs as Prisma.WorkflowInstanceFindManyArgs) as any;
        break;
      default:
        throw new BadRequestException(`Unsupported report module: ${query.name}`);
    }

    const { items, hasMore, nextCursor } = sliceCursorItems(rows, take);
    return buildCursorListResponse(items, {
      limit: take,
      hasMore,
      nextCursor,
      sortBy,
      sortDir,
      sortableFields,
      consistency: 'snapshot'
    });
  }

  async getMetricsByModule(query: ModuleDataQueryDto) {
    const normalized = query.name.trim().toLowerCase();
    const resolvedRange = this.resolveRange(query);
    const whereCreatedAt = {
      gte: resolvedRange.from,
      lt: resolvedRange.to
    } as const;

    let metrics: any = {};

    switch (normalized) {
      case 'sales':
      case 'crm': {
        const orderStatusGroups = await this.prisma.client.order.groupBy({
          by: ['status'],
          where: { createdAt: whereCreatedAt },
          _count: { _all: true }
        });
        const revenueSeries = await this.buildRevenueSeries(resolvedRange.from, resolvedRange.to);
        metrics = {
          orderStatusSeries: this.toOrderStatusSeries ? this.toOrderStatusSeries(orderStatusGroups) : orderStatusGroups,
          revenueSeries,
        };
        break;
      }
      case 'finance': {
        const cashflowSeries = await this.buildCashflowSeries(resolvedRange.from, resolvedRange.to);
        metrics = { cashflowSeries };
        break;
      }
      case 'hr': {
        const activeCount = await this.prisma.client.employee.count({
          where: { status: GenericStatus.ACTIVE }
        });
        const pendingCount = await this.prisma.client.employee.count({
          where: { status: GenericStatus.PENDING }
        });
        const onLeaveCount = await this.prisma.client.leaveRequest.count({
           where: { 
             status: GenericStatus.APPROVED, 
             startDate: { lte: resolvedRange.to }, 
             endDate: { gte: resolvedRange.from } 
           }
        });
        metrics = { activeCount, pendingCount, onLeaveCount };
        break;
      }
      case 'scm':
      case 'inventory':
      case 'catalog':
      case 'assets': {
        const activeAssets = await this.prisma.client.asset.count({
          where: { status: GenericStatus.ACTIVE }
        });
        const pendingPOs = await this.prisma.client.purchaseOrder.count({
          where: { status: GenericStatus.PENDING, createdAt: whereCreatedAt }
        });
        metrics = { activeAssets, pendingPOs };
        break;
      }
      case 'projects': {
        const avgForecast = await this.prisma.client.project.aggregate({
          where: { status: GenericStatus.ACTIVE, createdAt: whereCreatedAt },
          _avg: { forecastPercent: true }
        });
        const activeCount = await this.prisma.client.project.count({
          where: { status: GenericStatus.ACTIVE, createdAt: whereCreatedAt }
        });
        metrics = { activeProjects: activeCount, avgForecastPercent: Number((avgForecast._avg.forecastPercent ?? 0).toFixed(2)) };
        break;
      }
      case 'workflows':
      case 'audit': {
        const instances = await this.prisma.client.workflowInstance.count({
          where: { createdAt: whereCreatedAt }
        });
        metrics = { instances };
        break;
      }
      default:
        metrics = { message: 'No specific metrics for this module.' };
    }

    return {
      moduleName: normalized,
      range: {
        key: resolvedRange.key,
        label: resolvedRange.label,
        from: resolvedRange.from.toISOString(),
        to: resolvedRange.to.toISOString()
      },
      metrics
    };
  }

  async listDefinitions(query: ReportsListQueryDto) {
    const take = resolvePageLimit(query.limit, 25, 100);
    const { sortBy, sortDir, sortableFields } = resolveSortQuery(query, {
      sortableFields: this.reportDefinitionSortableFields,
      defaultSortBy: 'createdAt',
      defaultSortDir: 'desc',
      errorLabel: 'reports'
    });
    const keyword = query.q?.trim();
    const where: Prisma.ReportWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.moduleName ? { moduleName: query.moduleName } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword, mode: 'insensitive' } },
              { reportType: { contains: keyword, mode: 'insensitive' } },
              { templateCode: { contains: keyword, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const rows = await this.prisma.client.report.findMany({
      where,
      orderBy: this.buildDefinitionSortOrderBy(sortBy, sortDir),
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });
    const { items, hasMore, nextCursor } = sliceCursorItems(rows, take);
    return buildCursorListResponse(items, {
      limit: take,
      hasMore,
      nextCursor,
      sortBy,
      sortDir,
      sortableFields,
      consistency: 'snapshot'
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
    const take = resolvePageLimit(query.limit, 25, 100);
    const { sortBy, sortDir, sortableFields } = resolveSortQuery(query, {
      sortableFields: this.reportRunSortableFields,
      defaultSortBy: 'createdAt',
      defaultSortDir: 'desc',
      errorLabel: 'reports/runs'
    });
    const rows = await this.prisma.client.reportRun.findMany({
      where: { reportId },
      orderBy: this.buildRunSortOrderBy(sortBy, sortDir),
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });
    const { items, hasMore, nextCursor } = sliceCursorItems(rows, take);
    return buildCursorListResponse(items, {
      limit: take,
      hasMore,
      nextCursor,
      sortBy,
      sortDir,
      sortableFields,
      consistency: 'snapshot'
    });
  }

  async generateReportRun(reportId: string, payload: GenerateReportRunDto) {
    const report = await this.ensureDefinition(reportId);
    const outputFormat = this.resolveOutputFormat(
      payload.outputFormat ?? (report.outputFormat as ReportOutputFormat | null) ?? 'JSON'
    );
    const moduleName = report.moduleName ?? 'sales';
    const generatedAt = new Date();

    const run = await this.prisma.client.reportRun.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        reportId,
        outputFormat,
        runStatus: 'queued',
        status: GenericStatus.PENDING
      }
    });

    try {
      await this.prisma.client.reportRun.update({
        where: { id: run.id },
        data: {
          runStatus: 'running',
          startedAt: new Date(),
          status: GenericStatus.PENDING
        }
      });

      if (!this.reportExport.isFormatSupported(outputFormat)) {
        throw new BadRequestException(this.reportExport.getUnsupportedReason(outputFormat));
      }

      const moduleData = await this.byModule({
        name: moduleName,
        limit: payload.limit ?? 500,
        range: payload.range,
        startDate: payload.startDate,
        endDate: payload.endDate
      } as ModuleDataQueryDto);
      const rows = moduleData.items as Array<Record<string, unknown>>;

      const summary = {
        generatedAt: generatedAt.toISOString(),
        moduleName,
        templateCode: report.templateCode,
        rowCount: rows.length,
        filters: payload.filters ?? null,
        range: payload.range ?? null,
        startDate: payload.startDate ?? null,
        endDate: payload.endDate ?? null,
        preview: rows.slice(0, 5)
      };

      const exportResult = await this.reportExport.writeReportFile({
        tenantId: this.prisma.getTenantId(),
        reportId,
        runId: run.id,
        reportName: report.name,
        outputFormat,
        rows,
        summary,
        generatedAt
      });

      const persistedRun = await this.prisma.client.reportRun.update({
        where: { id: run.id },
        data: {
          runStatus: 'succeeded',
          status: GenericStatus.APPROVED,
          generatedAt,
          finishedAt: new Date(),
          outputPath: exportResult.outputPath,
          outputMimeType: exportResult.outputMimeType,
          outputSizeBytes: exportResult.outputSizeBytes,
          summaryJson: summary as Prisma.InputJsonValue,
          errorMessage: null
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
          content: `${outputFormat} / ${rows.length} rows / run ${persistedRun.id}`,
          isRead: false
        }
      });

      return {
        run: persistedRun,
        summary
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generate report thất bại.';
      await this.prisma.client.reportRun.updateMany({
        where: { id: run.id },
        data: {
          runStatus: 'failed',
          status: GenericStatus.REJECTED,
          finishedAt: new Date(),
          errorMessage: message
        }
      });

      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(message);
    }
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
    const failures: Array<{ reportId: string; reason: string }> = [];

    for (const report of dueReports) {
      try {
        const generated = await this.generateReportRun(report.id, {
          outputFormat: (report.outputFormat as ReportOutputFormat | null) ?? undefined,
          limit: 500
        });

        runs.push({
          reportId: report.id,
          runId: generated.run.id,
          outputFormat: generated.run.outputFormat
        });
      } catch (error) {
        failures.push({
          reportId: report.id,
          reason: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      processed: runs.length,
      failed: failures.length,
      reportIds: dueReports.map((report) => report.id),
      runs,
      failures
    };
  }

  async downloadRun(runId: string) {
    const run = await this.prisma.client.reportRun.findFirst({
      where: { id: runId },
      include: {
        report: {
          select: {
            name: true
          }
        }
      }
    });

    if (!run) {
      throw new NotFoundException(`Report run not found: ${runId}`);
    }

    if (run.runStatus !== 'succeeded' || !run.outputPath) {
      throw new BadRequestException('Report run chưa sẵn sàng để tải xuống.');
    }

    const file = await this.reportExport.resolveOutputFile(run.outputPath);
    const ext = String(run.outputFormat ?? 'json').toLowerCase();
    const base = String(run.report?.name ?? 'report')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'report';

    return {
      stream: file.stream,
      size: file.size,
      mimeType: run.outputMimeType ?? 'application/octet-stream',
      fileName: `${base}-${run.id}.${ext}`
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

  private buildModuleSortOrderBy(sortBy: string, sortDir: 'asc' | 'desc') {
    if (sortBy === 'id') {
      return [{ id: sortDir }];
    }
    return [{ [sortBy]: sortDir }, { id: sortDir }];
  }

  private buildDefinitionSortOrderBy(
    sortBy: string,
    sortDir: 'asc' | 'desc'
  ): Prisma.ReportOrderByWithRelationInput[] {
    if (sortBy === 'id') {
      return [{ id: sortDir }];
    }
    return [{ [sortBy]: sortDir }, { id: sortDir }] as Prisma.ReportOrderByWithRelationInput[];
  }

  private buildRunSortOrderBy(
    sortBy: string,
    sortDir: 'asc' | 'desc'
  ): Prisma.ReportRunOrderByWithRelationInput[] {
    if (sortBy === 'id') {
      return [{ id: sortDir }];
    }
    return [{ [sortBy]: sortDir }, { id: sortDir }] as Prisma.ReportRunOrderByWithRelationInput[];
  }

  private resolveRange(query: ReportsOverviewQueryDto | ModuleDataQueryDto) {
    const explicit = clampDateRange(query.startDate, query.endDate);
    if (explicit) {
      const previousFrom = new Date(explicit.from.getTime() - (explicit.to.getTime() - explicit.from.getTime()));
      return {
        key: 'CUSTOM',
        label: 'Tùy chọn',
        from: explicit.from,
        to: explicit.to,
        previousFrom,
        previousTo: explicit.from
      };
    }
    return resolveReportDateRange(query.range);
  }

  private resolveCreatedAtFilter(query: ModuleDataQueryDto) {
    if (!query.range && !query.startDate && !query.endDate) {
      return undefined;
    }
    const range = this.resolveRange(query);
    return {
      gte: range.from,
      lt: range.to
    };
  }

  private async buildRevenueSeries(from: Date, to: Date) {
    const buckets = buildDailyBuckets({ from, to });
    const tenantId = this.prisma.getTenantId();
    const byBucket = new Map<string, { value: number; orders: number }>();

    try {
      const rows = await this.prisma.client.$queryRaw<RevenueBucketRow[]>(Prisma.sql`
        SELECT
          DATE_TRUNC('day', "createdAt") AS "bucket",
          COALESCE(SUM("totalAmount"), 0) AS "revenue",
          COUNT(*)::bigint AS "orders"
        FROM "Order"
        WHERE "tenant_Id" = ${tenantId}
          AND "createdAt" >= ${from}
          AND "createdAt" < ${to}
        GROUP BY 1
        ORDER BY 1 ASC
      `);

      rows.forEach((row) => {
        const bucketDate = new Date(row.bucket);
        const key = toBucketKey(bucketDate);
        byBucket.set(key, {
          value: this.toFiniteNumber(row.revenue),
          orders: Number(row.orders ?? 0)
        });
      });
    } catch {
      const fallbackRows = await this.prisma.client.order.findMany({
        where: {
          createdAt: {
            gte: from,
            lt: to
          }
        },
        select: {
          createdAt: true,
          totalAmount: true
        }
      });
      fallbackRows.forEach((row) => {
        const key = toBucketKey(row.createdAt);
        const current = byBucket.get(key) ?? { value: 0, orders: 0 };
        current.value += this.toFiniteNumber(row.totalAmount);
        current.orders += 1;
        byBucket.set(key, current);
      });
    }

    return buckets.map((bucket) => {
      const key = toBucketKey(bucket);
      const entry = byBucket.get(key) ?? { value: 0, orders: 0 };
      return {
        bucket: key,
        label: formatBucketLabel(bucket),
        value: entry.value,
        orders: entry.orders
      };
    });
  }

  private async buildCashflowSeries(from: Date, to: Date) {
    const tenantId = this.prisma.getTenantId();

    type MonthlyRow = { month: string; total: Prisma.Decimal | number | null };

    let incomeRows: MonthlyRow[] = [];
    let expenseRows: MonthlyRow[] = [];

    try {
      incomeRows = await this.prisma.client.$queryRaw<MonthlyRow[]>(Prisma.sql`
        SELECT
          TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS "month",
          COALESCE(SUM("totalAmount"), 0) AS "total"
        FROM "Invoice"
        WHERE "tenant_Id" = ${tenantId}
          AND "status" = 'APPROVED'
          AND "createdAt" >= ${from}
          AND "createdAt" < ${to}
        GROUP BY 1
        ORDER BY 1 ASC
      `);
    } catch {
      incomeRows = [];
    }

    try {
      expenseRows = await this.prisma.client.$queryRaw<MonthlyRow[]>(Prisma.sql`
        SELECT
          TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS "month",
          COALESCE(SUM("totalAmount"), 0) AS "total"
        FROM "PurchaseOrder"
        WHERE "tenant_Id" = ${tenantId}
          AND "status" = 'APPROVED'
          AND "createdAt" >= ${from}
          AND "createdAt" < ${to}
        GROUP BY 1
        ORDER BY 1 ASC
      `);
    } catch {
      expenseRows = [];
    }

    const incomeMap = new Map(incomeRows.map((r) => [r.month, this.toFiniteNumber(r.total)]));
    const expenseMap = new Map(expenseRows.map((r) => [r.month, this.toFiniteNumber(r.total)]));
    const allMonths = new Set([...incomeMap.keys(), ...expenseMap.keys()]);
    const sortedMonths = [...allMonths].sort();

    // If no data, generate months from range
    if (sortedMonths.length === 0) {
      const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
      while (cursor < to) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        sortedMonths.push(key);
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    return sortedMonths.map((month) => {
      const [year, m] = month.split('-');
      const label = `T${Number(m)}/${year}`;
      return {
        month,
        label,
        income: incomeMap.get(month) ?? 0,
        expense: expenseMap.get(month) ?? 0
      };
    });
  }

  private toOrderStatusSeries(groups: OrderStatusGroup[]) {
    return groups
      .map((item) => ({
        status: item.status,
        label: this.toOrderStatusLabel(item.status),
        value: Number(item._count._all ?? 0)
      }))
      .sort((left, right) => right.value - left.value);
  }

  private toOrderStatusLabel(status: GenericStatus) {
    switch (status) {
      case GenericStatus.APPROVED:
        return 'Hoàn thành';
      case GenericStatus.PENDING:
        return 'Đang xử lý';
      case GenericStatus.REJECTED:
        return 'Từ chối';
      case GenericStatus.DRAFT:
        return 'Nháp';
      case GenericStatus.ACTIVE:
        return 'Đang hoạt động';
      case GenericStatus.INACTIVE:
        return 'Ngừng hoạt động';
      case GenericStatus.ARCHIVED:
        return 'Đã lưu trữ';
      default:
        return status;
    }
  }

  private toFiniteNumber(value: unknown) {
    if (value === null || value === undefined) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private computeDeltaPercent(current: number, previous: number) {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) {
      return null;
    }
    if (previous === 0) {
      return current === 0 ? 0 : 100;
    }
    return Number((((current - previous) / previous) * 100).toFixed(2));
  }
}
