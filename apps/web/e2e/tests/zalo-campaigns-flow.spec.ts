import { expect, test, type Page, type Route } from '@playwright/test';

type CampaignStatus = 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELED';

type CampaignRow = {
  id: string;
  code: string;
  name: string;
  status: CampaignStatus;
  timezone: string;
  selectionPolicy: 'PRIORITIZE_RECENT_INTERACTION' | 'AVOID_PREVIOUSLY_INTERACTED_ACCOUNT';
  delayMinSeconds: number;
  delayMaxSeconds: number;
  maxConsecutiveErrors: number;
  maxRecipients: number | null;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats: {
    pending: number;
    inProgress: number;
    sent: number;
    skipped: number;
    failed: number;
  };
  accounts: Array<{
    id: string;
    campaignId: string;
    zaloAccountId: string;
    templateContent: string;
    quota: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    consecutiveErrorCount: number;
    status: 'READY' | 'PAUSED_ERROR' | 'DONE' | 'DISABLED';
    nextSendAt: string | null;
    lastSentAt: string | null;
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
    createdAt: string;
    updatedAt: string;
    zaloAccount: {
      id: string;
      displayName: string;
      status: string;
    };
  }>;
  operators: Array<{
    id: string;
    userId: string;
    assignedBy: string | null;
    assignedAt: string;
    revokedAt: string | null;
  }>;
};

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

async function mockCampaignApis(page: Page) {
  const accounts = [
    {
      id: 'zalo_personal_1',
      accountType: 'PERSONAL',
      displayName: 'Nick CSKH 01',
      zaloUid: 'uid_01',
      status: 'CONNECTED',
    },
    {
      id: 'zalo_personal_2',
      accountType: 'PERSONAL',
      displayName: 'Nick CSKH 02',
      zaloUid: 'uid_02',
      status: 'CONNECTED',
    },
  ];

  const users = [
    {
      id: 'admin_1',
      email: 'admin@local.erp',
      role: 'ADMIN',
      employee: { fullName: 'Admin ERP' },
    },
    {
      id: 'staff_1',
      email: 'staff@local.erp',
      role: 'USER',
      employee: { fullName: 'Staff ERP' },
    },
  ];

  const now = new Date('2026-04-06T08:00:00.000Z').toISOString();
  const campaigns: CampaignRow[] = [
    {
      id: 'campaign_draft_1',
      code: 'DRAFT_DEL_01',
      name: 'Draft Delete Me',
      status: 'DRAFT',
      timezone: 'Asia/Ho_Chi_Minh',
      selectionPolicy: 'PRIORITIZE_RECENT_INTERACTION',
      delayMinSeconds: 180,
      delayMaxSeconds: 300,
      maxConsecutiveErrors: 3,
      maxRecipients: null,
      startedAt: null,
      pausedAt: null,
      completedAt: null,
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
      stats: { pending: 0, inProgress: 0, sent: 0, skipped: 0, failed: 0 },
      accounts: [
        {
          id: 'campaign_acc_1',
          campaignId: 'campaign_draft_1',
          zaloAccountId: 'zalo_personal_1',
          templateContent: 'Xin chào {{ten_khach}}',
          quota: 20,
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
          consecutiveErrorCount: 0,
          status: 'READY',
          nextSendAt: null,
          lastSentAt: null,
          lastErrorAt: null,
          lastErrorMessage: null,
          createdAt: now,
          updatedAt: now,
          zaloAccount: {
            id: 'zalo_personal_1',
            displayName: 'Nick CSKH 01',
            status: 'CONNECTED',
          },
        },
      ],
      operators: [],
    },
  ];

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'GET' && path === '/api/v1/settings/runtime') {
      return json(route, {
        organization: { companyName: 'ERP Demo' },
        locale: { timezone: 'Asia/Ho_Chi_Minh', numberFormat: 'vi-VN', currency: 'VND' },
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
          'assistant',
          'reports',
          'audit',
          'notifications',
        ],
      });
    }

    if (method === 'GET' && path === '/api/v1/zalo/accounts') {
      return json(route, accounts);
    }

    if (method === 'GET' && path === '/api/v1/settings/iam/users') {
      return json(route, users);
    }

    if (method === 'GET' && path === '/api/v1/zalo/campaigns') {
      return json(route, campaigns);
    }

    if (method === 'POST' && path === '/api/v1/zalo/campaigns') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const payloadAccounts = Array.isArray(body.accounts) ? body.accounts : [];
      const createdAt = new Date().toISOString();
      const created: CampaignRow = {
        id: `campaign_${campaigns.length + 1}`,
        code: String(body.code ?? ''),
        name: String(body.name ?? 'Campaign mới'),
        status: 'DRAFT',
        timezone: 'Asia/Ho_Chi_Minh',
        selectionPolicy: String(body.selectionPolicy ?? 'PRIORITIZE_RECENT_INTERACTION') as CampaignRow['selectionPolicy'],
        delayMinSeconds: Number(body.delayMinSeconds ?? 180),
        delayMaxSeconds: Number(body.delayMaxSeconds ?? 300),
        maxConsecutiveErrors: Number(body.maxConsecutiveErrors ?? 3),
        maxRecipients: body.maxRecipients ? Number(body.maxRecipients) : null,
        startedAt: null,
        pausedAt: null,
        completedAt: null,
        canceledAt: null,
        createdAt,
        updatedAt: createdAt,
        stats: { pending: 0, inProgress: 0, sent: 0, skipped: 0, failed: 0 },
        accounts: payloadAccounts.map((item, index) => {
          const row = item as Record<string, unknown>;
          const zaloAccountId = String(row.zaloAccountId ?? '');
          const zaloAccount = accounts.find((account) => account.id === zaloAccountId);
          return {
            id: `campaign_account_created_${index + 1}`,
            campaignId: `campaign_${campaigns.length + 1}`,
            zaloAccountId,
            templateContent: String(row.templateContent ?? ''),
            quota: Number(row.quota ?? 20),
            sentCount: 0,
            failedCount: 0,
            skippedCount: 0,
            consecutiveErrorCount: 0,
            status: 'READY',
            nextSendAt: null,
            lastSentAt: null,
            lastErrorAt: null,
            lastErrorMessage: null,
            createdAt,
            updatedAt: createdAt,
            zaloAccount: {
              id: zaloAccountId,
              displayName: String(zaloAccount?.displayName ?? zaloAccountId),
              status: String(zaloAccount?.status ?? 'CONNECTED'),
            },
          };
        }),
        operators: [],
      };
      campaigns.unshift(created);
      return json(route, created, 201);
    }

    const campaignActionMatch = path.match(/^\/api\/v1\/zalo\/campaigns\/([^/]+)\/(start|pause|resume|cancel)$/);
    if (campaignActionMatch && method === 'POST') {
      const campaignId = campaignActionMatch[1];
      const action = campaignActionMatch[2];
      const found = campaigns.find((campaign) => campaign.id === campaignId);
      if (!found) {
        return json(route, { message: 'Not found' }, 404);
      }
      if (action === 'start') {
        found.status = 'RUNNING';
        found.startedAt = new Date().toISOString();
      } else if (action === 'pause') {
        found.status = 'PAUSED';
        found.pausedAt = new Date().toISOString();
      } else if (action === 'resume') {
        found.status = 'RUNNING';
        found.pausedAt = null;
      } else if (action === 'cancel') {
        found.status = 'CANCELED';
        found.canceledAt = new Date().toISOString();
      }
      found.updatedAt = new Date().toISOString();
      return json(route, found);
    }

    const campaignDeleteMatch = path.match(/^\/api\/v1\/zalo\/campaigns\/([^/]+)$/);
    if (campaignDeleteMatch && method === 'GET') {
      const campaignId = campaignDeleteMatch[1];
      const found = campaigns.find((campaign) => campaign.id === campaignId);
      if (!found) {
        return json(route, { message: 'Not found' }, 404);
      }
      return json(route, found);
    }

    if (campaignDeleteMatch && method === 'DELETE') {
      const campaignId = campaignDeleteMatch[1];
      const index = campaigns.findIndex((campaign) => campaign.id === campaignId);
      if (index < 0) {
        return json(route, { message: 'Not found' }, 404);
      }
      campaigns.splice(index, 1);
      return json(route, {
        success: true,
        campaignId,
      });
    }

    const recipientsMatch = path.match(/^\/api\/v1\/zalo\/campaigns\/([^/]+)\/recipients$/);
    if (recipientsMatch && method === 'GET') {
      return json(route, []);
    }

    const attemptsMatch = path.match(/^\/api\/v1\/zalo\/campaigns\/([^/]+)\/attempts$/);
    if (attemptsMatch && method === 'GET') {
      return json(route, []);
    }

    if (method === 'GET' && path === '/api/v1/reports/overview') {
      return json(route, {
        totalRevenue: 1000000,
        totalEmployees: 10,
        pendingInvoices: 1,
        activePurchaseOrders: 1,
      });
    }

    return json(route, { ok: true });
  });
}

test.describe('Zalo campaigns flow', () => {
  test('creates campaign and runs lifecycle actions', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('erp_web_role', 'ADMIN');
    });
    await mockCampaignApis(page);

    await page.goto('/modules/zalo-automation/campaigns');
    await expect(page.getByTestId('zalo-automation-campaigns-workbench')).toBeVisible();

    await page.getByTitle('Giải thích: Tên campaign').click();
    await expect(page.getByRole('heading', { name: 'Giải thích: Tên campaign' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();

    await page.getByPlaceholder('Ví dụ: Campaign Tư vấn tháng 4').fill('Campaign V1 Flow');
    await page.getByPlaceholder('OPTIONAL_CAMPAIGN_CODE').fill('FLOW_V1_001');
    await page.getByRole('checkbox').first().check();
    await page.locator('form').getByLabel('Chọn operator cho campaign').selectOption('staff_1');
    await page.locator('form').getByRole('button', { name: 'Thêm operator' }).click();
    await expect(page.locator('form .zalo-campaign-operator-chip')).toContainText(['Staff ERP']);
    await page.getByRole('button', { name: 'Tạo campaign' }).click();

    await expect(page.getByText('Đã tạo campaign mới thành công.')).toBeVisible();
    await expect(page.locator('strong', { hasText: 'Campaign V1 Flow' })).toBeVisible();
    await page.getByRole('link', { name: 'Campaign V1 Flow' }).click();
    await expect(page).toHaveURL(/\/modules\/zalo-automation\/campaigns\/campaign_2$/);

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('Đã thực hiện thao tác START cho campaign.')).toBeVisible();

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByText('Đã thực hiện thao tác PAUSE cho campaign.')).toBeVisible();

    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByText('Đã thực hiện thao tác RESUME cho campaign.')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Đã thực hiện thao tác CANCEL cho campaign.')).toBeVisible();
  });

  test('deletes draft campaign from workbench', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('erp_web_role', 'ADMIN');
    });
    await mockCampaignApis(page);
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/modules/zalo-automation/campaigns');
    await expect(page.getByTestId('zalo-automation-campaigns-workbench')).toBeVisible();
    await expect(page.locator('strong', { hasText: 'Draft Delete Me' })).toBeVisible();
    await page.getByRole('link', { name: 'Draft Delete Me' }).click();
    await expect(page).toHaveURL(/\/modules\/zalo-automation\/campaigns\/campaign_draft_1$/);

    await page.getByTestId('zalo-campaign-action-delete').click();
    await expect(page.getByText('Đã xóa campaign draft.')).toBeVisible();
    await expect(page.locator('strong', { hasText: 'Draft Delete Me' })).toHaveCount(0);
  });
});
