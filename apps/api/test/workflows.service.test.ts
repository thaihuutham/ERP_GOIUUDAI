import { GenericStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
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
      }
    }
  };
}

describe('WorkflowsService', () => {
  it('submits workflow and resolves dynamic approver from VALUE_RULE', async () => {
    const prisma = makePrismaMock();
    prisma.client.workflowDefinition.findFirst.mockResolvedValue({
      id: 'def_1',
      module: 'finance',
      definitionJson: {
        initialStep: 'approval',
        steps: [
          {
            key: 'approval',
            approvers: [
              {
                type: 'VALUE_RULE',
                field: 'amount',
                minValue: 100,
                approverId: 'manager_1'
              }
            ],
            transitions: [{ action: 'APPROVE', terminalStatus: 'APPROVED' }]
          }
        ]
      }
    });

    prisma.client.workflowInstance.create.mockResolvedValue({
      id: 'wf_1',
      definitionId: 'def_1',
      targetType: 'ORDER',
      targetId: 'SO-1',
      currentStep: 'approval',
      status: GenericStatus.PENDING,
      contextJson: { amount: 120 },
      startedBy: 'user_req_1'
    });

    prisma.client.workflowInstance.findFirst.mockResolvedValue({
      id: 'wf_1',
      definitionId: 'def_1',
      targetType: 'ORDER',
      targetId: 'SO-1',
      currentStep: 'approval',
      status: GenericStatus.PENDING,
      contextJson: { amount: 120 },
      startedBy: 'user_req_1',
      definition: { id: 'def_1' },
      approvals: [],
      actionLogs: []
    });

    const service = new WorkflowsService(prisma as any);
    await service.submitInstance({
      definitionId: 'def_1',
      targetType: 'ORDER',
      targetId: 'SO-1',
      requestedBy: 'user_req_1',
      contextJson: { amount: 120 }
    });

    expect(prisma.client.approval.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            approverId: 'manager_1',
            stepKey: 'approval',
            status: GenericStatus.PENDING
          })
        ])
      })
    );
  });

  it('advances to next step when the last approval is approved', async () => {
    const prisma = makePrismaMock();

    prisma.client.workflowDefinition.findFirst.mockResolvedValue({
      id: 'def_2',
      module: 'scm',
      definitionJson: {
        initialStep: 'manager_approval',
        steps: [
          {
            key: 'manager_approval',
            approvers: [{ type: 'USER', approverId: 'manager_1' }],
            transitions: [{ action: 'APPROVE', toStep: 'director_approval' }]
          },
          {
            key: 'director_approval',
            approvers: [{ type: 'USER', approverId: 'director_1' }],
            transitions: [{ action: 'APPROVE', terminalStatus: 'APPROVED' }]
          }
        ]
      }
    });

    prisma.client.workflowInstance.findFirst.mockImplementation(async (args: any) => {
      if (args?.include) {
        return {
          id: 'wf_2',
          definitionId: 'def_2',
          targetType: 'PO',
          targetId: 'PO-1',
          currentStep: 'director_approval',
          status: GenericStatus.PENDING,
          contextJson: { amount: 900 },
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
        contextJson: { amount: 900 },
        startedBy: 'requester_1'
      };
    });

    prisma.client.approval.findFirst.mockResolvedValue({
      id: 'appr_1',
      instanceId: 'wf_2',
      stepKey: 'manager_approval',
      approverId: 'manager_1',
      status: GenericStatus.PENDING,
      decisionNote: null
    });

    prisma.client.approval.findMany.mockResolvedValue([]);

    const service = new WorkflowsService(prisma as any);
    await service.approveInstance('wf_2', { actorId: 'manager_1', note: 'approved' });

    expect(prisma.client.workflowInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStep: 'director_approval',
          status: GenericStatus.PENDING
        })
      })
    );

    expect(prisma.client.approval.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            stepKey: 'director_approval',
            approverId: 'director_1'
          })
        ])
      })
    );
  });

  it('cancels workflow instance and archives it', async () => {
    const prisma = makePrismaMock();

    prisma.client.workflowInstance.findFirst.mockImplementation(async (args: any) => {
      if (args?.include) {
        return {
          id: 'wf_3',
          definitionId: 'def_3',
          targetType: 'INVOICE',
          targetId: 'INV-1',
          currentStep: 'approval',
          status: GenericStatus.ARCHIVED,
          contextJson: {},
          startedBy: 'requester_2',
          definition: { id: 'def_3' },
          approvals: [],
          actionLogs: []
        };
      }

      return {
        id: 'wf_3',
        definitionId: 'def_3',
        targetType: 'INVOICE',
        targetId: 'INV-1',
        currentStep: 'approval',
        status: GenericStatus.PENDING,
        contextJson: {},
        startedBy: 'requester_2'
      };
    });

    const service = new WorkflowsService(prisma as any);
    await service.cancelInstance('wf_3', {
      actorId: 'manager_2',
      note: 'cancelled by manager'
    });

    expect(prisma.client.workflowInstance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: GenericStatus.ARCHIVED
        })
      })
    );

    expect(prisma.client.workflowActionLog.create).toHaveBeenCalled();
  });
});
