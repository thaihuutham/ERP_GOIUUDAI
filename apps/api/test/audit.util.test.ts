import { describe, expect, it } from 'vitest';
import { computeChangedFields, createAuditHash, maskSensitiveFields } from '../src/common/audit/audit.util';

describe('audit.util', () => {
  it('generates deterministic hash regardless object key order', () => {
    const payloadA = {
      tenantId: 'GOIUUDAI',
      action: 'UPDATE_ORDER',
      metadata: {
        requestId: 'req_1',
        status: 'APPROVED'
      }
    };

    const payloadB = {
      metadata: {
        status: 'APPROVED',
        requestId: 'req_1'
      },
      action: 'UPDATE_ORDER',
      tenantId: 'GOIUUDAI'
    };

    expect(createAuditHash(payloadA)).toBe(createAuditHash(payloadB));
  });

  it('masks sensitive fields recursively', () => {
    const masked = maskSensitiveFields({
      email: 'manager@example.com',
      password: 'P@ssw0rd',
      credentials: {
        apiKey: 'abc123',
        refresh_token: 'xyz999'
      },
      nested: [
        { otpCode: '778899' },
        { note: 'safe' }
      ]
    }) as Record<string, unknown>;

    expect(masked.email).toBe('manager@example.com');
    expect(masked.password).toBe('***REDACTED***');
    expect(masked.credentials).toEqual({
      apiKey: '***REDACTED***',
      refresh_token: '***REDACTED***'
    });
    expect(masked.nested).toEqual([
      { otpCode: '***REDACTED***' },
      { note: 'safe' }
    ]);
  });

  it('computes changed fields for nested object and arrays', () => {
    const before = {
      status: 'PENDING',
      approval: {
        by: null,
        note: null
      },
      items: [{ sku: 'SKU-1', qty: 1 }]
    };
    const after = {
      status: 'APPROVED',
      approval: {
        by: 'manager_1',
        note: 'approved'
      },
      items: [{ sku: 'SKU-1', qty: 2 }]
    };

    const changed = computeChangedFields(before, after);

    expect(changed).toEqual(
      expect.arrayContaining(['status', 'approval.by', 'approval.note', 'items[0].qty'])
    );
  });
});
