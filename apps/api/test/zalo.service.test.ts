import { BadRequestException } from '@nestjs/common';
import { ConversationChannel, ConversationSenderType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZaloService } from '../src/modules/zalo/zalo.service';

describe('ZaloService OA outbound', () => {
  const prisma = {
    client: {
      zaloAccount: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn()
      },
      user: {
        findFirst: vi.fn()
      },
      employee: {
        findFirst: vi.fn()
      },
      customer: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn()
      },
      conversationThread: {
        findFirst: vi.fn(),
        updateMany: vi.fn()
      }
    },
    getTenantId: vi.fn(() => 'tenant_demo_company')
  } as any;

  const config = {
    get: vi.fn(() => '')
  } as any;
  const cls = {
    get: vi.fn(() => ({}))
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
    sendMessage: vi.fn(),
    getReconnectFailureMetrics: vi.fn(),
    disconnect: vi.fn(),
    getConnectedApi: vi.fn(),
    cancelAutoReplyForThread: vi.fn()
  } as any;
  const oaOutboundWorker = {
    sendTextMessage: vi.fn()
  } as any;
  const runtimeSettings = {
    getIntegrationRuntime: vi.fn()
  } as any;
  const zaloRealtime = {
    emitScoped: vi.fn()
  } as any;

  let service: ZaloService;

  beforeEach(() => {
    vi.restoreAllMocks();
    prisma.client.zaloAccount.findFirst.mockReset();
    prisma.client.zaloAccount.findMany.mockReset();
    prisma.client.zaloAccount.updateMany.mockReset();
    prisma.client.zaloAccount.create.mockReset();
    prisma.client.user.findFirst.mockReset();
    prisma.client.employee.findFirst.mockReset();
    prisma.client.customer.findFirst.mockReset();
    prisma.client.customer.updateMany.mockReset();
    prisma.client.customer.create.mockReset();
    prisma.client.conversationThread.findFirst.mockReset();
    prisma.client.conversationThread.updateMany.mockReset();
    conversationsService.ingestExternalMessage.mockReset();
    zaloAssignment.assertCanChatAccount.mockReset();
    zaloAssignment.resolveAccessibleAccountIds.mockReset();
    zaloAssignment.assertCanViewOperationalMetrics.mockReset();
    zaloAssignment.getAssignmentMismatchMetrics.mockReset();
    oaOutboundWorker.sendTextMessage.mockReset();
    personalPool.sendMessage.mockReset();
    personalPool.getReconnectFailureMetrics.mockReset();
    personalPool.disconnect.mockReset();
    personalPool.getConnectedApi.mockReset();
    personalPool.cancelAutoReplyForThread.mockReset();
    runtimeSettings.getIntegrationRuntime.mockReset();
    cls.get.mockReset();
    cls.get.mockReturnValue({});
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
    personalPool.disconnect.mockResolvedValue(undefined);
    personalPool.getConnectedApi.mockReturnValue(null);
    runtimeSettings.getIntegrationRuntime.mockResolvedValue({
      zalo: {
        outboundUrl: '',
        apiBaseUrl: 'https://openapi.zalo.me/v3.0/oa',
        outboundTimeoutMs: 20000,
        accessToken: 'token_runtime'
      }
    });

    service = new ZaloService(
      prisma,
      config,
      cls,
      conversationsService,
      zaloAssignment,
      personalPool,
      oaOutboundWorker,
      runtimeSettings,
      zaloRealtime
    );
  });

  it('creates account with owner bound to current non-admin user', async () => {
    cls.get.mockReturnValue({
      userId: 'staff_erp_1',
      role: 'STAFF'
    });
    prisma.client.zaloAccount.create.mockResolvedValue({
      id: 'zalo_account_created_1'
    });

    await service.createAccount({
      accountType: 'PERSONAL',
      displayName: 'Zalo CSKH',
      phone: '0909000111',
      ownerUserId: 'manager_override_1',
      zaloUid: 'uid_should_be_ignored'
    });

    expect(prisma.client.zaloAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountType: 'PERSONAL',
          displayName: 'Zalo CSKH',
          phone: '0909000111',
          aiAutoReplyEnabled: false,
          aiAutoReplyTakeoverMinutes: 5,
          ownerUserId: 'staff_erp_1',
          zaloUid: null
        })
      })
    );
  });

  it('allows admin to assign owner when creating account', async () => {
    cls.get.mockReturnValue({
      userId: 'admin_erp_1',
      role: 'ADMIN'
    });
    prisma.client.zaloAccount.create.mockResolvedValue({
      id: 'zalo_account_created_2'
    });

    await service.createAccount({
      accountType: 'PERSONAL',
      displayName: 'Zalo sale 01',
      phone: '0909000222',
      ownerUserId: 'manager_erp_1'
    });

    expect(prisma.client.zaloAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerUserId: 'manager_erp_1'
        })
      })
    );
  });

  it('marks manual takeover window when personal message is sent by user origin', async () => {
    prisma.client.zaloAccount.findFirst
      .mockResolvedValueOnce({
        id: 'acc_personal_1',
        accountType: 'PERSONAL',
        aiAutoReplyTakeoverMinutes: 5
      })
      .mockResolvedValueOnce({
        id: 'acc_personal_1',
        accountType: 'PERSONAL',
        aiAutoReplyTakeoverMinutes: 5
      });
    prisma.client.conversationThread.findFirst.mockResolvedValue({
      id: 'thread_1',
      metadataJson: {}
    });
    personalPool.sendMessage.mockResolvedValue({ success: true });

    await service.sendPersonalMessage('acc_personal_1', {
      externalThreadId: 'customer_001',
      content: 'Xin chao',
      origin: 'USER'
    });

    expect(prisma.client.conversationThread.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'thread_1' }
      })
    );
    expect(personalPool.cancelAutoReplyForThread).toHaveBeenCalledWith('thread_1');
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

  it('uses ERP user fullName as sender when auth context has employeeId', async () => {
    cls.get.mockReturnValue({
      userId: 'user_admin_1',
      email: 'admin@erp.local',
      employeeId: 'emp_1'
    });
    prisma.client.employee.findFirst.mockResolvedValue({
      id: 'emp_1',
      fullName: 'Nguyen Van Admin',
      email: 'admin@erp.local'
    });
    prisma.client.zaloAccount.findFirst.mockResolvedValue({
      id: 'oa_account_1',
      accountType: 'OA',
      displayName: 'OA CSKH',
      zaloUid: 'oa_uid_001',
      accessTokenEnc: 'token_oa',
      metadataJson: {}
    });
    oaOutboundWorker.sendTextMessage.mockResolvedValue({
      externalMessageId: 'oa_msg_sender_1'
    });
    conversationsService.ingestExternalMessage.mockResolvedValue({
      id: 'message_sender_1'
    });

    await service.sendOaMessage('oa_account_1', {
      externalThreadId: 'oa_thread_sender',
      content: 'hello'
    });

    expect(conversationsService.ingestExternalMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderName: 'Nguyen Van Admin'
      })
    );
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

  it('soft deletes personal account without removing conversation history', async () => {
    prisma.client.zaloAccount.findFirst
      .mockResolvedValueOnce({
        id: 'personal_account_1',
        tenant_Id: 'tenant_demo_company',
        accountType: 'PERSONAL',
        status: 'CONNECTED'
      })
      .mockResolvedValueOnce({
        id: 'personal_account_1',
        status: 'INACTIVE'
      });

    const result = await service.softDeleteAccount('personal_account_1');

    expect(personalPool.disconnect).toHaveBeenCalledWith('personal_account_1');
    expect(prisma.client.zaloAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'personal_account_1' },
        data: { status: 'INACTIVE' }
      })
    );
    expect(zaloRealtime.emitScoped).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'tenant_demo_company',
        accountId: 'personal_account_1',
        event: 'zalo:disconnected'
      })
    );
    expect(result).toMatchObject({
      success: true,
      account: {
        id: 'personal_account_1',
        status: 'INACTIVE'
      }
    });
  });

  it('syncs contacts using phone-only rule and upserts customers by normalized phone', async () => {
    prisma.client.zaloAccount.findFirst.mockResolvedValue({
      id: 'personal_account_2',
      tenant_Id: 'tenant_demo_company',
      accountType: 'PERSONAL',
      status: 'CONNECTED'
    });

    personalPool.getConnectedApi.mockReturnValue({
      getAllFriends: vi.fn().mockResolvedValue({
        a1: {
          userId: 'u1',
          zaloName: 'Khach 01',
          phoneNumber: '0909 111 222'
        },
        a2: {
          userId: 'u2',
          zaloName: 'Khach 02',
          phoneNumber: ''
        },
        a3: {
          userId: 'u3',
          zaloName: 'Khach 03',
          phoneNumber: '0909-333-444'
        }
      })
    });

    prisma.client.customer.findFirst
      .mockResolvedValueOnce({
        id: 'customer_existing_1',
        fullName: 'Old Name',
        phone: '0909111222',
        source: null
      })
      .mockResolvedValueOnce(null);

    const result = await service.syncContacts('personal_account_2');

    expect(prisma.client.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'customer_existing_1' },
        data: expect.objectContaining({
          phoneNormalized: '0909111222',
          source: 'ZALO'
        })
      })
    );
    expect(prisma.client.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_Id: 'tenant_demo_company',
          phoneNormalized: '0909333444',
          source: 'ZALO'
        })
      })
    );
    expect(result).toMatchObject({
      success: true,
      totalContacts: 3,
      created: 1,
      updated: 1,
      skippedNoPhone: 1
    });
  });
});
