import { GenericStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ReportsService } from '../src/modules/reports/reports.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('tenant_demo_company'),
    client: {
      $queryRaw: vi.fn().mockResolvedValue([]),
      order: {
        findMany: vi.fn(),
        aggregate: vi.fn(),
        groupBy: vi.fn()
      },
      employee: {
        count: vi.fn()
      },
      invoice: {
        findMany: vi.fn(),
        count: vi.fn()
      },
      purchaseOrder: {
        findMany: vi.fn(),
        count: vi.fn()
      },
      project: {
        findMany: vi.fn(),
        count: vi.fn(),
        aggregate: vi.fn()
      },
      asset: {
        findMany: vi.fn(),
        count: vi.fn()
      },
      product: {
        findMany: vi.fn()
      },
      customer: {
        findMany: vi.fn()
      },
      workflowInstance: {
        findMany: vi.fn()
      },
      report: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      reportRun: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn()
      },
      notification: {
        create: vi.fn()
      }
    }
  };
}

function makeReportExportMock() {
  return {
    isFormatSupported: vi.fn().mockReturnValue(true),
    getUnsupportedReason: vi.fn().mockReturnValue('unsupported'),
    writeReportFile: vi.fn(),
    resolveOutputFile: vi.fn()
  };
}

describe('ReportsService', () => {
  it('returns module snapshot with cursor pagination + sort metadata', async () => {
    const prisma = makePrismaMock();
    const reportExport = makeReportExportMock();
    prisma.client.order.findMany.mockResolvedValue([
      { id: 'ord_3', status: GenericStatus.PENDING, createdAt: new Date('2026-04-01T00:00:00.000Z') },
      { id: 'ord_2', status: GenericStatus.APPROVED, createdAt: new Date('2026-03-31T00:00:00.000Z') },
      { id: 'ord_1', status: GenericStatus.APPROVED, createdAt: new Date('2026-03-30T00:00:00.000Z') }
    ]);

    const service = new ReportsService(prisma as any, reportExport as any);
    const result = await service.byModule({
      name: 'sales',
      limit: 2,
      sortBy: 'createdAt',
      sortDir: 'desc'
    } as any);

    expect(prisma.client.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3
      })
    );
    expect(result.items).toHaveLength(2);
    expect(result.pageInfo).toMatchObject({
      limit: 2,
      hasMore: true,
      nextCursor: 'ord_2'
    });
    expect(result.sortMeta).toMatchObject({
      sortBy: 'createdAt',
      sortDir: 'desc'
    });
  });

  it('generates report run with lifecycle and persisted output metadata', async () => {
    const prisma = makePrismaMock();
    const reportExport = makeReportExportMock();
    prisma.client.report.findFirst.mockResolvedValue({
      id: 'rep_1',
      name: 'Sales Daily',
      moduleName: 'sales',
      templateCode: 'TPL_SALES_DAILY',
      outputFormat: 'CSV',
      scheduleRule: 'DAILY',
      runs: []
    });
    prisma.client.order.findMany.mockResolvedValue([{ id: 'o_1' }, { id: 'o_2' }]);
    prisma.client.reportRun.create.mockResolvedValue({
      id: 'run_1',
      outputFormat: 'CSV'
    });
    prisma.client.reportRun.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'run_1',
      outputFormat: 'CSV',
      runStatus: data.runStatus ?? 'running'
    }));
    reportExport.writeReportFile.mockResolvedValue({
      outputPath: 'tenant_demo_company/rep_1/run_1.csv',
      outputMimeType: 'text/csv; charset=utf-8',
      outputSizeBytes: 256,
      downloadFileName: 'sales-daily.csv'
    });

    const service = new ReportsService(prisma as any, reportExport as any);
    const result = await service.generateReportRun('rep_1', { limit: 2 });

    expect(prisma.client.reportRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runStatus: 'queued'
        })
      })
    );
    expect(prisma.client.reportRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runStatus: 'running'
        })
      })
    );
    expect(prisma.client.reportRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runStatus: 'succeeded'
        })
      })
    );
    expect(reportExport.writeReportFile).toHaveBeenCalled();
    expect(prisma.client.report.updateMany).toHaveBeenCalled();
    expect(prisma.client.notification.create).toHaveBeenCalled();
    expect(result.summary.rowCount).toBe(2);
  });

  it('returns overview KPI values from aggregate queries', async () => {
    const prisma = makePrismaMock();
    const reportExport = makeReportExportMock();
    prisma.client.order.aggregate
      .mockResolvedValueOnce({
        _sum: { totalAmount: 350 },
        _count: { _all: 3 }
      })
      .mockResolvedValueOnce({
        _sum: { totalAmount: 175 }
      });
    prisma.client.employee.count.mockResolvedValue(20);
    prisma.client.invoice.count.mockResolvedValue(1);
    prisma.client.purchaseOrder.count.mockResolvedValue(2);
    prisma.client.project.count.mockResolvedValue(4);
    prisma.client.project.aggregate.mockResolvedValue({
      _avg: { forecastPercent: 55.5 }
    });
    prisma.client.asset.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);
    prisma.client.order.groupBy.mockResolvedValue([
      { status: GenericStatus.APPROVED, _count: { _all: 2 } },
      { status: GenericStatus.PENDING, _count: { _all: 1 } }
    ]);
    prisma.client.$queryRaw.mockResolvedValue([
      {
        bucket: new Date('2026-04-01T00:00:00.000Z'),
        revenue: 200,
        orders: 1
      }
    ]);

    const service = new ReportsService(prisma as any, reportExport as any);
    const overview = await service.overview({ range: 'THIS_WEEK' } as any);

    expect(overview.totalRevenue).toBe(350);
    expect(overview.totalEmployees).toBe(20);
    expect(overview.pendingInvoices).toBe(1);
    expect(overview.activeProjects).toBe(4);
    expect(overview.maintenanceAssets).toBe(2);
    expect(overview.charts.orderStatusSeries).toHaveLength(2);
    expect(Array.isArray(overview.charts.revenueSeries)).toBe(true);
  });

  it('continues scheduled runs when one report fails', async () => {
    const prisma = makePrismaMock();
    const reportExport = makeReportExportMock();
    prisma.client.report.findMany.mockResolvedValue([
      { id: 'rep_due_ok', outputFormat: 'JSON' },
      { id: 'rep_due_fail', outputFormat: 'PDF' }
    ]);

    const service = new ReportsService(prisma as any, reportExport as any);
    vi.spyOn(service, 'generateReportRun')
      .mockResolvedValueOnce({
        run: { id: 'run_due_ok', outputFormat: 'JSON' },
        summary: { rowCount: 3 }
      } as any)
      .mockRejectedValueOnce(new Error('Định dạng PDF chưa được hỗ trợ'));

    const result = await service.runDueSchedules({});

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.runs[0]?.runId).toBe('run_due_ok');
    expect(result.failures[0]?.reportId).toBe('rep_due_fail');
  });
});
