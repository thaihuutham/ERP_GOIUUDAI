import { expect, test, type Page, type Request, type Route } from '@playwright/test';

type AccountState = {
  id: string;
  accountType: 'PERSONAL' | 'OA';
  displayName: string;
  zaloUid: string;
  ownerUserId?: string;
  phone?: string;
  status: string;
  currentPermissionLevel: 'ADMIN' | 'CHAT' | 'READ';
};

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

async function mockAccountsApis(
  page: Page,
  accounts: AccountState[],
  options?: {
    allowCreateForStaff?: boolean;
  }
) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const role = String(request.headers()['x-erp-dev-role'] ?? 'ADMIN').trim().toUpperCase();

    if (method === 'GET' && path === '/api/v1/settings/runtime') {
      return json(route, {
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
          'notifications'
        ]
      });
    }

    if (method === 'GET' && path === '/api/v1/settings/permissions/effective') {
      if (role === 'USER' && options?.allowCreateForStaff) {
        return json(route, {
          effective: [
            {
              moduleKey: 'crm',
              actions: {
                CREATE: 'ALLOW'
              }
            }
          ]
        });
      }
      return json(route, { effective: [] });
    }

    if (method === 'GET' && path === '/api/v1/settings/iam/users') {
      return json(route, {
        items: [
          {
            id: 'dev_admin',
            email: 'admin@example.com',
            role: 'ADMIN',
            employee: { fullName: 'Admin ERP' }
          },
          {
            id: 'dev_manager',
            email: 'manager@example.com',
            role: 'USER',
            employee: { fullName: 'Manager ERP' }
          }
        ],
        nextCursor: null,
        limit: 300
      });
    }

    if (method === 'GET' && path === '/api/v1/zalo/accounts') {
      return json(route, accounts);
    }

    if (method === 'POST' && path === '/api/v1/zalo/accounts') {
      const body = (request.postDataJSON() as Record<string, unknown> | null) ?? {};
      const created: AccountState = {
        id: `created_${accounts.length + 1}`,
        accountType: String(body.accountType ?? 'PERSONAL').toUpperCase() === 'OA' ? 'OA' : 'PERSONAL',
        displayName: String(body.displayName ?? 'Tài khoản mới'),
        zaloUid: '',
        phone: String(body.phone ?? ''),
        ownerUserId: String(body.ownerUserId ?? ''),
        status: 'DISCONNECTED',
        currentPermissionLevel: 'ADMIN'
      };
      accounts.unshift(created);
      return json(route, created, 201);
    }

    const updateMatch = path.match(/^\/api\/v1\/zalo\/accounts\/([^/]+)$/);
    if (updateMatch && method === 'PATCH') {
      const accountId = decodeURIComponent(updateMatch[1] ?? '');
      const body = (request.postDataJSON() as Record<string, unknown> | null) ?? {};
      const found = accounts.find((item) => item.id === accountId);
      if (!found) {
        return json(route, { message: 'Not found' }, 404);
      }
      if (body.displayName !== undefined) {
        found.displayName = String(body.displayName ?? '').trim();
      }
      return json(route, found);
    }

    const assignmentMatch = path.match(/^\/api\/v1\/zalo\/accounts\/([^/]+)\/assignments/);
    if (assignmentMatch && method === 'GET') {
      return json(route, []);
    }
    if (assignmentMatch && (method === 'PUT' || method === 'DELETE')) {
      return json(route, { success: true });
    }

    const personalLoginMatch = path.match(/^\/api\/v1\/zalo\/accounts\/([^/]+)\/personal\/login$/);
    if (personalLoginMatch && method === 'POST') {
      return json(route, {
        message: 'Đã khởi tạo đăng nhập QR cho Zalo cá nhân.',
        accountId: personalLoginMatch[1]
      }, 201);
    }

    const personalReconnectMatch = path.match(/^\/api\/v1\/zalo\/accounts\/([^/]+)\/personal\/reconnect$/);
    if (personalReconnectMatch && method === 'POST') {
      return json(route, {
        message: 'Đã khởi tạo reconnect cho Zalo cá nhân.',
        accountId: personalReconnectMatch[1]
      }, 201);
    }

    const personalDisconnectMatch = path.match(/^\/api\/v1\/zalo\/accounts\/([^/]+)\/personal\/disconnect$/);
    if (personalDisconnectMatch && method === 'POST') {
      const accountId = decodeURIComponent(personalDisconnectMatch[1] ?? '');
      const found = accounts.find((item) => item.id === accountId);
      if (found) {
        found.status = 'DISCONNECTED';
      }
      return json(route, {
        message: 'Đã ngắt kết nối tài khoản Zalo cá nhân.',
        accountId
      }, 201);
    }

    const personalQrMatch = path.match(/^\/api\/v1\/zalo\/accounts\/([^/]+)\/personal\/qr$/);
    if (personalQrMatch && method === 'GET') {
      return json(route, {
        accountId: personalQrMatch[1],
        status: 'QR_PENDING',
        qrImage:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII='
      });
    }

    const syncMatch = path.match(/^\/api\/v1\/zalo\/accounts\/([^/]+)\/sync-contacts$/);
    if (syncMatch && method === 'POST') {
      return json(route, {
        success: true,
        accountId: syncMatch[1],
        created: 2,
        updated: 1,
        skippedNoPhone: 3,
        skippedInvalidPhone: 1
      }, 201);
    }

    const deleteMatch = path.match(/^\/api\/v1\/zalo\/accounts\/([^/]+)$/);
    if (deleteMatch && method === 'DELETE') {
      const accountId = decodeURIComponent(deleteMatch[1] ?? '');
      const found = accounts.find((item) => item.id === accountId);
      if (found) {
        found.status = 'INACTIVE';
      }
      return json(route, {
        success: true,
        account: found ?? null
      });
    }

    return json(route, { message: `Unmocked route: ${method} ${path}` }, 404);
  });
}

function rowByAccount(page: Page, name: string) {
  return page.getByRole('row', { name: new RegExp(name) });
}

test.describe('Zalo Automation Accounts actions', () => {
  test('supports login QR, reconnect, sync contacts and soft delete', async ({ page }) => {
    const accounts: AccountState[] = [
      {
        id: 'personal_account_1',
        accountType: 'PERSONAL',
        displayName: 'Zalo Personal 01',
        zaloUid: 'uid_personal_01',
        phone: '0909000111',
        status: 'CONNECTED',
        currentPermissionLevel: 'ADMIN'
      },
      {
        id: 'oa_account_1',
        accountType: 'OA',
        displayName: 'OA Retail 01',
        zaloUid: 'uid_oa_01',
        status: 'CONNECTED',
        currentPermissionLevel: 'ADMIN'
      }
    ];

    await page.addInitScript(() => {
      window.localStorage.setItem('erp_web_role', 'ADMIN');
      window.localStorage.setItem('erp_web_user_id', 'dev_admin');
    });

    await mockAccountsApis(page, accounts);
    await page.goto('/modules/zalo-automation/accounts');

    await expect(page.getByTestId('zalo-automation-accounts-workbench')).toBeVisible();
    await expect(rowByAccount(page, 'Zalo Personal 01')).toBeVisible();

    const personalRow = rowByAccount(page, 'Zalo Personal 01');

    await personalRow.getByRole('button', { name: 'Login QR' }).click();
    await expect(page.getByRole('heading', { name: 'Đăng nhập QR tài khoản Zalo' })).toBeVisible();
    await expect(page.getByText('Trạng thái: QR_PENDING')).toBeVisible();
    await expect(page.locator('.zalo-qr-image')).toBeVisible();
    await expect(page.locator('.zalo-qr-image')).toHaveAttribute('src', /^data:image\/png;base64,/);
    await page.locator('.modal-dialog .modal-footer').getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByRole('heading', { name: 'Đăng nhập QR tài khoản Zalo' })).toHaveCount(0);

    await personalRow.getByRole('button', { name: 'Reconnect' }).click();
    await expect(page.getByText('Đã khởi tạo reconnect.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Đăng nhập QR tài khoản Zalo' })).toBeVisible();
    await page.locator('.modal-dialog .modal-footer').getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByRole('heading', { name: 'Đăng nhập QR tài khoản Zalo' })).toHaveCount(0);

    await personalRow.getByRole('button', { name: 'Sync danh bạ' }).click();
    await expect(page.getByText(/Sync danh bạ hoàn tất: tạo mới 2, cập nhật 1/)).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await personalRow.getByRole('button', { name: 'Xóa mềm' }).click();
    await expect(page.getByText(/Đã xóa mềm tài khoản Zalo Personal 01/)).toBeVisible();
    await expect(rowByAccount(page, 'Zalo Personal 01').getByText('INACTIVE')).toBeVisible();
  });

  test('moves create account flow into modal with required fields and admin owner selector', async ({ page }) => {
    const accounts: AccountState[] = [
      {
        id: 'oa_account_existing_1',
        accountType: 'OA',
        displayName: 'OA Existing',
        zaloUid: 'uid_oa_existing',
        phone: '0909000001',
        ownerUserId: 'dev_admin',
        status: 'CONNECTED',
        currentPermissionLevel: 'ADMIN'
      }
    ];

    await page.addInitScript(() => {
      window.localStorage.setItem('erp_web_role', 'ADMIN');
    });
    await mockAccountsApis(page, accounts);
    await page.goto('/modules/zalo-automation/accounts');

    await page.getByTestId('zalo-open-create-account-modal').click();
    await expect(page.getByRole('heading', { name: 'Tạo tài khoản Zalo mới' })).toBeVisible();
    await expect(page.getByLabel('Zalo UID')).toHaveCount(0);
    const createModal = page.locator('.modal-dialog');

    await createModal.getByLabel('Loại tài khoản').selectOption('OA');
    await createModal.getByLabel('Tên hiển thị').fill('OA mới từ modal');
    await createModal.getByLabel('Số điện thoại').fill('0912345678');
    await createModal.getByLabel('Chủ sở hữu').selectOption('dev_manager');

    const createRequestPromise = page.waitForRequest((req) => {
      const reqUrl = new URL(req.url());
      return req.method() === 'POST' && reqUrl.pathname === '/api/v1/zalo/accounts';
    });
    await page.locator('.modal-dialog').getByRole('button', { name: 'Tạo tài khoản' }).click();
    const createRequest = await createRequestPromise;

    const payload = (createRequest.postDataJSON() as Record<string, unknown> | null) ?? {};
    expect(payload.accountType).toBe('OA');
    expect(payload.displayName).toBe('OA mới từ modal');
    expect(payload.phone).toBe('0912345678');
    expect(payload.ownerUserId).toBe('dev_manager');
    expect(payload).not.toHaveProperty('zaloUid');

    await expect(page.getByText('Đã tạo tài khoản Zalo mới.')).toBeVisible();
    await expect(rowByAccount(page, 'OA mới từ modal')).toBeVisible();
  });

  test('hides owner selector for non-admin and does not send ownerUserId in create payload', async ({ page }) => {
    const accounts: AccountState[] = [
      {
        id: 'personal_existing_1',
        accountType: 'PERSONAL',
        displayName: 'Personal Existing',
        zaloUid: 'uid_existing_1',
        phone: '0909123123',
        status: 'CONNECTED',
        currentPermissionLevel: 'CHAT'
      }
    ];

    await page.addInitScript(() => {
      window.localStorage.setItem('erp_web_role', 'USER');
    });
    await mockAccountsApis(page, accounts, { allowCreateForStaff: true });
    await page.goto('/modules/zalo-automation/accounts');

    await page.getByTestId('zalo-open-create-account-modal').click();
    await expect(page.getByRole('heading', { name: 'Tạo tài khoản Zalo mới' })).toBeVisible();
    await expect(page.getByLabel('Chủ sở hữu')).toHaveCount(0);
    const createModal = page.locator('.modal-dialog');

    await createModal.getByLabel('Loại tài khoản').selectOption('PERSONAL');
    await createModal.getByLabel('Tên hiển thị').fill('Personal staff tạo');
    await createModal.getByLabel('Số điện thoại').fill('0988111222');

    const createRequestPromise = page.waitForRequest((req) => {
      const reqUrl = new URL(req.url());
      return req.method() === 'POST' && reqUrl.pathname === '/api/v1/zalo/accounts';
    });
    await page.locator('.modal-dialog').getByRole('button', { name: 'Tạo tài khoản' }).click();
    const createRequest = await createRequestPromise;
    const payload = (createRequest.postDataJSON() as Record<string, unknown> | null) ?? {};

    expect(payload.displayName).toBe('Personal staff tạo');
    expect(payload.phone).toBe('0988111222');
    expect(payload).not.toHaveProperty('ownerUserId');
    expect(payload).not.toHaveProperty('zaloUid');
  });

  test('allows editing display name in ERP without changing zalo uid', async ({ page }) => {
    const accounts: AccountState[] = [
      {
        id: 'personal_rename_1',
        accountType: 'PERSONAL',
        displayName: 'Tên cũ ERP',
        zaloUid: 'uid_personal_keep',
        phone: '0909000999',
        status: 'CONNECTED',
        currentPermissionLevel: 'ADMIN'
      }
    ];

    await page.addInitScript(() => {
      window.localStorage.setItem('erp_web_role', 'ADMIN');
    });
    await mockAccountsApis(page, accounts);
    await page.goto('/modules/zalo-automation/accounts');

    await expect(rowByAccount(page, 'Tên cũ ERP')).toBeVisible();
    await rowByAccount(page, 'Tên cũ ERP').getByRole('button', { name: 'Sửa tên hiển thị' }).click();
    await expect(page.getByRole('heading', { name: 'Sửa tên hiển thị tài khoản' })).toBeVisible();
    await expect(page.getByText(/không đổi tên trên nick Zalo thật/i)).toBeVisible();

    await page.getByLabel('Tên hiển thị trong ERP').fill('Tên mới ERP');

    const patchRequestPromise = page.waitForRequest((req) => {
      const reqUrl = new URL(req.url());
      return req.method() === 'PATCH' && reqUrl.pathname === '/api/v1/zalo/accounts/personal_rename_1';
    });
    await page.getByTestId('zalo-save-display-name').click();
    const patchRequest = await patchRequestPromise;
    const payload = (patchRequest.postDataJSON() as Record<string, unknown> | null) ?? {};

    expect(payload.displayName).toBe('Tên mới ERP');
    await expect(page.getByText('Đã cập nhật tên hiển thị tài khoản Zalo trong ERP.')).toBeVisible();
    await expect(rowByAccount(page, 'Tên mới ERP')).toBeVisible();
    await expect(rowByAccount(page, 'Tên mới ERP')).toContainText('uid_personal_keep');
  });
});
