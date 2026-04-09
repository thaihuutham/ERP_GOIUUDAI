import { expect, test, type Page, type Route } from '@playwright/test';

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

async function mockWave1ModuleApis(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === 'GET' && path === '/api/v1/settings/runtime') {
      return json(route, {
        organization: { companyName: 'ERP Retail' },
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
          'notifications'
        ]
      });
    }

    if (method === 'GET' && path === '/api/v1/settings/domains/finance_controls') {
      return json(route, {
        data: {
          recordIdentity: {
            mode: 'compact',
            foreignKeyMode: 'compact',
            prefix: 'ID',
            sequencePadding: 5,
            compactLength: 8
          }
        }
      });
    }

    if (method === 'GET' && path === '/api/v1/hr/employees') {
      return json(route, {
        items: [
          { id: 'emp_01', fullName: 'Nguyen Van A' },
          { id: 'emp_02', fullName: 'Tran Thi B' }
        ],
        pageInfo: { limit: 25, hasMore: false, nextCursor: null }
      });
    }

    if (method === 'GET' && path === '/api/v1/catalog/products') {
      return json(route, {
        items: [
          {
            id: 'prd_01',
            sku: 'SKU-001',
            name: 'Laptop Pro',
            productType: 'PRODUCT',
            categoryPath: 'laptop/business',
            pricePolicyCode: 'RET-STD',
            unitPrice: 15000000,
            status: 'ACTIVE',
            createdAt: '2026-04-01T08:00:00.000Z'
          }
        ],
        pageInfo: { limit: 25, hasMore: false, nextCursor: null },
        sortMeta: { sortBy: 'createdAt', sortDir: 'desc', sortableFields: ['createdAt', 'name', 'unitPrice'] }
      });
    }

    if (method === 'POST' && path === '/api/v1/catalog/products') {
      return json(route, { id: 'prd_new' });
    }

    if (method === 'GET' && path === '/api/v1/assets') {
      return json(route, {
        items: [
          {
            id: 'ast_01',
            assetCode: 'AST-001',
            name: 'Macbook Asset',
            category: 'Laptop',
            lifecycleStatus: 'IN_USE',
            value: 24000000,
            status: 'ACTIVE',
            purchaseAt: '2026-03-01T08:00:00.000Z',
            createdAt: '2026-03-01T08:00:00.000Z'
          }
        ],
        pageInfo: { limit: 25, hasMore: false, nextCursor: null },
        sortMeta: { sortBy: 'createdAt', sortDir: 'desc', sortableFields: ['createdAt', 'name', 'value'] }
      });
    }

    if (method === 'GET' && path === '/api/v1/assets/allocations') {
      return json(route, {
        items: [
          {
            id: 'alloc_01',
            assetId: 'ast_01',
            employeeId: 'emp_01',
            allocatedAt: '2026-03-12T08:00:00.000Z',
            returnedAt: null,
            status: 'ACTIVE'
          }
        ],
        pageInfo: { limit: 25, hasMore: false, nextCursor: null }
      });
    }

    if (method === 'POST' && path === '/api/v1/assets') {
      return json(route, { id: 'ast_new' });
    }

    if (method === 'GET' && path === '/api/v1/projects') {
      return json(route, {
        items: [
          {
            id: 'prj_01',
            code: 'PRJ-001',
            name: 'ERP Wave 1',
            status: 'ACTIVE',
            plannedBudget: 100000000,
            actualBudget: 15000000,
            forecastPercent: 35,
            startAt: '2026-04-01T08:00:00.000Z',
            endAt: '2026-06-30T08:00:00.000Z'
          }
        ],
        pageInfo: { limit: 25, hasMore: false, nextCursor: null },
        sortMeta: { sortBy: 'createdAt', sortDir: 'desc', sortableFields: ['createdAt', 'name', 'status'] }
      });
    }

    if (method === 'GET' && path === '/api/v1/projects/tasks') {
      return json(route, {
        items: [
          {
            id: 'task_01',
            projectId: 'prj_01',
            title: 'Setup schema',
            assignedTo: 'emp_01',
            status: 'PENDING',
            dueAt: '2026-04-20T08:00:00.000Z'
          }
        ],
        pageInfo: { limit: 25, hasMore: false, nextCursor: null }
      });
    }

    if (method === 'GET' && path === '/api/v1/projects/resources') {
      return json(route, {
        items: [
          {
            id: 'res_01',
            projectId: 'prj_01',
            resourceType: 'NHAN_SU',
            resourceRef: 'emp_01',
            quantity: 1
          }
        ],
        pageInfo: { limit: 25, hasMore: false, nextCursor: null }
      });
    }

    if (method === 'GET' && path === '/api/v1/projects/budgets') {
      return json(route, {
        items: [{ id: 'budget_01', projectId: 'prj_01', budgetType: 'PLAN', amount: 100000000 }],
        pageInfo: { limit: 25, hasMore: false, nextCursor: null }
      });
    }

    if (method === 'GET' && path === '/api/v1/projects/time-entries') {
      return json(route, {
        items: [{ id: 'time_01', projectId: 'prj_01', employeeId: 'emp_01', workDate: '2026-04-09', hours: 8 }],
        pageInfo: { limit: 25, hasMore: false, nextCursor: null }
      });
    }

    if (method === 'POST' && path === '/api/v1/projects') {
      return json(route, { id: 'prj_new' });
    }

    if (method === 'GET' && path === '/api/v1/reports/overview') {
      return json(route, {
        totalRevenue: 500000000,
        totalEmployees: 40,
        pendingInvoices: 5,
        activePurchaseOrders: 4,
        activeProjects: 3,
        avgForecastPercent: 42.5,
        activeAssets: 18,
        maintenanceAssets: 2
      });
    }

    if (method === 'GET' && path === '/api/v1/reports/module') {
      return json(route, {
        items: [
          { id: 'sales_01', status: 'APPROVED', createdAt: '2026-04-08T08:00:00.000Z' }
        ],
        pageInfo: { limit: 25, hasMore: false, nextCursor: null }
      });
    }

    if (method === 'GET' && path === '/api/v1/reports') {
      return json(route, {
        items: [
          {
            id: 'rpt_01',
            name: 'Bao cao tuan',
            reportType: 'TONG_HOP',
            moduleName: 'sales',
            outputFormat: 'JSON',
            status: 'ACTIVE',
            nextRunAt: '2026-04-10T02:00:00.000Z',
            lastRunAt: '2026-04-09T02:00:00.000Z'
          }
        ],
        pageInfo: { limit: 25, hasMore: false, nextCursor: null }
      });
    }

    if (method === 'POST' && path === '/api/v1/reports') {
      return json(route, { id: 'rpt_new' });
    }

    if (method === 'GET' && path === '/api/v1/notifications') {
      return json(route, {
        items: [
          {
            id: 'ntf_01',
            userId: 'emp_01',
            title: 'Thong bao test',
            content: 'Noi dung test',
            isRead: false,
            createdAt: '2026-04-09T09:00:00.000Z'
          }
        ],
        pageInfo: { limit: 25, hasMore: false, nextCursor: null }
      });
    }

    if (method === 'POST' && path === '/api/v1/notifications') {
      return json(route, { id: 'ntf_new' });
    }

    return json(route, { ok: true });
  });
}

test.describe('Wave 1 domain modules board', () => {
  test.beforeEach(async ({ page }) => {
    await mockWave1ModuleApis(page);
  });

  test('catalog board supports create flow and bulk action', async ({ page }) => {
    await page.goto('/modules/catalog');
    await expect(page.locator('article.module-workbench > header.module-header h1', { hasText: 'Danh mục' })).toBeVisible();
    await expect(page.getByText('Bộ lọc đang bật')).toBeVisible();

    await page.getByPlaceholder('Tìm kiếm nhanh...').fill('Laptop');
    await expect(page.getByRole('button', { name: 'Xóa bộ lọc' })).toBeVisible();
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
    await expect(page.getByRole('button', { name: 'Xóa bộ lọc' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Tạo sản phẩm' }).click();
    await page.locator('.field').filter({ hasText: 'Tên sản phẩm' }).locator('input').fill('Macbook Air M4');
    await page.locator('.field').filter({ hasText: 'Đơn giá' }).locator('input').fill('28000000');
    await page.getByRole('button', { name: 'Xác nhận' }).click();

    await expect(page.getByText('Tạo sản phẩm thành công.')).toBeVisible();

    await page.locator('tbody input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: 'Bulk Actions' }).click();
    await expect(page.getByRole('button', { name: 'Lưu trữ sản phẩm' })).toBeVisible();
  });

  test('assets board supports create flow and lifecycle bulk action', async ({ page }) => {
    await page.goto('/modules/assets');
    await expect(page.locator('article.module-workbench > header.module-header h1', { hasText: 'Tài sản' })).toBeVisible();

    await page.getByRole('button', { name: 'Tạo tài sản' }).click();
    await page.locator('.field').filter({ hasText: 'Tên tài sản' }).locator('input').fill('May scan hoa don');
    await page.getByRole('button', { name: 'Xác nhận' }).click();

    await expect(page.getByText('Tạo tài sản thành công.')).toBeVisible();

    await page.locator('tbody input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: 'Bulk Actions' }).click();
    await expect(page.getByRole('button', { name: 'Chuyển vòng đời' })).toBeVisible();
  });

  test('projects board supports create project flow', async ({ page }) => {
    await page.goto('/modules/projects');
    await expect(page.locator('article.module-workbench > header.module-header h1', { hasText: 'Dự án' })).toBeVisible();

    await page.getByRole('button', { name: 'Tạo dự án' }).click();
    await page.locator('.field').filter({ hasText: 'Tên dự án' }).locator('input').fill('Du an Wave 1');
    await page.getByRole('button', { name: 'Xác nhận' }).click();

    await expect(page.getByText('Tạo dự án thành công.')).toBeVisible();
  });

  test('reports board supports create definition and run-now bulk action', async ({ page }) => {
    await page.goto('/modules/reports');
    await expect(page.locator('article.module-workbench > header.module-header h1', { hasText: 'Báo cáo' })).toBeVisible();

    await page.getByRole('button', { name: 'Mẫu báo cáo' }).click();
    await page.getByRole('button', { name: 'Lưu mẫu báo cáo' }).click();
    await page.locator('.field').filter({ hasText: 'Tên báo cáo' }).locator('input').fill('Bao cao ngay');
    await page.getByRole('button', { name: 'Xác nhận' }).click();

    await expect(page.getByText('Lưu mẫu báo cáo thành công.')).toBeVisible();

    await page.locator('tbody input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: 'Bulk Actions' }).click();
    await expect(page.getByRole('button', { name: 'Chạy báo cáo ngay' })).toBeVisible();
  });

  test('notifications board supports create flow and mark-read bulk action', async ({ page }) => {
    await page.goto('/modules/notifications');
    await expect(page.locator('article.module-workbench > header.module-header h1', { hasText: 'Thông báo' })).toBeVisible();

    await page.getByRole('button', { name: 'Tạo thông báo' }).click();
    await page.locator('.field').filter({ hasText: 'Tiêu đề' }).locator('input').fill('Thong bao wave 1');
    await page.locator('.field').filter({ hasText: 'Nội dung' }).locator('textarea').fill('Noi dung thong bao');
    await page.getByRole('button', { name: 'Xác nhận' }).click();

    await expect(page.getByText('Tạo thông báo thành công.')).toBeVisible();

    await page.locator('tbody input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: 'Bulk Actions' }).click();
    await expect(page.getByRole('button', { name: 'Đánh dấu đã đọc' })).toBeVisible();
  });
});
