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
