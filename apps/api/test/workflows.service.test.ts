import { GenericStatus, UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_USER_CONTEXT_KEY, IAM_SCOPE_CONTEXT_KEY } from '../src/common/request/request.constants';
import { WorkflowsService } from '../src/modules/workflows/workflows.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn().mockReturnValue('tenant_demo_company'),
    client: {
      workflowDefinition: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      workflowInstance: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      approval: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        createMany: vi.fn(),
        updateMany: vi.fn()
      },
      workflowActionLog: {
        create: vi.fn(),
        findMany: vi.fn()
      },
      user: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      },
      employee: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      },
      order: {
        findFirst: vi.fn(),
        updateMany: vi.fn()
      },
      orderItem: {
        deleteMany: vi.fn(),
        createMany: vi.fn()
      },
      notification: {
        create: vi.fn()
      },
      $transaction: vi.fn(async (handler: (tx: any) => Promise<void>) => {
        await handler({
          orderItem: {
            deleteMany: vi.fn(),
            createMany: vi.fn()
          },
          order: {
            updateMany: vi.fn()
          },
          notification: {
            create: vi.fn()
          }
        });
      })
    }
  };
}

function makeRuntimeSettingsMock() {
  return {
    getApprovalMatrixRuntime: vi.fn().mockResolvedValue({
      rules: [],
      escalation: {
        enabled: true,
        slaHours: 24,
        escalateToRole: 'ADMIN'
      },
      delegation: {
        enabled: true,
        maxDays: 14
      }
    })
  };
}

function makeClsMock(authUser?: Record<string, unknown>, extras: Record<string, unknown> = {}) {
  return {
    get: vi.fn((key?: string) => {
      if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(extras, key)) {
        return extras[key];
      }
      return authUser ?? undefined;
    })
  };
}

function makeSearchMock() {
  return {
    syncOrderUpsert: vi.fn().mockResolvedValue(undefined)
  };
}

function makeIamAccessMock() {
  return {
    canAccessRecord: vi.fn().mockResolvedValue(false),
    grantRecordAccess: vi.fn().mockResolvedValue(null)
  };
}

describe('WorkflowsService', () => {
  it('submits workflow and normalizes ROLE approvers to concrete users', async () => {
    const prisma = makePrismaMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const cls = makeClsMock({ userId: 'requester_1', role: UserRole.MANAGER });
    const search = makeSearchMock();

    prisma.client.workflowDefinition.findFirst.mockResolvedValue({
      id: 'def_1',
      status: GenericStatus.ACTIVE,
      module: 'finance',
      definitionJson: {
        initialStep: 'approval',
        steps: [
          {
            key: 'approval',
            approvalMode: 'ALL',
            approvers: [{ type: 'ROLE', role: 'MANAGER' }],
            transitions: [{ action: 'APPROVE', terminalStatus: 'APPROVED' }]
          }
        ]
      }
    });

    prisma.client.user.findMany.mockResolvedValue([
      { id: 'manager_1' },
      { id: 'manager_2' }
    ]);

    prisma.client.workflowInstance.create.mockResolvedValue({
      id: 'wf_1',
      definitionId: 'def_1',
      targetType: 'ORDER',
      targetId: 'SO-1',
      currentStep: 'approval',
      status: GenericStatus.PENDING,
      contextJson: { amount: 120 },
      startedBy: 'requester_1'
    });

    prisma.client.workflowInstance.findFirst.mockResolvedValue({
      id: 'wf_1',
      definitionId: 'def_1',
      targetType: 'ORDER',
      targetId: 'SO-1',
      currentStep: 'approval',
      status: GenericStatus.PENDING,
      contextJson: { amount: 120 },
      startedBy: 'requester_1',
      definition: { id: 'def_1' },
      approvals: [],
      actionLogs: []
    });

    const service = new WorkflowsService(prisma as any, runtimeSettings as any, cls as any, search as any);
    await service.submitInstance({
      definitionId: 'def_1',
      targetType: 'ORDER',
      targetId: 'SO-1',
      requestedBy: 'requester_1',
      contextJson: { amount: 120 }
    });

    expect(prisma.client.approval.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            approverId: 'manager_1',
            assignmentType: 'ROLE',
            approvalMode: 'ALL',
            requiredApprovals: 2
          }),
          expect.objectContaining({
            approverId: 'manager_2',
            assignmentType: 'ROLE',
            approvalMode: 'ALL',
            requiredApprovals: 2
          })
        ])
      })
    );
  });

  it('blocks self-approval by SoD policy', async () => {
    const prisma = makePrismaMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const cls = makeClsMock({ userId: 'requester_1', role: UserRole.MANAGER });
    const search = makeSearchMock();

    prisma.client.workflowInstance.findFirst.mockImplementation(async (args: any) => {
      if (args?.include) {
        return {
          id: 'wf_2',
          definitionId: 'def_2',
          targetType: 'PO',
          targetId: 'PO-1',
          currentStep: 'manager_approval',
          status: GenericStatus.PENDING,
          contextJson: {},
          startedBy: 'requester_1',
          definition: { id: 'def_2' },
          approvals: [],
          actionLogs: []
        };
      }
      return {
        id: 'wf_2',
        definitionId: 'def_2',
        targetType: 'PO',
        targetId: 'PO-1',
        currentStep: 'manager_approval',
        status: GenericStatus.PENDING,
        contextJson: {},
        startedBy: 'requester_1'
      };
    });

    prisma.client.workflowDefinition.findFirst.mockResolvedValue({
      id: 'def_2',
      status: GenericStatus.ACTIVE,
      module: 'scm',
      definitionJson: {
        initialStep: 'manager_approval',
        steps: [
          {
            key: 'manager_approval',
            approvers: [{ type: 'USER', approverId: 'requester_1' }],
            transitions: [{ action: 'APPROVE', terminalStatus: 'APPROVED' }]
          }
        ]
      }
    });

    prisma.client.approval.findFirst.mockResolvedValue({
      id: 'appr_1',
      instanceId: 'wf_2',
      stepKey: 'manager_approval',
      requesterId: 'requester_1',
      approverId: 'requester_1',
      status: GenericStatus.PENDING,
      decisionNote: null
    });

    const service = new WorkflowsService(prisma as any, runtimeSettings as any, cls as any, search as any);
    await expect(service.approveInstance('wf_2', { note: 'self-approve attempt' })).rejects.toThrow(
      'SoD: người gửi yêu cầu không được tự phê duyệt.'
    );
  });

  it('advances step when MIN_N threshold is met and archives remaining pending approvals', async () => {
    const prisma = makePrismaMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const cls = makeClsMock({ userId: 'manager_1', role: UserRole.MANAGER });
    const search = makeSearchMock();

    prisma.client.workflowDefinition.findFirst.mockResolvedValue({
      id: 'def_3',
      status: GenericStatus.ACTIVE,
      module: 'sales',
      definitionJson: {
        initialStep: 'approval',
        steps: [
          {
            key: 'approval',
            approvalMode: 'MIN_N',
            minApprovers: 2,
            approvers: [{ type: 'ROLE', role: 'MANAGER' }],
            transitions: [{ action: 'APPROVE', toStep: 'final_gate' }]
          },
          {
            key: 'final_gate',
            approvers: [{ type: 'USER', approverId: 'director_1' }],
            transitions: [{ action: 'APPROVE', terminalStatus: 'APPROVED' }]
          }
        ]
      }
    });

    prisma.client.workflowInstance.findFirst.mockImplementation(async (args: any) => {
      if (args?.include) {
        return {
          id: 'wf_3',
          definitionId: 'def_3',
          targetType: 'ORDER_EDIT',
          targetId: 'SO-9',
          currentStep: 'final_gate',
          status: GenericStatus.PENDING,
          contextJson: { items: [] },
          startedBy: 'requester_3',
          definition: { id: 'def_3' },
          approvals: [],
          actionLogs: []
        };
      }
      return {
        id: 'wf_3',
        definitionId: 'def_3',
        targetType: 'ORDER_EDIT',
        targetId: 'SO-9',
        currentStep: 'approval',
        status: GenericStatus.PENDING,
        contextJson: { items: [] },
        startedBy: 'requester_3'
      };
    });

    prisma.client.approval.findFirst.mockResolvedValue({
      id: 'appr_3_1',
      instanceId: 'wf_3',
      stepKey: 'approval',
      requesterId: 'requester_3',
      approverId: 'manager_1',
      status: GenericStatus.PENDING,
      decisionNote: null
    });

    prisma.client.approval.findMany.mockResolvedValue([
      { id: 'appr_3_1', status: GenericStatus.APPROVED },
      { id: 'appr_3_2', status: GenericStatus.APPROVED },
      { id: 'appr_3_3', status: GenericStatus.PENDING }
    ]);

    prisma.client.user.findMany.mockResolvedValue([{ id: 'director_1' }]);
    prisma.client.user.findFirst.mockImplementation(async (args: any) => {
      if (args?.where?.id === 'director_1' && args?.where?.isActive === true) {
        return { id: 'director_1' };
      }
      return null;
    });

    const service = new WorkflowsService(prisma as any, runtimeSettings as any, cls as any, search as any);
    await service.approveInstance('wf_3', { note: 'threshold reached' });

    expect(prisma.client.approval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          instanceId: 'wf_3',
          stepKey: 'approval',
          status: GenericStatus.PENDING
        }),
        data: expect.objectContaining({
          status: GenericStatus.ARCHIVED
        })
      })
    );

    expect(prisma.client.workflowInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStep: 'final_gate'
        })
      })
    );
  });

  it('auto-escalates overdue tasks once (idempotent)', async () => {
    const prisma = makePrismaMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const cls = makeClsMock();
    const search = makeSearchMock();

    const overdueTask = {
      id: 'appr_overdue_1',
      instanceId: 'wf_overdue_1',
      stepKey: 'approval',
      targetType: 'ORDER_EDIT',
      targetId: 'SO-91',
      requesterId: 'requester_9',
      approverId: 'manager_9',
      escalatedAt: null,
      escalatedTo: 'ADMIN',
      status: GenericStatus.PENDING,
      dueAt: new Date(Date.now() - 60 * 1000),
      decisionNote: null
    };

    prisma.client.approval.findMany.mockResolvedValue([overdueTask]);
    prisma.client.approval.findFirst.mockImplementation(async (args: any) => {
      if (args?.where?.id === 'appr_overdue_1') {
        return overdueTask;
      }
      return null;
    });
    prisma.client.workflowInstance.findFirst.mockResolvedValue({
      id: 'wf_overdue_1',
      definitionId: 'def_overdue_1',
      targetType: 'ORDER_EDIT',
      targetId: 'SO-91',
      currentStep: 'approval',
      status: GenericStatus.PENDING,
      contextJson: {},
      startedBy: 'requester_9'
    });
    prisma.client.user.findMany.mockResolvedValue([{ id: 'admin_1' }]);
    prisma.client.approval.updateMany.mockResolvedValue({ count: 1 });

    const service = new WorkflowsService(prisma as any, runtimeSettings as any, cls as any, search as any);
    const run1 = await service.runAutoEscalation(50);
    expect(run1.escalated).toBe(1);
    expect(prisma.client.approval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'appr_overdue_1',
          escalatedAt: null
        }),
        data: expect.objectContaining({
          approverId: 'admin_1',
          escalationCount: { increment: 1 }
        })
      })
    );

    prisma.client.approval.findMany.mockResolvedValue([]);
    const run2 = await service.runAutoEscalation(50);
    expect(run2.escalated).toBe(0);
  });

  it('allows approver to view assigned instance outside normal scope', async () => {
    const prisma = makePrismaMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const cls = makeClsMock(
      { userId: 'staff_1', role: UserRole.STAFF },
      {
        [AUTH_USER_CONTEXT_KEY]: { userId: 'staff_1', role: UserRole.STAFF },
        [IAM_SCOPE_CONTEXT_KEY]: {
          enabled: true,
          mode: 'ENFORCE',
          companyWide: false,
          actorIds: ['staff_1'],
          employeeIds: [],
          orgUnitIds: []
        }
      }
    );
    const search = makeSearchMock();
    const iamAccess = makeIamAccessMock();
    iamAccess.canAccessRecord.mockResolvedValue(true);

    prisma.client.workflowInstance.findFirst.mockResolvedValue({
      id: 'wf_scope_1',
      definitionId: 'def_scope_1',
      targetType: 'ORDER_EDIT',
      targetId: 'SO-999',
      currentStep: 'approval',
      status: GenericStatus.PENDING,
      contextJson: {},
      startedBy: 'requester_outside',
      definition: { id: 'def_scope_1' },
      approvals: [],
      actionLogs: []
    });

    const service = new WorkflowsService(prisma as any, runtimeSettings as any, cls as any, search as any, iamAccess as any);
    const result = await service.getInstanceDetail('wf_scope_1');

    expect(result.id).toBe('wf_scope_1');
    expect(iamAccess.canAccessRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_demo_company',
        userId: 'staff_1'
      }),
      'WORKFLOW_INSTANCE',
      'wf_scope_1',
      'VIEW'
    );
  });

  it('does not allow unrelated records outside scope', async () => {
    const prisma = makePrismaMock();
    const runtimeSettings = makeRuntimeSettingsMock();
    const cls = makeClsMock(
      { userId: 'staff_1', role: UserRole.STAFF },
      {
        [AUTH_USER_CONTEXT_KEY]: { userId: 'staff_1', role: UserRole.STAFF },
        [IAM_SCOPE_CONTEXT_KEY]: {
          enabled: true,
          mode: 'ENFORCE',
          companyWide: false,
          actorIds: ['staff_1'],
          employeeIds: [],
          orgUnitIds: []
        }
      }
    );
    const search = makeSearchMock();
    const iamAccess = makeIamAccessMock();
    iamAccess.canAccessRecord.mockResolvedValue(false);
    prisma.client.approval.findFirst.mockResolvedValue(null);
    prisma.client.workflowInstance.findFirst.mockResolvedValue({
      id: 'wf_scope_2',
      definitionId: 'def_scope_2',
      targetType: 'ORDER_EDIT',
      targetId: 'SO-998',
      currentStep: 'approval',
      status: GenericStatus.PENDING,
      contextJson: {},
      startedBy: 'requester_outside',
      definition: { id: 'def_scope_2' },
      approvals: [],
      actionLogs: []
    });

    const service = new WorkflowsService(prisma as any, runtimeSettings as any, cls as any, search as any, iamAccess as any);

    await expect(service.getInstanceDetail('wf_scope_2')).rejects.toThrow('Bạn không có quyền xem workflow instance này.');
  });
});
