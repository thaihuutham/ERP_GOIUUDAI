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
  updatedAt: '2026-04-01T01:00:00.000Z',
  runtimeApplied: true,
  runtimeLoadedAt: '2026-04-01T01:00:00.000Z'
}));

const ORG_PROFILE_DOMAIN = {
  domain: 'org_profile',
  data: {
    companyName: 'ERP Demo',
    branchName: 'CN HCM',
    taxCode: '0312345678',
    address: 'HCM',
    contactEmail: 'ops@erp.vn',
    contactPhone: '0909123456',
    enabledModules: ['crm', 'sales', 'catalog', 'hr', 'finance', 'scm', 'assets', 'projects', 'workflows', 'reports', 'audit', 'notifications'],
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

const ACCESS_SECURITY_DOMAIN = {
  domain: 'access_security',
  data: {
    sessionTimeoutMinutes: 480,
    superAdminIds: [],
    permissionPolicy: {
      enabled: true,
      conflictPolicy: 'DENY_OVERRIDES',
      superAdminIds: [],
      superAdminEmails: []
    },
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireNumber: true,
      requireSpecial: false,
      rotateDays: 90
    },
    loginPolicy: {
      maxFailedAttempts: 5,
      lockoutMinutes: 15,
      mfaRequired: false
    },
    auditViewPolicy: {
      enabled: true,
      groups: {
        DIRECTOR: { enabled: true },
        BRANCH_MANAGER: { enabled: true },
        DEPARTMENT_MANAGER: { enabled: true }
      },
      denyIfUngroupedManager: true
    },
    settingsEditorPolicy: {
      domainRoleMap: {
        ADMIN: [],
        USER: []
      },
      userDomainMap: {}
    }
  },
  validation: { ok: true, errors: [], warnings: [] }
};

test.describe('Settings Center audit scope matrix', () => {
  test('renders audit scope controls, includes audit permission module, and saves branch toggle', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('erp_web_role', 'ADMIN');
    });

    let savedAccessSecurityBody: any = null;

    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();

      if (method === 'GET' && path === '/api/v1/settings/runtime') {
        return json(route, {
          organization: {
            companyName: 'ERP Demo'
          },
          enabledModules: ['crm', 'sales', 'catalog', 'hr', 'finance', 'scm', 'assets', 'projects', 'workflows', 'reports', 'audit', 'settings', 'notifications'],
          locale: {
            timezone: 'Asia/Ho_Chi_Minh',
            currency: 'VND',
            numberFormat: 'vi-VN',
            dateFormat: 'DD/MM/YYYY'
          }
        });
      }

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

      if (method === 'GET' && path === '/api/v1/settings/domains/org_profile') {
        return json(route, ORG_PROFILE_DOMAIN);
      }

      if (method === 'GET' && path === '/api/v1/settings/domains/access_security') {
        return json(route, ACCESS_SECURITY_DOMAIN);
      }

      if (method === 'PUT' && path === '/api/v1/settings/domains/access_security') {
        savedAccessSecurityBody = request.postDataJSON() as Record<string, unknown>;
        return json(route, {
          domain: 'access_security',
          data: savedAccessSecurityBody,
          validation: { ok: true, errors: [], warnings: [] }
        });
      }

      if (method === 'GET' && path === '/api/v1/settings/iam/users') {
        return json(route, {
          items: [
            {
              id: 'user_1',
              email: 'manager@erp.vn',
              role: 'USER',
              employee: {
                id: 'emp_1',
                fullName: 'Manager ERP'
              }
            }
          ]
        });
      }

      if (method === 'GET' && path === '/api/v1/settings/organization/tree') {
        return json(route, {
          items: [{ id: 'org_company', name: 'ERP Demo', type: 'COMPANY' }],
          tree: [{ id: 'org_company', name: 'ERP Demo', type: 'COMPANY', children: [] }]
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
    await expect(page.locator('[data-testid="list-manager-security-perm-super-admin-ids"]')).toBeVisible();
    await expect(page.locator('[data-testid="list-manager-security-perm-super-admin-emails"]')).toBeVisible();

    await page.getByRole('tab', { name: 'Nhật ký & Trợ lý AI' }).click();
    await expect(page.getByText('Phân quyền nhật ký hệ thống theo cấp quản lý')).toBeVisible();
    await expect(page.getByLabel('Giám đốc: xem toàn công ty')).toBeChecked();
    await expect(page.getByLabel('Trưởng chi nhánh: xem trong phạm vi chi nhánh')).toBeChecked();
    await expect(page.getByLabel('Trưởng phòng: xem trong phạm vi phòng ban')).toBeChecked();
    await expect(page.getByLabel('Chặn USER chưa được gán vào đơn vị tổ chức')).toBeChecked();

    await page.getByRole('tab', { name: 'Ma trận quyền hạn' }).click();
    await expect(page.getByRole('cell', { name: 'audit' }).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Nhật ký & Trợ lý AI' }).click();
    await page.getByLabel('Trưởng chi nhánh: xem trong phạm vi chi nhánh').uncheck();
    await page.getByRole('button', { name: 'Lưu cấu hình' }).click();

    await expect(page.getByText('Lưu cấu hình thành công.')).toBeVisible();
    if (!savedAccessSecurityBody) {
      throw new Error('Không nhận được payload save access_security.');
    }

    const auditViewPolicy = (savedAccessSecurityBody.auditViewPolicy ?? {}) as Record<string, unknown>;
    const groups = (auditViewPolicy.groups ?? {}) as Record<string, unknown>;
    const branch = (groups.BRANCH_MANAGER ?? {}) as Record<string, unknown>;

    expect(branch.enabled).toBe(false);
  });
});
