import { expect, test, type Page, type Route } from '@playwright/test';

type TaskActionBody = {
  note?: string;
  actorId?: string;
  toApproverId?: string;
};

type TaskActionResponse = {
  status?: number;
  payload?: unknown;
  applyState?: boolean;
};

type WorkflowsMockOptions = {
  inboxTaskIds?: string[];
  onApprove?: (body: TaskActionBody, taskId?: string) => TaskActionResponse;
  onDelegate?: (body: TaskActionBody, taskId?: string) => TaskActionResponse;
  onReassign?: (body: TaskActionBody, taskId?: string) => TaskActionResponse;
};

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

function readBody(route: Route): TaskActionBody {
  const raw = route.request().postData();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as TaskActionBody;
  } catch {
    return {};
  }
}

async function mockWorkflowApis(page: Page, options: WorkflowsMockOptions = {}) {
  const initialTaskIds = options.inboxTaskIds && options.inboxTaskIds.length > 0 ? options.inboxTaskIds : ['task_1'];

  const state = {
    inboxTasks: initialTaskIds.map((taskId) => ({
      id: taskId,
      instanceId: `wf_${taskId}`,
      targetType: 'ORDER_EDIT',
      targetId: `SO-${taskId.toUpperCase()}`,
      requesterId: 'requester_1',
      approverId: 'manager_1',
      stepKey: 'approval',
      status: 'PENDING',
      createdAt: '2026-04-01T03:00:00.000Z'
    })),
    approved: false,
    lastAction: 'SUBMIT',
    lastNote: null as string | null,
    lastActor: 'manager_1',
    lastTargetApprover: null as string | null
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'GET' && path === '/api/v1/settings/runtime') {
      return json(route, {
        organization: { companyName: 'ERP Demo' },
        enabledModules: ['crm', 'sales', 'catalog', 'hr', 'finance', 'scm', 'assets', 'projects', 'workflows', 'reports', 'notifications'],
        locale: {
          timezone: 'Asia/Ho_Chi_Minh',
          currency: 'VND',
          numberFormat: 'vi-VN',
          dateFormat: 'DD/MM/YYYY'
        }
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
            id: 'manager_2',
            email: 'manager_2@demo.local',
            role: 'MANAGER',
            employee: { fullName: 'Manager 2' }
          },
          {
            id: 'manager_3',
            email: 'manager_3@demo.local',
            role: 'MANAGER',
            employee: { fullName: 'Manager 3' }
          }
        ]
      });
    }

    if (method === 'GET' && path === '/api/v1/workflows/definitions') {
      return json(route, {
        items: [
          {
            id: 'def_sales_1',
            code: 'SALES_ORDER_EDIT',
            name: 'Sales Order Edit',
            module: 'sales',
            version: 1,
            status: 'DRAFT',
            definitionJson: {
              initialStep: 'approval',
              steps: [
                {
                  key: 'approval',
                  name: 'Manager Approval',
                  approvalMode: 'ALL',
                  minApprovers: 1,
                  slaHours: 24,
                  approvers: [{ type: 'ROLE', role: 'MANAGER' }],
                  transitions: [{ action: 'APPROVE', terminalStatus: 'APPROVED' }]
                }
              ]
            }
          }
        ]
      });
    }

    if (method === 'GET' && path === '/api/v1/workflows/inbox') {
      return json(route, {
        items: state.inboxTasks.map((task) => ({
          ...task,
          approverId: state.lastTargetApprover ?? task.approverId
        }))
      });
    }

    if (method === 'GET' && path === '/api/v1/workflows/requests') {
      return json(route, {
        items: [
          {
            id: 'wf_1',
            definitionId: 'def_sales_1',
            targetType: 'ORDER_EDIT',
            targetId: 'SO-1001',
            currentStep: state.approved ? 'final' : 'approval',
            status: state.approved ? 'APPROVED' : 'PENDING',
            createdAt: '2026-04-01T03:00:00.000Z'
          }
        ]
      });
    }

    if (method === 'GET' && path === '/api/v1/workflows/instances') {
      return json(route, {
        items: [
          {
            id: 'wf_1',
            definitionId: 'def_sales_1',
            targetType: 'ORDER_EDIT',
            targetId: 'SO-1001',
            currentStep: state.approved ? 'final' : 'approval',
            status: state.approved ? 'APPROVED' : 'PENDING',
            createdAt: '2026-04-01T03:00:00.000Z',
            definition: { id: 'def_sales_1', name: 'Sales Order Edit', module: 'sales' }
          }
        ]
      });
    }

    if (method === 'POST' && path === '/api/v1/workflows/definitions/def_sales_1/validate') {
      return json(route, { ok: true, valid: true, errors: [] });
    }

    if (method === 'POST' && path === '/api/v1/workflows/definitions/def_sales_1/simulate') {
      return json(route, {
        path: ['approval', 'APPROVED'],
        result: 'APPROVED'
      });
    }

    if (method === 'POST' && path === '/api/v1/workflows/definitions/def_sales_1/publish') {
      return json(route, { ok: true, status: 'ACTIVE' });
    }

    if (method === 'POST' && /\/api\/v1\/workflows\/tasks\/[^/]+\/approve$/.test(path)) {
      const taskId = path.split('/')[5] ?? '';
      const taskExists = state.inboxTasks.some((item) => item.id === taskId);
      if (!taskExists) {
        return json(route, { message: 'Task not found' }, 404);
      }
      const body = readBody(route);
      const response = options.onApprove?.(body, taskId) ?? { status: 200, payload: { ok: true }, applyState: true };
      if (response.applyState !== false && (response.status ?? 200) < 400) {
        state.inboxTasks = state.inboxTasks.filter((item) => item.id !== taskId);
        if (taskId === 'task_1') {
          state.approved = true;
        }
        state.lastAction = 'APPROVE';
        state.lastNote = body.note ?? null;
        state.lastActor = body.actorId ?? 'manager_1';
      }
      return json(route, response.payload ?? { ok: true }, response.status ?? 200);
    }

    if (method === 'POST' && /\/api\/v1\/workflows\/tasks\/[^/]+\/delegate$/.test(path)) {
      const taskId = path.split('/')[5] ?? '';
      const taskExists = state.inboxTasks.some((item) => item.id === taskId);
      if (!taskExists) {
        return json(route, { message: 'Task not found' }, 404);
      }
      const body = readBody(route);
      const response = options.onDelegate?.(body, taskId) ?? { status: 200, payload: { ok: true }, applyState: true };
      if (response.applyState !== false && (response.status ?? 200) < 400) {
        state.inboxTasks = state.inboxTasks.filter((item) => item.id !== taskId);
        state.lastAction = 'DELEGATE';
        state.lastNote = body.note ?? null;
        state.lastActor = body.actorId ?? 'manager_1';
        state.lastTargetApprover = body.toApproverId ?? null;
      }
      return json(route, response.payload ?? { ok: true }, response.status ?? 200);
    }

    if (method === 'POST' && /\/api\/v1\/workflows\/tasks\/[^/]+\/reassign$/.test(path)) {
      const taskId = path.split('/')[5] ?? '';
      const taskExists = state.inboxTasks.some((item) => item.id === taskId);
      if (!taskExists) {
        return json(route, { message: 'Task not found' }, 404);
      }
      const body = readBody(route);
      const response = options.onReassign?.(body, taskId) ?? { status: 200, payload: { ok: true }, applyState: true };
      if (response.applyState !== false && (response.status ?? 200) < 400) {
        state.inboxTasks = state.inboxTasks.filter((item) => item.id !== taskId);
        state.lastAction = 'REASSIGN';
        state.lastNote = body.note ?? null;
        state.lastActor = body.actorId ?? 'manager_1';
        state.lastTargetApprover = body.toApproverId ?? null;
      }
      return json(route, response.payload ?? { ok: true }, response.status ?? 200);
    }

    if (method === 'GET' && path === '/api/v1/workflows/instances/wf_1') {
      return json(route, {
        id: 'wf_1',
        definitionId: 'def_sales_1',
        targetType: 'ORDER_EDIT',
        targetId: 'SO-1001',
        currentStep: state.approved ? 'final' : 'approval',
        status: state.approved ? 'APPROVED' : 'PENDING',
        createdAt: '2026-04-01T03:00:00.000Z',
        definition: { id: 'def_sales_1', name: 'Sales Order Edit', module: 'sales' },
        actionLogs: [
          {
            id: 'log_1',
            action: state.lastAction,
            fromStep: 'approval',
            toStep: state.approved ? 'final' : 'approval',
            actorId: state.lastActor,
            note: state.lastNote,
            createdAt: '2026-04-01T03:02:00.000Z'
          }
        ]
      });
    }

    return json(route, { ok: true });
  });
}

test.describe('Workflows module', () => {
  test('starts a fresh draft when clicking create definition button', async ({ page }) => {
    await mockWorkflowApis(page);

    await page.goto('/modules/workflows');
    await page.getByRole('button', { name: 'Thiết kế quy trình' }).click();
    await page.getByRole('button', { name: /Sales Order Edit/ }).click();

    await page.getByLabel('Tên quy trình').fill('Temporary overwrite');
    const previousCode = await page.getByLabel('Mã quy trình').inputValue();

    await page.getByRole('button', { name: /Tạo định nghĩa mới/ }).click();

    await expect(page.getByText('Đã tạo biểu mẫu định nghĩa mới. Vui lòng chọn các giá trị từ danh sách.')).toBeVisible();
    await expect(page.getByLabel('Tên quy trình')).toHaveValue('');
    const builderModuleSelect = page.locator('section.feature-panel').getByLabel('Phân hệ').last();
    await expect(builderModuleSelect).toHaveValue('sales');

    const newCode = await page.getByLabel('Mã quy trình').inputValue();
    expect(newCode).not.toBe(previousCode);
  });

  test('supports builder actions, inbox approval action, and monitor detail panel', async ({ page }) => {
    await mockWorkflowApis(page);

    await page.goto('/modules/workflows');
    await expect(page.getByRole('heading', { name: 'Vận hành quy trình phê duyệt' })).toBeVisible();

    await page.getByRole('button', { name: 'Thiết kế quy trình' }).click();
    await page.getByRole('button', { name: /Sales Order Edit/ }).click();
    await page.getByRole('button', { name: 'Kiểm tra' }).click();
    await expect(page.getByText('Kiểm tra định nghĩa thành công.')).toBeVisible();

    await page.getByRole('button', { name: 'Chạy mô phỏng' }).click();
    await expect(page.getByText('Mô phỏng hoàn tất.')).toBeVisible();

    await page.getByRole('button', { name: 'Kích hoạt' }).click();
    await expect(page.getByText('Kích hoạt quy trình thành công.')).toBeVisible();

    await page.getByRole('button', { name: 'Hộp duyệt' }).click();
    await page.locator('.row-select-trigger').first().click();
    await expect(page.getByText('Xử lý tác vụ phê duyệt')).toBeVisible();

    await page.getByLabel('Ghi chú').fill('Approved from inbox e2e');
    await page.getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.getByText('Thao tác tác vụ thành công.')).toBeVisible();

    await page.getByRole('button', { name: 'Giám sát' }).click();
    await page.locator('.row-select-trigger').first().click();
    await expect(page.getByText('Chi tiết phiên quy trình')).toBeVisible();
    await expect(page.getByText('Dòng thời gian')).toBeVisible();
    await expect(page.getByText('APPROVE', { exact: true })).toBeVisible();
  });

  test('supports delegate action from inbox', async ({ page }) => {
    let capturedTargetApprover = '';

    await mockWorkflowApis(page, {
      onDelegate: (body) => {
        capturedTargetApprover = String(body.toApproverId ?? '');
        return { status: 200, payload: { ok: true }, applyState: true };
      }
    });

    await page.goto('/modules/workflows');
    await page.getByRole('button', { name: 'Hộp duyệt' }).click();
    await page.locator('.row-select-trigger').first().click();

    await page.getByLabel('Hành động').selectOption('delegate');
    await page.getByLabel('Người nhận mới').selectOption('manager_2');
    await page.getByLabel('Ghi chú').fill('Delegate for vacation coverage');
    await page.getByRole('button', { name: 'Xác nhận' }).click();

    await expect(page.getByText('Thao tác tác vụ thành công.')).toBeVisible();
    expect(capturedTargetApprover).toBe('manager_2');
  });

  test('supports reassign action from inbox', async ({ page }) => {
    let capturedTargetApprover = '';

    await mockWorkflowApis(page, {
      onReassign: (body) => {
        capturedTargetApprover = String(body.toApproverId ?? '');
        return { status: 200, payload: { ok: true }, applyState: true };
      }
    });

    await page.goto('/modules/workflows');
    await page.getByRole('button', { name: 'Hộp duyệt' }).click();
    await page.locator('.row-select-trigger').first().click();

    await page.getByLabel('Hành động').selectOption('reassign');
    await page.getByLabel('Người nhận mới').selectOption('manager_3');
    await page.getByLabel('Ghi chú').fill('Reassign due to conflict of interest');
    await page.getByRole('button', { name: 'Xác nhận' }).click();

    await expect(page.getByText('Thao tác tác vụ thành công.')).toBeVisible();
    expect(capturedTargetApprover).toBe('manager_3');
  });

  test('shows validation and policy errors on delegate/reassign paths', async ({ page }) => {
    await mockWorkflowApis(page, {
      onDelegate: () => ({
        status: 400,
        payload: {
          message: 'Tính năng delegation đang tắt theo approval_matrix.delegation.enabled.'
        },
        applyState: false
      }),
      onReassign: (body) => {
        if (!String(body.toApproverId ?? '').trim()) {
          return {
            status: 400,
            payload: {
              message: 'toApproverId là bắt buộc khi reassign task.'
            },
            applyState: false
          };
        }
        return { status: 200, payload: { ok: true }, applyState: true };
      }
    });

    await page.goto('/modules/workflows');
    await page.getByRole('button', { name: 'Hộp duyệt' }).click();
    await page.locator('.row-select-trigger').first().click();

    await page.getByLabel('Hành động').selectOption('delegate');
    await page.getByLabel('Người nhận mới').selectOption('manager_2');
    await page.getByLabel('Ghi chú').fill('Try delegate with policy off');
    await page.getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.getByText('Tính năng delegation đang tắt theo approval_matrix.delegation.enabled.')).toBeVisible();

    await page.getByLabel('Hành động').selectOption('reassign');
    await page.getByLabel('Người nhận mới').selectOption('');
    await page.getByLabel('Ghi chú').fill('Try reassign without target');
    await page.getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.getByText('Vui lòng chọn Người nhận mới trước khi xác nhận.')).toBeVisible();
  });

  test('supports inbox bulk approve with partial failure summary', async ({ page }) => {
    await mockWorkflowApis(page, {
      inboxTaskIds: ['task_1', 'task_2'],
      onApprove: (_body, taskId) => {
        if (taskId === 'task_2') {
          return {
            status: 400,
            payload: { message: 'Task task_2 không hợp lệ để approve.' },
            applyState: false
          };
        }
        return { status: 200, payload: { ok: true }, applyState: true };
      }
    });

    await page.goto('/modules/workflows');
    await page.getByRole('button', { name: 'Hộp duyệt' }).click();

    await page.getByRole('checkbox', { name: 'Chọn tất cả dữ liệu đang tải' }).check();
    await page.getByRole('button', { name: 'Phê duyệt' }).click();

    await expect(page.getByText('Xử lý hàng loạt Phê duyệt (2)')).toBeVisible();
    await page.getByRole('button', { name: 'Xác nhận' }).click();

    await expect(page.locator('.standard-table-bulk-result')).toContainText('thành công 1/2, lỗi 1.');
    await expect(page.getByRole('button', { name: 'Retry failed' })).toBeEnabled();
    await expect(page.getByText('Một số tác vụ lỗi khi chạy hàng loạt (approve).')).toBeVisible();
  });
});
