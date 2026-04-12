import { expect, test, type Page, type Route } from '@playwright/test';

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

async function clickRoleControl(
  page: Page,
  role: 'button' | 'tab' | 'link',
  name: string | RegExp
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const locator = page.getByRole(role, { name }).first();
    try {
      await expect(locator).toBeVisible({ timeout: 5000 });
      await locator.click({ timeout: 5000 });
      return;
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
      await page.waitForTimeout(150);
    }
  }
}

async function checkSelectAllCheckbox(page: Page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const checkbox = page.locator('table.data-table thead input[type="checkbox"]').first();
    try {
      await expect(checkbox).toBeVisible({ timeout: 5000 });
      await checkbox.check({ force: true, timeout: 5000 });
      return;
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
      await page.waitForTimeout(150);
    }
  }
}

async function waitForSettingsReloadReady(page: Page) {
  await expect(page.getByRole('button', { name: 'Làm mới' })).toBeEnabled();
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
  if (domain === 'hr_policies') {
    return {
      domain,
      data: {
        shiftDefault: 'HC',
        leave: {
          annualDefaultDays: 12,
          maxCarryOverDays: 5
        },
        payroll: {
          cycle: 'monthly',
          cutoffDay: 25
        },
        approverChain: {
          leaveApproverRole: 'USER',
          payrollApproverRole: 'ADMIN'
        },
        appendixFieldCatalog: {
          summary: { key: 'summary', label: 'Summary', type: 'text', options: [], analyticsEnabled: false, aggregator: 'none' },
          result: { key: 'result', label: 'Result', type: 'text', options: [], analyticsEnabled: false, aggregator: 'none' },
          taskCount: { key: 'taskCount', label: 'Task count', type: 'number', options: [], analyticsEnabled: true, aggregator: 'sum' },
          custom_1: { key: 'PL05_customerFeedback', label: 'Feedback', type: 'select', options: ['Tot', 'Can cai thien'], analyticsEnabled: false, aggregator: 'none' },
          custom_2: { key: 'PL06_qualityTag', label: 'Quality tag', type: 'select', options: ['A', 'B'], analyticsEnabled: false, aggregator: 'none' },
          custom_3: { key: 'PL10_recoveryRisk', label: 'Recovery risk', type: 'select', options: ['Low', 'Medium', 'High'], analyticsEnabled: false, aggregator: 'none' }
        },
        appendixTemplates: {
          PL01: {
            name: 'PL01',
            description: 'Daily log',
            fields: [{ fieldKey: 'summary' }, { fieldKey: 'result' }, { fieldKey: 'taskCount' }]
          },
          PL02: { name: 'PL02', description: '', fields: [{ fieldKey: 'summary' }, { fieldKey: 'result' }] },
          PL03: { name: 'PL03', description: '', fields: [{ fieldKey: 'summary' }, { fieldKey: 'result' }] },
          PL04: { name: 'PL04', description: '', fields: [{ fieldKey: 'summary' }, { fieldKey: 'result' }] },
          PL05: { name: 'PL05', description: '', fields: [{ fieldKey: 'summary' }, { fieldKey: 'pl05_customerfeedback' }] },
          PL06: { name: 'PL06', description: '', fields: [{ fieldKey: 'summary' }, { fieldKey: 'pl06_qualitytag' }] },
          PL10: { name: 'PL10', description: '', fields: [{ fieldKey: 'summary' }, { fieldKey: 'pl10_recoveryrisk' }] }
        }
      },
      validation: { ok: true, errors: [], warnings: [] }
    };
  }

  if (domain === 'approval_matrix') {
    return {
      domain,
      data: {
        rules: [
          {
            module: 'reports',
            minAmount: 0,
            approverRole: 'USER',
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
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('erp_web_role', 'ADMIN');
    });
  });

  test('renders phase-2 managed list fields for security and finance domains', async ({ page }) => {
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

      if (method === 'GET' && path === '/api/v1/settings/positions') {
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

    await page.getByRole('button', { name: 'Bảo mật truy cập' }).click();
    await page.getByRole('tab', { name: 'Phân quyền hệ thống' }).click();
    await expect(page.locator('[data-testid="list-manager-security-super-admin-legacy"]')).toBeVisible();
    await expect(page.locator('[data-testid="list-manager-security-perm-super-admin-emails"]')).toBeVisible();

    await page.getByRole('button', { name: 'Kiểm soát tài chính' }).click();
    await expect(page.locator('[data-testid="list-manager-finance-locked-periods"]')).toBeVisible();
  });

  test('opens a dedicated position detail page when clicking position name', async ({ page }) => {
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

      if (method === 'GET' && path === '/api/v1/settings/positions') {
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
    await page.getByRole('button', { name: 'Bảo mật truy cập' }).click();
    await page.getByRole('tab', { name: 'Ma trận quyền hạn' }).click();
    await expect(page.locator('[data-testid="iam-scope-override-editor"]')).toBeVisible();

    await page.locator('a[href="/modules/settings/positions/position_1"]').first().click();
    await expect(page).toHaveURL(/\/modules\/settings\/positions\/position_1$/);
    await expect(page.getByRole('heading', { name: 'Chi tiết vị trí công việc' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chi tiết quyền' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Danh sách nhân viên' })).toBeVisible();
  });

  test('renders phase-3 HR appendix managed list fields for options and template pickers', async ({ page }) => {
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

      if (method === 'GET' && path === '/api/v1/settings/positions') {
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

    await waitForSettingsReloadReady(page);
    await clickRoleControl(page, 'button', /Chính sách.*nhân sự/i);
    await clickRoleControl(page, 'tab', 'Phụ lục hợp đồng');

    await expect(page.locator('[data-testid="list-manager-hr-field-custom1-options"]')).toBeVisible();
    await expect(page.locator('[data-testid="list-manager-hr-field-custom2-options"]')).toBeVisible();
    await expect(page.locator('[data-testid="list-manager-hr-field-custom3-options"]')).toBeVisible();
    await expect(page.locator('[data-testid="list-manager-hr-pl01-fields"]')).toBeVisible();
    await expect(page.locator('[data-testid="list-manager-hr-pl05-fields"]')).toBeVisible();
  });

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

      if (method === 'GET' && path === '/api/v1/settings/positions') {
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
    await expect(page.getByText('General')).toBeVisible();
    await expect(page.getByText('Security & Access')).toBeVisible();
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
              role: 'USER',
              email: 'manager_1@erp.vn',
              employee: { fullName: 'Manager 1' },
              isActive: true
            },
            {
              id: 'user_2',
              role: 'USER',
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

      if (method === 'GET' && path === '/api/v1/settings/positions') {
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
    await waitForSettingsReloadReady(page);
    await clickRoleControl(page, 'button', /Chính sách (HR|nhân sự)/i);
    await clickRoleControl(page, 'tab', 'Tài khoản nhân viên');

    await expect(page.getByText('Danh sách tài khoản IAM')).toBeVisible();
    await expect(page.locator('table.data-table tbody tr')).toHaveCount(2);

    await checkSelectAllCheckbox(page);
    await clickRoleControl(page, 'button', 'Bulk reset mật khẩu');

    await expect.poll(() => resetRequests.length).toBe(2);
    await expect(page.getByText('Reset mật khẩu IAM: thành công 2/2.')).toBeVisible();
    expect(resetRequests.sort()).toEqual(['user_1', 'user_2']);
  });

  test('advanced mode defaults to ON for admin and can hide/reveal technical fields on demand', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('erp_web_role', 'ADMIN');
    });

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
          items: [{ id: 'user_1', fullName: 'Manager ERP', email: 'manager@erp.vn' }]
        });
      }

      if (method === 'GET' && path === '/api/v1/settings/organization/tree') {
        return json(route, {
          items: [{ id: 'org_1', name: 'ERP Demo', type: 'COMPANY' }],
          tree: [{ id: 'org_1', name: 'ERP Demo', type: 'COMPANY', children: [] }]
        });
      }

      if (method === 'GET' && path === '/api/v1/settings/positions') {
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

    const advancedToggle = page.getByLabel('Chế độ Chuyên gia / IT');
    await expect(advancedToggle).toBeVisible();
    await expect(advancedToggle).toBeChecked();

    await clickRoleControl(page, 'button', 'Tích hợp hệ thống');
    await expect(page.getByLabel('BHTOT Base URL')).toBeVisible();

    await advancedToggle.uncheck();
    await expect(page.getByLabel('BHTOT Base URL')).toHaveCount(0);

    await advancedToggle.check();
    await expect(page.getByLabel('BHTOT Base URL')).toBeVisible();
  });

  test('renders phase-2 domain tabs for remaining settings domains', async ({ page }) => {
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
          items: [{ id: 'user_1', fullName: 'Manager ERP', email: 'manager@erp.vn' }]
        });
      }

      if (method === 'GET' && path === '/api/v1/settings/organization/tree') {
        return json(route, {
          items: [{ id: 'org_1', name: 'ERP Demo', type: 'COMPANY' }],
          tree: [{ id: 'org_1', name: 'ERP Demo', type: 'COMPANY', children: [] }]
        });
      }

      if (method === 'GET' && path === '/api/v1/settings/positions') {
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
    await waitForSettingsReloadReady(page);
    await clickRoleControl(page, 'button', 'Ma trận phê duyệt');
    await expect(page.getByRole('tab', { name: 'Quy tắc duyệt' })).toBeVisible();
    await clickRoleControl(page, 'tab', 'Leo thang & ủy quyền');
    await expect(page.getByRole('heading', { name: 'Leo thang & ủy quyền' })).toBeVisible();

    await waitForSettingsReloadReady(page);
    await clickRoleControl(page, 'button', 'Kiểm soát tài chính');
    await expect(page.getByRole('tab', { name: 'Kỳ kế toán' })).toBeVisible();
    await clickRoleControl(page, 'tab', 'Đánh số chứng từ');
    await expect(page.getByRole('heading', { name: 'Đánh số chứng từ' })).toBeVisible();

    await waitForSettingsReloadReady(page);
    await clickRoleControl(page, 'button', 'Chính sách CRM/Bán hàng');
    await expect(page.getByRole('tab', { name: 'Quy tắc đơn hàng' })).toBeVisible();
    await clickRoleControl(page, 'tab', 'Phân loại khách hàng');
    await expect(page.getByRole('heading', { name: 'Phân loại khách hàng' })).toBeVisible();

    await waitForSettingsReloadReady(page);
    await clickRoleControl(page, 'button', 'Chính sách Danh mục/SCM');
    await expect(page.getByRole('tab', { name: 'Mặc định hệ thống' })).toBeVisible();
    await clickRoleControl(page, 'tab', 'Ràng buộc nhập/xuất');
    await expect(page.getByRole('heading', { name: 'Ràng buộc nhập/xuất' })).toBeVisible();

    await waitForSettingsReloadReady(page);
    await clickRoleControl(page, 'button', 'Tích hợp hệ thống');
    await expect(page.getByRole('tab', { name: 'BHTOT' })).toBeVisible();
    await clickRoleControl(page, 'tab', 'Zalo OA');
    await expect(page.getByRole('heading', { name: 'Zalo OA' })).toBeVisible();

    await waitForSettingsReloadReady(page);
    await clickRoleControl(page, 'button', 'Thông báo & mẫu');
    await expect(page.getByRole('tab', { name: 'Template' })).toBeVisible();
    await clickRoleControl(page, 'tab', 'Kênh gửi');
    await expect(page.getByRole('heading', { name: 'Chính sách kênh gửi' })).toBeVisible();

    await waitForSettingsReloadReady(page);
    await clickRoleControl(page, 'button', 'Tìm kiếm & hiệu năng');
    await expect(page.getByRole('tab', { name: 'Runtime' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Reindex' })).toBeVisible();

    await waitForSettingsReloadReady(page);
    await clickRoleControl(page, 'button', 'Dữ liệu & backup');
    await expect(page.getByRole('tab', { name: 'Vòng đời dữ liệu' })).toBeVisible();
    await clickRoleControl(page, 'tab', 'Chính sách export');
    await expect(page.getByRole('heading', { name: 'Chính sách export' })).toBeVisible();
    await clickRoleControl(page, 'tab', 'Checklist & audit');
    await expect(page.getByRole('heading', { name: 'Checklist khởi tạo' })).toBeVisible();
  });

  test('uses layout metadata endpoint when available and keeps fallback-safe behavior', async ({ page }) => {
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

      if (method === 'GET' && path === '/api/v1/settings/layout') {
        return json(route, {
          version: 1,
          rolloutPhase: 'phase_2',
          generatedAt: '2026-04-03T16:00:00.000Z',
          groupedSidebar: [
            {
              id: 'meta-general',
              label: 'Nhóm Metadata Chung',
              domains: ['org_profile', 'locale_calendar']
            },
            {
              id: 'meta-modules',
              label: 'Nhóm Metadata Phân hệ',
              domains: ['sales_crm_policies', 'catalog_scm_policies', 'hr_policies']
            },
            {
              id: 'meta-management',
              label: 'Nhóm Metadata Kiểm soát',
              domains: ['access_security', 'approval_matrix', 'finance_controls', 'data_governance_backup']
            },
            {
              id: 'meta-integration',
              label: 'Nhóm Metadata IT',
              domains: ['integrations', 'notifications_templates', 'search_performance']
            }
          ],
          advancedMode: {
            defaultByRole: {
              ADMIN: false,
              USER: false
            },
            scope: 'section_and_field'
          },
          domainTabs: {
            approval_matrix: [
              { key: 'approval-rules-meta', label: 'Luồng duyệt metadata', sectionIds: ['approval-rule-default'] },
              { key: 'approval-escalation-meta', label: 'Escalation metadata', sectionIds: ['approval-escalation'] }
            ]
          }
        });
      }

      if (method === 'GET' && path.startsWith('/api/v1/settings/domains/')) {
        const domain = path.replace('/api/v1/settings/domains/', '');
        return json(route, buildDomainPayload(domain));
      }

      if (method === 'GET' && path === '/api/v1/settings/iam/users') {
        return json(route, {
          items: [{ id: 'user_1', fullName: 'Manager ERP', email: 'manager@erp.vn' }]
        });
      }

      if (method === 'GET' && path === '/api/v1/settings/organization/tree') {
        return json(route, {
          items: [{ id: 'org_1', name: 'ERP Demo', type: 'COMPANY' }],
          tree: [{ id: 'org_1', name: 'ERP Demo', type: 'COMPANY', children: [] }]
        });
      }

      if (method === 'GET' && path === '/api/v1/settings/positions') {
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
    await expect(page.getByText('Nhóm Metadata Chung')).toBeVisible();
    await expect(page.getByLabel('Chế độ Chuyên gia / IT')).not.toBeChecked();

    await waitForSettingsReloadReady(page);
    await clickRoleControl(page, 'button', 'Ma trận phê duyệt');
    await expect(page.getByRole('tab', { name: 'Luồng duyệt metadata' })).toBeVisible();
    await clickRoleControl(page, 'tab', 'Escalation metadata');
    await expect(page.getByRole('heading', { name: 'Leo thang & ủy quyền' })).toBeVisible();
  });
});
