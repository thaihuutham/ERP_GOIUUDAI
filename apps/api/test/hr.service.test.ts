import { BadRequestException } from '@nestjs/common';
import { GenericStatus, HrGoalTrackingMode, Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { HrService } from '../src/modules/hr/hr.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: 'emp_1', fullName: 'Test Employee' }),
        updateMany: vi.fn()
      },
      personalIncomeTaxProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'pit_profile_1',
          employeeId: 'emp_1',
          personalDeduction: new Prisma.Decimal(11_000_000),
          dependentCount: 1,
          dependentDeduction: new Prisma.Decimal(4_400_000),
          insuranceDeduction: new Prisma.Decimal(1_200_000),
          otherDeduction: new Prisma.Decimal(300_000),
          taxRate: new Prisma.Decimal(0.1)
        })
      },
      personalIncomeTaxRecord: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'pit_record_1', ...data }))
      },
      payrollLineItem: {
        findMany: vi.fn().mockResolvedValue([
          { amount: new Prisma.Decimal(14_000_000) },
          { amount: new Prisma.Decimal(9_000_000) }
        ])
      },
      hrGoal: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'goal_1',
          employeeId: 'emp_1',
          targetValue: new Prisma.Decimal(100),
          currentValue: new Prisma.Decimal(60),
          autoCurrentValue: new Prisma.Decimal(60),
          manualAdjustmentValue: new Prisma.Decimal(0),
          trackingMode: HrGoalTrackingMode.HYBRID,
          progressPercent: 20,
          status: GenericStatus.ACTIVE
        }),
        updateMany: vi.fn()
      },
      hrGoalTimeline: {
        create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'timeline_1', ...data }))
      }
    }
  };
}

describe('HrService (new HR v1 domains)', () => {
  it('calculates PIT formula v1 from taxable payroll lines and profile deduction', async () => {
    const prisma = makePrismaMock();
    const service = new HrService(prisma as any);

    await service.createPersonalIncomeTaxRecord({
      employeeId: 'emp_1',
      payrollId: 'payroll_1',
      taxMonth: 3,
      taxYear: 2026
    });

    expect(prisma.client.payrollLineItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: 'emp_1'
        })
      })
    );

    expect(prisma.client.personalIncomeTaxRecord.create).toHaveBeenCalledTimes(1);
    const payload = prisma.client.personalIncomeTaxRecord.create.mock.calls[0][0].data;

    expect(Number(payload.grossTaxable)).toBe(23_000_000);
    expect(Number(payload.deduction)).toBe(16_900_000);
    expect(Number(payload.taxableIncome)).toBe(6_100_000);
    expect(Number(payload.taxRate)).toBeCloseTo(0.1, 4);
    expect(Number(payload.taxAmount)).toBe(610_000);
  });

  it('updates goal progress and auto-completes when reaching 100%', async () => {
    const prisma = makePrismaMock();
    const service = new HrService(prisma as any);

    await service.updateGoalProgress('goal_1', {
      currentValue: 100,
      note: 'manual update'
    });

    expect(prisma.client.hrGoal.updateMany).toHaveBeenCalledTimes(1);
    const updateData = prisma.client.hrGoal.updateMany.mock.calls[0][0].data;

    expect(Number(updateData.currentValue)).toBe(100);
    expect(Number(updateData.manualAdjustmentValue)).toBe(40);
    expect(updateData.progressPercent).toBe(100);
    expect(updateData.status).toBe(GenericStatus.APPROVED);
    expect(updateData.completedAt).toBeInstanceOf(Date);

    expect(prisma.client.hrGoalTimeline.create).toHaveBeenCalledTimes(1);
    expect(prisma.client.hrGoalTimeline.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          goalId: 'goal_1',
          eventType: 'PROGRESS_UPDATED'
        })
      })
    );
  });

  it('validates employee-info update payload and rejects invalid date fields', async () => {
    const prisma = makePrismaMock();
    const service = new HrService(prisma as any);

    await expect(
      service.updateEmployeeInfo('emp_1', {
        dateOfBirth: 'not-a-valid-date'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
