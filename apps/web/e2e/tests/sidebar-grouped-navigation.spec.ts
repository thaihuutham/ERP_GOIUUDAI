import { expect, test, type Route } from '@playwright/test';

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

test.describe('AppShell sidebar grouped navigation', () => {
  test('renders grouped sections and applies role-aware navigation visibility', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();

      if (method === 'GET' && path === '/api/v1/settings/runtime') {
        return json(route, {
          organization: { companyName: 'ERP Demo' },
          locale: { numberFormat: 'vi-VN', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' },
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
            'notifications',
          ],
        });
      }

      if (method === 'GET' && path === '/api/v1/reports/overview') {
        return json(route, {
          totalRevenue: 123456789,
          totalEmployees: 24,
          pendingInvoices: 7,
          activePurchaseOrders: 5,
        });
      }

      return json(route, { ok: true });
    });

    await page.goto('/');

    const sideMenu = page.locator('aside.side-menu');

    await expect(sideMenu.locator('.side-section-title', { hasText: 'KINH DOANH' })).toBeVisible();
    await expect(sideMenu.locator('.side-section-title', { hasText: 'ZALO AUTOMATION' })).toBeVisible();
    await expect(sideMenu.locator('.side-section-title', { hasText: 'NHÂN SỰ' })).toBeVisible();
    await expect(sideMenu.locator('.side-section-title', { hasText: 'TÀI CHÍNH & VẬN HÀNH' })).toBeVisible();
    await expect(sideMenu.locator('.side-section-title', { hasText: 'HỆ THỐNG' })).toBeVisible();

    const roleSelect = page.getByLabel('Vai trò');

    await roleSelect.selectOption('STAFF');
    await expect(sideMenu.getByRole('link', { name: 'CRM', exact: true })).toBeVisible();
    await expect(sideMenu.getByRole('link', { name: 'Tin nhắn', exact: true })).toBeVisible();
    await expect(sideMenu.getByRole('link', { name: 'Tài khoản Zalo', exact: true })).toBeVisible();
    await expect(sideMenu.getByRole('link', { name: 'AI đánh giá & Phiên chạy', exact: true })).toBeVisible();
    await expect(sideMenu.getByRole('link', { name: 'Chiến dịch', exact: true })).toBeVisible();
    await expect(sideMenu.getByRole('link', { name: 'Quy trình', exact: true })).toHaveCount(0);
    await expect(sideMenu.getByRole('link', { name: 'Nhật ký hệ thống', exact: true })).toHaveCount(0);

    await sideMenu.getByRole('link', { name: 'Chiến dịch', exact: true }).click();
    await expect(page).toHaveURL(/\/modules\/zalo-automation\/campaigns$/);
    await expect(page.getByRole('heading', { name: 'Chiến dịch Zalo PERSONAL' })).toBeVisible();

    await roleSelect.selectOption('MANAGER');
    await expect(sideMenu.getByRole('link', { name: 'Quy trình', exact: true })).toBeVisible();
    await expect(sideMenu.getByRole('link', { name: 'Nhật ký hệ thống', exact: true })).toBeVisible();

    await roleSelect.selectOption('ADMIN');
    await expect(sideMenu.getByRole('link', { name: 'Cấu hình hệ thống', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Thu gọn menu' }).click();
    await expect(page.locator('.shell-layout')).toHaveClass(/shell-layout-collapsed/);
    await expect(sideMenu.locator('.side-link[title="CRM"]')).toBeVisible();
  });
});
