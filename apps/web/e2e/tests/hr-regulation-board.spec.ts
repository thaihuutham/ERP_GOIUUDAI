import { expect, test, type Page, type Route } from '@playwright/test';

type Submission = {
  id: string;
  appendixCode: string;
  employeeId: string;
  workDate: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  revisions: Array<Record<string, unknown>>;
};

type PipCase = {
  id: string;
  employeeId: string;
  triggerReason: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
};

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

function parseBody(route: Route) {
  const raw = route.request().postData();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function mockHrRegulationApis(page: Page) {
  const state: {
    viewerScope: 'self' | 'team' | 'department' | 'company';
    requesterEmployeeId: string;
    submissions: Submission[];
    pipCases: PipCase[];
  } = {
    viewerScope: 'self',
    requesterEmployeeId: 'EMP-SELF-01',
    submissions: [
      {
        id: 'sub_seed_1',
        appendixCode: 'PL01',
        employeeId: 'EMP-SEED-01',
        workDate: '2026-04-03T00:00:00.000Z',
        status: 'DRAFT',
        revisions: []
      }
    ],
    pipCases: [
      {
        id: 'pip_seed_1',
        employeeId: 'EMP-SEED-01',
        triggerReason: 'AUTO_PIP_MONTHLY_SCORE_BELOW_75',
        status: 'DRAFT'
      }
    ]
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === 'GET' && path === '/api/v1/settings/runtime') {
      return json(route, {
        organization: { companyName: 'GOIUUDAI' },
        locale: {
          timezone: 'Asia/Ho_Chi_Minh',
          currency: 'VND',
          numberFormat: 'vi-VN',
          dateFormat: 'DD/MM/YYYY'
        }
      });
    }

    if (method === 'GET' && path === '/api/v1/hr/regulation/metadata') {
      return json(route, {
        viewerScope: state.viewerScope,
        canOverrideEmployeeId: false,
        requesterEmployeeId: state.requesterEmployeeId,
        appendices: [
          {
            code: 'PL01',
            name: 'Phụ lục nhật ký công việc ngày',
            description: 'Ghi nhận hoạt động trong ngày theo quy chế 2026.',
            fields: ['summary', 'result', 'taskCount', 'complianceNote', 'note']
          },
          {
            code: 'PL02',
            name: 'Phụ lục kết quả công việc ngày',
            description: 'Tổng hợp kết quả và chất lượng thực thi trong ngày.',
            fields: ['summary', 'result', 'taskCount', 'qualityNote', 'note']
          },
          {
            code: 'PL10',
            name: 'Phụ lục kế hoạch cải thiện hiệu suất (PIP)',
            description: 'Dùng cho trường hợp cần theo dõi cải thiện hiệu suất.',
            fields: ['summary', 'result', 'complianceNote', 'qualityNote', 'note']
          }
        ]
      });
    }

    if (method === 'GET' && path === '/api/v1/hr/appendix/templates') {
      return json(route, [
        {
          id: 'tpl_1',
          appendixCode: 'PL01',
          version: 1,
          status: 'ACTIVE',
          updatedAt: '2026-04-03T01:00:00.000Z'
        }
      ]);
    }

    if (method === 'GET' && path === '/api/v1/hr/appendix/submissions') {
      return json(route, { viewerScope: state.viewerScope, items: state.submissions });
    }

    if (method === 'POST' && path === '/api/v1/hr/appendix/submissions') {
      const body = parseBody(route);
      const created: Submission = {
        id: `sub_${state.submissions.length + 1}`,
        appendixCode: String(body.appendixCode ?? 'PL01'),
        employeeId: String(body.employeeId ?? state.requesterEmployeeId),
        workDate: body.workDate ? `${body.workDate}T00:00:00.000Z` : null,
        status: 'DRAFT',
        revisions: []
      };
      state.submissions = [created, ...state.submissions];
      return json(route, created, 201);
    }

    if (method === 'POST' && path.match(/^\/api\/v1\/hr\/appendix\/submissions\/[^/]+\/submit$/)) {
      const id = path.split('/')[6] ?? '';
      state.submissions = state.submissions.map((item) =>
        item.id === id ? { ...item, status: 'SUBMITTED' } : item
      );
      return json(route, state.submissions.find((item) => item.id === id) ?? null, 201);
    }

    if (method === 'POST' && path.match(/^\/api\/v1\/hr\/appendix\/submissions\/[^/]+\/approve$/)) {
      const id = path.split('/')[6] ?? '';
      state.submissions = state.submissions.map((item) =>
        item.id === id ? { ...item, status: 'APPROVED' } : item
      );
      return json(route, state.submissions.find((item) => item.id === id) ?? null, 201);
    }

    if (method === 'POST' && path.match(/^\/api\/v1\/hr\/appendix\/submissions\/[^/]+\/reject$/)) {
      const id = path.split('/')[6] ?? '';
      state.submissions = state.submissions.map((item) =>
        item.id === id ? { ...item, status: 'REJECTED' } : item
      );
      return json(route, state.submissions.find((item) => item.id === id) ?? null, 201);
    }

    if (method === 'POST' && path.match(/^\/api\/v1\/hr\/appendix\/submissions\/[^/]+\/revisions$/)) {
      const id = path.split('/')[6] ?? '';
      const body = parseBody(route);
      const revision = {
        id: `rev_${Date.now()}`,
        status: 'PENDING_APPROVAL',
        reason: body.reason ?? 'test'
      };
      state.submissions = state.submissions.map((item) =>
        item.id === id ? { ...item, revisions: [revision, ...(item.revisions ?? [])] } : item
      );
      return json(route, revision, 201);
    }

    if (method === 'POST' && path.match(/^\/api\/v1\/hr\/appendix\/revisions\/[^/]+\/approve$/)) {
      return json(route, { ok: true }, 201);
    }

    if (method === 'POST' && path.match(/^\/api\/v1\/hr\/appendix\/revisions\/[^/]+\/reject$/)) {
      return json(route, { ok: true }, 201);
    }

    if (method === 'GET' && path === '/api/v1/hr/performance/daily-scores') {
      return json(route, {
        viewerScope: state.viewerScope,
        items: [
          {
            id: 'score_1',
            employeeId: state.requesterEmployeeId,
            workDate: '2026-04-03T00:00:00.000Z',
            outputScore: 100,
            activityScore: 95,
            complianceScore: 100,
            qualityScore: 100,
            totalScore: 99,
            status: 'PROVISIONAL',
            freezeAt: '2026-04-04T16:59:59.999Z'
          }
        ]
      });
    }

    if (method === 'POST' && path === '/api/v1/hr/performance/daily-scores/recompute') {
      return json(route, { processed: 1, snapshots: [{ id: 'score_1' }] }, 201);
    }

    if (method === 'POST' && path === '/api/v1/hr/performance/daily-scores/reconcile/run') {
      return json(route, { scanned: 1, processed: 1, finalized: 0 }, 201);
    }

    if (method === 'GET' && path === '/api/v1/hr/performance/role-templates') {
      return json(route, [
        {
          roleGroup: 'SALES',
          pillarWeights: { output: 50, activity: 20, compliance: 20, quality: 10 },
          thresholds: { pipMonthlyScoreBelow: 75, pipConsecutiveMonths: 2, missingLogs30d: 5 },
          status: 'ACTIVE'
        }
      ]);
    }

    if (method === 'GET' && path === '/api/v1/hr/pip/cases') {
      return json(route, { viewerScope: state.viewerScope, items: state.pipCases });
    }

    if (method === 'POST' && path === '/api/v1/hr/pip/cases') {
      const body = parseBody(route);
      const created: PipCase = {
        id: `pip_${state.pipCases.length + 1}`,
        employeeId: String(body.employeeId ?? state.requesterEmployeeId),
        triggerReason: String(body.triggerReason ?? 'manual'),
        status: 'DRAFT'
      };
      state.pipCases = [created, ...state.pipCases];
      return json(route, created, 201);
    }

    if (method === 'POST' && path === '/api/v1/hr/pip/cases/auto-draft/run') {
      const created: PipCase = {
        id: `pip_${state.pipCases.length + 1}`,
        employeeId: 'EMP-AUTO-01',
        triggerReason: 'AUTO_PIP_MONTHLY_SCORE_BELOW_75',
        status: 'DRAFT'
      };
      state.pipCases = [created, ...state.pipCases];
      return json(route, { scannedEmployees: 5, createdCount: 1, createdCases: [created] }, 201);
    }

    return json(route, { ok: true });
  });
}

test.describe('HR Regulation board', () => {
  test('supports appendix, score, and pip flows', async ({ page }) => {
    await mockHrRegulationApis(page);
    await page.goto('/modules/hr/regulation');

    await expect(page.getByRole('heading', { name: 'HR Quy chế 2026' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Submissions \(/ })).toBeVisible();
    await expect(page.getByLabel('Employee ID')).toHaveCount(0);

    await page.getByRole('button', { name: 'Tạo submission' }).click();
    await expect(page.getByText('Đã tạo submission phụ lục.')).toBeVisible();
    await expect(page.getByText('EMP-SELF-01')).toBeVisible();

    await page.getByRole('button', { name: 'Submit' }).first().click();
    await expect(page.getByText('Đã submit submission.')).toBeVisible();
    await page.getByRole('button', { name: 'Duyệt' }).first().click();
    await expect(page.getByText('Đã duyệt submission.')).toBeVisible();

    await page.getByRole('button', { name: 'Điểm ngày' }).click();
    await expect(page.getByText('Tổng hợp điểm ngày (chart)')).toBeVisible();
    await expect(page.getByText('Phạm vi cá nhân: chỉ hiển thị biểu đồ tổng hợp, ẩn bảng chi tiết.')).toBeVisible();
    await expect(page.getByText('Role templates')).toHaveCount(0);
    await page.getByRole('button', { name: 'Recompute' }).click();
    await expect(page.getByText('Đã chạy recompute điểm ngày.')).toBeVisible();

    await page.getByRole('button', { name: 'PIP' }).click();
    await expect(page.getByText('PIP cases')).toBeVisible();
    await page.getByRole('button', { name: 'Tạo PIP case' }).click();
    await expect(page.getByText('Đã tạo PIP case thủ công.')).toBeVisible();
    await expect(page.getByText('EMP-SELF-01')).toBeVisible();

    await page.getByRole('button', { name: 'Chạy auto-draft PIP' }).click();
    await expect(page.getByText('Đã chạy auto-draft PIP.')).toBeVisible();
    await expect(page.getByText('EMP-AUTO-01')).toBeVisible();
  });
});
