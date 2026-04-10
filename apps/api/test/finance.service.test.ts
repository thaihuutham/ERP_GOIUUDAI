import { BadRequestException } from '@nestjs/common';
import { GenericStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { FinanceService } from '../src/modules/finance/finance.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('tenant_demo_company'),
    client: {
      setting: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      invoice: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      order: {
        findFirst: vi.fn()
      },
      paymentAllocation: {
        aggregate: vi.fn(),
        create: vi.fn()
      },
      journalEntry: {
        create: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn()
      },
      journalEntryLine: {
        createMany: vi.fn(),
        deleteMany: vi.fn()
      },
      $transaction: vi.fn(async (fn: (tx: any) => any) => fn({
        journalEntry: {
          create: vi.fn().mockResolvedValue({ id: 'je_1' }),
          findFirst: vi.fn().mockResolvedValue({ id: 'je_1', lines: [] }),
          updateMany: vi.fn()
        },
        journalEntryLine: {
          createMany: vi.fn(),
          deleteMany: vi.fn()
        }
      }))
    }
  };
}

function makeSettingsPolicyMock() {
  return {
    listFinanceLockedPeriods: vi.fn().mockResolvedValue([]),
    lockFinancePeriod: vi.fn(async (period: string) => [period])
  };
}

function makeRuntimeSettingsMock() {
  return {
    getFinanceControlsRuntime: vi.fn().mockResolvedValue({
      postingPeriods: {
        lockedPeriods: [],
        allowBackdateDays: 3650
      },
      documentNumbering: {
        invoicePrefix: 'INV',
        orderPrefix: 'SO',
        autoNumber: true
      },
      transactionCutoffHour: 23
    }),
    getWebRuntime: vi.fn().mockResolvedValue({
      locale: {
        timezone: 'Asia/Ho_Chi_Minh'
      },
      documentLayout: {
        invoiceTemplate: 'standard'
      }
    })
  };
}

function makeSearchMock() {
  return {
    shouldUseHybridSearch: vi.fn().mockResolvedValue(false),
    searchInvoiceIds: vi.fn().mockResolvedValue(null),
    syncInvoiceUpsert: vi.fn().mockResolvedValue(undefined)
  };
}

describe('FinanceService', () => {
  it('filters invoice list by IAM scope employee ids through linked order', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    const iamScopeFilter = {
      resolveForCurrentActor: vi.fn().mockResolvedValue({
        enabled: true,
        mode: 'LIMITED',
        companyWide: false,
        actorIds: ['user_in_scope'],
        employeeIds: ['emp_fin_scope_1'],
        orgUnitIds: []
      })
    };

    const service = new FinanceService(
      prisma as any,
      search as any,
      makeSettingsPolicyMock() as any,
      makeRuntimeSettingsMock() as any,
      iamScopeFilter as any
    );

    await service.listInvoices({} as any);

    expect(iamScopeFilter.resolveForCurrentActor).toHaveBeenCalledWith('finance');
    expect(prisma.client.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          order: {
            is: {
              employeeId: {
                in: ['emp_fin_scope_1']
              }
            }
          }
        })
      })
    );
  });

  it('rejects unbalanced journal lines', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    const settingsPolicy = makeSettingsPolicyMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new FinanceService(prisma as any, search as any, settingsPolicy as any, runtimeSettings as any);

    await expect(
      service.createJournalEntry({
        entryDate: '2026-03-28',
        lines: [
          { accountCode: '111', debit: 100 },
          { accountCode: '112', credit: 80 }
        ]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('closes finance period and persists lock list', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    const settingsPolicy = makeSettingsPolicyMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new FinanceService(prisma as any, search as any, settingsPolicy as any, runtimeSettings as any);

    const result = await service.closePeriod('2026-03', 'qa_admin');

    expect(result.locked).toBe(true);
    expect(result.period).toBe('2026-03');
    expect(settingsPolicy.lockFinancePeriod).toHaveBeenCalledWith('2026-03', 'qa_admin');
    expect(prisma.client.setting.create).toHaveBeenCalledTimes(1);
  });

  it('allocates payment and marks invoice as paid off when full amount reached', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    prisma.client.invoice.findFirst.mockResolvedValue({
      id: 'inv_1',
      dueAt: new Date('2026-03-31T00:00:00.000Z'),
      status: GenericStatus.APPROVED,
      totalAmount: 100,
      paidAmount: 0
    });
    prisma.client.paymentAllocation.aggregate.mockResolvedValue({
      _sum: { allocatedAmount: 0 }
    });
    prisma.client.paymentAllocation.create.mockResolvedValue({ id: 'alloc_1' });

    const settingsPolicy = makeSettingsPolicyMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new FinanceService(prisma as any, search as any, settingsPolicy as any, runtimeSettings as any);
    const result = await service.allocatePayment('inv_1', {
      allocatedAmount: 100,
      paymentRef: 'PAY-001'
    });

    expect(result.isPaidOff).toBe(true);
    expect(result.outstandingAmount).toBe(0);
    expect(prisma.client.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: GenericStatus.ARCHIVED,
          paidAmount: 100
        })
      })
    );
  });

  it('blocks PAY transition from invalid invoice state', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    prisma.client.invoice.findFirst.mockResolvedValue({
      id: 'inv_2',
      dueAt: null,
      status: GenericStatus.DRAFT,
      totalAmount: 200,
      paidAmount: 0
    });

    const settingsPolicy = makeSettingsPolicyMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new FinanceService(prisma as any, search as any, settingsPolicy as any, runtimeSettings as any);

    await expect(
      service.payInvoice('inv_2', { note: 'invalid transition test' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates manual invoice in DRAFT status', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    prisma.client.invoice.create.mockResolvedValue({
      id: 'inv_manual_1',
      invoiceNo: 'INV-2026-000001',
      invoiceType: 'SALES',
      partnerName: 'Cong ty ABC',
      orderId: null,
      totalAmount: 1800000,
      paidAmount: 0,
      dueAt: null,
      status: GenericStatus.DRAFT,
      order: null
    });

    const settingsPolicy = makeSettingsPolicyMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new FinanceService(prisma as any, search as any, settingsPolicy as any, runtimeSettings as any);

    const result = await service.createInvoice({
      invoiceType: 'SALES',
      partnerName: 'Cong ty ABC',
      totalAmount: 1800000
    });

    expect(result.status).toBe(GenericStatus.DRAFT);
    expect(prisma.client.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceType: 'SALES',
          partnerName: 'Cong ty ABC',
          totalAmount: 1800000,
          status: GenericStatus.DRAFT
        })
      })
    );
  });

  it('creates invoice from approved order', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    prisma.client.order.findFirst.mockResolvedValue({
      id: 'order_approved_1',
      status: GenericStatus.APPROVED,
      totalAmount: 2500000,
      customerName: 'Khach Approved',
      orderNo: 'SO-2026-000111'
    });
    prisma.client.invoice.findFirst.mockResolvedValueOnce(null);
    prisma.client.invoice.create.mockResolvedValue({
      id: 'inv_from_order_1',
      invoiceNo: 'INV-2026-000111',
      invoiceType: 'SALES',
      partnerName: 'Khach Approved',
      orderId: 'order_approved_1',
      totalAmount: 2500000,
      paidAmount: 0,
      dueAt: null,
      status: GenericStatus.DRAFT,
      order: {
        id: 'order_approved_1',
        orderNo: 'SO-2026-000111'
      }
    });

    const settingsPolicy = makeSettingsPolicyMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new FinanceService(prisma as any, search as any, settingsPolicy as any, runtimeSettings as any);

    const result = await service.createInvoiceFromOrder({
      orderId: 'order_approved_1'
    });

    expect(result.orderNo).toBe('SO-2026-000111');
    expect(prisma.client.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order_approved_1',
          totalAmount: 2500000,
          status: GenericStatus.DRAFT
        })
      })
    );
  });

  it('blocks creating invoice from non-approved order', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    prisma.client.order.findFirst.mockResolvedValue({
      id: 'order_pending_1',
      status: GenericStatus.PENDING,
      totalAmount: 1900000,
      customerName: 'Khach Pending',
      orderNo: 'SO-2026-000112'
    });

    const settingsPolicy = makeSettingsPolicyMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new FinanceService(prisma as any, search as any, settingsPolicy as any, runtimeSettings as any);

    await expect(
      service.createInvoiceFromOrder({ orderId: 'order_pending_1' })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.invoice.create).not.toHaveBeenCalled();
  });

  it('blocks creating second invoice for the same order', async () => {
    const prisma = makePrismaMock();
    const search = makeSearchMock();
    prisma.client.order.findFirst.mockResolvedValue({
      id: 'order_approved_2',
      status: GenericStatus.APPROVED,
      totalAmount: 2800000,
      customerName: 'Khach Duplicate',
      orderNo: 'SO-2026-000113'
    });
    prisma.client.invoice.findFirst.mockResolvedValueOnce({
      id: 'inv_existing_1',
      orderId: 'order_approved_2'
    });

    const settingsPolicy = makeSettingsPolicyMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const service = new FinanceService(prisma as any, search as any, settingsPolicy as any, runtimeSettings as any);

    await expect(
      service.createInvoiceFromOrder({ orderId: 'order_approved_2' })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.client.invoice.create).not.toHaveBeenCalled();
  });
});
