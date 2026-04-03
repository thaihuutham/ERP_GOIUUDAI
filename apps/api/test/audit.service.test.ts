import { BadRequestException } from '@nestjs/common';
import { AuditOperationType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/modules/audit/audit.service';

function createPrismaMock() {
  const deleteMany = vi.fn().mockResolvedValue({ count: 5 });
  const tx = {
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    auditLog: {
      deleteMany
    }
  };

  const auditLog = {
    findMany: vi.fn(),
    groupBy: vi.fn(),
    deleteMany
  };

  return {
    getTenantId: vi.fn().mockReturnValue('GOIUUDAI'),
    client: {
      auditLog,
      $transaction: vi.fn(async (callback: (ctx: typeof tx) => Promise<number>) => callback(tx))
    }
  };
}

describe('AuditService', () => {
  const now = new Date('2026-03-31T00:00:00.000Z');

  let prisma: ReturnType<typeof createPrismaMock>;
  let archive: {
    toHotThreshold: ReturnType<typeof vi.fn>;
    requireStorageEnabledForArchiveQuery: ReturnType<typeof vi.fn>;
    queryArchivedLogs: ReturnType<typeof vi.fn>;
  };
  let runtimeSettings: {
    getDataGovernanceRuntime: ReturnType<typeof vi.fn>;
  };
  let accessScope: {
    resolveCurrentUserScope: ReturnType<typeof vi.fn>;
  };
  let config: {
    get: ReturnType<typeof vi.fn>;
  };
  let service: AuditService;

  beforeEach(() => {
    prisma = createPrismaMock();
    archive = {
      toHotThreshold: vi.fn().mockReturnValue(new Date('2025-03-31T00:00:00.000Z')),
      requireStorageEnabledForArchiveQuery: vi.fn(),
      queryArchivedLogs: vi.fn().mockResolvedValue({
        items: [],
        hasMore: false,
        scannedFiles: 0,
        scannedRows: 0,
        durationMs: 1
      })
    };
    runtimeSettings = {
      getDataGovernanceRuntime: vi.fn().mockResolvedValue({
        auditHotRetentionMonths: 12
      })
    };
    accessScope = {
      resolveCurrentUserScope: vi.fn().mockResolvedValue({
        accessScope: 'company',
        allowedActorIds: null,
        managedOrgUnitIds: []
      })
    };
    config = {
      get: vi.fn().mockReturnValue(undefined)
    };
    service = new AuditService(
      prisma as any,
      archive as any,
      accessScope as any,
      runtimeSettings as any,
      config as any
    );
  });

  it('lists audit logs with combined filters and normalized action/module', async () => {
    prisma.client.auditLog.findMany.mockResolvedValue([
      {
        id: 'log_1',
        tenant_Id: 'GOIUUDAI',
        module: 'sales',
        entityType: 'Order',
        entityId: 'ord_1',
        action: 'APPROVE_ORDER',
        operationType: AuditOperationType.WRITE,
        actorId: 'manager_1',
        actorRole: 'MANAGER',
        requestId: 'req_1',
        route: '/api/v1/sales/orders/ord_1/approve',
        method: 'POST',
        statusCode: 200,
        ip: '127.0.0.1',
        userAgent: 'vitest',
        beforeData: null,
        afterData: { status: 'APPROVED' },
        changedFields: ['status'],
        metadata: {},
        prevHash: null,
        hash: 'hash_1',
        createdAt: now
      }
    ]);

    const result = await service.listLogs({
      entityType: 'order',
      entityId: 'ord_1',
      action: 'approve_order',
      operationType: 'WRITE',
      module: 'SALES',
      actorId: 'manager_1',
      requestId: 'req_1',
      q: 'ord_1',
      limit: 10
    });

    expect(prisma.client.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 11,
        where: expect.objectContaining({
          entityType: expect.objectContaining({ equals: 'order' }),
          entityId: 'ord_1',
          action: expect.objectContaining({ equals: 'APPROVE_ORDER' }),
          operationType: AuditOperationType.WRITE,
          module: expect.objectContaining({ equals: 'sales' }),
          actorId: 'manager_1',
          requestId: 'req_1'
        })
      })
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.changedFields).toEqual(['status']);
    expect((result.pageInfo as Record<string, unknown>).tier).toBe('hot');
    expect(result.pageInfo.hasMore).toBe(false);
  });

  it('returns object history using entityType + entityId as hard filters', async () => {
    prisma.client.auditLog.findMany.mockResolvedValue([]);

    await service.getObjectHistory('Order', 'ord_42', { action: 'APPROVE_ORDER' });

    expect(prisma.client.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: expect.objectContaining({ equals: 'Order' }),
          entityId: 'ord_42'
        })
      })
    );
  });

  it('throws validation error when object history is missing entity identifiers', async () => {
    await expect(service.getObjectHistory('', 'ord_42', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getObjectHistory('Order', '', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('merges action taxonomy with grouped counts', async () => {
    prisma.client.auditLog.groupBy.mockResolvedValue([
      { action: 'APPROVE', _count: { _all: 7 } },
      { action: 'custom_action', _count: { _all: 2 } }
    ]);

    const result = await service.getActions();
    const actionMap = new Map(result.items.map((item) => [item.action, item.count]));

    expect(actionMap.get('APPROVE')).toBe(7);
    expect(actionMap.get('CUSTOM_ACTION')).toBe(2);
    expect(actionMap.has('SENSITIVE_READ')).toBe(true);
  });

  it('filters audit actions by resolved actor scope', async () => {
    accessScope.resolveCurrentUserScope.mockResolvedValue({
      accessScope: 'branch',
      allowedActorIds: ['actor_1', 'actor_2'],
      managedOrgUnitIds: ['ou_branch_1']
    });
    prisma.client.auditLog.groupBy.mockResolvedValue([]);

    await service.getActions();

    expect(prisma.client.auditLog.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          actorId: {
            in: ['actor_1', 'actor_2']
          }
        }
      })
    );
  });

  it('prunes old logs inside guarded transaction', async () => {
    const count = await service.pruneLogsBefore(now);

    expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
    expect(count).toBe(5);
  });

  it('merges hot + cold tiers and returns cold scan stats', async () => {
    prisma.client.auditLog.findMany.mockResolvedValue([
      {
        id: 'log_hot_1',
        tenant_Id: 'GOIUUDAI',
        module: 'sales',
        entityType: 'Order',
        entityId: 'ord_1',
        action: 'APPROVE_ORDER',
        operationType: AuditOperationType.WRITE,
        actorId: 'manager_1',
        actorRole: 'MANAGER',
        requestId: 'req_hot_1',
        route: '/api/v1/sales/orders/ord_1/approve',
        method: 'POST',
        statusCode: 200,
        ip: '127.0.0.1',
        userAgent: 'vitest',
        beforeData: null,
        afterData: { status: 'APPROVED' },
        changedFields: ['status'],
        metadata: {},
        prevHash: null,
        hash: 'hash_hot_1',
        createdAt: new Date('2025-06-01T00:00:00.000Z')
      }
    ]);

    archive.queryArchivedLogs.mockResolvedValue({
      items: [
        {
          id: 'log_cold_1',
          tenant_Id: 'GOIUUDAI',
          module: 'sales',
          entityType: 'Order',
          entityId: 'ord_1',
          action: 'APPROVE_ORDER',
          operationType: 'WRITE',
          actorId: 'manager_1',
          actorRole: 'MANAGER',
          requestId: 'req_cold_1',
          route: '/api/v1/sales/orders/ord_1/approve',
          method: 'POST',
          statusCode: 200,
          ip: '127.0.0.1',
          userAgent: 'vitest',
          beforeData: null,
          afterData: { status: 'APPROVED' },
          changedFields: ['status'],
          metadata: {},
          prevHash: null,
          hash: 'hash_cold_1',
          createdAt: '2025-03-25T00:00:00.000Z'
        }
      ],
      hasMore: false,
      scannedFiles: 2,
      scannedRows: 100,
      durationMs: 35
    });

    const result = await service.listLogs({
      from: '2025-03-20T00:00:00.000Z',
      to: '2025-04-05T00:00:00.000Z',
      limit: 10
    });

    expect(archive.queryArchivedLogs).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.id).toBe('log_hot_1');
    expect((result.items[0] as Record<string, unknown>).dataTier).toBe('hot');
    expect((result.items[1] as Record<string, unknown>).dataTier).toBe('cold');
    expect((result.pageInfo as Record<string, unknown>).tier).toBe('mixed');
    expect((result.pageInfo as Record<string, unknown>).coldScanStats).toEqual({
      scannedFiles: 2,
      scannedRows: 100,
      durationMs: 35
    });
  });

  it('filters hot and cold data by actor scope when manager is scoped', async () => {
    accessScope.resolveCurrentUserScope.mockResolvedValue({
      accessScope: 'branch',
      allowedActorIds: ['manager_1'],
      managedOrgUnitIds: ['ou_branch_1']
    });

    prisma.client.auditLog.findMany.mockResolvedValue([
      {
        id: 'log_hot_scope_1',
        tenant_Id: 'GOIUUDAI',
        module: 'sales',
        entityType: 'Order',
        entityId: 'ord_scope_1',
        action: 'APPROVE_ORDER',
        operationType: AuditOperationType.WRITE,
        actorId: 'manager_1',
        actorRole: 'MANAGER',
        requestId: 'req_scope_hot_1',
        route: '/api/v1/sales/orders/ord_scope_1/approve',
        method: 'POST',
        statusCode: 200,
        ip: '127.0.0.1',
        userAgent: 'vitest',
        beforeData: null,
        afterData: { status: 'APPROVED' },
        changedFields: ['status'],
        metadata: {},
        prevHash: null,
        hash: 'hash_scope_hot_1',
        createdAt: new Date('2025-06-01T00:00:00.000Z')
      }
    ]);

    archive.queryArchivedLogs.mockImplementation(async (args: any) => {
      const matcher = args.matcher as (row: Record<string, unknown>) => boolean;
      const coldRows = [
        {
          id: 'log_cold_scope_1',
          tenant_Id: 'GOIUUDAI',
          module: 'sales',
          entityType: 'Order',
          entityId: 'ord_scope_1',
          action: 'APPROVE_ORDER',
          operationType: 'WRITE',
          actorId: 'manager_1',
          actorRole: 'MANAGER',
          requestId: 'req_scope_cold_1',
          route: '/api/v1/sales/orders/ord_scope_1/approve',
          method: 'POST',
          statusCode: 200,
          ip: '127.0.0.1',
          userAgent: 'vitest',
          beforeData: null,
          afterData: { status: 'APPROVED' },
          changedFields: ['status'],
          metadata: {},
          prevHash: null,
          hash: 'hash_scope_cold_1',
          createdAt: '2025-03-25T00:00:00.000Z'
        },
        {
          id: 'log_cold_scope_2',
          tenant_Id: 'GOIUUDAI',
          module: 'sales',
          entityType: 'Order',
          entityId: 'ord_scope_2',
          action: 'APPROVE_ORDER',
          operationType: 'WRITE',
          actorId: 'staff_outside_scope',
          actorRole: 'STAFF',
          requestId: 'req_scope_cold_2',
          route: '/api/v1/sales/orders/ord_scope_2/approve',
          method: 'POST',
          statusCode: 200,
          ip: '127.0.0.1',
          userAgent: 'vitest',
          beforeData: null,
          afterData: { status: 'APPROVED' },
          changedFields: ['status'],
          metadata: {},
          prevHash: null,
          hash: 'hash_scope_cold_2',
          createdAt: '2025-03-24T00:00:00.000Z'
        }
      ];

      return {
        items: coldRows.filter((item) => matcher(item as any)),
        hasMore: false,
        scannedFiles: 2,
        scannedRows: 2,
        durationMs: 18
      };
    });

    const result = await service.listLogs({
      from: '2025-03-20T00:00:00.000Z',
      to: '2025-04-05T00:00:00.000Z',
      limit: 10
    });

    const firstFindManyCall = prisma.client.auditLog.findMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstFindManyCall).toBeTruthy();
    const serializedWhere = JSON.stringify(firstFindManyCall.where ?? {});
    expect(serializedWhere).toContain('"actorId":{"in":["manager_1"]}');

    const ids = result.items.map((item) => item.id);
    expect(ids).toContain('log_hot_scope_1');
    expect(ids).toContain('log_cold_scope_1');
    expect(ids).not.toContain('log_cold_scope_2');
    expect((result.pageInfo as Record<string, unknown>).accessScope).toBe('branch');
  });

  it('requires from/to when query reaches archive tier', async () => {
    await expect(
      service.listLogs({
        from: '2024-01-01T00:00:00.000Z'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects cold range wider than configured window', async () => {
    await expect(
      service.listLogs({
        from: '2024-01-01T00:00:00.000Z',
        to: '2024-03-15T00:00:00.000Z'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
