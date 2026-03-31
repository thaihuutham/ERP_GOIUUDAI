import { PermissionAction } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { resolveModuleKeyFromPath, resolvePermissionActionFromRequest } from '../src/common/auth/permission.util';

describe('permission.util', () => {
  it('resolves module key from api path', () => {
    expect(resolveModuleKeyFromPath('/api/v1/settings/permissions/effective')).toBe('settings');
    expect(resolveModuleKeyFromPath('/sales/orders')).toBe('sales');
  });

  it('maps HTTP methods to CRUD actions', () => {
    expect(resolvePermissionActionFromRequest('GET', '/api/v1/crm/customers')).toBe(PermissionAction.VIEW);
    expect(resolvePermissionActionFromRequest('POST', '/api/v1/crm/customers')).toBe(PermissionAction.CREATE);
    expect(resolvePermissionActionFromRequest('PATCH', '/api/v1/crm/customers/1')).toBe(PermissionAction.UPDATE);
    expect(resolvePermissionActionFromRequest('DELETE', '/api/v1/crm/customers/1')).toBe(PermissionAction.DELETE);
  });

  it('maps approval-like routes to APPROVE', () => {
    expect(resolvePermissionActionFromRequest('POST', '/api/v1/sales/orders/1/approve')).toBe(PermissionAction.APPROVE);
    expect(resolvePermissionActionFromRequest('POST', '/api/v1/settings/search/reindex')).toBe(PermissionAction.APPROVE);
    expect(resolvePermissionActionFromRequest('POST', '/api/v1/hr/payrolls/1/pay')).toBe(PermissionAction.APPROVE);
  });
});

