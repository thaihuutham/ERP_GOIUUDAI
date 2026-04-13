import { expect, test, type Page, type Route } from '@playwright/test';

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
  updatedAt: '2026-04-05T08:00:00.000Z',
  runtimeApplied: true,
  runtimeLoadedAt: '2026-04-05T08:00:00.000Z'
}));

async function mockApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === 'GET' && path === '/api/v1/settings/runtime') {
      return json(route, {
        organization: { companyName: 'ERP Demo' },
        enabledModules: [
          'crm',
          'sales',
          'catalog',
          'hr',
          'finance',
          'scm',
          'assets',
          'projects',
          'workflows',
          'reports',
          'assistant',
          'audit',
          'settings',
          'notifications'
        ],
        locale: {
          timezone: 'Asia/Ho_Chi_Minh',
          numberFormat: 'vi-VN',
          currency: 'VND',
          dateFormat: 'DD/MM/YYYY'
        }
      });
    }

    if (method === 'GET' && path === '/api/v1/settings/permissions/effective') {
      return json(route, {
        effective: [],
        overrides: []
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
        recentSnapshots: [],
        recentAudit: []
      });
    }

    if (method === 'GET' && path.startsWith('/api/v1/settings/domains/')) {
      const domain = path.replace('/api/v1/settings/domains/', '');
      return json(route, {
        domain,
        data: {},
        validation: {
          ok: true,
          errors: [],
          warnings: []
        }
      });
    }

    if (method === 'GET' && path === '/api/v1/settings/layout') {
      return json(route, {});
    }

    if (method === 'GET' && path === '/api/v1/settings/iam/users') {
      return json(route, { items: [] });
    }

    if (method === 'GET' && path === '/api/v1/settings/organization/tree') {
      return json(route, {
        items: [],
        tree: []
      });
    }

    if (method === 'GET' && path === '/api/v1/settings/positions') {
      return json(route, { items: [] });
    }

    if (method === 'GET' && path === '/api/v1/settings/sales-taxonomy') {
      return json(route, {
        stages: ['MOI', 'CHOT_DON'],
        sources: ['ONLINE']
      });
    }

    if (method === 'GET' && path === '/api/v1/settings/crm-tags') {
      return json(route, {
        customerTags: ['vip'],
        interactionTags: ['quan_tam'],
        interactionResultTags: ['da_mua']
      });
    }

    if (method === 'GET' && path === '/api/v1/reports/overview') {
      return json(route, {
        totalRevenue: 120000000,
        totalEmployees: 50,
        pendingInvoices: 5,
        activePurchaseOrders: 3
      });
    }

    if (method === 'GET' && path === '/api/v1/reports/module') {
      return json(route, { items: [] });
    }

    if (method === 'GET' && path === '/api/v1/workflows/inbox') {
      return json(route, { items: [] });
    }

    if (method === 'GET' && path === '/api/v1/audit/logs') {
      return json(route, { items: [] });
    }

    if (method === 'GET' && path === '/api/v1/crm/customers') {
      return json(route, {
        items: [
          {
            id: 'cus_policy_1',
            code: 'CUS-POLICY-001',
            fullName: 'Khách test quyền',
            phone: '0909000000',
            email: 'policy.customer@example.com',
            customerStage: 'MOI',
            source: 'ONLINE',
            segment: 'Retail',
            status: 'ACTIVE',
            totalOrders: 0,
            totalSpent: 0,
            tags: ['vip'],
            updatedAt: '2026-04-05T08:00:00.000Z'
          }
        ]
      });
    }

    if (method === 'GET' && path === '/api/v1/crm/interactions') {
      return json(route, { items: [] });
    }

    if (method === 'GET' && path === '/api/v1/crm/payment-requests') {
      return json(route, { items: [] });
    }

    if (method === 'GET' && path === '/api/v1/crm/dedup-candidates') {
      return json(route, { items: [] });
    }

    if (method === 'GET' && path === '/api/v1/crm/taxonomy') {
      return json(route, {
        customerTaxonomy: {
          stages: ['MOI', 'TIEP_CAN'],
          sources: ['ONLINE', 'OFFLINE']
        },
        tagRegistry: {
          customerTags: ['vip', 'khach_moi'],
          interactionTags: ['quan_tam'],
          interactionResultTags: ['da_mua']
        }
      });
    }

    return json(route, { ok: true });
  });
}

test.describe('access policy hardening', () => {
  test('redirects USER away from blocked routes', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    const roleSelect = page.getByLabel('Vai trò');

    await roleSelect.selectOption('USER');
    await page.goto('/modules/settings');
    await expect(page).toHaveURL('/');
    await expect(
      page.getByText('Trang bạn mở không thuộc phạm vi quyền truy cập. Hệ thống đã chuyển về Tổng quan.')
    ).toBeVisible();

    await page.goto('/modules/finance');
    await expect(page).toHaveURL(/\/modules\/finance(?:\?.*)?$/);
  });

  test('hides CRM create/update/delete actions by role policy', async ({ page }) => {
    await mockApi(page);
    await page.goto('/modules/crm');

    const roleSelect = page.getByLabel('Vai trò');

    await roleSelect.selectOption('USER');
    await page.goto('/modules/crm');
    await expect(page.getByRole('button', { name: 'Thêm dữ liệu' })).toBeVisible();
    await page.getByRole('cell', { name: 'Khách test quyền' }).click();
    await expect(page.getByRole('heading', { name: 'Chi tiết khách hàng' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chỉnh sửa hồ sơ' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Xóa$/ })).toHaveCount(0);

    await roleSelect.selectOption('ADMIN');
    await page.goto('/modules/crm');
    await expect(page.getByRole('button', { name: 'Thêm dữ liệu' })).toBeVisible();
    await page.getByRole('cell', { name: 'Khách test quyền' }).click();
    await expect(page.getByRole('heading', { name: 'Chi tiết khách hàng' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chỉnh sửa hồ sơ' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Xóa$/ })).toBeVisible();
  });

  test('keeps settings area accessible for ADMIN only and suppresses raw 403 copy', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    await page.getByLabel('Vai trò').selectOption('ADMIN');
    await page.goto('/modules/settings');
    await expect(page).toHaveURL(/\/modules\/settings$/);
    await expect(page.getByRole('heading', { name: 'Trung tâm cấu hình hệ thống' })).toBeVisible();
    await expect(page.getByText('Bạn không có quyền truy cập tài nguyên này.')).toHaveCount(0);
  });
});
