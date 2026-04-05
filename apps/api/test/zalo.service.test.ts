import { BadRequestException } from '@nestjs/common';
import { ConversationChannel, ConversationSenderType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZaloService } from '../src/modules/zalo/zalo.service';

describe('ZaloService OA outbound', () => {
  const prisma = {
    client: {
      zaloAccount: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      }
    },
    getTenantId: vi.fn(() => 'tenant_demo_company')
  } as any;

  const config = {
    get: vi.fn(() => '')
  } as any;

  const conversationsService = {
    ingestExternalMessage: vi.fn()
  } as any;

  const zaloAssignment = {
    assertCanChatAccount: vi.fn(),
    resolveAccessibleAccountIds: vi.fn(),
    assertCanViewOperationalMetrics: vi.fn(),
    getAssignmentMismatchMetrics: vi.fn()
  } as any;

  const personalPool = {
    getReconnectFailureMetrics: vi.fn()
  } as any;
  const oaOutboundWorker = {
    sendTextMessage: vi.fn()
  } as any;
  const runtimeSettings = {
    getIntegrationRuntime: vi.fn()
  } as any;

  let service: ZaloService;

  beforeEach(() => {
    vi.restoreAllMocks();
    prisma.client.zaloAccount.findFirst.mockReset();
    prisma.client.zaloAccount.findMany.mockReset();
    conversationsService.ingestExternalMessage.mockReset();
    zaloAssignment.assertCanChatAccount.mockReset();
    zaloAssignment.resolveAccessibleAccountIds.mockReset();
    zaloAssignment.assertCanViewOperationalMetrics.mockReset();
    zaloAssignment.getAssignmentMismatchMetrics.mockReset();
    oaOutboundWorker.sendTextMessage.mockReset();
    personalPool.getReconnectFailureMetrics.mockReset();
    runtimeSettings.getIntegrationRuntime.mockReset();
    zaloAssignment.resolveAccessibleAccountIds.mockResolvedValue(null);
    zaloAssignment.assertCanChatAccount.mockResolvedValue(undefined);
    zaloAssignment.assertCanViewOperationalMetrics.mockResolvedValue(undefined);
    zaloAssignment.getAssignmentMismatchMetrics.mockResolvedValue({
      totalActiveAssignments: 0,
      mismatchCount: 0,
      mismatchByReason: {
        USER_ID_EMPTY: 0,
        USER_NOT_FOUND: 0,
        USER_INACTIVE: 0,
        DUPLICATE_ACTIVE_ASSIGNMENT: 0
      },
      samples: []
    });
    personalPool.getReconnectFailureMetrics.mockReturnValue({
      totalFailures: 0,
      byAccount: []
    });
    runtimeSettings.getIntegrationRuntime.mockResolvedValue({
      zalo: {
        outboundUrl: '',
        apiBaseUrl: 'https://openapi.zalo.me/v3.0/oa',
        outboundTimeoutMs: 20000,
        accessToken: 'token_runtime'
      }
    });

    service = new ZaloService(prisma, config, conversationsService, zaloAssignment, personalPool, oaOutboundWorker, runtimeSettings);
  });

  it('sends OA message and ingests outbound message into thread', async () => {
    prisma.client.zaloAccount.findFirst.mockResolvedValue({
      id: 'oa_account_1',
      accountType: 'OA',
      displayName: 'OA CSKH',
      zaloUid: 'oa_uid_001',
      accessTokenEnc: 'token_oa',
      metadataJson: { outboundUrl: 'https://example.test/zalo/oa/send' }
    });

    vi.spyOn(service as any, 'parseDate');

    oaOutboundWorker.sendTextMessage.mockResolvedValue({
      requestUrl: 'https://example.test/zalo/oa/send',
      response: { error: 0, data: { message_id: 'oa_msg_123' } },
      externalMessageId: 'oa_msg_123'
    });

    conversationsService.ingestExternalMessage.mockResolvedValue({
      id: 'message_local_1'
    });

    const result = await service.sendOaMessage('oa_account_1', {
      externalThreadId: 'oa_user_123',
      content: 'Xin chao tu OA'
    });

    expect(oaOutboundWorker.sendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        account: {
          id: 'oa_account_1',
          accessTokenEnc: 'token_oa',
          metadataJson: { outboundUrl: 'https://example.test/zalo/oa/send' }
        },
        externalThreadId: 'oa_user_123',
        content: 'Xin chao tu OA',
        recipientId: undefined,
        runtimeConfig: expect.objectContaining({
          apiBaseUrl: 'https://openapi.zalo.me/v3.0/oa',
          outboundTimeoutMs: 20000,
          accessToken: 'token_runtime'
        })
      })
    );

    expect(conversationsService.ingestExternalMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: ConversationChannel.ZALO_OA,
        channelAccountId: 'oa_account_1',
        externalThreadId: 'oa_user_123',
        externalMessageId: 'oa_msg_123',
        senderType: ConversationSenderType.AGENT,
        senderName: 'OA CSKH',
        senderExternalId: 'oa_uid_001',
        content: 'Xin chao tu OA'
      })
    );

    expect(result).toMatchObject({
      success: true,
      messageId: 'oa_msg_123'
    });
  });

  it('rejects sending OA message when account type is PERSONAL', async () => {
    prisma.client.zaloAccount.findFirst.mockResolvedValue({
      id: 'personal_account_1',
      accountType: 'PERSONAL'
    });

    await expect(
      service.sendOaMessage('personal_account_1', {
        externalThreadId: 'oa_user_123',
        content: 'Xin chao'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns operational metrics snapshot for support runbook', async () => {
    prisma.client.zaloAccount.findMany.mockResolvedValue([
      { id: 'acc_personal_1', accountType: 'PERSONAL', status: 'CONNECTED' },
      { id: 'acc_personal_2', accountType: 'PERSONAL', status: 'DISCONNECTED' },
      { id: 'acc_oa_1', accountType: 'OA', status: 'CONNECTED' }
    ]);
    personalPool.getReconnectFailureMetrics.mockReturnValue({
      totalFailures: 3,
      byAccount: [{ accountId: 'acc_personal_2', count: 3 }]
    });
    zaloAssignment.getAssignmentMismatchMetrics.mockResolvedValue({
      totalActiveAssignments: 8,
      mismatchCount: 1,
      mismatchByReason: {
        USER_ID_EMPTY: 0,
        USER_NOT_FOUND: 1,
        USER_INACTIVE: 0,
        DUPLICATE_ACTIVE_ASSIGNMENT: 0
      },
      samples: [
        {
          assignmentId: 'assign_1',
          userId: 'staff_missing',
          zaloAccountId: 'acc_personal_2',
          reason: 'USER_NOT_FOUND'
        }
      ]
    });

    const metrics = await service.getOperationalMetrics();

    expect(zaloAssignment.assertCanViewOperationalMetrics).toHaveBeenCalledTimes(1);
    expect(personalPool.getReconnectFailureMetrics).toHaveBeenCalledWith([
      'acc_personal_1',
      'acc_personal_2',
      'acc_oa_1'
    ]);
    expect(metrics).toMatchObject({
      accountMetrics: {
        totalAccounts: 3,
        activeAccounts: 2,
        personalTotalAccounts: 2,
        personalActiveAccounts: 1,
        oaTotalAccounts: 1,
        oaActiveAccounts: 1,
        statusBreakdown: {
          CONNECTED: 2,
          DISCONNECTED: 1
        }
      },
      reconnectMetrics: {
        totalFailures: 3
      },
      assignmentMetrics: {
        mismatchCount: 1
      }
    });
  });
});
