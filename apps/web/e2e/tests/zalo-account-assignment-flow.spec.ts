import { expect, test, type Request, type Route, type Page } from '@playwright/test';

type PermissionLevel = 'READ' | 'CHAT' | 'ADMIN';

type MockState = {
  assignments: Record<string, Record<string, PermissionLevel>>;
};

type AccountRow = {
  id: string;
  accountType: 'OA';
  displayName: string;
  status: string;
};

type ThreadRow = {
  id: string;
  channel: 'ZALO_OA';
  channelAccountId: string;
  externalThreadId: string;
  customerDisplayName: string;
  unreadCount: number;
  lastMessageAt: string;
  evaluations: [];
};

const ACCOUNTS: AccountRow[] = [
  {
    id: 'oa_account_1',
    accountType: 'OA',
    displayName: 'OA Retail 1',
    status: 'CONNECTED'
  },
  {
    id: 'oa_account_2',
    accountType: 'OA',
    displayName: 'OA Retail 2',
    status: 'CONNECTED'
  }
];

const THREADS: ThreadRow[] = [
  {
    id: 'thread_oa_1',
    channel: 'ZALO_OA',
    channelAccountId: 'oa_account_1',
    externalThreadId: 'oa_thread_001',
    customerDisplayName: 'Khách A',
    unreadCount: 1,
    lastMessageAt: '2026-04-05T08:00:00.000Z',
    evaluations: []
  },
  {
    id: 'thread_oa_2',
    channel: 'ZALO_OA',
    channelAccountId: 'oa_account_2',
    externalThreadId: 'oa_thread_002',
    customerDisplayName: 'Khách B',
    unreadCount: 2,
    lastMessageAt: '2026-04-05T08:05:00.000Z',
    evaluations: []
  }
];

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

function readRole(request: Request) {
  return String(request.headers()['x-erp-dev-role'] ?? 'ADMIN').trim().toUpperCase();
}

function readUserId(request: Request) {
  return String(request.headers()['x-erp-dev-user-id'] ?? '').trim();
}

function getAccessibleAccountIds(role: string, userId: string, state: MockState) {
  if (role === 'ADMIN' || role === 'MANAGER') {
    return ACCOUNTS.map((account) => account.id);
  }

  return ACCOUNTS
    .map((account) => account.id)
    .filter((accountId) => Boolean(state.assignments[accountId]?.[userId]));
}

async function mockZaloAssignmentApis(page: Page, state: MockState) {
  await page.context().route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const role = readRole(request);
    const userId = readUserId(request) || `dev_${role.toLowerCase()}`;

    if (method === 'GET' && path === '/api/v1/settings/runtime') {
      return json(route, {
        enabledModules: ['crm', 'sales', 'catalog', 'hr', 'finance', 'scm', 'assets', 'projects', 'workflows', 'reports', 'assistant', 'audit', 'notifications']
      });
    }

    if (method === 'GET' && path === '/api/v1/settings/permissions/effective') {
      if (role === 'STAFF') {
        return json(route, {
          effective: [
            {
              moduleKey: 'crm',
              actions: {
                CREATE: 'ALLOW',
                UPDATE: 'ALLOW'
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
            id: 'dev_staff',
            email: 'staff@example.com',
            role: 'STAFF',
            employee: { fullName: 'Nhân viên CSKH' }
          }
        ],
        nextCursor: null,
        limit: 300
      });
    }

    if (method === 'GET' && path === '/api/v1/zalo/accounts') {
      const accessibleAccountIds = getAccessibleAccountIds(role, userId, state);
      const rows = ACCOUNTS
        .filter((account) => role === 'ADMIN' || role === 'MANAGER' || accessibleAccountIds.includes(account.id))
        .map((account) => ({
          ...account,
          currentPermissionLevel:
            role === 'ADMIN' || role === 'MANAGER'
              ? 'ADMIN'
              : state.assignments[account.id]?.[userId] ?? null
        }));
      return json(route, rows);
    }

    const assignmentMatch = path.match(/^\/api\/v1\/zalo\/accounts\/([^/]+)\/assignments(?:\/([^/]+))?$/);
    if (assignmentMatch && method === 'GET') {
      if (role !== 'ADMIN') {
        return json(route, { message: 'Chỉ ADMIN mới được xem phân quyền.' }, 403);
      }

      const accountId = decodeURIComponent(assignmentMatch[1] ?? '');
      const rows = Object.entries(state.assignments[accountId] ?? {}).map(([targetUserId, permissionLevel], index) => ({
        id: `${accountId}_${targetUserId}`,
        zaloAccountId: accountId,
        userId: targetUserId,
        permissionLevel,
        assignedBy: 'dev_admin',
        assignedAt: `2026-04-05T09:0${index}:00.000Z`
      }));
      return json(route, rows);
    }

    if (assignmentMatch && method === 'PUT') {
      if (role !== 'ADMIN') {
        return json(route, { message: 'Chỉ ADMIN mới được phân quyền.' }, 403);
      }

      const accountId = decodeURIComponent(assignmentMatch[1] ?? '');
      const targetUserId = decodeURIComponent(assignmentMatch[2] ?? '');
      const body = (request.postDataJSON() as Record<string, unknown> | null) ?? {};
      const permissionLevel = String(body.permissionLevel ?? 'READ').trim().toUpperCase();
      const normalizedPermission: PermissionLevel =
        permissionLevel === 'ADMIN' ? 'ADMIN' : permissionLevel === 'CHAT' ? 'CHAT' : 'READ';

      state.assignments[accountId] = state.assignments[accountId] ?? {};
      state.assignments[accountId][targetUserId] = normalizedPermission;

      return json(route, {
        id: `${accountId}_${targetUserId}`,
        zaloAccountId: accountId,
        userId: targetUserId,
        permissionLevel: normalizedPermission,
        assignedBy: 'dev_admin',
        assignedAt: '2026-04-05T09:10:00.000Z'
      });
    }

    if (assignmentMatch && method === 'DELETE') {
      if (role !== 'ADMIN') {
        return json(route, { message: 'Chỉ ADMIN mới được thu hồi phân quyền.' }, 403);
      }

      const accountId = decodeURIComponent(assignmentMatch[1] ?? '');
      const targetUserId = decodeURIComponent(assignmentMatch[2] ?? '');
      const existed = Boolean(state.assignments[accountId]?.[targetUserId]);
      if (state.assignments[accountId]) {
        delete state.assignments[accountId][targetUserId];
      }
      return json(route, { success: true, revokedCount: existed ? 1 : 0 });
    }

    if (method === 'GET' && path === '/api/v1/conversations/threads') {
      const accessibleAccountIds = getAccessibleAccountIds(role, userId, state);
      const items = THREADS.filter(
        (thread) => role === 'ADMIN' || role === 'MANAGER' || accessibleAccountIds.includes(thread.channelAccountId)
      );
      return json(route, {
        items,
        nextCursor: null,
        limit: 50
      });
    }

    if (method === 'GET' && /^\/api\/v1\/conversations\/threads\/[^/]+\/messages$/.test(path)) {
      const threadId = path.split('/')[5] ?? '';
      return json(route, {
        items: [
          {
            id: `${threadId}_msg_1`,
            senderType: 'CUSTOMER',
            senderName: 'Khách hàng',
            content: `Nội dung test ${threadId}`,
            contentType: 'TEXT',
            sentAt: '2026-04-05T08:10:00.000Z'
          }
        ],
        nextCursor: null,
        limit: 120
      });
    }

    if (method === 'GET' && /^\/api\/v1\/conversations\/threads\/[^/]+\/evaluation\/latest$/.test(path)) {
      return json(route, {
        evaluation: null
      });
    }

    if (method === 'POST' && /^\/api\/v1\/zalo\/accounts\/[^/]+\/oa\/messages\/send$/.test(path)) {
      return json(route, {
        success: true,
        messageId: 'oa_outbound_1'
      }, 201);
    }

    if (method === 'GET' && path === '/api/v1/conversation-quality/jobs') {
      return json(route, []);
    }

    if (method === 'GET' && path === '/api/v1/conversation-quality/runs') {
      return json(route, []);
    }

    if (method === 'GET' && /^\/api\/v1\/conversation-quality\/runs\//.test(path)) {
      return json(route, {
        id: path.split('/')[5],
        status: 'SUCCESS',
        summaryJson: {}
      });
    }

    return json(route, { ok: true });
  });
}

test.describe('Zalo account assignment flow', () => {
  test('admin gán account cho staff, staff chỉ thấy inbox được gán và không gửi khi READ', async ({ page }) => {
    const state: MockState = {
      assignments: {
        oa_account_1: {},
        oa_account_2: {}
      }
    };

    await page.addInitScript(() => {
      window.localStorage.setItem('erp_web_role', 'ADMIN');
    });

    await mockZaloAssignmentApis(page, state);

    await page.goto('/modules/zalo-automation/accounts');

    await expect(page.getByTestId('zalo-automation-accounts-workbench')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'OA Retail 1' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'OA Retail 2' }).first()).toBeVisible();

    await page.getByRole('row', { name: /OA Retail 1/ }).getByRole('button', { name: 'Phân quyền' }).click();
    await expect(page.getByRole('heading', { name: 'Phân quyền tài khoản Zalo' })).toBeVisible();
    await page.getByLabel('Nhân sự').selectOption('dev_staff');
    await page.getByLabel('Mức quyền').selectOption('READ');
    await page.getByTestId('zalo-assignment-save').click();

    await expect(page.getByText('Đã cập nhật phân quyền tài khoản Zalo.')).toBeVisible();
    await expect(page.getByRole('cell', { name: /Nhân viên CSKH/ })).toBeVisible();

    const staffPage = await page.context().newPage();
    await staffPage.addInitScript(() => {
      window.localStorage.setItem('erp_web_role', 'STAFF');
    });
    await staffPage.goto('/modules/zalo-automation/messages');

    await expect(staffPage.getByTestId('zalo-automation-messages-workbench')).toBeVisible();
    await expect(staffPage.getByRole('button', { name: /Khách A/ }).first()).toBeVisible();
    await expect(staffPage.getByText('Khách B')).toHaveCount(0);
    await expect(staffPage.getByText(/Quyền hiện tại:\s*READ/i)).toBeVisible();
    await expect(staffPage.getByTestId('zalo-message-send-button')).toBeDisabled();
  });
});
