import { ForbiddenException } from '@nestjs/common';
import { ZaloAccountPermissionLevel } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ZaloAccountAssignmentService } from '../src/modules/zalo/zalo-account-assignment.service';

function makeService(options?: {
  authUser?: Record<string, unknown>;
  assignment?: { permissionLevel: ZaloAccountPermissionLevel } | null;
}) {
  const prisma = {
    getTenantId: vi.fn(() => 'GOIUUDAI'),
    client: {
      zaloAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: 'zalo_acc_1' })
      },
      user: {
        findMany: vi.fn().mockResolvedValue([])
      },
      zaloAccountAssignment: {
        findFirst: vi.fn().mockResolvedValue(options?.assignment ?? null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    }
  } as any;

  const cls = {
    get: vi.fn((key: string) => {
      if (key === 'authUser') {
        return options?.authUser ?? { userId: 'staff_1', role: 'USER' };
      }
      return undefined;
    })
  } as any;

  return {
    service: new ZaloAccountAssignmentService(prisma, cls),
    prisma
  };
}

describe('ZaloAccountAssignmentService', () => {
  it('allows admin role to read/chat account without explicit assignment', async () => {
    const { service } = makeService({
      authUser: { userId: 'admin_1', role: 'ADMIN' }
    });

    await expect(service.assertCanReadAccount('zalo_acc_1')).resolves.toBeUndefined();
    await expect(service.assertCanChatAccount('zalo_acc_1')).resolves.toBeUndefined();
  });

  it('denies staff chat when no active assignment', async () => {
    const { service } = makeService({
      authUser: { userId: 'staff_1', role: 'USER' },
      assignment: null
    });

    await expect(service.assertCanChatAccount('zalo_acc_1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows staff chat when assignment permission is CHAT', async () => {
    const { service } = makeService({
      authUser: { userId: 'staff_1', role: 'USER' },
      assignment: { permissionLevel: ZaloAccountPermissionLevel.CHAT }
    });

    await expect(service.assertCanReadAccount('zalo_acc_1')).resolves.toBeUndefined();
    await expect(service.assertCanChatAccount('zalo_acc_1')).resolves.toBeUndefined();
  });

  it('returns staff-scoped accessible account ids', async () => {
    const { service, prisma } = makeService({
      authUser: { userId: 'staff_1', role: 'USER' }
    });

    prisma.client.zaloAccountAssignment.findMany.mockResolvedValue([
      { zaloAccountId: 'zalo_a' },
      { zaloAccountId: 'zalo_b' },
      { zaloAccountId: 'zalo_a' }
    ]);

    await expect(service.resolveAccessibleAccountIds()).resolves.toEqual(['zalo_a', 'zalo_b']);
  });

  it('upserts existing assignment instead of creating duplicate active row', async () => {
    const { service, prisma } = makeService({
      authUser: { userId: 'admin_1', role: 'ADMIN' },
      assignment: { permissionLevel: ZaloAccountPermissionLevel.READ }
    });

    prisma.client.zaloAccountAssignment.findFirst.mockResolvedValue({
      id: 'assign_1',
      permissionLevel: ZaloAccountPermissionLevel.READ
    });
    prisma.client.zaloAccountAssignment.update.mockResolvedValue({
      id: 'assign_1',
      permissionLevel: ZaloAccountPermissionLevel.CHAT
    });

    const result = await service.upsertAssignment('zalo_acc_1', 'staff_2', 'CHAT');
    expect(prisma.client.zaloAccountAssignment.update).toHaveBeenCalledTimes(1);
    expect(prisma.client.zaloAccountAssignment.create).not.toHaveBeenCalled();
    expect(result.permissionLevel).toBe(ZaloAccountPermissionLevel.CHAT);
  });

  it('denies manager role from managing assignments', async () => {
    const { service } = makeService({
      authUser: { userId: 'manager_1', role: 'USER' }
    });

    await expect(
      service.upsertAssignment('zalo_acc_1', 'staff_3', 'READ')
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies staff role from viewing operational metrics', async () => {
    const { service } = makeService({
      authUser: { userId: 'staff_1', role: 'USER' }
    });

    await expect(service.assertCanViewOperationalMetrics()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reports assignment mismatch metrics (missing/inactive/duplicate/empty user)', async () => {
    const { service, prisma } = makeService({
      authUser: { userId: 'admin_1', role: 'ADMIN' }
    });
    prisma.client.zaloAccountAssignment.findMany.mockResolvedValue([
      { id: 'assign_1', zaloAccountId: 'zalo_a', userId: '' },
      { id: 'assign_2', zaloAccountId: 'zalo_b', userId: 'staff_missing' },
      { id: 'assign_3', zaloAccountId: 'zalo_c', userId: 'staff_inactive' },
      { id: 'assign_4', zaloAccountId: 'zalo_d', userId: 'staff_dup' },
      { id: 'assign_5', zaloAccountId: 'zalo_d', userId: 'staff_dup' }
    ]);
    prisma.client.user.findMany.mockResolvedValue([
      { id: 'staff_inactive', isActive: false },
      { id: 'staff_dup', isActive: true }
    ]);

    const metrics = await service.getAssignmentMismatchMetrics();

    expect(metrics.totalActiveAssignments).toBe(5);
    expect(metrics.mismatchCount).toBe(4);
    expect(metrics.mismatchByReason).toEqual({
      USER_ID_EMPTY: 1,
      USER_NOT_FOUND: 1,
      USER_INACTIVE: 1,
      DUPLICATE_ACTIVE_ASSIGNMENT: 1
    });
    expect(metrics.samples.length).toBeGreaterThan(0);
  });
});
