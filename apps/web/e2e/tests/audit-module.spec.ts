import { expect, test, type Route } from '@playwright/test';

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

test.describe('Audit module', () => {
  test('loads object history via deep-link from sales detail', async ({ page }) => {
    let objectHistoryRequestCount = 0;

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
          enabledModules: ['crm', 'sales', 'catalog', 'hr', 'finance', 'scm', 'assets', 'projects', 'workflows', 'reports', 'audit', 'notifications'],
          locale: {
            timezone: 'Asia/Ho_Chi_Minh',
            currency: 'VND',
            numberFormat: 'vi-VN',
            dateFormat: 'DD/MM/YYYY'
          }
        });
      }

      if (method === 'GET' && path === '/api/v1/sales/orders') {
        return json(route, {
          items: [
            {
              id: 'order_audit_1',
              orderNo: 'SO-AUD-001',
              customerName: 'Khach Audit',
              totalAmount: 500000,
              status: 'APPROVED',
              createdBy: 'manager_1',
              createdAt: '2026-03-31T08:00:00.000Z',
              items: [
                {
                  id: 'item_1',
                  productName: 'Combo Audit',
                  quantity: 1,
                  unitPrice: 500000
                }
              ],
              invoices: []
            }
          ]
        });
      }

      if (method === 'GET' && path === '/api/v1/sales/approvals') {
        return json(route, []);
      }

      if (method === 'GET' && path === '/api/v1/audit/actions') {
        return json(route, {
          items: [
            { action: 'APPROVE_ORDER', count: 1 },
            { action: 'CREATE_ORDER', count: 2 }
          ]
        });
      }

      if (method === 'GET' && path === '/api/v1/audit/objects/Order/order_audit_1/history') {
        objectHistoryRequestCount += 1;
        return json(route, {
          items: [
            {
              id: 'log_1',
              module: 'sales',
              entityType: 'Order',
              entityId: 'order_audit_1',
              action: 'APPROVE_ORDER',
              operationType: 'WRITE',
              actorId: 'manager_1',
              actorRole: 'MANAGER',
              requestId: 'req_audit_1',
              route: '/api/v1/sales/orders/order_audit_1/approve',
              method: 'POST',
              statusCode: 201,
              ip: '127.0.0.1',
              userAgent: 'playwright',
              beforeData: { status: 'PENDING' },
              afterData: { status: 'APPROVED' },
              changedFields: ['status'],
              metadata: {},
              prevHash: 'prev_hash',
              hash: 'hash_1',
              createdAt: '2026-03-31T08:15:00.000Z'
            }
          ],
          pageInfo: {
            limit: 100,
            hasMore: false,
            tier: 'hot',
            accessScope: 'branch'
          }
        });
      }

      return json(route, { items: [] });
    });

    await page.goto('/modules/sales');
    await page.getByText('SO-AUD-001').first().click();

    const auditLink = page.getByRole('link', { name: /Xem audit log/i });
    await expect(auditLink).toBeVisible();
    await expect(auditLink).toHaveAttribute('href', /\/modules\/audit\?entityType=Order&entityId=order_audit_1/);

    await auditLink.click();
    await expect(page.getByRole('heading', { name: 'Nhật ký hệ thống' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'APPROVE_ORDER' })).toBeVisible();
    await expect(page.getByText(/Phạm vi xem audit hiện tại:/)).toBeVisible();
    expect(objectHistoryRequestCount).toBeGreaterThan(0);
  });

  test('shows friendly error when blocked by audit manager policy', async ({ page }) => {
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
          enabledModules: ['crm', 'sales', 'catalog', 'hr', 'finance', 'scm', 'assets', 'projects', 'workflows', 'reports', 'audit', 'notifications'],
          locale: {
            timezone: 'Asia/Ho_Chi_Minh',
            currency: 'VND',
            numberFormat: 'vi-VN',
            dateFormat: 'DD/MM/YYYY'
          }
        });
      }

      if (method === 'GET' && (path === '/api/v1/audit/actions' || path === '/api/v1/audit/logs')) {
        return json(route, {
          message: 'Nhóm quản lý hiện tại không được bật quyền xem audit log.'
        }, 403);
      }

      return json(route, { items: [] });
    });

    await page.goto('/modules/audit');
    await expect(page.getByRole('heading', { name: 'Nhật ký hệ thống' })).toBeVisible();
    await expect(
      page.getByText('Bạn chưa được cấp quyền xem audit theo ma trận ủy quyền hiện tại. Vui lòng liên hệ Admin để được cấu hình nhóm quản lý.')
    ).toBeVisible();
  });

  test('supports read-only bulk utilities (copy/export) on audit main table', async ({ page }) => {
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
          enabledModules: ['audit', 'reports'],
          locale: {
            timezone: 'Asia/Ho_Chi_Minh',
            currency: 'VND',
            numberFormat: 'vi-VN',
            dateFormat: 'DD/MM/YYYY'
          }
        });
      }

      if (method === 'GET' && path === '/api/v1/audit/actions') {
        return json(route, {
          items: [{ action: 'APPROVE_ORDER', count: 1 }]
        });
      }

      if (method === 'GET' && path === '/api/v1/audit/logs') {
        return json(route, {
          items: [
            {
              id: 'log_bulk_1',
              module: 'sales',
              entityType: 'Order',
              entityId: 'order_1',
              action: 'APPROVE_ORDER',
              operationType: 'WRITE',
              actorId: 'manager_1',
              actorRole: 'MANAGER',
              requestId: 'req_bulk_1',
              route: '/api/v1/sales/orders/order_1/approve',
              method: 'POST',
              statusCode: 201,
              ip: '127.0.0.1',
              userAgent: 'playwright',
              beforeData: { status: 'PENDING' },
              afterData: { status: 'APPROVED' },
              changedFields: ['status'],
              metadata: {},
              prevHash: 'prev_hash',
              hash: 'hash_bulk_1',
              createdAt: '2026-03-31T08:15:00.000Z',
              dataTier: 'hot'
            }
          ],
          pageInfo: {
            limit: 100,
            hasMore: false,
            tier: 'hot',
            accessScope: 'branch'
          }
        });
      }

      return json(route, { items: [] });
    });

    await page.goto('/modules/audit');
    await expect(page.getByRole('cell', { name: 'APPROVE_ORDER' })).toBeVisible();

    await page.getByRole('checkbox', { name: 'Chọn tất cả dữ liệu đang tải' }).check();
    await page.getByRole('button', { name: 'Bulk Actions' }).click();
    const bulkModal = page.locator('dialog.modal-dialog').last();
    await expect(bulkModal).toBeVisible();
    await expect(bulkModal.getByText('Đã chọn 1 / 1 dòng đang tải')).toBeVisible();

    await bulkModal.getByRole('button', { name: 'Copy IDs' }).click();

    const downloadPromise = page.waitForEvent('download');
    await bulkModal.getByRole('button', { name: 'Export CSV' }).click();
    await downloadPromise;

    await bulkModal.getByRole('button', { name: 'Clear selection' }).click();
    await expect(bulkModal.getByText('Đã chọn 0 / 1 dòng đang tải')).toBeVisible();
    await bulkModal.getByRole('button', { name: 'Đóng' }).click();
    await expect(bulkModal).toBeHidden();
  });
});
