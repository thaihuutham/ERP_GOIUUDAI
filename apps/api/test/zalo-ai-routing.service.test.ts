import { ConversationChannel } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZaloAiRoutingService } from '../src/modules/zalo/zalo-ai-routing.service';

describe('ZaloAiRoutingService', () => {
  const prisma = {
    client: {
      aiRoutingChannelAccount: {
        findFirst: vi.fn()
      }
    },
    getTenantId: vi.fn(() => 'tenant_demo_company')
  } as any;

  const config = {
    get: vi.fn((key: string) => {
      const defaults: Record<string, unknown> = {
        AI_ROUTING_MODE: 'n8n',
        AI_N8N_CHAT_EVENTS_URL: 'https://n8n.local/webhook/chat-events',
        AI_N8N_OUTBOUND_HMAC_SECRET: 'outbound_secret',
        AI_N8N_CALLBACK_HMAC_SECRET: 'callback_secret',
        AI_N8N_DEBOUNCE_SECONDS: '8',
        AI_N8N_DISPATCH_TIMEOUT_MS: '25000',
        AI_N8N_MAX_RETRY_ATTEMPTS: '3',
        AI_N8N_RETRY_BACKOFF_SECONDS: '10,30,90'
      };
      return defaults[key];
    })
  } as any;

  const runtimeSettings = {
    getDomain: vi.fn(async () => ({}))
  } as any;

  let service: ZaloAiRoutingService;

  beforeEach(() => {
    vi.restoreAllMocks();
    prisma.client.aiRoutingChannelAccount.findFirst.mockReset();
    runtimeSettings.getDomain.mockReset();
    runtimeSettings.getDomain.mockResolvedValue({});

    service = new ZaloAiRoutingService(prisma, config, runtimeSettings);
  });

  it('reads runtime config with defaults from env/runtime settings', async () => {
    const runtime = await service.getRuntimeConfig();

    expect(runtime).toMatchObject({
      mode: 'n8n',
      chatEventsUrl: 'https://n8n.local/webhook/chat-events',
      outboundHmacSecret: 'outbound_secret',
      callbackHmacSecret: 'callback_secret',
      debounceSeconds: 8,
      dispatchTimeoutMs: 25000,
      maxRetryAttempts: 3,
      retryBackoffSeconds: [10, 30, 90]
    });
  });

  it('resolves active route from mapping + active binding snapshot', async () => {
    prisma.client.aiRoutingChannelAccount.findFirst.mockResolvedValue({
      channel: ConversationChannel.ZALO_PERSONAL,
      channelAccountId: 'acc_1',
      industry: {
        id: 'industry_1',
        industryKey: 'bao-hiem',
        name: 'Bao hiem',
        knowledgeSpaceRef: 'kb://bao-hiem',
        piiMaskEnabled: true,
        piiMaskConfigJson: { allowRawFields: ['customer.segment'] },
        isActive: true,
        industryBinding: [
          {
            workflowKey: 'wf_bao_hiem',
            agentKey: 'agent_bao_hiem',
            webhookPath: '/wf/bao-hiem',
            isActive: true
          }
        ]
      }
    });

    const resolved = await service.resolveActiveRoute(ConversationChannel.ZALO_PERSONAL, 'acc_1');

    expect(resolved).toMatchObject({
      industryId: 'industry_1',
      industryKey: 'bao-hiem',
      industryName: 'Bao hiem',
      knowledgeSpaceRef: 'kb://bao-hiem',
      piiMaskEnabled: true,
      workflowKey: 'wf_bao_hiem',
      agentKey: 'agent_bao_hiem',
      webhookPath: '/wf/bao-hiem'
    });
  });

  it('returns null when mapping has no active industry binding', async () => {
    prisma.client.aiRoutingChannelAccount.findFirst.mockResolvedValue({
      channel: ConversationChannel.ZALO_PERSONAL,
      channelAccountId: 'acc_2',
      industry: {
        id: 'industry_2',
        industryKey: 'vien-thong',
        name: 'Vien thong',
        knowledgeSpaceRef: null,
        piiMaskEnabled: true,
        piiMaskConfigJson: null,
        isActive: true,
        industryBinding: []
      }
    });

    const resolved = await service.resolveActiveRoute(ConversationChannel.ZALO_PERSONAL, 'acc_2');

    expect(resolved).toBeNull();
  });
});
