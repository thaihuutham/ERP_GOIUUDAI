import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { SettingsEnterpriseService } from '../src/modules/settings/settings-enterprise.service';

describe('SettingsEnterpriseService org hierarchy rules', () => {
  const service = new SettingsEnterpriseService({} as any, {} as any);

  it('allows valid parent-child hierarchy', () => {
    expect(() => (service as any).assertOrgHierarchy('COMPANY', null)).not.toThrow();
    expect(() => (service as any).assertOrgHierarchy('BRANCH', 'COMPANY')).not.toThrow();
    expect(() => (service as any).assertOrgHierarchy('DEPARTMENT', 'BRANCH')).not.toThrow();
    expect(() => (service as any).assertOrgHierarchy('TEAM', 'DEPARTMENT')).not.toThrow();
  });

  it('rejects invalid parent-child hierarchy', () => {
    expect(() => (service as any).assertOrgHierarchy('TEAM', 'BRANCH')).toThrow(BadRequestException);
    expect(() => (service as any).assertOrgHierarchy('DEPARTMENT', 'COMPANY')).toThrow(BadRequestException);
    expect(() => (service as any).assertOrgHierarchy('COMPANY', 'BRANCH')).toThrow(BadRequestException);
  });
});

