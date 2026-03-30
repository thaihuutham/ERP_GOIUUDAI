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
        findFirst: vi.fn(),
        updateMany: vi.fn()
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

describe('FinanceService', () => {
  it('rejects unbalanced journal lines', async () => {
    const prisma = makePrismaMock();
    const service = new FinanceService(prisma as any);

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
    const service = new FinanceService(prisma as any);

    const result = await service.closePeriod('2026-03', 'qa_admin');

    expect(result.locked).toBe(true);
    expect(result.period).toBe('2026-03');
    expect(prisma.client.setting.create).toHaveBeenCalledTimes(1);
  });

  it('allocates payment and marks invoice as paid off when full amount reached', async () => {
    const prisma = makePrismaMock();
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

    const service = new FinanceService(prisma as any);
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
    prisma.client.invoice.findFirst.mockResolvedValue({
      id: 'inv_2',
      dueAt: null,
      status: GenericStatus.DRAFT,
      totalAmount: 200,
      paidAmount: 0
    });

    const service = new FinanceService(prisma as any);

    await expect(
      service.payInvoice('inv_2', { note: 'invalid transition test' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
