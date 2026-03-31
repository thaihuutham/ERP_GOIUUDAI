import { expect, test, type Page, type Route } from '@playwright/test';

type RecruitmentStage = 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'ASSESSMENT' | 'OFFER' | 'HIRED';
type RecruitmentStatus = 'ACTIVE' | 'REJECTED' | 'WITHDRAWN' | 'HIRED';
type RecruitmentSource = 'REFERRAL' | 'JOB_BOARD' | 'SOCIAL_MEDIA' | 'CAREER_SITE' | 'AGENCY' | 'CAMPUS' | 'OTHER';
type OfferStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ACCEPTED' | 'DECLINED' | 'CANCELED';

type AppState = {
  id: string;
  stage: RecruitmentStage;
  status: RecruitmentStatus;
  recruiterId: string;
  requisition: { id: string; title: string; department: string | null; recruiterId: string };
  candidate: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    source: RecruitmentSource;
    cvExternalUrl: string | null;
  };
  timeInStageDays: number;
  offers: Array<{
    id: string;
    status: OfferStatus;
    offeredPosition: string | null;
    offeredSalary: number | null;
    currency: string | null;
    proposedStartDate: string | null;
    approvedAt: string | null;
    acceptedAt: string | null;
    rejectedAt: string | null;
    workflowInstanceId: string | null;
  }>;
  stageHistories: Array<{
    id: string;
    actionType: string;
    fromStage: RecruitmentStage | null;
    toStage: RecruitmentStage | null;
    fromStatus: RecruitmentStatus | null;
    toStatus: RecruitmentStatus | null;
    reason: string | null;
    actorId: string | null;
    createdAt: string;
  }>;
  canConvert: boolean;
};

type MockState = {
  apps: AppState[];
};

const STAGES: RecruitmentStage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED'];

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

function filterApps(apps: AppState[], params: URLSearchParams) {
  const q = (params.get('q') || '').trim().toLowerCase();
  const status = (params.get('status') || '').trim().toUpperCase();
  const source = (params.get('source') || '').trim().toUpperCase();
  const requisitionId = (params.get('requisitionId') || '').trim();
  const recruiterId = (params.get('recruiterId') || '').trim();

  return apps.filter((app) => {
    if (status && app.status !== status) return false;
    if (source && app.candidate.source !== source) return false;
    if (requisitionId && app.requisition.id !== requisitionId) return false;
    if (recruiterId && app.recruiterId !== recruiterId && app.requisition.recruiterId !== recruiterId) return false;
    if (!q) return true;

    const haystack = [app.candidate.fullName, app.candidate.email || '', app.candidate.phone || '', app.requisition.title, app.requisition.id]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}

function buildPipeline(state: MockState, params: URLSearchParams) {
  const filtered = filterApps(state.apps, params);

  const stages = STAGES.map((stage) => {
    const items = filtered
      .filter((app) => app.stage === stage)
      .map((app) => ({
        id: app.id,
        stage: app.stage,
        status: app.status,
        recruiterId: app.recruiterId,
        stageEnteredAt: '2026-03-25T09:00:00.000Z',
        timeInStageDays: app.timeInStageDays,
        candidate: app.candidate,
        requisition: {
          id: app.requisition.id,
          title: app.requisition.title,
          department: app.requisition.department
        },
        latestOffer: app.offers[0]
          ? {
              id: app.offers[0].id,
              status: app.offers[0].status
            }
          : null,
        convertedEmployeeId: null,
        canConvert: app.canConvert
      }));

    return {
      stage,
      count: items.length,
      items
    };
  });

  const statusTotals = {
    all: filtered.length,
    active: filtered.filter((item) => item.status === 'ACTIVE').length,
    rejected: filtered.filter((item) => item.status === 'REJECTED').length,
    withdrawn: filtered.filter((item) => item.status === 'WITHDRAWN').length,
    hired: filtered.filter((item) => item.status === 'HIRED').length
  };

  const requisitions = Array.from(
    new Map(
      state.apps.map((item) => [item.requisition.id, { id: item.requisition.id, title: item.requisition.title, recruiterId: item.requisition.recruiterId }])
    ).values()
  );

  const recruiters = Array.from(new Set(state.apps.map((item) => item.recruiterId))).sort();
  const sources = Array.from(new Set(state.apps.map((item) => item.candidate.source))).sort();

  return {
    stages,
    totals: statusTotals,
    filterOptions: {
      requisitions,
      recruiters,
      sources
    }
  };
}

function buildMetrics(state: MockState, params: URLSearchParams) {
  const filtered = filterApps(state.apps, params);
  const total = filtered.length || 1;

  return {
    totals: {
      applications: filtered.length,
      active: filtered.filter((item) => item.status === 'ACTIVE').length,
      rejected: filtered.filter((item) => item.status === 'REJECTED').length,
      withdrawn: filtered.filter((item) => item.status === 'WITHDRAWN').length,
      hired: filtered.filter((item) => item.status === 'HIRED').length
    },
    conversionRates: {
      screeningRate: filtered.filter((item) => STAGES.indexOf(item.stage) >= STAGES.indexOf('SCREENING')).length / total,
      interviewRate: filtered.filter((item) => STAGES.indexOf(item.stage) >= STAGES.indexOf('INTERVIEW')).length / total,
      assessmentRate: filtered.filter((item) => STAGES.indexOf(item.stage) >= STAGES.indexOf('ASSESSMENT')).length / total,
      offerRate: filtered.filter((item) => STAGES.indexOf(item.stage) >= STAGES.indexOf('OFFER')).length / total,
      hiredRate: filtered.filter((item) => item.status === 'HIRED').length / total
    }
  };
}

function buildApplicationDetail(app: AppState) {
  return {
    id: app.id,
    currentStage: app.stage,
    status: app.status,
    canConvert: app.canConvert,
    candidate: app.candidate,
    requisition: {
      title: app.requisition.title,
      department: app.requisition.department
    },
    stageHistories: app.stageHistories,
    interviews: [],
    offers: app.offers
  };
}

async function mockRecruitmentApis(page: Page, state: MockState) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'GET' && path === '/api/v1/hr/recruitment/pipeline') {
      return json(route, buildPipeline(state, url.searchParams));
    }

    if (method === 'GET' && path === '/api/v1/hr/recruitment/metrics') {
      return json(route, buildMetrics(state, url.searchParams));
    }

    if (method === 'GET' && path.startsWith('/api/v1/hr/recruitment/applications/')) {
      const appId = path.split('/').pop();
      const app = state.apps.find((item) => item.id === appId);
      if (!app) {
        return json(route, { message: 'Not found' }, 404);
      }
      return json(route, buildApplicationDetail(app));
    }

    if (method === 'PATCH' && /\/api\/v1\/hr\/recruitment\/applications\/[^/]+\/stage$/.test(path)) {
      const appId = path.split('/')[6];
      const app = state.apps.find((item) => item.id === appId);
      const body = request.postDataJSON() as { toStage?: RecruitmentStage };
      if (!app || !body.toStage) {
        return json(route, { message: 'Invalid request' }, 400);
      }

      app.stage = body.toStage;
      app.stageHistories.unshift({
        id: `history_${Date.now()}`,
        actionType: 'STAGE_CHANGED',
        fromStage: app.stage,
        toStage: body.toStage,
        fromStatus: app.status,
        toStatus: app.status,
        reason: null,
        actorId: 'test_user',
        createdAt: '2026-03-31T06:00:00.000Z'
      });

      return json(route, { id: app.id, stage: app.stage, status: app.status });
    }

    if (method === 'POST' && /\/api\/v1\/hr\/recruitment\/offers\/[^/]+\/submit-approval$/.test(path)) {
      const offerId = path.split('/')[6];
      for (const app of state.apps) {
        const offer = app.offers.find((item) => item.id === offerId);
        if (offer) {
          offer.status = 'PENDING_APPROVAL';
          offer.workflowInstanceId = 'wf_test_1';
          return json(route, offer, 201);
        }
      }
      return json(route, { message: 'Offer not found' }, 404);
    }

    if (method === 'POST' && /\/api\/v1\/hr\/recruitment\/applications\/[^/]+\/convert-to-employee$/.test(path)) {
      const appId = path.split('/')[6];
      const app = state.apps.find((item) => item.id === appId);
      if (!app || !app.canConvert) {
        return json(route, { message: 'Not allowed' }, 400);
      }
      app.status = 'HIRED';
      app.stage = 'HIRED';
      return json(route, {
        employee: { id: 'emp_1', fullName: app.candidate.fullName },
        application: { id: app.id, status: app.status }
      }, 201);
    }

    return json(route, { message: `${method} ${path} mocked default` });
  });
}

function seedState(): MockState {
  return {
    apps: [
      {
        id: 'app_1',
        stage: 'APPLIED',
        status: 'ACTIVE',
        recruiterId: 'recruiter_1',
        requisition: { id: 'req_sales', title: 'Sales Executive', department: 'Sales', recruiterId: 'recruiter_1' },
        candidate: {
          id: 'cand_1',
          fullName: 'Nguyen Van A',
          email: 'a@example.com',
          phone: '0901000001',
          source: 'REFERRAL',
          cvExternalUrl: 'https://example.com/a-cv'
        },
        timeInStageDays: 3,
        offers: [
          {
            id: 'offer_1',
            status: 'DRAFT',
            offeredPosition: 'Sales Executive',
            offeredSalary: 18000000,
            currency: 'VND',
            proposedStartDate: '2026-04-15T00:00:00.000Z',
            approvedAt: null,
            acceptedAt: null,
            rejectedAt: null,
            workflowInstanceId: null
          }
        ],
        stageHistories: [
          {
            id: 'history_1',
            actionType: 'CREATED',
            fromStage: null,
            toStage: 'APPLIED',
            fromStatus: null,
            toStatus: 'ACTIVE',
            reason: null,
            actorId: 'recruiter_1',
            createdAt: '2026-03-30T02:00:00.000Z'
          }
        ],
        canConvert: false
      },
      {
        id: 'app_2',
        stage: 'OFFER',
        status: 'ACTIVE',
        recruiterId: 'recruiter_1',
        requisition: { id: 'req_marketing', title: 'Marketing Specialist', department: 'Marketing', recruiterId: 'recruiter_1' },
        candidate: {
          id: 'cand_2',
          fullName: 'Tran Thi B',
          email: 'b@example.com',
          phone: '0901000002',
          source: 'JOB_BOARD',
          cvExternalUrl: 'https://example.com/b-cv'
        },
        timeInStageDays: 5,
        offers: [
          {
            id: 'offer_2',
            status: 'ACCEPTED',
            offeredPosition: 'Marketing Specialist',
            offeredSalary: 21000000,
            currency: 'VND',
            proposedStartDate: '2026-04-20T00:00:00.000Z',
            approvedAt: '2026-03-30T09:00:00.000Z',
            acceptedAt: '2026-03-30T11:00:00.000Z',
            rejectedAt: null,
            workflowInstanceId: 'wf_2'
          }
        ],
        stageHistories: [
          {
            id: 'history_2',
            actionType: 'STAGE_CHANGED',
            fromStage: 'ASSESSMENT',
            toStage: 'OFFER',
            fromStatus: 'ACTIVE',
            toStatus: 'ACTIVE',
            reason: null,
            actorId: 'recruiter_1',
            createdAt: '2026-03-29T03:00:00.000Z'
          }
        ],
        canConvert: true
      }
    ]
  };
}

test.describe('HR recruitment pipeline board', () => {
  test('render đúng 6 cột và filter global hoạt động', async ({ page }) => {
    const state = seedState();
    await mockRecruitmentApis(page, state);

    await page.goto('/modules/hr/recruitment');

    await expect(page.getByTestId('hr-recruitment-board')).toBeVisible();
    await expect(page.getByText('Tổng hồ sơ')).toBeVisible();

    for (const stage of STAGES) {
      await expect(page.getByTestId(`recruitment-column-${stage.toLowerCase()}`)).toBeVisible();
    }

    await expect(page.getByText('Nguyen Van A')).toBeVisible();
    await expect(page.getByText('Tran Thi B')).toBeVisible();

    await page.getByTestId('recruitment-filter-source').selectOption('JOB_BOARD');

    await expect(page.getByText('Tran Thi B')).toBeVisible();
    await expect(page.getByText('Nguyen Van A')).toHaveCount(0);
  });

  test('drag & drop cập nhật stage và dữ liệu giữ đúng sau refresh', async ({ page }) => {
    const state = seedState();
    await mockRecruitmentApis(page, state);

    await page.goto('/modules/hr/recruitment');

    const card = page.getByTestId('recruitment-card-app_1');
    const screeningColumn = page.getByTestId('recruitment-column-screening');

    await expect(card).toBeVisible();
    await card.dragTo(screeningColumn);

    await expect(page.getByText('Đã chuyển hồ sơ sang SCREENING')).toBeVisible();

    await page.getByTestId('recruitment-refresh-button').click();

    const screeningCard = page.getByTestId('recruitment-column-screening').getByTestId('recruitment-card-app_1');
    await expect(screeningCard).toBeVisible();
  });

  test('offer approval hiển thị đúng và nút convert chỉ enable khi đủ điều kiện', async ({ page }) => {
    const state = seedState();
    await mockRecruitmentApis(page, state);

    await page.goto('/modules/hr/recruitment');

    await page.getByTestId('recruitment-card-app_1').click();
    await expect(page.getByTestId('recruitment-convert-button')).toBeDisabled();

    await page.getByTestId('recruitment-offer-submit-offer_1').click();
    await expect(page.getByText('Đã submit offer vào workflow duyệt')).toBeVisible();
    await expect(page.getByText('PENDING_APPROVAL')).toBeVisible();

    await page.getByRole('button', { name: 'Đóng' }).click();
    await page.getByTestId('recruitment-card-app_2').click();
    await expect(page.getByTestId('recruitment-convert-button')).toBeEnabled();
  });
});
