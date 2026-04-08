import { UnauthorizedException } from '@nestjs/common';
import { AiConversationJobStatus, ConversationChannel } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZaloAiJobsService } from '../src/modules/zalo/zalo-ai-jobs.service';

describe('ZaloAiJobsService callback guardrails', () => {
  const prisma = {
    getTenantId: vi.fn(() => 'tenant_demo_company'),
    client: {
      aiConversationJob: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn()
      },
      aiConversationOutbox: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn()
      },
      conversationMessage: {
        findFirst: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn()
      },
      conversationThread: {
        findFirst: vi.fn(),
        updateMany: vi.fn()
      },
      zaloAccount: {
        findFirst: vi.fn()
      },
      $transaction: vi.fn(async (handler: (tx: any) => Promise<unknown>) => handler(prisma.client))
    }
  } as any;

  const routingService = {
    getRuntimeConfig: vi.fn(async () => ({
      mode: 'n8n',
      chatEventsUrl: 'https://n8n.local/webhook/chat-events',
      outboundHmacSecret: 'outbound_secret',
      callbackHmacSecret: 'callback_secret',
      debounceSeconds: 8,
      dispatchTimeoutMs: 25000,
      maxRetryAttempts: 3,
      retryBackoffSeconds: [10, 30, 90]
    }))
  } as any;

  let service: ZaloAiJobsService;

  beforeEach(() => {
    vi.restoreAllMocks();
    prisma.client.aiConversationJob.findFirst.mockReset();
    prisma.client.aiConversationJob.updateMany.mockReset();
    prisma.client.conversationMessage.findFirst.mockReset();
    prisma.client.conversationMessage.count.mockReset();
    prisma.client.zaloAccount.findFirst.mockReset();

    routingService.getRuntimeConfig.mockReset();
    routingService.getRuntimeConfig.mockResolvedValue({
      mode: 'n8n',
      chatEventsUrl: 'https://n8n.local/webhook/chat-events',
      outboundHmacSecret: 'outbound_secret',
      callbackHmacSecret: 'callback_secret',
      debounceSeconds: 8,
      dispatchTimeoutMs: 25000,
      maxRetryAttempts: 3,
      retryBackoffSeconds: [10, 30, 90]
    });

    service = new ZaloAiJobsService(prisma, routingService);
  });

  it('verifies callback HMAC signature', async () => {
    const rawBody = JSON.stringify({ eventId: 'evt_1' });
    const signature = createHmac('sha256', 'callback_secret').update(rawBody).digest('hex');

    await expect(service.verifyCallbackSignature(rawBody, `sha256=${signature}`)).resolves.toBeUndefined();
    await expect(service.verifyCallbackSignature(rawBody, 'sha256=invalid')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('treats duplicate callback eventId as NOOP', async () => {
    prisma.client.aiConversationJob.findFirst.mockResolvedValue({
      id: 'job_1',
      status: AiConversationJobStatus.REPLIED,
      callbackPayloadJson: { already: true },
      thread: {
        id: 'thread_1',
        channel: ConversationChannel.ZALO_PERSONAL,
        channelAccountId: 'acc_1',
        externalThreadId: 'ext_thread_1',
        metadataJson: {}
      },
      customerMessageId: 'msg_customer_1'
    });

    const result = await service.registerCallback({
      eventId: 'evt_1',
      replyText: 'Xin chao'
    });

    expect(result).toMatchObject({
      action: 'NOOP',
      duplicate: true,
      jobId: 'job_1',
      status: AiConversationJobStatus.REPLIED
    });
    expect(prisma.client.aiConversationJob.updateMany).not.toHaveBeenCalled();
  });

  it('skips send when account auto-reply is disabled during callback re-check', async () => {
    prisma.client.aiConversationJob.findFirst.mockResolvedValue({
      id: 'job_2',
      status: AiConversationJobStatus.DISPATCHED,
      callbackPayloadJson: null,
      thread: {
        id: 'thread_2',
        channel: ConversationChannel.ZALO_PERSONAL,
        channelAccountId: 'acc_2',
        externalThreadId: 'ext_thread_2',
        metadataJson: {}
      },
      customerMessageId: 'msg_customer_2'
    });
    prisma.client.aiConversationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.zaloAccount.findFirst.mockResolvedValue({
      id: 'acc_2',
      aiAutoReplyEnabled: false
    });

    const result = await service.registerCallback({
      eventId: 'evt_2',
      replyText: 'Nội dung AI trả lời'
    });

    expect(result).toMatchObject({
      action: 'SKIP',
      duplicate: false,
      jobId: 'job_2',
      status: AiConversationJobStatus.SKIPPED_DISABLED,
      reason: 'ACCOUNT_AUTO_REPLY_DISABLED'
    });

    const updatedStatuses = prisma.client.aiConversationJob.updateMany.mock.calls
      .map((call: any[]) => call?.[0]?.data?.status)
      .filter(Boolean);

    expect(updatedStatuses).toContain(AiConversationJobStatus.CALLBACK_RECEIVED);
    expect(updatedStatuses).toContain(AiConversationJobStatus.SKIPPED_DISABLED);
  });

  it('returns SEND decision when callback is valid and guardrails pass', async () => {
    prisma.client.aiConversationJob.findFirst.mockResolvedValue({
      id: 'job_3',
      status: AiConversationJobStatus.DISPATCHED,
      callbackPayloadJson: null,
      thread: {
        id: 'thread_3',
        channel: ConversationChannel.ZALO_PERSONAL,
        channelAccountId: 'acc_3',
        externalThreadId: 'ext_thread_3',
        metadataJson: {}
      },
      customerMessageId: 'msg_customer_3'
    });
    prisma.client.aiConversationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.zaloAccount.findFirst.mockResolvedValue({
      id: 'acc_3',
      aiAutoReplyEnabled: true
    });
    prisma.client.conversationMessage.findFirst.mockResolvedValue({
      id: 'msg_customer_3',
      sentAt: new Date('2026-04-08T00:00:00.000Z')
    });
    prisma.client.conversationMessage.count.mockResolvedValue(0);

    const result = await service.registerCallback({
      eventId: 'evt_3',
      replyText: 'Xin chao ban, minh co the ho tro gi?',
      confidence: 0.86,
      workflowKey: 'wf_bao_hiem',
      agentKey: 'agent_bao_hiem',
      tokenUsage: { prompt: 100, completion: 40 },
      latencyMs: 950,
      safetyFlags: { pii: false },
      shouldHandoff: false
    });

    expect(result).toMatchObject({
      action: 'SEND',
      duplicate: false,
      jobId: 'job_3',
      accountId: 'acc_3',
      externalThreadId: 'ext_thread_3',
      replyText: 'Xin chao ban, minh co the ho tro gi?',
      eventId: 'evt_3'
    });
    expect((result as any).metadata).toMatchObject({
      confidence: 0.86,
      workflowKey: 'wf_bao_hiem',
      agentKey: 'agent_bao_hiem',
      latencyMs: 950
    });
  });
});
