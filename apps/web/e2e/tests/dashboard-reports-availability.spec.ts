import { expect, test, type Route } from '@playwright/test';

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

const REPORTS_DISABLED_NOTICE =
  "Phân hệ 'reports' đang tắt. Vui lòng bật lại tại Cấu hình hệ thống > Hồ sơ tổ chức > Phân hệ đang bật.";

test.describe('Home dashboard reports availability', () => {
  test('shows friendly warning and skips overview call when reports module is disabled', async ({ page }) => {
    let reportsOverviewCalls = 0;

    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();

      if (method === 'GET' && path === '/api/v1/settings/runtime') {
        return json(route, {
          organization: { companyName: 'ERP Demo' },
          locale: { numberFormat: 'vi-VN', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' },
          enabledModules: ['crm', 'sales', 'catalog', 'hr', 'finance', 'scm', 'assets', 'projects', 'workflows', 'notifications']
        });
      }

      if (method === 'GET' && path === '/api/v1/reports/overview') {
        reportsOverviewCalls += 1;
        return json(route, {
          totalRevenue: 123456789,
          totalEmployees: 10,
          pendingInvoices: 2,
          activePurchaseOrders: 3
        });
      }

      return json(route, { ok: true });
    });

    await page.goto('/');

    await expect(page.getByText(REPORTS_DISABLED_NOTICE)).toBeVisible();
    expect(reportsOverviewCalls).toBe(0);
  });

  test('loads overview normally when reports module is enabled', async ({ page }) => {
    let reportsOverviewCalls = 0;

    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();

      if (method === 'GET' && path === '/api/v1/settings/runtime') {
        return json(route, {
          organization: { companyName: 'ERP Demo' },
          locale: { numberFormat: 'vi-VN', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' },
          enabledModules: ['crm', 'sales', 'catalog', 'hr', 'finance', 'scm', 'assets', 'projects', 'workflows', 'reports', 'notifications']
        });
      }

      if (method === 'GET' && path === '/api/v1/reports/overview') {
        reportsOverviewCalls += 1;
        return json(route, {
          totalRevenue: 123456789,
          totalEmployees: 24,
          pendingInvoices: 7,
          activePurchaseOrders: 5
        });
      }

      return json(route, { ok: true });
    });

    await page.goto('/');

    await expect(page.getByText(REPORTS_DISABLED_NOTICE)).toHaveCount(0);
    await expect(page.getByText('24')).toBeVisible();
    expect(reportsOverviewCalls).toBeGreaterThan(0);
  });

  test('keeps other widgets usable when quick tasks endpoint fails', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();

      if (method === 'GET' && path === '/api/v1/settings/runtime') {
        return json(route, {
          organization: { companyName: 'ERP Demo' },
          locale: { numberFormat: 'vi-VN', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' },
          enabledModules: ['crm', 'sales', 'catalog', 'hr', 'finance', 'scm', 'assets', 'projects', 'workflows', 'reports', 'notifications']
        });
      }

      if (method === 'GET' && path === '/api/v1/reports/overview') {
        return json(route, {
          totalRevenue: 987654321,
          totalEmployees: 33,
          pendingInvoices: 5,
          activePurchaseOrders: 4
        });
      }

      if (method === 'GET' && path === '/api/v1/reports/module') {
        return json(route, {
          items: [
            { id: 'so_1', status: 'APPROVED', totalAmount: 12000000, createdAt: '2026-03-10T10:00:00.000Z' },
            { id: 'so_2', status: 'PENDING', totalAmount: 8000000, createdAt: '2026-04-01T10:00:00.000Z' }
          ]
        });
      }

      if (method === 'GET' && path === '/api/v1/workflows/inbox') {
        return json(route, { message: 'workflow inbox unavailable' }, 500);
      }

      if (method === 'GET' && path === '/api/v1/audit/logs') {
        return json(route, { items: [] });
      }

      return json(route, { ok: true });
    });

    await page.goto('/');

    await expect(page.getByText('33')).toBeVisible();
    await expect(page.getByText('Không thể tải danh sách công việc.')).toBeVisible();
    await expect(page.getByText(REPORTS_DISABLED_NOTICE)).toHaveCount(0);
  });
});
