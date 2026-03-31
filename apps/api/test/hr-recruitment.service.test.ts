import { BadRequestException } from '@nestjs/common';
import { RecruitmentApplicationStatus, RecruitmentStage } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { HrService } from '../src/modules/hr/hr.service';

function makeService(prismaOverrides: Record<string, any> = {}) {
  const prisma = {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      recruitmentOffer: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        updateMany: vi.fn()
      },
      workflowInstance: {
        findMany: vi.fn().mockResolvedValue([])
      },
      recruitmentApplication: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn()
      },
      recruitmentStageHistory: {
        create: vi.fn()
      },
      employee: {
        create: vi.fn()
      }
    }
  } as any;

  Object.assign(prisma.client, prismaOverrides);

  const runtimeSettings = {
    getHrPolicyRuntime: vi.fn(),
    getApprovalMatrixRuntime: vi.fn()
  } as any;

  return {
    prisma,
    service: new HrService(prisma, runtimeSettings)
  };
}

describe('HrService recruitment pipeline rules', () => {
  it('blocks invalid stage jumps in recruitment pipeline', async () => {
    const { service } = makeService({
      recruitmentApplication: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'app_1',
          currentStage: RecruitmentStage.APPLIED,
          status: RecruitmentApplicationStatus.ACTIVE
        }),
        updateMany: vi.fn()
      }
    });

    await expect(
      service.updateRecruitmentApplicationStage('app_1', { toStage: RecruitmentStage.INTERVIEW })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('computes recruitment metrics from current stage distribution', async () => {
    const now = new Date('2026-03-31T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const { service } = makeService({
      recruitmentApplication: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'app_1',
            currentStage: RecruitmentStage.APPLIED,
            status: RecruitmentApplicationStatus.ACTIVE,
            appliedAt: new Date('2026-03-01T00:00:00.000Z'),
            stageEnteredAt: new Date('2026-03-28T00:00:00.000Z')
          },
          {
            id: 'app_2',
            currentStage: RecruitmentStage.INTERVIEW,
            status: RecruitmentApplicationStatus.ACTIVE,
            appliedAt: new Date('2026-03-02T00:00:00.000Z'),
            stageEnteredAt: new Date('2026-03-20T00:00:00.000Z')
          },
          {
            id: 'app_3',
            currentStage: RecruitmentStage.HIRED,
            status: RecruitmentApplicationStatus.HIRED,
            appliedAt: new Date('2026-03-03T00:00:00.000Z'),
            stageEnteredAt: new Date('2026-03-10T00:00:00.000Z')
          }
        ])
      }
    });

    const metrics = await service.getRecruitmentMetrics({});
    expect(metrics.totals.applications).toBe(3);
    expect(metrics.countsByStage.APPLIED).toBe(1);
    expect(metrics.countsByStage.INTERVIEW).toBe(1);
    expect(metrics.countsByStage.HIRED).toBe(1);
    expect(metrics.conversionRates.hiredRate).toBeCloseTo(1 / 3, 4);

    vi.useRealTimers();
  });

  it('requires approved + accepted offer before conversion to employee', async () => {
    const { service, prisma } = makeService({
      recruitmentApplication: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'app_1',
          currentStage: RecruitmentStage.OFFER,
          status: RecruitmentApplicationStatus.ACTIVE,
          convertedEmployeeId: null,
          candidate: {
            fullName: 'Candidate A',
            email: 'a@example.com',
            phone: '0909'
          },
          requisition: {
            title: 'Sales Executive',
            department: 'Sales',
            positionId: null
          },
          offers: [
            {
              id: 'offer_1',
              status: 'APPROVED',
              approvedAt: new Date(),
              proposedStartDate: null,
              offeredPosition: 'Sales Executive',
              offeredSalary: null
            }
          ]
        })
      }
    });

    await expect(
      service.convertRecruitmentApplicationToEmployee('app_1', {})
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.client.employee.create).not.toHaveBeenCalled();
  });
});
