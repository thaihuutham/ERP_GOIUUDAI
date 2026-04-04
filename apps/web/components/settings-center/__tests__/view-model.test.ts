import { describe, expect, it } from 'vitest';
import {
  filterDomainTabsByRole,
  filterSectionsForTabAndMode,
  resolveActiveTab,
  resolveDefaultAdvancedMode,
  resolveDomainTabs,
  type SectionLike
} from '../view-model';

type MockField = {
  id: string;
  isAdvanced?: boolean;
};

type MockSection = SectionLike<MockField> & {
  title: string;
};

const sections: MockSection[] = [
  {
    id: 'org-base',
    title: 'Base',
    fields: [{ id: 'base-name' }]
  },
  {
    id: 'org-branding',
    title: 'Branding',
    fields: [
      { id: 'color-main' },
      { id: 'advanced-color-token', isAdvanced: true }
    ]
  },
  {
    id: 'advanced-only-section',
    title: 'Advanced',
    isAdvanced: true,
    fields: [{ id: 'advanced-a' }]
  }
];

describe('settings view model', () => {
  it('defaults advanced mode by role', () => {
    expect(resolveDefaultAdvancedMode('ADMIN')).toBe(true);
    expect(resolveDefaultAdvancedMode('MANAGER')).toBe(false);
    expect(resolveDefaultAdvancedMode('STAFF')).toBe(false);
    expect(resolveDefaultAdvancedMode(undefined)).toBe(false);
  });

  it('resolves domain tabs for phase-1 domains', () => {
    const orgTabs = resolveDomainTabs('org_profile');
    expect(orgTabs.map((item) => item.key)).toEqual(['org-general', 'org-structure']);

    const securityTabs = resolveDomainTabs('access_security');
    expect(securityTabs.map((item) => item.key)).toEqual([
      'security-auth',
      'security-governance',
      'security-observability',
      'security-matrix'
    ]);
  });

  it('resolves domain tabs for phase-2 domains', () => {
    expect(resolveDomainTabs('locale_calendar').map((item) => item.key)).toEqual(['locale-display']);
    expect(resolveDomainTabs('approval_matrix').map((item) => item.key)).toEqual([
      'approval-rules',
      'approval-escalation'
    ]);
    expect(resolveDomainTabs('finance_controls').map((item) => item.key)).toEqual([
      'finance-period',
      'finance-numbering'
    ]);
    expect(resolveDomainTabs('sales_crm_policies').map((item) => item.key)).toEqual([
      'sales-orders',
      'sales-credit',
      'sales-taxonomy'
    ]);
    expect(resolveDomainTabs('catalog_scm_policies').map((item) => item.key)).toEqual([
      'catalog-defaults',
      'catalog-constraints'
    ]);
    expect(resolveDomainTabs('integrations').map((item) => item.key)).toEqual([
      'integration-bhtot',
      'integration-zalo',
      'integration-ai'
    ]);
    expect(resolveDomainTabs('notifications_templates').map((item) => item.key)).toEqual([
      'notify-template',
      'notify-channel-policy',
      'notify-retry'
    ]);
    expect(resolveDomainTabs('search_performance').map((item) => item.key)).toEqual([
      'search-runtime',
      'search-reindex'
    ]);
    expect(resolveDomainTabs('data_governance_backup').map((item) => item.key)).toEqual([
      'data-retention',
      'data-export-policy'
    ]);
  });

  it('falls back to first tab when active tab is invalid', () => {
    const tabs = resolveDomainTabs('org_profile');
    expect(resolveActiveTab(tabs, 'unknown')).toBe('org-general');
    expect(resolveActiveTab(tabs, 'org-structure')).toBe('org-structure');
  });

  it('filters sections by tab and advanced mode', () => {
    const tabs = resolveDomainTabs('org_profile');

    const basic = filterSectionsForTabAndMode(sections, tabs, 'org-general', false);
    expect(basic.map((section) => section.id)).toEqual(['org-base', 'org-branding']);
    expect(basic[1]?.fields.map((field) => field.id)).toEqual(['color-main']);

    const advanced = filterSectionsForTabAndMode(sections, tabs, 'org-general', true);
    expect(advanced.map((section) => section.id)).toEqual(['org-base', 'org-branding']);
    expect(advanced[1]?.fields.map((field) => field.id)).toEqual(['color-main', 'advanced-color-token']);

    const orgStructureTab = filterSectionsForTabAndMode(sections, tabs, 'org-structure', false);
    expect(orgStructureTab).toEqual([]);
  });

  it('filters access-security tabs by role for a simpler experience', () => {
    const tabs = resolveDomainTabs('access_security');

    expect(filterDomainTabsByRole('access_security', tabs, 'ADMIN').map((item) => item.key)).toEqual([
      'security-auth',
      'security-governance',
      'security-observability',
      'security-matrix'
    ]);
    expect(filterDomainTabsByRole('access_security', tabs, 'MANAGER').map((item) => item.key)).toEqual([
      'security-auth',
      'security-observability'
    ]);
    expect(filterDomainTabsByRole('access_security', tabs, 'STAFF').map((item) => item.key)).toEqual([
      'security-auth'
    ]);
  });
});
