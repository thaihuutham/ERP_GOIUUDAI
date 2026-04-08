import { GenericStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ReportsService } from '../src/modules/reports/reports.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('tenant_demo_company'),
    client: {
      order: {
        findMany: vi.fn()
      },
      employee: {
        count: vi.fn()
      },
      invoice: {
        findMany: vi.fn()
      },
      purchaseOrder: {
        findMany: vi.fn()
      },
      project: {
        findMany: vi.fn()
      },
      asset: {
        findMany: vi.fn()
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
        findMany: vi.fn(),
        create: vi.fn()
      },
      notification: {
        create: vi.fn()
      }
    }
  };
}

describe('ReportsService', () => {
  it('returns module snapshot with cursor pagination + sort metadata', async () => {
    const prisma = makePrismaMock();
    prisma.client.order.findMany.mockResolvedValue([
      { id: 'ord_3', status: GenericStatus.PENDING, createdAt: new Date('2026-04-01T00:00:00.000Z') },
      { id: 'ord_2', status: GenericStatus.APPROVED, createdAt: new Date('2026-03-31T00:00:00.000Z') },
      { id: 'ord_1', status: GenericStatus.APPROVED, createdAt: new Date('2026-03-30T00:00:00.000Z') }
    ]);

    const service = new ReportsService(prisma as any);
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

  it('lists report definitions with cursor pagination + sort metadata', async () => {
    const prisma = makePrismaMock();
    prisma.client.report.findMany.mockResolvedValue([
      { id: 'rep_3', name: 'C report' },
      { id: 'rep_2', name: 'B report' },
      { id: 'rep_1', name: 'A report' }
    ]);

    const service = new ReportsService(prisma as any);
    const result = await service.listDefinitions({
      limit: 2,
      sortBy: 'name',
      sortDir: 'asc'
    } as any);

    expect(prisma.client.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 3
      })
    );
    expect(result.items).toHaveLength(2);
    expect(result.pageInfo).toMatchObject({
      limit: 2,
      hasMore: true,
      nextCursor: 'rep_2'
    });
    expect(result.sortMeta).toMatchObject({
      sortBy: 'name',
      sortDir: 'asc'
    });
  });

  it('generates report run and creates notification', async () => {
    const prisma = makePrismaMock();
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

    const service = new ReportsService(prisma as any);
    const result = await service.generateReportRun('rep_1', { limit: 2 });

    expect(prisma.client.reportRun.create).toHaveBeenCalled();
    expect(prisma.client.report.updateMany).toHaveBeenCalled();
    expect(prisma.client.notification.create).toHaveBeenCalled();
    expect(result.summary.rowCount).toBe(2);
  });

  it('runs due schedules and returns processed runs', async () => {
    const prisma = makePrismaMock();
    prisma.client.report.findMany.mockResolvedValue([
      {
        id: 'rep_due_1',
        outputFormat: 'JSON'
      }
    ]);

    const service = new ReportsService(prisma as any);
    vi.spyOn(service, 'generateReportRun').mockResolvedValue({
      run: {
        id: 'run_due_1',
        outputFormat: 'JSON'
      },
      summary: {
        rowCount: 0
      }
    } as any);

    const result = await service.runDueSchedules({});

    expect(service.generateReportRun).toHaveBeenCalledWith(
      'rep_due_1',
      expect.objectContaining({ outputFormat: 'JSON' })
    );
    expect(result.processed).toBe(1);
    expect(result.runs[0]?.runId).toBe('run_due_1');
  });

  it('returns overview KPI dashboard values', async () => {
    const prisma = makePrismaMock();
    prisma.client.order.findMany.mockResolvedValue([{ totalAmount: 100 }, { totalAmount: 250 }]);
    prisma.client.employee.count.mockResolvedValue(20);
    prisma.client.invoice.findMany.mockResolvedValue([
      { status: GenericStatus.PENDING },
      { status: GenericStatus.APPROVED }
    ]);
    prisma.client.purchaseOrder.findMany.mockResolvedValue([{ status: GenericStatus.PENDING }]);
    prisma.client.project.findMany.mockResolvedValue([{ status: GenericStatus.ACTIVE, forecastPercent: 50 }]);
    prisma.client.asset.findMany.mockResolvedValue([
      { status: GenericStatus.ACTIVE, lifecycleStatus: 'IN_USE' },
      { status: GenericStatus.ACTIVE, lifecycleStatus: 'MAINTENANCE' }
    ]);

    const service = new ReportsService(prisma as any);
    const overview = await service.overview();

    expect(overview.totalRevenue).toBe(350);
    expect(overview.totalEmployees).toBe(20);
    expect(overview.pendingInvoices).toBe(1);
    expect(overview.activeProjects).toBe(1);
    expect(overview.maintenanceAssets).toBe(1);
  });
});
