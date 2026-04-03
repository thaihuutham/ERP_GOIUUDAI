import { expect, test, type Page, type Route } from '@playwright/test';

type MockState = {
  runEvaluatedCount: number;
  runNowCalls: number;
};

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

async function mockConversationsApis(page: Page, state: MockState) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'GET' && path === '/api/v1/zalo/accounts') {
      return json(route, [
        {
          id: 'oa_account_1',
          accountType: 'OA',
          displayName: 'OA Retail',
          status: 'CONNECTED'
        }
      ]);
    }

    if (method === 'GET' && path === '/api/v1/conversations/threads') {
      return json(route, {
        items: [
          {
            id: 'thread_oa_1',
            channel: 'ZALO_OA',
            channelAccountId: 'oa_account_1',
            externalThreadId: 'oa_thread_001',
            customerDisplayName: 'Khách test OA',
            unreadCount: 1,
            lastMessageAt: '2026-03-29T04:45:00.000Z',
            evaluations: [
              {
                id: 'eval_brief_1',
                verdict: 'PASS',
                score: 88
              }
            ]
          }
        ],
        nextCursor: null,
        limit: 50
      });
    }

    if (method === 'GET' && path === '/api/v1/conversations/threads/thread_oa_1/messages') {
      return json(route, {
        items: [
          {
            id: 'msg_1',
            senderType: 'CUSTOMER',
            senderName: 'Khách test OA',
            content: 'Khách hỏi giá combo',
            contentType: 'TEXT',
            sentAt: '2026-03-29T04:44:00.000Z'
          },
          {
            id: 'msg_2',
            senderType: 'AGENT',
            senderName: 'Staff',
            content: 'Bên em gửi bảng giá ngay ạ',
            contentType: 'TEXT',
            sentAt: '2026-03-29T04:45:00.000Z'
          }
        ],
        nextCursor: null,
        limit: 120
      });
    }

    if (method === 'GET' && path === '/api/v1/conversations/threads/thread_oa_1/evaluation/latest') {
      return json(route, {
        evaluation: {
          id: 'eval_latest_1',
          verdict: 'PASS',
          score: 90,
          summary: 'Tư vấn đầy đủ và đúng ngữ cảnh.',
          review: 'Nên hỏi thêm nhu cầu số lượng.',
          model: 'gpt-4o-mini',
          provider: 'OPENAI_COMPATIBLE',
          evaluatedAt: '2026-03-29T04:46:00.000Z',
          violations: []
        }
      });
    }

    if (method === 'POST' && path === '/api/v1/zalo/accounts/oa_account_1/oa/messages/send') {
      return json(route, {
        success: true,
        messageId: 'oa_out_001',
        message: { id: 'msg_oa_out_1' }
      }, 201);
    }

    if (method === 'GET' && path === '/api/v1/conversation-quality/jobs') {
      return json(route, [
        {
          id: 'job_1',
          name: 'QC Zalo định kỳ',
          intervalMinutes: 120,
          lastRunStatus: 'SUCCESS',
          nextRunAt: '2026-03-29T06:00:00.000Z'
        },
        {
          id: 'job_2',
          name: 'QC OA realtime',
          intervalMinutes: 60,
          lastRunStatus: 'SUCCESS',
          nextRunAt: '2026-03-29T06:30:00.000Z'
        }
      ]);
    }

    if (method === 'GET' && path === '/api/v1/conversation-quality/runs') {
      return json(route, [
        {
          id: 'run_1',
          jobId: 'job_1',
          status: 'SUCCESS',
          startedAt: '2026-03-29T04:30:00.000Z',
          finishedAt: '2026-03-29T04:31:00.000Z',
          summaryJson: {
            totalThreads: 6,
            evaluatedCount: state.runEvaluatedCount,
            failedCount: 0,
            skippedCount: 0,
            totalViolationCount: 1
          }
        }
      ]);
    }

    if (method === 'GET' && path === '/api/v1/conversation-quality/runs/run_1') {
      return json(route, {
        id: 'run_1',
        status: 'SUCCESS',
        startedAt: '2026-03-29T04:30:00.000Z',
        finishedAt: '2026-03-29T04:31:00.000Z',
        summaryJson: {
          totalThreads: 6,
          evaluatedCount: state.runEvaluatedCount,
          failedCount: 0,
          skippedCount: 0,
          totalViolationCount: 1
        },
        evaluations: [
          {
            id: 'eval_run_1',
            verdict: 'PASS',
            score: 90,
            thread: {
              customerDisplayName: 'Khách test OA',
              externalThreadId: 'oa_thread_001'
            },
            violations: []
          }
        ]
      });
    }

    if (method === 'POST' && /\/api\/v1\/conversation-quality\/jobs\/[^/]+\/run-now$/.test(path)) {
      const jobId = path.split('/')[5] ?? '';
      state.runNowCalls += 1;
      state.runEvaluatedCount += 3;
      return json(route, {
        runId: 'run_1',
        summary: {
          triggerType: 'MANUAL',
          jobId,
          evaluatedCount: state.runEvaluatedCount
        }
      }, 201);
    }

    return json(route, { message: `Unmocked route: ${method} ${path}` }, 404);
  });
}

test.describe('CRM Conversations Inbox', () => {
  test('hiển thị thread list và message panel đúng dữ liệu', async ({ page }) => {
    const state: MockState = { runEvaluatedCount: 3, runNowCalls: 0 };
    await mockConversationsApis(page, state);

    await page.goto('/modules/crm/conversations');

    await expect(page.getByTestId('crm-conversations-workbench')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hội thoại khách hàng CRM' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Khách test OA' }).first()).toBeVisible();
    await expect(page.getByText('Khách hỏi giá combo')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Kết quả AI mới nhất' })).toBeVisible();
    await expect(page.getByText('Tư vấn đầy đủ và đúng ngữ cảnh.')).toBeVisible();
  });

  test('gửi tin nhắn từ panel phản hồi hiển thị banner thành công', async ({ page }) => {
    const state: MockState = { runEvaluatedCount: 3, runNowCalls: 0 };
    await mockConversationsApis(page, state);

    await page.goto('/modules/crm/conversations');

    await page.getByLabel('Nội dung').fill('Bảng giá hôm nay đã gửi qua OA.');
    await page.getByTestId('conversation-send-button').click();

    await expect(page.getByText('Đã gửi tin nhắn thành công.')).toBeVisible();
  });

  test('run-now cập nhật danh sách runs và run detail', async ({ page }) => {
    const state: MockState = { runEvaluatedCount: 3, runNowCalls: 0 };
    await mockConversationsApis(page, state);

    await page.goto('/modules/crm/conversations');

    await expect(page.getByRole('heading', { name: 'Lịch đánh giá AI và phiên chạy' })).toBeVisible();
    await expect(page.getByTestId('run-evaluated-run_1')).toHaveText('3');

    await page.getByTestId('run-now-job_1').click();

    await expect(page.getByText('Đã kích hoạt chạy lịch đánh giá AI.')).toBeVisible();
    await expect(page.getByTestId('run-evaluated-run_1')).toHaveText('6');
    await expect(page.getByRole('heading', { name: 'Chi tiết phiên chạy' })).toBeVisible();
  });

  test('bulk run-now jobs hiển thị summary thành công', async ({ page }) => {
    const state: MockState = { runEvaluatedCount: 3, runNowCalls: 0 };
    await mockConversationsApis(page, state);

    await page.goto('/modules/crm/conversations');

    await expect(page.getByRole('cell', { name: 'QC Zalo định kỳ' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'QC OA realtime' })).toBeVisible();

    await page.getByRole('row', { name: /QC Zalo định kỳ/ }).locator('input[type="checkbox"]').check();
    await page.getByRole('row', { name: /QC OA realtime/ }).locator('input[type="checkbox"]').check();
    await expect(page.getByText('Đã chọn 2 lịch')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Chạy ngay mục đã chọn' }).click();

    await expect.poll(() => state.runNowCalls).toBe(2);
  });
});
