import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  GenericStatus,
  HrAppendixCode,
  HrAppendixRevisionStatus,
  HrAppendixSubmissionStatus,
  HrDailyScoreStatus,
  HrPipCaseStatus
} from '@prisma/client';
import { HrRegulationService } from '../src/modules/hr/hr-regulation.service';

function createPrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      hrAppendixTemplate: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn()
      },
      hrAppendixSubmission: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      hrAppendixEvidence: {
        deleteMany: vi.fn(),
        createMany: vi.fn()
      },
      hrAppendixRevision: {
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      hrScoreRoleTemplate: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      hrDailyScoreSnapshot: {
        findMany: vi.fn(),
        upsert: vi.fn()
      },
      hrPipCase: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      employee: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      },
      user: {
        findFirst: vi.fn()
      },
      approval: {
        create: vi.fn(),
        updateMany: vi.fn()
      }
    }
  };
}

describe('HrRegulationService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('computes default dueAt by appendix rule for PL01 at end of workday ICT', async () => {
    const prisma = createPrismaMock();
    const service = new HrRegulationService(prisma as any);

    const workDate = '2026-04-03';
    let createdSubmission: Record<string, unknown> | null = null;

    prisma.client.employee.findFirst.mockResolvedValue({
      id: 'emp_1',
      department: 'Sales',
      position: 'Sales Rep',
      managerId: 'emp_mgr'
    });
    prisma.client.hrAppendixSubmission.create.mockImplementation(async ({ data }: any) => {
      createdSubmission = {
        id: 'sub_1',
        ...data
      };
      return createdSubmission;
    });
    prisma.client.hrAppendixSubmission.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.id === 'sub_1') {
        return {
          ...(createdSubmission ?? {}),
          id: 'sub_1',
          template: null,
          evidences: [],
          revisions: []
        };
      }
      return null;
    });

    const result = await service.createAppendixSubmission({
      appendixCode: HrAppendixCode.PL01,
      employeeId: 'emp_1',
      workDate,
      payloadJson: { summary: 'daily log', result: 'done', taskCount: 3 }
    });

    const createdDueAt = createdSubmission?.dueAt as Date;
    expect(createdDueAt).toBeInstanceOf(Date);
    expect(createdDueAt.toISOString()).toBe('2026-04-03T16:59:59.999Z');
    expect(result?.status).toBe(HrAppendixSubmissionStatus.DRAFT);
  });

  it('accepts appendix payload alias "payload" without breaking legacy payloadJson', async () => {
    const prisma = createPrismaMock();
    const service = new HrRegulationService(prisma as any);

    prisma.client.employee.findFirst.mockResolvedValue({
      id: 'emp_1',
      department: 'Sales',
      position: 'Sales Rep',
      managerId: 'emp_mgr',
      status: GenericStatus.ACTIVE
    });
    prisma.client.hrAppendixSubmission.create.mockResolvedValue({
      id: 'sub_alias_1',
      status: HrAppendixSubmissionStatus.DRAFT
    });
    prisma.client.hrAppendixSubmission.findFirst.mockResolvedValue({
      id: 'sub_alias_1',
      appendixCode: HrAppendixCode.PL01,
      employeeId: 'emp_1',
      status: HrAppendixSubmissionStatus.DRAFT,
      template: null,
      evidences: [],
      revisions: []
    } as any);

    await service.createAppendixSubmission({
      appendixCode: HrAppendixCode.PL01,
      employeeId: 'emp_1',
      payload: {
        summary: 'daily log',
        result: 'done',
        taskCount: 5
      }
    });

    expect(prisma.client.hrAppendixSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payloadJson: expect.objectContaining({
            summary: 'daily log',
            taskCount: 5
          })
        })
      })
    );
  });

  it('falls back to HCNS manager as approver when employee has no manager', async () => {
    const prisma = createPrismaMock();
    const service = new HrRegulationService(prisma as any);

    const submission = {
      id: 'sub_pl04',
      tenant_Id: 'GOIUUDAI',
      appendixCode: HrAppendixCode.PL04,
      templateId: null,
      employeeId: 'emp_1',
      workDate: null,
      period: null,
      payloadJson: { note: 'request' },
      status: HrAppendixSubmissionStatus.DRAFT,
      dueAt: null,
      submittedAt: null,
      decidedAt: null,
      approverId: null,
      decisionNote: null,
      workflowDefinitionId: null,
      workflowInstanceId: null,
      createdBy: 'emp_1',
      updatedBy: 'emp_1',
      createdAt: new Date('2026-04-03T08:00:00+07:00'),
      updatedAt: new Date('2026-04-03T08:00:00+07:00'),
      template: null,
      evidences: [],
      revisions: []
    };

    prisma.client.hrAppendixSubmission.findFirst.mockResolvedValue(submission);
    prisma.client.employee.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.id === 'emp_1') {
        return {
          id: 'emp_1',
          department: 'Sales',
          position: 'Sales Rep',
          managerId: null,
          status: GenericStatus.ACTIVE
        };
      }
      return {
        id: 'emp_hcns_mgr',
        department: 'HCNS',
        position: 'HR Manager',
        managerId: null,
        status: GenericStatus.ACTIVE
      };
    });
    prisma.client.user.findFirst.mockResolvedValue({ id: 'user_hcns_mgr' });
    prisma.client.approval.create.mockResolvedValue({ id: 'appr_1' });

    await service.submitAppendixSubmission('sub_pl04', {
      actorId: 'emp_1'
    });

    expect(prisma.client.hrAppendixSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub_pl04' },
        data: expect.objectContaining({
          status: HrAppendixSubmissionStatus.SUBMITTED,
          approverId: 'user_hcns_mgr'
        })
      })
    );
    expect(prisma.client.approval.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: 'HR_APPENDIX_SUBMISSION',
          targetId: 'sub_pl04',
          approverId: 'user_hcns_mgr'
        })
      })
    );
  });

  it('applies T+1 revision payload only after manager approval', async () => {
    const prisma = createPrismaMock();
    const service = new HrRegulationService(prisma as any);
    vi.setSystemTime(new Date('2026-04-03T10:00:00+07:00'));

    const submission = {
      id: 'sub_1',
      tenant_Id: 'GOIUUDAI',
      appendixCode: HrAppendixCode.PL02,
      templateId: null,
      employeeId: 'emp_1',
      workDate: new Date('2026-04-03T00:00:00+07:00'),
      period: null,
      payloadJson: { before: true },
      status: HrAppendixSubmissionStatus.APPROVED,
      dueAt: new Date('2026-04-03T23:59:59.999+07:00'),
      submittedAt: new Date('2026-04-03T16:00:00+07:00'),
      decidedAt: new Date('2026-04-03T17:00:00+07:00'),
      approverId: 'user_mgr',
      decisionNote: null,
      workflowDefinitionId: null,
      workflowInstanceId: null,
      createdBy: 'emp_1',
      updatedBy: 'emp_1',
      createdAt: new Date('2026-04-03T08:00:00+07:00'),
      updatedAt: new Date('2026-04-03T08:00:00+07:00'),
      template: null,
      evidences: [],
      revisions: []
    };

    const revision = {
      id: 'rev_1',
      tenant_Id: 'GOIUUDAI',
      submissionId: 'sub_1',
      requestedBy: 'emp_1',
      payloadJson: { after: true },
      reason: 'fix T+1',
      status: HrAppendixRevisionStatus.PENDING_APPROVAL,
      approverId: 'user_mgr',
      decisionNote: null,
      approvedAt: null,
      rejectedAt: null,
      appliedAt: null,
      createdAt: new Date('2026-04-03T10:00:00+07:00'),
      updatedAt: new Date('2026-04-03T10:00:00+07:00')
    };

    prisma.client.employee.findFirst.mockImplementation(async ({ where }: any) => {
      const id = where?.id;
      if (id === 'emp_1') {
        return {
          id: 'emp_1',
          department: 'Sales',
          position: 'Sales Rep',
          managerId: 'emp_mgr',
          status: GenericStatus.ACTIVE
        };
      }
      if (id === 'emp_mgr') {
        return {
          id: 'emp_mgr',
          department: 'Sales',
          position: 'Manager',
          managerId: null,
          status: GenericStatus.ACTIVE
        };
      }
      return null;
    });
    prisma.client.user.findFirst.mockResolvedValue({ id: 'user_mgr' });
    prisma.client.hrAppendixSubmission.findFirst.mockResolvedValue(submission);
    prisma.client.hrAppendixRevision.create.mockResolvedValue(revision);
    prisma.client.hrAppendixRevision.findFirst.mockResolvedValue(revision);
    prisma.client.approval.create.mockResolvedValue({ id: 'appr_1' });
    prisma.client.hrAppendixSubmission.findMany.mockResolvedValue([
      {
        ...submission,
        payloadJson: { after: true }
      }
    ]);
    prisma.client.hrScoreRoleTemplate.findFirst.mockResolvedValue(null);
    prisma.client.hrDailyScoreSnapshot.upsert.mockImplementation(async ({ create, update }: any) => ({
      ...create,
      ...update
    }));

    await service.createAppendixRevision('sub_1', {
      actorId: 'emp_1',
      payloadJson: { after: true },
      reason: 'fix T+1'
    });

    expect(prisma.client.hrAppendixSubmission.updateMany).not.toHaveBeenCalled();

    await service.approveAppendixRevision('rev_1', {
      approverId: 'user_mgr',
      note: 'ok'
    });

    expect(prisma.client.hrAppendixSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub_1' },
        data: expect.objectContaining({
          payloadJson: { after: true },
          status: HrAppendixSubmissionStatus.APPROVED
        })
      })
    );
  });

  it('recomputes score with role template weights and keeps status PROVISIONAL before freeze', async () => {
    const prisma = createPrismaMock();
    const service = new HrRegulationService(prisma as any);
    vi.setSystemTime(new Date('2026-04-03T12:00:00+07:00'));

    prisma.client.employee.findFirst.mockResolvedValue({
      id: 'emp_sales_1',
      department: 'Sales',
      position: 'Sales Exec',
      managerId: 'emp_mgr',
      status: GenericStatus.ACTIVE
    });
    prisma.client.hrAppendixSubmission.findMany.mockResolvedValue([
      {
        id: 'sub_pl01',
        appendixCode: HrAppendixCode.PL01,
        employeeId: 'emp_sales_1',
        workDate: new Date('2026-04-03T00:00:00+07:00'),
        status: HrAppendixSubmissionStatus.APPROVED,
        dueAt: new Date('2026-04-03T23:59:59.999+07:00'),
        submittedAt: new Date('2026-04-03T18:00:00+07:00'),
        createdAt: new Date('2026-04-03T09:00:00+07:00'),
        updatedAt: new Date('2026-04-03T09:00:00+07:00')
      },
      {
        id: 'sub_pl02',
        appendixCode: HrAppendixCode.PL02,
        employeeId: 'emp_sales_1',
        workDate: new Date('2026-04-03T00:00:00+07:00'),
        status: HrAppendixSubmissionStatus.SUBMITTED,
        dueAt: new Date('2026-04-03T23:59:59.999+07:00'),
        submittedAt: new Date('2026-04-03T22:00:00+07:00'),
        createdAt: new Date('2026-04-03T10:00:00+07:00'),
        updatedAt: new Date('2026-04-03T10:00:00+07:00')
      }
    ]);
    prisma.client.hrScoreRoleTemplate.findFirst.mockResolvedValue(null);
    prisma.client.hrDailyScoreSnapshot.upsert.mockImplementation(async ({ create, update }: any) => ({
      ...create,
      ...update
    }));

    const result = await service.recomputeDailyScores({
      employeeId: 'emp_sales_1',
      workDate: '2026-04-03'
    });

    expect(result.processed).toBe(1);
    const upsertCall = prisma.client.hrDailyScoreSnapshot.upsert.mock.calls[0]?.[0];
    expect(upsertCall).toBeTruthy();
    expect(upsertCall.update.totalScore).toBeCloseTo(99, 2);
    expect(upsertCall.update.status).toBe(HrDailyScoreStatus.PROVISIONAL);
  });

  it('auto-drafts PIP when KPI is below threshold for 2 consecutive months', async () => {
    const prisma = createPrismaMock();
    const service = new HrRegulationService(prisma as any);
    vi.setSystemTime(new Date('2026-04-03T12:00:00+07:00'));

    prisma.client.employee.findMany.mockResolvedValue([
      {
        id: 'emp_sales_1',
        department: 'Sales',
        position: 'Sales Exec',
        managerId: null,
        status: GenericStatus.ACTIVE
      }
    ]);
    prisma.client.employee.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.id === 'emp_sales_1') {
        return {
          id: 'emp_sales_1',
          department: 'Sales',
          position: 'Sales Exec',
          managerId: null,
          status: GenericStatus.ACTIVE
        };
      }
      return {
        id: 'emp_hcns_mgr',
        department: 'HCNS',
        position: 'HR Manager',
        managerId: null,
        status: GenericStatus.ACTIVE
      };
    });
    prisma.client.user.findFirst.mockResolvedValue({ id: 'user_hcns_mgr' });
    prisma.client.hrDailyScoreSnapshot.findMany.mockResolvedValue([
      {
        employeeId: 'emp_sales_1',
        workDate: new Date('2026-03-10T00:00:00+07:00'),
        totalScore: 70
      },
      {
        employeeId: 'emp_sales_1',
        workDate: new Date('2026-02-10T00:00:00+07:00'),
        totalScore: 73
      }
    ]);
    prisma.client.hrAppendixSubmission.findMany.mockResolvedValue([]);
    prisma.client.hrPipCase.findMany.mockResolvedValue([]);
    prisma.client.hrAppendixSubmission.create.mockResolvedValue({
      id: 'pl10_sub_1'
    });
    prisma.client.hrPipCase.create.mockResolvedValue({
      id: 'pip_1',
      status: HrPipCaseStatus.DRAFT
    });
    prisma.client.hrScoreRoleTemplate.findFirst.mockResolvedValue(null);

    const result = await service.runAutoDraftPip({
      triggeredBy: 'test-runner'
    });

    expect(result.createdCount).toBe(1);
    expect(prisma.client.hrAppendixSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          appendixCode: HrAppendixCode.PL10,
          employeeId: 'emp_sales_1',
          status: HrAppendixSubmissionStatus.DRAFT
        })
      })
    );
    expect(prisma.client.hrPipCase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: 'emp_sales_1',
          status: HrPipCaseStatus.DRAFT
        })
      })
    );
  });

  it('accepts PIP aliases goals/baseline while keeping compatibility', async () => {
    const prisma = createPrismaMock();
    const service = new HrRegulationService(prisma as any);

    prisma.client.employee.findFirst.mockResolvedValue({
      id: 'emp_1',
      department: 'Sales',
      position: 'Sales Rep',
      managerId: 'emp_mgr',
      status: GenericStatus.ACTIVE
    });
    prisma.client.hrPipCase.create.mockResolvedValue({
      id: 'pip_alias_1',
      status: HrPipCaseStatus.DRAFT
    });

    await service.createPipCase({
      employeeId: 'emp_1',
      triggerReason: 'manual',
      goals: {
        targetMonthlyScore: 80,
        recoveryWindowDays: 45
      },
      baseline: {
        roleGroup: 'SALES',
        missingLogCount30d: 3
      }
    });

    expect(prisma.client.hrPipCase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          goalsJson: expect.objectContaining({
            targetMonthlyScore: 80,
            recoveryWindowDays: 45
          }),
          baselineJson: expect.objectContaining({
            roleGroup: 'SALES',
            missingLogCount30d: 3
          })
        })
      })
    );
  });

  it('forces employeeId to current staff when auth is enabled', async () => {
    const prisma = createPrismaMock();
    const config = { get: vi.fn().mockImplementation((key: string, fallback: string) => (key === 'AUTH_ENABLED' ? 'true' : fallback)) };
    const cls = {
      get: vi.fn().mockReturnValue({
        role: 'USER',
        employeeId: 'emp_self',
        userId: 'user_staff'
      })
    };
    const service = new HrRegulationService(prisma as any, config as any, cls as any);

    prisma.client.employee.findFirst.mockResolvedValue({
      id: 'emp_self',
      department: 'Sales',
      position: 'Sales Rep',
      managerId: 'emp_mgr',
      status: GenericStatus.ACTIVE
    });
    prisma.client.hrAppendixSubmission.create.mockResolvedValue({ id: 'sub_auth_1' });
    prisma.client.hrAppendixSubmission.findFirst.mockResolvedValue({
      id: 'sub_auth_1',
      appendixCode: HrAppendixCode.PL01,
      employeeId: 'emp_self',
      status: HrAppendixSubmissionStatus.DRAFT,
      template: null,
      evidences: [],
      revisions: []
    } as any);

    await service.createAppendixSubmission({
      appendixCode: HrAppendixCode.PL01,
      employeeId: 'emp_other',
      payloadJson: { summary: 'locked by auth context', result: 'done' }
    });

    expect(prisma.client.hrAppendixSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: 'emp_self'
        })
      })
    );
  });

  it('allows admin to override employeeId when auth is enabled', async () => {
    const prisma = createPrismaMock();
    const config = { get: vi.fn().mockImplementation((key: string, fallback: string) => (key === 'AUTH_ENABLED' ? 'true' : fallback)) };
    const cls = {
      get: vi.fn().mockReturnValue({
        role: 'ADMIN',
        employeeId: 'emp_admin',
        userId: 'user_admin'
      })
    };
    const service = new HrRegulationService(prisma as any, config as any, cls as any);

    prisma.client.employee.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.id === 'emp_override') {
        return {
          id: 'emp_override',
          department: 'Sales',
          position: 'Sales Rep',
          managerId: null,
          status: GenericStatus.ACTIVE
        };
      }
      return null;
    });
    prisma.client.hrAppendixSubmission.create.mockResolvedValue({ id: 'sub_auth_admin_1' });
    prisma.client.hrAppendixSubmission.findFirst.mockResolvedValue({
      id: 'sub_auth_admin_1',
      appendixCode: HrAppendixCode.PL02,
      employeeId: 'emp_override',
      status: HrAppendixSubmissionStatus.DRAFT,
      template: null,
      evidences: [],
      revisions: []
    } as any);

    await service.createAppendixSubmission({
      appendixCode: HrAppendixCode.PL02,
      employeeId: 'emp_override',
      payloadJson: { summary: 'admin override', result: 'done' }
    });

    expect(prisma.client.hrAppendixSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: 'emp_override'
        })
      })
    );
  });

  it('applies self scope filter to submission listing for staff users', async () => {
    const prisma = createPrismaMock();
    const config = { get: vi.fn().mockImplementation((key: string, fallback: string) => (key === 'AUTH_ENABLED' ? 'true' : fallback)) };
    const cls = {
      get: vi.fn().mockReturnValue({
        role: 'USER',
        employeeId: 'emp_self',
        userId: 'user_staff'
      })
    };
    const service = new HrRegulationService(prisma as any, config as any, cls as any);

    prisma.client.hrAppendixSubmission.findMany.mockResolvedValue([]);

    const payload = await service.listAppendixSubmissions({ limit: 20 } as any, {});

    expect(payload.viewerScope).toBe('self');
    expect(prisma.client.hrAppendixSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: { in: ['emp_self'] }
        })
      })
    );
  });

  it('returns metadata with appendix catalog and access flags', async () => {
    const prisma = createPrismaMock();
    const config = { get: vi.fn().mockImplementation((key: string, fallback: string) => (key === 'AUTH_ENABLED' ? 'true' : fallback)) };
    const cls = {
      get: vi.fn().mockReturnValue({
        role: 'USER',
        employeeId: 'emp_self',
        userId: 'user_staff'
      })
    };
    const runtimeSettings = {
      getHrPolicyRuntime: vi.fn().mockResolvedValue({
        appendixCatalog: [
          {
            code: 'PL01',
            name: 'Phụ lục nhật ký',
            description: 'Mô tả test',
            fields: ['summary', 'result']
          }
        ]
      })
    };
    const service = new HrRegulationService(prisma as any, config as any, cls as any, runtimeSettings as any);

    const metadata = await service.getRegulationMetadata();
    expect(metadata.viewerScope).toBe('self');
    expect(metadata.canOverrideEmployeeId).toBe(false);
    expect(metadata.requesterEmployeeId).toBe('emp_self');
    expect(metadata.appendices[0]).toMatchObject({
      code: 'PL01',
      name: 'Phụ lục nhật ký'
    });
  });
});
