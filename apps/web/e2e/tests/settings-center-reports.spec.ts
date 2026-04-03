import { expect, test, type Route } from '@playwright/test';

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

const DOMAIN_STATES = [
  'org_profile',
  'locale_calendar',
  'access_security',
  'approval_matrix',
  'finance_controls',
  'sales_crm_policies',
  'catalog_scm_policies',
  'hr_policies',
  'integrations',
  'notifications_templates',
  'search_performance',
  'data_governance_backup'
].map((domain) => ({
  domain,
  ok: true,
  errorCount: 0,
  warningCount: 0,
  updatedAt: '2026-03-31T08:00:00.000Z',
  runtimeApplied: true,
  runtimeLoadedAt: '2026-03-31T08:00:00.000Z'
}));

function buildDomainPayload(domain: string) {
  if (domain === 'approval_matrix') {
    return {
      domain,
      data: {
        rules: [
          {
            module: 'reports',
            minAmount: 0,
            approverRole: 'MANAGER',
            approverDepartment: ''
          }
        ],
        escalation: {
          enabled: true,
          slaHours: 24,
          escalateToRole: 'ADMIN'
        },
        delegation: {
          enabled: true,
          maxDays: 14
        }
      },
      validation: { ok: true, errors: [], warnings: [] }
    };
  }

  return {
    domain,
    data: {
      companyName: 'ERP Demo',
      branchName: 'CN HCM',
      taxCode: '0312345678',
      address: 'HCM',
      contactEmail: 'ops@erp.vn',
      contactPhone: '0909123456',
      enabledModules: ['crm', 'sales', 'catalog', 'hr', 'finance', 'scm', 'assets', 'projects', 'workflows', 'reports', 'notifications'],
      branding: {
        logoUrl: '',
        primaryColor: '#3f8f50'
      },
      documentLayout: {
        invoiceTemplate: 'retail',
        showCompanySeal: true
      }
    },
    validation: { ok: true, errors: [], warnings: [] }
  };
}

test.describe('Settings Center reports alignment', () => {
  test('shows reports module in Organization and removes preset UI', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();

      if (method === 'GET' && path === '/api/v1/settings/center') {
        return json(route, {
          summary: {
            totalDomains: DOMAIN_STATES.length,
            validDomains: DOMAIN_STATES.length,
            invalidDomains: 0
          },
          checklist: {
            org: true,
            security: true,
            financeControls: true,
            integrations: true,
            modulePolicies: true
          },
          domainStates: DOMAIN_STATES,
          recentAudit: [],
          recentSnapshots: []
        });
      }

      if (method === 'GET' && path.startsWith('/api/v1/settings/domains/')) {
        const domain = path.replace('/api/v1/settings/domains/', '');
        return json(route, buildDomainPayload(domain));
      }

      if (method === 'GET' && path === '/api/v1/settings/iam/users') {
        return json(route, {
          items: [{ id: 'user_1', fullName: 'Admin ERP', email: 'admin@erp.vn' }]
        });
      }

      if (method === 'GET' && path === '/api/v1/settings/organization/tree') {
        return json(route, {
          items: [{ id: 'org_1', name: 'ERP Demo', type: 'COMPANY' }],
          tree: [{ id: 'org_1', name: 'ERP Demo', type: 'COMPANY', children: [] }]
        });
      }

      if (method === 'GET' && path === '/api/v1/hr/positions') {
        return json(route, {
          items: [{ id: 'position_1', name: 'Manager' }]
        });
      }

      if (method === 'GET' && path.startsWith('/api/v1/settings/permissions/positions/')) {
        return json(route, { rules: [] });
      }

      if (method === 'GET' && path === '/api/v1/settings/permissions/effective') {
        return json(route, { overrides: [] });
      }

      return json(route, { ok: true });
    });

    await page.goto('/modules/settings');

    await expect(page.getByRole('heading', { name: 'Trung tâm cấu hình hệ thống' })).toBeVisible();
    await expect(page.getByText('Áp mẫu nhanh:')).toHaveCount(0);

    const reportsCheckbox = page.locator('label.checkbox-wrap:has-text("Báo cáo") input[type="checkbox"]').first();
    await expect(reportsCheckbox).toBeVisible();
    await expect(reportsCheckbox).toBeChecked();

    await page.getByRole('button', { name: /Ma trận phê duyệt/ }).click();
    await expect(page.locator('#approval-module option[value="reports"]')).toHaveCount(1);
  });

  test('supports bulk reset password on IAM users table', async ({ page }) => {
    const resetRequests: string[] = [];

    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();

      if (method === 'GET' && path === '/api/v1/settings/center') {
        return json(route, {
          summary: {
            totalDomains: DOMAIN_STATES.length,
            validDomains: DOMAIN_STATES.length,
            invalidDomains: 0
          },
          checklist: {
            org: true,
            security: true,
            financeControls: true,
            integrations: true,
            modulePolicies: true
          },
          domainStates: DOMAIN_STATES,
          recentAudit: [],
          recentSnapshots: []
        });
      }

      if (method === 'GET' && path.startsWith('/api/v1/settings/domains/')) {
        const domain = path.replace('/api/v1/settings/domains/', '');
        return json(route, buildDomainPayload(domain));
      }

      if (method === 'GET' && path === '/api/v1/settings/iam/users') {
        return json(route, {
          items: [
            {
              id: 'user_1',
              role: 'MANAGER',
              email: 'manager_1@erp.vn',
              employee: { fullName: 'Manager 1' },
              isActive: true
            },
            {
              id: 'user_2',
              role: 'STAFF',
              email: 'staff_1@erp.vn',
              employee: { fullName: 'Staff 1' },
              isActive: true
            }
          ]
        });
      }

      if (method === 'POST' && /\/api\/v1\/settings\/iam\/users\/[^/]+\/reset-password$/.test(path)) {
        const userId = path.split('/')[6] ?? '';
        resetRequests.push(userId);
        return json(route, {
          userId,
          temporaryPassword: `Temp#${userId}`,
          temporaryPasswordExpiresAt: '2026-04-01T08:00:00.000Z',
          mustChangePassword: true
        });
      }

      if (method === 'GET' && path === '/api/v1/settings/organization/tree') {
        return json(route, {
          items: [{ id: 'org_1', name: 'ERP Demo', type: 'COMPANY' }],
          tree: [{ id: 'org_1', name: 'ERP Demo', type: 'COMPANY', children: [] }]
        });
      }

      if (method === 'GET' && path === '/api/v1/hr/positions') {
        return json(route, {
          items: [{ id: 'position_1', name: 'Manager' }]
        });
      }

      if (method === 'GET' && path.startsWith('/api/v1/settings/permissions/positions/')) {
        return json(route, { rules: [] });
      }

      if (method === 'GET' && path === '/api/v1/settings/permissions/effective') {
        return json(route, { overrides: [] });
      }

      return json(route, { ok: true });
    });

    page.once('dialog', (dialog) => dialog.accept());

    await page.goto('/modules/settings');
    await page.getByRole('button', { name: /Chính sách (HR|nhân sự)/i }).click();

    await expect(page.getByText('Danh sách tài khoản IAM')).toBeVisible();

    await page.locator('table.data-table thead input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: 'Bulk reset mật khẩu' }).click();

    await expect(page.getByText('Reset mật khẩu IAM: thành công 2/2.')).toBeVisible();
    expect(resetRequests.sort()).toEqual(['user_1', 'user_2']);
  });
});
