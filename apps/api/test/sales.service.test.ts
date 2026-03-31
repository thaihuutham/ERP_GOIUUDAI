import { BadRequestException } from '@nestjs/common';
import { GenericStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { SalesService } from '../src/modules/sales/sales.service';

function makePrismaMock() {
  const txOrderUpdateMany = vi.fn();
  const txOrderItemDeleteMany = vi.fn();
  const txOrderItemCreateMany = vi.fn();
  const txApprovalUpdateMany = vi.fn();
  const txNotificationCreate = vi.fn();

  return {
    tx: {
      orderUpdateMany: txOrderUpdateMany,
      orderItemDeleteMany: txOrderItemDeleteMany,
      orderItemCreateMany: txOrderItemCreateMany,
      approvalUpdateMany: txApprovalUpdateMany,
      notificationCreate: txNotificationCreate
    },
    getTenantId: vi.fn().mockReturnValue('tenant_demo_company'),
    client: {
      order: {
        findFirst: vi.fn(),
        updateMany: vi.fn()
      },
      orderItem: {
        deleteMany: vi.fn(),
        createMany: vi.fn()
      },
      approval: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn()
      },
      notification: {
        create: vi.fn()
      },
      $transaction: vi.fn(async (fn: (tx: any) => Promise<void>) => fn({
        order: {
          updateMany: txOrderUpdateMany
        },
        orderItem: {
          deleteMany: txOrderItemDeleteMany,
          createMany: txOrderItemCreateMany
        },
        approval: {
          updateMany: txApprovalUpdateMany
        },
        notification: {
          create: txNotificationCreate
        }
      }))
    }
  };
}

function makeSearchMock() {
  return {
    shouldUseHybridSearch: vi.fn().mockResolvedValue(false),
    searchOrderIds: vi.fn(),
    syncOrderUpsert: vi.fn().mockResolvedValue(undefined)
  };
}

function makeSettingsPolicyMock() {
  return {
    getOrderSettingsPolicy: vi.fn().mockResolvedValue({
      allowIncreaseWithoutApproval: true,
      requireApprovalForDecrease: true,
      approverId: ''
    })
  };
}

function makeRuntimeSettingsMock() {
  return {
    getSalesCrmPolicyRuntime: vi.fn().mockResolvedValue({
      orderSettings: {
        allowIncreaseWithoutApproval: true,
        requireApprovalForDecrease: true,
        approverId: ''
      },
      discountPolicy: {
        maxDiscountPercent: 15,
        requireApprovalAbovePercent: 10
      },
      creditPolicy: {
        allowNegativeBalance: true,
        maxCreditLimit: 0
      }
    }),
    getApprovalMatrixRuntime: vi.fn().mockResolvedValue({
      rules: [],
      escalation: {
        enabled: false,
        slaHours: 24,
        escalateToRole: 'ADMIN'
      },
      delegation: {
        maxDays: 14
      }
    })
  };
}

describe('SalesService', () => {
  it('approves pending order via /sales/orders/:id/approve flow', async () => {
    const prisma = makePrismaMock();
    const initialOrder = {
      id: 'order_1',
      orderNo: 'SO-2026-000001',
      status: GenericStatus.PENDING,
      createdBy: 'manager_1',
      items: [],
      invoices: []
    };
    const approvedOrder = {
      ...initialOrder,
      status: GenericStatus.APPROVED
    };

    prisma.client.order.findFirst
      .mockResolvedValueOnce(initialOrder)
      .mockResolvedValueOnce(approvedOrder);

    const search = makeSearchMock();
    const service = new SalesService(
      prisma as any,
      search as any,
      makeSettingsPolicyMock() as any,
      makeRuntimeSettingsMock() as any
    );

    const result = await service.approveOrder('order_1', { note: 'OK duyệt' });

    expect(result.transition.to).toBe(GenericStatus.APPROVED);
    expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
    expect(search.syncOrderUpsert).toHaveBeenCalledWith(approvedOrder);
  });

  it('rejects pending order via /sales/orders/:id/reject flow', async () => {
    const prisma = makePrismaMock();
    const initialOrder = {
      id: 'order_2',
      orderNo: 'SO-2026-000002',
      status: GenericStatus.PENDING,
      createdBy: 'manager_1',
      items: [],
      invoices: []
    };
    const rejectedOrder = {
      ...initialOrder,
      status: GenericStatus.REJECTED
    };

    prisma.client.order.findFirst
      .mockResolvedValueOnce(initialOrder)
      .mockResolvedValueOnce(rejectedOrder);

    const search = makeSearchMock();
    const service = new SalesService(
      prisma as any,
      search as any,
      makeSettingsPolicyMock() as any,
      makeRuntimeSettingsMock() as any
    );

    const result = await service.rejectOrder('order_2', { note: 'Sai thông tin' });

    expect(result.transition.to).toBe(GenericStatus.REJECTED);
    expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
    expect(search.syncOrderUpsert).toHaveBeenCalledWith(rejectedOrder);
  });

  it('blocks order approve/reject when order is not PENDING', async () => {
    const prisma = makePrismaMock();
    prisma.client.order.findFirst.mockResolvedValue({
      id: 'order_3',
      status: GenericStatus.APPROVED,
      createdBy: null,
      items: [],
      invoices: []
    });

    const service = new SalesService(
      prisma as any,
      makeSearchMock() as any,
      makeSettingsPolicyMock() as any,
      makeRuntimeSettingsMock() as any
    );

    await expect(service.approveOrder('order_3', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates order lifecycle to APPROVED when ORDER_EDIT approval is accepted', async () => {
    const prisma = makePrismaMock();
    prisma.client.approval.findFirst.mockResolvedValue({
      id: 'approval_accepted_1',
      targetId: 'order_accepted_1',
      status: GenericStatus.PENDING,
      requesterId: 'requester_1',
      contextJson: {
        totalAmount: 3200000,
        employeeId: 'emp_1'
      }
    });
    prisma.client.order.findFirst.mockResolvedValue({
      id: 'order_accepted_1',
      status: GenericStatus.APPROVED,
      createdBy: 'requester_1',
      items: [],
      invoices: []
    });

    const service = new SalesService(
      prisma as any,
      makeSearchMock() as any,
      makeSettingsPolicyMock() as any,
      makeRuntimeSettingsMock() as any
    );

    const result = await service.approve('approval_accepted_1');

    expect(result.status).toBe(GenericStatus.APPROVED);
    expect(prisma.tx.orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order_accepted_1' },
        data: expect.objectContaining({ status: GenericStatus.APPROVED })
      })
    );
    expect(prisma.tx.approvalUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'approval_accepted_1' },
        data: expect.objectContaining({ status: GenericStatus.APPROVED })
      })
    );
  });

  it('updates order lifecycle to REJECTED when ORDER_EDIT approval is rejected', async () => {
    const prisma = makePrismaMock();
    prisma.client.approval.findFirst.mockResolvedValue({
      id: 'approval_rejected_1',
      targetId: 'order_rejected_1',
      status: GenericStatus.PENDING,
      requesterId: 'requester_1',
      contextJson: {}
    });
    prisma.client.order.findFirst.mockResolvedValue({
      id: 'order_rejected_1',
      status: GenericStatus.REJECTED,
      createdBy: 'requester_1',
      items: [],
      invoices: []
    });

    const service = new SalesService(
      prisma as any,
      makeSearchMock() as any,
      makeSettingsPolicyMock() as any,
      makeRuntimeSettingsMock() as any
    );

    const result = await service.reject('approval_rejected_1');

    expect(result.status).toBe(GenericStatus.REJECTED);
    expect(prisma.tx.orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order_rejected_1' },
        data: expect.objectContaining({ status: GenericStatus.REJECTED })
      })
    );
    expect(prisma.tx.approvalUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'approval_rejected_1' },
        data: expect.objectContaining({ status: GenericStatus.REJECTED })
      })
    );
  });
});
