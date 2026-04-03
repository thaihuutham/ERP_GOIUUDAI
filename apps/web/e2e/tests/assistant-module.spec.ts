import { expect, test, type Page, type Route } from '@playwright/test';

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

function parseBody(route: Route): Record<string, unknown> {
  const raw = route.request().postData();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

type AssistantMockOptions = {
  runsStartsEmpty?: boolean;
  failRunsCreate?: boolean;
  delayRunsCreateMs?: number;
  runsCreateErrorStatus?: number;
};

async function mockAssistantApis(page: Page, options: AssistantMockOptions = {}) {
  const now = () => new Date().toISOString();

  let runSeq = 1;
  let sourceSeq = 1;
  let channelSeq = 2;
  let runsCreateCount = 0;

  const runs: Array<Record<string, any>> = options.runsStartsEmpty
    ? []
    : [
        {
          id: 'run_seed_1',
          runType: 'MANUAL',
          status: 'PENDING',
          requestedBy: 'manager_1',
          reportPacksJson: ['sales'],
          createdAt: '2026-04-01T02:00:00.000Z',
          updatedAt: '2026-04-01T02:00:00.000Z',
          artifacts: [
            {
              id: 'artifact_seed_erp',
              runId: 'run_seed_1',
              artifactType: 'ERP',
              scopeType: 'department',
              scopeRefIds: ['dept_sales'],
              status: 'PENDING',
              channelId: null,
              publishedAt: null,
              contentJson: { seed: true, type: 'erp' },
              dispatchAttempts: []
            }
          ]
        }
      ];

  const knowledgeSources: Array<Record<string, any>> = [
    {
      id: 'source_seed_1',
      name: 'Sales SOP',
      sourceType: 'FOLDER',
      rootPath: '/knowledge/sales',
      sourceUrl: null,
      includePatterns: ['**/*.md'],
      scopeType: 'department',
      scopeRefIds: ['dept_sales'],
      allowedRoles: ['MANAGER', 'STAFF'],
      classification: 'internal',
      scheduleRule: null,
      isActive: true,
      lastSyncedAt: null,
      lastSyncStatus: null,
      createdAt: '2026-04-01T01:00:00.000Z',
      updatedAt: '2026-04-01T01:00:00.000Z'
    }
  ];

  const knowledgeDocuments: Array<Record<string, any>> = [];

  const channels: Array<Record<string, any>> = [
    {
      id: 'channel_seed_1',
      name: 'Self Scope Channel',
      channelType: 'WEBHOOK',
      endpointUrl: 'https://hooks.seed.local/assistant',
      webhookSecretRef: null,
      scopeType: 'self',
      scopeRefIds: ['another_actor'],
      allowedReportPacks: ['sales'],
      isActive: true,
      lastTestedAt: null,
      createdAt: '2026-04-01T01:00:00.000Z',
      updatedAt: '2026-04-01T01:00:00.000Z'
    }
  ];

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

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
          'notifications',
          'settings'
        ],
        locale: {
          timezone: 'Asia/Ho_Chi_Minh',
          currency: 'VND',
          numberFormat: 'vi-VN',
          dateFormat: 'DD/MM/YYYY'
        }
      });
    }

    if (method === 'GET' && path === '/api/v1/settings/organization/tree') {
      return json(route, {
        tree: [
          {
            id: 'org_company',
            name: 'ERP Demo',
            type: 'COMPANY',
            children: [
              {
                id: 'branch_hcm',
                name: 'Chi nhánh HCM',
                type: 'BRANCH',
                children: [
                  {
                    id: 'dept_sales',
                    name: 'Phòng Sales',
                    type: 'DEPARTMENT',
                    children: []
                  }
                ]
              }
            ]
          }
        ]
      });
    }

    if (method === 'GET' && path === '/api/v1/settings/iam/users') {
      return json(route, {
        items: [
          {
            id: 'manager_1',
            email: 'manager_1@demo.local',
            role: 'MANAGER',
            employee: { fullName: 'Manager 1' }
          },
          {
            id: 'staff_1',
            email: 'staff_1@demo.local',
            role: 'STAFF',
            employee: { fullName: 'Staff 1' }
          }
        ]
      });
    }

    if (method === 'GET' && path === '/api/v1/assistant/access/me') {
      return json(route, {
        actor: {
          userId: 'manager_1',
          email: 'manager_1@demo.local',
          role: 'MANAGER',
          tenantId: 'GOIUUDAI',
          employeeId: 'emp_manager_1',
          positionId: 'pos_manager_1'
        },
        scope: {
          type: 'department',
          orgUnitIds: ['dept_sales'],
          employeeIds: ['emp_manager_1', 'emp_staff_1'],
          actorIds: ['manager_1', 'staff_1'],
          scopeRefIds: ['dept_sales']
        },
        allowedModules: ['sales', 'crm', 'hr', 'workflows', 'finance', 'reports'],
        moduleActions: {
          sales: ['VIEW', 'CREATE', 'UPDATE', 'APPROVE'],
          reports: ['VIEW', 'CREATE', 'APPROVE'],
          finance: ['VIEW']
        },
        policy: {
          enforcePermissionEngine: true,
          denyIfNoScope: true,
          chatChannelScopeEnforced: true
        }
      });
    }

    if (method === 'GET' && path === '/api/v1/assistant/reports/runs') {
      return json(route, {
        items: runs.map((run) => ({
          ...run,
          artifacts: run.artifacts ?? []
        })),
        count: runs.length
      });
    }

    if (method === 'POST' && path === '/api/v1/assistant/reports/runs') {
      runsCreateCount += 1;
      if (options.delayRunsCreateMs && options.delayRunsCreateMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.delayRunsCreateMs));
      }
      if (options.failRunsCreate) {
        return json(route, { message: 'Không thể tạo run (mock error).' }, options.runsCreateErrorStatus ?? 500);
      }

      const body = parseBody(route);
      const runId = `run_${runSeq++}`;
      const reportPacks = Array.isArray(body.reportPacks) && body.reportPacks.length > 0 ? body.reportPacks : ['sales'];
      const dispatchChat = body.dispatchChat === true;
      const createdAt = now();

      const artifacts: Array<Record<string, any>> = [
        {
          id: `artifact_${runId}_erp`,
          runId,
          artifactType: 'ERP',
          scopeType: 'department',
          scopeRefIds: ['dept_sales'],
          status: 'PENDING',
          channelId: null,
          publishedAt: null,
          contentJson: { reportPacks, snapshot: { sales: { metrics: { orderCount: 1 } } } },
          dispatchAttempts: []
        }
      ];

      let chatArtifactId: string | null = null;
      if (dispatchChat) {
        chatArtifactId = `artifact_${runId}_chat`;
        artifacts.push({
          id: chatArtifactId,
          runId,
          artifactType: 'CHAT',
          scopeType: 'department',
          scopeRefIds: ['dept_sales'],
          status: 'APPROVED',
          channelId: null,
          publishedAt: createdAt,
          contentJson: {
            type: 'chat_artifact',
            summary: 'dispatch skipped due to scope mismatch',
            dispatchStatus: 'SCOPE_MISMATCH'
          },
          dispatchAttempts: []
        });
      }

      runs.unshift({
        id: runId,
        runType: String(body.runType ?? 'MANUAL'),
        status: 'PENDING',
        requestedBy: 'manager_1',
        reportPacksJson: reportPacks,
        createdAt,
        updatedAt: createdAt,
        artifacts
      });

      return json(route, {
        runId,
        runType: String(body.runType ?? 'MANUAL'),
        reportPacks,
        artifacts: {
          erpArtifactId: artifacts[0].id,
          chatArtifactId
        }
      });
    }

    if (method === 'GET' && path.startsWith('/api/v1/assistant/reports/runs/')) {
      const runId = path.split('/').pop() ?? '';
      const run = runs.find((item) => item.id === runId);
      if (!run) {
        return json(route, { message: 'Run not found' }, 404);
      }
      return json(route, run);
    }

    if (method === 'POST' && path.endsWith('/approve')) {
      const runId = path.split('/')[6] ?? '';
      const run = runs.find((item) => item.id === runId);
      if (!run) {
        return json(route, { message: 'Run not found' }, 404);
      }
      run.status = 'APPROVED';
      const erpArtifact = (run.artifacts ?? []).find((artifact: any) => artifact.artifactType === 'ERP');
      if (erpArtifact) {
        erpArtifact.status = 'APPROVED';
      }
      run.updatedAt = now();
      return json(route, run);
    }

    if (method === 'POST' && path.endsWith('/reject')) {
      const runId = path.split('/')[6] ?? '';
      const run = runs.find((item) => item.id === runId);
      if (!run) {
        return json(route, { message: 'Run not found' }, 404);
      }
      run.status = 'REJECTED';
      const erpArtifact = (run.artifacts ?? []).find((artifact: any) => artifact.artifactType === 'ERP');
      if (erpArtifact) {
        erpArtifact.status = 'REJECTED';
      }
      run.updatedAt = now();
      return json(route, run);
    }

    if (method === 'GET' && path.startsWith('/api/v1/assistant/proxy/')) {
      const source = path.split('/').pop();
      const keyword = url.searchParams.get('q')?.toLowerCase() ?? '';
      if (source === 'sales') {
        return json(route, {
          module: 'sales',
          scope: { type: 'department', scopeRefIds: ['dept_sales'] },
          query: { q: keyword || undefined },
          snapshot: {
            orders: [{ id: 'order_1', orderNo: 'SO-1001', customerName: 'Khách A' }],
            invoices: [{ id: 'inv_1', invoiceNo: 'INV-1001', amount: 1200000 }],
            metrics: { orderCount: 1, invoiceCount: 1 }
          }
        });
      }
      if (source === 'cskh') {
        return json(route, {
          module: 'cskh',
          scope: { type: 'department', scopeRefIds: ['dept_sales'] },
          query: { q: keyword || undefined },
          snapshot: {
            customers: [{ id: 'cus_1', fullName: 'Khách B', phone: '0901' }],
            interactions: [{ id: 'itx_1', customerId: 'cus_1', interactionType: 'TU_VAN' }],
            threads: [{ id: 'thread_1', customerId: 'cus_1', channel: 'ZALO' }],
            metrics: { customerCount: 1, interactionCount: 1, threadCount: 1 }
          }
        });
      }
      if (source === 'hr') {
        return json(route, {
          module: 'hr',
          scope: { type: 'department', scopeRefIds: ['dept_sales'] },
          query: { q: keyword || undefined },
          snapshot: {
            employees: [{ id: 'emp_1', fullName: 'Nhân viên C', code: 'E001' }],
            payrolls: [{ id: 'pay_1', employeeId: 'emp_1', payMonth: 3 }],
            leaveRequests: [{ id: 'leave_1', employeeId: 'emp_1', status: 'PENDING' }],
            metrics: { employeeCount: 1, payrollCount: 1, leaveCount: 1 }
          }
        });
      }
      if (source === 'workflow') {
        return json(route, {
          module: 'workflow',
          scope: { type: 'department', scopeRefIds: ['dept_sales'] },
          query: { q: keyword || undefined },
          snapshot: {
            approvals: [{ id: 'apv_1', targetType: 'ORDER_EDIT', targetId: 'SO-1001' }],
            instances: [{ id: 'wf_1', status: 'PENDING', currentStep: 'approval' }],
            metrics: { approvalCount: 1, instanceCount: 1 }
          }
        });
      }
      if (source === 'finance') {
        return json(route, {
          module: 'finance',
          scope: { type: 'department', scopeRefIds: ['dept_sales'] },
          query: { q: keyword || undefined },
          snapshot: {
            invoices: [{ id: 'fin_inv_1', invoiceNo: 'INV-9001', amount: 100000 }],
            journalEntries: [{ id: 'je_1', entryNo: 'JE-1' }],
            accounts: [{ id: 'acc_1', code: '1111' }],
            budgetPlans: [{ id: 'budget_1', year: 2026 }],
            metrics: { invoiceCount: 1, journalCount: 1, accountCount: 1, budgetCount: 1 }
          }
        });
      }
      return json(route, { message: 'Unknown source' }, 404);
    }

    if (method === 'GET' && path === '/api/v1/assistant/knowledge/sources') {
      return json(route, {
        items: knowledgeSources,
        count: knowledgeSources.length
      });
    }

    if (method === 'POST' && path === '/api/v1/assistant/knowledge/sources') {
      const body = parseBody(route);
      const sourceId = `source_${sourceSeq++}`;
      const created = {
        id: sourceId,
        name: String(body.name ?? `Knowledge ${sourceId}`),
        sourceType: String(body.sourceType ?? 'FOLDER'),
        rootPath: body.rootPath ?? null,
        sourceUrl: body.sourceUrl ?? null,
        includePatterns: Array.isArray(body.includePatterns) ? body.includePatterns : [],
        scopeType: String(body.scopeType ?? 'department'),
        scopeRefIds: Array.isArray(body.scopeRefIds) ? body.scopeRefIds : [],
        allowedRoles: Array.isArray(body.allowedRoles) ? body.allowedRoles : [],
        classification: body.classification ?? 'internal',
        scheduleRule: body.scheduleRule ?? null,
        isActive: body.isActive !== false,
        createdAt: now(),
        updatedAt: now(),
        lastSyncedAt: null,
        lastSyncStatus: null
      };
      knowledgeSources.unshift(created);
      return json(route, created, 201);
    }

    if (method === 'POST' && path.includes('/api/v1/assistant/knowledge/sources/') && path.endsWith('/sync')) {
      const sourceId = path.split('/')[6] ?? '';
      const source = knowledgeSources.find((item) => item.id === sourceId);
      if (!source) {
        return json(route, { message: 'Source not found' }, 404);
      }

      source.lastSyncedAt = now();
      source.lastSyncStatus = 'SUCCESS';
      source.updatedAt = now();

      const doc = {
        id: `doc_${sourceId}_${knowledgeDocuments.length + 1}`,
        sourceId: source.id,
        title: `${source.name} - Document`,
        uri: source.rootPath || source.sourceUrl || `memory://${source.id}`,
        scopeType: source.scopeType,
        scopeRefIds: source.scopeRefIds,
        allowedRoles: source.allowedRoles,
        classification: source.classification,
        contentText: '# Sample Knowledge\nNội dung tài liệu mẫu cho chunk generation.',
        lastIndexedAt: now(),
        createdAt: now(),
        updatedAt: now()
      };
      knowledgeDocuments.unshift(doc);

      return json(route, {
        sourceId: source.id,
        sourceType: source.sourceType,
        dryRun: false,
        ingestedDocuments: 1,
        ingestedUris: [doc.uri],
        syncedAt: now()
      });
    }

    if (method === 'GET' && path === '/api/v1/assistant/knowledge/documents') {
      const sourceId = url.searchParams.get('sourceId');
      const scopeType = url.searchParams.get('scopeType');
      const q = url.searchParams.get('q')?.toLowerCase() ?? '';

      const filtered = knowledgeDocuments.filter((doc) => {
        if (sourceId && doc.sourceId !== sourceId) {
          return false;
        }
        if (scopeType && doc.scopeType !== scopeType) {
          return false;
        }
        if (q && !String(doc.title).toLowerCase().includes(q) && !String(doc.uri).toLowerCase().includes(q)) {
          return false;
        }
        return true;
      });

      return json(route, {
        items: filtered,
        count: filtered.length
      });
    }

    if (method === 'GET' && path === '/api/v1/assistant/channels') {
      return json(route, {
        items: channels,
        count: channels.length
      });
    }

    if (method === 'POST' && path === '/api/v1/assistant/channels') {
      const body = parseBody(route);
      const id = `channel_${channelSeq++}`;
      const created = {
        id,
        name: String(body.name ?? id),
        channelType: String(body.channelType ?? 'WEBHOOK'),
        endpointUrl: String(body.endpointUrl ?? ''),
        webhookSecretRef: body.webhookSecretRef ?? null,
        scopeType: String(body.scopeType ?? 'department'),
        scopeRefIds: Array.isArray(body.scopeRefIds) ? body.scopeRefIds : [],
        allowedReportPacks: Array.isArray(body.allowedReportPacks) ? body.allowedReportPacks : [],
        isActive: body.isActive !== false,
        lastTestedAt: null,
        createdAt: now(),
        updatedAt: now()
      };
      channels.unshift(created);
      return json(route, created, 201);
    }

    if (method === 'PATCH' && path.startsWith('/api/v1/assistant/channels/')) {
      const channelId = path.split('/').pop() ?? '';
      const body = parseBody(route);
      const channel = channels.find((item) => item.id === channelId);
      if (!channel) {
        return json(route, { message: 'Channel not found' }, 404);
      }
      Object.assign(channel, {
        ...body,
        updatedAt: now()
      });
      return json(route, channel);
    }

    if (method === 'POST' && path.startsWith('/api/v1/assistant/channels/') && path.endsWith('/test')) {
      const channelId = path.split('/')[5] ?? '';
      const channel = channels.find((item) => item.id === channelId);
      if (!channel) {
        return json(route, { message: 'Channel not found' }, 404);
      }
      channel.lastTestedAt = now();
      return json(route, {
        channelId,
        ok: true,
        statusCode: 200,
        message: 'ok'
      });
    }

    return json(route, { ok: true });
  });

  return {
    getRunsCreateCount: () => runsCreateCount
  };
}

test.describe('Assistant module', () => {
  test('điều hướng nested routes, RBAC menu tree và route guard hoạt động đúng', async ({ page }) => {
    await mockAssistantApis(page);

    await page.goto('/modules/assistant/runs');
    await expect(page.locator('article.module-workbench > header.module-header h1', { hasText: 'Trợ lý AI' })).toBeVisible();

    await page.locator('#web-role-select').selectOption('STAFF');
    await expect(page.getByRole('link', { name: 'Phiên chạy AI' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Phạm vi truy cập' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Proxy dữ liệu' }).first()).toBeVisible();

    await page.goto('/modules/assistant/knowledge');
    await expect(page.getByRole('heading', { name: 'Truy cập bị giới hạn' })).toBeVisible();

    await page.locator('#web-role-select').selectOption('MANAGER');
    await page.goto('/modules/assistant/knowledge');
    await expect(page.getByRole('heading', { name: 'Kho tri thức quản trị' })).toBeVisible();

    await page.goto('/modules/assistant/proxy');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Tổng hợp dữ liệu đa nguồn' })).toBeVisible();
  });

  test('Runs: tạo run, mở drawer artifact/dispatchAttempts, approve/reject và kiểm tra scope mismatch', async ({ page }) => {
    await mockAssistantApis(page);

    await page.goto('/modules/assistant/runs');
    await expect(page.getByRole('heading', { name: 'Tạo phiên chạy mới' })).toBeVisible();

    await page.getByRole('button', { name: 'Tạo phiên' }).click();
    await expect(page.getByText(/Tạo phiên chạy thành công/)).toBeVisible();

    await expect(page.getByText('Chi tiết phiên chạy')).toBeVisible();
    await expect(page.getByText(/Chưa có lần gửi nào/)).toBeVisible();
    await expect(page.getByText(/Nội dung `CHAT`/)).toBeVisible();

    await page.locator('.side-panel-container').getByRole('button', { name: 'Phê duyệt' }).click();
    await expect(page.getByText('Trạng thái hiện tại: APPROVED')).toBeVisible();

    await page.locator('.side-panel-container').getByRole('button', { name: 'Từ chối' }).click();
    await expect(page.getByText('Trạng thái hiện tại: REJECTED')).toBeVisible();
  });

  test('Proxy: chuyển đủ 5 nguồn và filter động theo dataset', async ({ page }) => {
    await mockAssistantApis(page);

    await page.goto('/modules/assistant/proxy');
    await expect(page.getByRole('heading', { name: 'Tổng hợp dữ liệu đa nguồn' })).toBeVisible();

    await page.getByLabel('Nguồn').selectOption('sales');
    await expect(page.getByText('order_1')).toBeVisible();

    await page.getByLabel('Nguồn').selectOption('cskh');
    await expect(page.getByText('cus_1')).toBeVisible();

    await page.getByLabel('Nguồn').selectOption('hr');
    await expect(page.getByText('emp_1')).toBeVisible();

    await page.getByLabel('Nguồn').selectOption('workflow');
    await expect(page.getByText('apv_1')).toBeVisible();

    await page.getByLabel('Nguồn').selectOption('finance');
    await expect(page.getByText('fin_inv_1')).toBeVisible();

    await page.getByLabel('Từ khóa').fill('INV');
    await page.getByRole('button', { name: 'Áp dụng lọc' }).click();
    await expect(page.getByText('fin_inv_1')).toBeVisible();
  });

  test('Knowledge: create/sync/list documents và chunks ước lượng', async ({ page }) => {
    await mockAssistantApis(page);
    await page.goto('/modules/assistant/knowledge');
    await expect(page.getByRole('heading', { name: 'Kho tri thức quản trị' })).toBeVisible();

    const createSourceForm = page.locator('form', {
      has: page.getByRole('heading', { name: 'Tạo nguồn tri thức' })
    });

    await createSourceForm.getByLabel('Tên nguồn').fill('Operations Handbook');
    await createSourceForm.getByLabel('Loại nguồn').selectOption('FOLDER');
    await createSourceForm.getByLabel('Thư mục gốc').fill('/knowledge/ops');
    await page.getByRole('button', { name: 'Tạo nguồn' }).click();
    await expect(page.getByText('Tạo nguồn tri thức thành công.')).toBeVisible();

    await page.locator('.row-select-trigger').first().click();
    await expect(page.getByText(/Đồng bộ nguồn/)).toBeVisible();

    await page.getByRole('button', { name: 'Lọc tài liệu' }).click();
    await expect(page.getByText(/Số phân mảnh \(ước lượng\)/)).toBeVisible();
  });

  test('Channels: create/update/test và lưu trạng thái test gần nhất', async ({ page }) => {
    await mockAssistantApis(page);
    await page.goto('/modules/assistant/channels');
    await expect(page.getByRole('heading', { name: 'Kênh phân phối quản trị' })).toBeVisible();

    await page.getByLabel('Tên kênh').first().fill('Ops Webhook');
    await page.getByLabel('URL đích').first().fill('https://hooks.company.vn/assistant');
    await page.getByRole('button', { name: 'Tạo kênh' }).click();
    await expect(page.getByText('Tạo kênh phân phối thành công.')).toBeVisible();

    await page.locator('.row-select-trigger').first().click();
    await expect(page.getByText('Cập nhật kênh phân phối')).toBeVisible();

    await page.getByLabel('Tên kênh').nth(1).fill('Ops Webhook Updated');
    await page.getByRole('button', { name: 'Lưu cập nhật' }).click();
    await expect(page.getByText('Cập nhật kênh phân phối thành công.')).toBeVisible();

    await page.locator('.row-select-trigger').first().click();
    await page.getByRole('button', { name: 'Kiểm tra kênh' }).click();
    await expect(page.getByText(/Kiểm tra kênh .* THÀNH CÔNG/)).toBeVisible();
  });

  test('Bulk: runs + knowledge + channels xử lý select-all loaded theo từng bảng chính', async ({ page }) => {
    await mockAssistantApis(page);

    await page.goto('/modules/assistant/runs');
    await page.getByRole('checkbox', { name: 'Chọn tất cả dữ liệu đang tải' }).check();
    await page.getByRole('button', { name: 'Phê duyệt' }).click();
    await expect(page.getByText('Phê duyệt phiên chạy: thành công 1/1.')).toBeVisible();

    await page.goto('/modules/assistant/knowledge');
    await page.getByRole('checkbox', { name: 'Chọn tất cả dữ liệu đang tải' }).first().check();
    await page.getByRole('button', { name: 'Đồng bộ đã chọn' }).click();
    await expect(page.locator('.banner.banner-success', { hasText: 'Đồng bộ nguồn: thành công 1/1.' })).toBeVisible();

    await page.goto('/modules/assistant/channels');
    await page.getByRole('checkbox', { name: 'Chọn tất cả dữ liệu đang tải' }).check();
    await page.getByRole('button', { name: 'Kích hoạt', exact: true }).click();
    await expect(page.locator('.banner.banner-success', { hasText: 'Kích hoạt kênh: thành công 1/1.' })).toBeVisible();
  });

  test('Negative/resilience: API lỗi hiển thị banner, CTA empty state, chống submit trùng', async ({ page }) => {
    const mock = await mockAssistantApis(page, {
      runsStartsEmpty: true,
      failRunsCreate: true,
      delayRunsCreateMs: 1200,
      runsCreateErrorStatus: 500
    });

    await page.goto('/modules/assistant/runs');
    await expect(page.getByText('Chưa có phiên chạy nào. Hãy tạo phiên đầu tiên để bắt đầu.')).toBeVisible();

    const createButton = page.locator('form button[type="submit"]').first();
    await createButton.click();
    await expect(createButton).toHaveText('Đang tạo...');
    await expect(createButton).toBeDisabled();

    await expect(page.getByText('Không thể tạo run (mock error).')).toBeVisible();
    expect(mock.getRunsCreateCount()).toBe(1);
  });
});
