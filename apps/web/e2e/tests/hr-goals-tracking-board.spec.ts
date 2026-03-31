import { expect, test, type Page, type Route } from '@playwright/test';

type GoalStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
type GoalScope = 'self' | 'team' | 'department' | 'company';

type MockState = {
  trackerCalls: number;
  submitRequested: boolean;
};

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

function buildTracker(state: MockState, scope: GoalScope) {
  state.trackerCalls += 1;
  const status: GoalStatus = state.submitRequested ? 'PENDING' : 'DRAFT';
  const item = {
    id: 'goal_1',
    goalCode: 'GOAL-001',
    title: `Goal ${scope} #${state.trackerCalls}`,
    description: 'Theo doi KPI doanh so',
    period: 'Q2-2026',
    status,
    trackingMode: 'HYBRID',
    targetValue: 100,
    currentValue: state.submitRequested ? 60 : 45,
    autoCurrentValue: 40,
    manualAdjustmentValue: state.submitRequested ? 20 : 5,
    progressPercent: state.submitRequested ? 60 : 45,
    startDate: '2026-04-01T00:00:00.000Z',
    endDate: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-04-10T09:00:00.000Z',
    employeeId: 'emp_1',
    employeeCode: 'EMP-001',
    employeeName: 'Nguyen Van A',
    employeeDepartment: 'Sales',
    metricBindings: [
      {
        id: 'binding_1',
        sourceSystem: 'SALES',
        metricKey: 'order_amount_sum',
        weight: 1,
        lastComputedValue: 40,
        lastComputedAt: '2026-04-10T09:00:00.000Z'
      }
    ]
  };

  return {
    scope,
    items: [item],
    grouped: {
      DRAFT: status === 'DRAFT' ? [item] : [],
      PENDING: status === 'PENDING' ? [item] : [],
      ACTIVE: [],
      APPROVED: [],
      REJECTED: [],
      ARCHIVED: []
    },
    totals: {
      all: 1,
      draft: status === 'DRAFT' ? 1 : 0,
      pending: status === 'PENDING' ? 1 : 0,
      active: 0,
      approved: 0,
      rejected: 0,
      archived: 0
    }
  };
}

function buildOverview(scope: GoalScope) {
  return {
    scope,
    totals: {
      all: 1,
      draft: 1,
      pending: 0,
      active: 0,
      approved: 0,
      rejected: 0,
      archived: 0
    },
    progress: {
      avgProgressPercent: 45,
      weightedProgressPercent: 45,
      completionRatePercent: 0
    },
    trackingModes: {
      manual: 0,
      auto: 0,
      hybrid: 1
    },
    byDepartment: [
      {
        key: 'sales',
        name: 'Sales',
        total: 1,
        approved: 0,
        avgProgressPercent: 45
      }
    ],
    byEmployee: [
      {
        id: 'emp_1',
        name: 'Nguyen Van A',
        total: 1,
        approved: 0,
        avgProgressPercent: 45
      }
    ]
  };
}

async function mockGoalsApis(page: Page, state: MockState) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'GET' && path === '/api/v1/hr/goals/tracker') {
      const scope = (url.searchParams.get('scope') || 'self') as GoalScope;
      return json(route, buildTracker(state, scope));
    }

    if (method === 'GET' && path === '/api/v1/hr/goals/overview') {
      const scope = (url.searchParams.get('scope') || 'self') as GoalScope;
      return json(route, buildOverview(scope));
    }

    if (method === 'GET' && path === '/api/v1/hr/goals/goal_1/timeline') {
      return json(route, [
        {
          id: 'timeline_1',
          eventType: state.submitRequested ? 'SUBMITTED' : 'CREATED',
          actorId: 'emp_1',
          fromStatus: state.submitRequested ? 'DRAFT' : null,
          toStatus: state.submitRequested ? 'PENDING' : 'DRAFT',
          progressPercent: state.submitRequested ? 60 : 45,
          note: null,
          createdAt: '2026-04-10T09:00:00.000Z'
        }
      ]);
    }

    if (method === 'POST' && path === '/api/v1/hr/goals/goal_1/submit-approval') {
      state.submitRequested = true;
      return json(
        route,
        {
          id: 'goal_1',
          status: 'PENDING',
          workflowInstanceId: 'wf_goal_1'
        },
        201
      );
    }

    if (method === 'PATCH' && path === '/api/v1/hr/goals/goal_1/progress') {
      return json(route, { id: 'goal_1', progressPercent: 66 }, 200);
    }

    if (method === 'POST' && path === '/api/v1/hr/goals/recompute-auto') {
      return json(route, { total: 1, updated: 1 }, 201);
    }

    if (method === 'POST' && path === '/api/v1/hr/goals/goal_1/recompute-auto') {
      return json(route, { updated: true, goalId: 'goal_1', reason: 'UPDATED' }, 201);
    }

    if (method === 'POST' && path === '/api/v1/hr/goals') {
      return json(route, { id: 'goal_2' }, 201);
    }

    return json(route, { message: `${method} ${path} mocked default` });
  });
}

test.describe('HR Goals tracking board', () => {
  test('renders dedicated board, supports scope switch, polling refresh, and submit approval', async ({ page }) => {
    const state: MockState = {
      trackerCalls: 0,
      submitRequested: false
    };

    await mockGoalsApis(page, state);
    await page.goto('/modules/hr/goals');

    await expect(page.getByRole('heading', { name: 'Mục tiêu nhân sự' })).toBeVisible();
    await expect(page.getByText('Goal self #1')).toBeVisible();

    await page.getByRole('button', { name: /Team/ }).click();
    await expect(page.getByText(/Goal team #\d+/)).toBeVisible();

    const titleBefore = await page.locator('button:has-text("Goal team #")').first().textContent();
    const numberBefore = Number(titleBefore?.match(/#(\d+)/)?.[1] ?? '0');

    await page.waitForTimeout(11_200);

    const titleAfter = await page.locator('button:has-text("Goal team #")').first().textContent();
    const numberAfter = Number(titleAfter?.match(/#(\d+)/)?.[1] ?? '0');
    expect(numberAfter).toBeGreaterThan(numberBefore);

    await page.locator('button:has-text("Goal team #")').first().click();
    await expect(page.getByText('Chi tiết mục tiêu')).toBeVisible();

    await page.getByRole('button', { name: /Submit duyệt/ }).click();
    await expect(page.getByText('Đã submit duyệt mục tiêu.')).toBeVisible();
    await expect(page.locator('.finance-status-pill', { hasText: 'PENDING' }).first()).toBeVisible();
  });
});
