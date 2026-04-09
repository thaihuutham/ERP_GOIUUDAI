import { ConversationChannel, ConversationSenderType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationsService } from '../src/modules/conversations/conversations.service';

describe('ConversationsService realtime emission', () => {
  const prisma = {
    getTenantId: vi.fn(() => 'tenant_demo_company'),
    client: {
      conversationThread: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        findFirstOrThrow: vi.fn()
      },
      conversationMessage: {
        findFirst: vi.fn(),
        create: vi.fn()
      },
      customer: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn()
      },
      customerSocialIdentity: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn()
      },
      $transaction: vi.fn()
    }
  } as any;

  const zaloAssignment = {
    resolveAccessibleAccountIds: vi.fn(),
    assertCanReadAccount: vi.fn(),
    assertCanChatAccount: vi.fn()
  } as any;

  const zaloRealtime = {
    emitScoped: vi.fn()
  } as any;
  const runtimeSettings = {
    getSalesCrmPolicyRuntime: vi.fn()
  } as any;
  const cls = {
    get: vi.fn(() => ({}))
  } as any;

  let service: ConversationsService;

  beforeEach(() => {
    vi.restoreAllMocks();
    prisma.client.conversationThread.findFirst.mockReset();
    prisma.client.conversationThread.findMany.mockReset();
    prisma.client.conversationThread.create.mockReset();
    prisma.client.conversationThread.updateMany.mockReset();
    prisma.client.conversationThread.findFirstOrThrow.mockReset();
    prisma.client.conversationMessage.findFirst.mockReset();
    prisma.client.conversationMessage.create.mockReset();
    prisma.client.customer.findFirst.mockReset();
    prisma.client.customer.findMany.mockReset();
    prisma.client.customer.create.mockReset();
    prisma.client.customerSocialIdentity.findFirst.mockReset();
    prisma.client.customerSocialIdentity.findMany.mockReset();
    prisma.client.customerSocialIdentity.create.mockReset();
    prisma.client.customerSocialIdentity.updateMany.mockReset();
    prisma.client.$transaction.mockReset();
    prisma.client.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => callback(prisma.client));
    zaloAssignment.resolveAccessibleAccountIds.mockReset();
    zaloAssignment.resolveAccessibleAccountIds.mockResolvedValue(null);
    zaloAssignment.assertCanReadAccount.mockReset();
    zaloAssignment.assertCanChatAccount.mockReset();
    zaloRealtime.emitScoped.mockReset();
    runtimeSettings.getSalesCrmPolicyRuntime.mockReset();
    runtimeSettings.getSalesCrmPolicyRuntime.mockResolvedValue({
      customerTaxonomy: {
        stages: ['MOI_CHUA_TU_VAN'],
        sources: ['ZALO', 'ONLINE']
      }
    });
    cls.get.mockReset();
    cls.get.mockReturnValue({});
    service = new ConversationsService(prisma, cls, zaloAssignment, zaloRealtime, runtimeSettings);
  });

  it('emits chat:message for zalo channels', async () => {
    prisma.client.conversationThread.findFirst.mockResolvedValueOnce(null);
    prisma.client.conversationThread.create.mockResolvedValueOnce({
      id: 'thread_zalo_1',
      unreadCount: 0,
      isReplied: true
    });
    prisma.client.conversationMessage.findFirst.mockResolvedValueOnce(null);
    prisma.client.conversationMessage.create.mockResolvedValueOnce({
      id: 'msg_1',
      tenant_Id: 'tenant_demo_company',
      threadId: 'thread_zalo_1',
      content: 'Xin chao'
    });

    await service.ingestExternalMessage({
      channel: ConversationChannel.ZALO_OA,
      channelAccountId: 'acc_oa_1',
      externalThreadId: 'oa_thread_1',
      senderType: ConversationSenderType.CUSTOMER,
      content: 'Xin chao'
    });

    expect(zaloRealtime.emitScoped).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'tenant_demo_company',
        accountId: 'acc_oa_1',
        event: 'chat:message',
        payload: expect.objectContaining({
          accountId: 'acc_oa_1',
          conversationId: 'thread_zalo_1'
        })
      })
    );
  });

  it('does not emit chat:message for non-zalo channels', async () => {
    prisma.client.conversationThread.findFirst.mockResolvedValueOnce(null);
    prisma.client.conversationThread.create.mockResolvedValueOnce({
      id: 'thread_other_1',
      unreadCount: 0,
      isReplied: true
    });
    prisma.client.conversationMessage.findFirst.mockResolvedValueOnce(null);
    prisma.client.conversationMessage.create.mockResolvedValueOnce({
      id: 'msg_2',
      tenant_Id: 'tenant_demo_company',
      threadId: 'thread_other_1',
      content: 'Xin chao'
    });

    await service.ingestExternalMessage({
      channel: ConversationChannel.OTHER,
      externalThreadId: 'other_thread_1',
      senderType: ConversationSenderType.CUSTOMER,
      content: 'Xin chao'
    });

    expect(zaloRealtime.emitScoped).not.toHaveBeenCalled();
  });

  it('returns suggested matchStatus when thread is unmatched but phone can map customer', async () => {
    prisma.client.conversationThread.findMany.mockResolvedValue([
      {
        id: 'thread_suggest_1',
        channel: ConversationChannel.ZALO_PERSONAL,
        channelAccountId: 'acc_1',
        externalThreadId: '0901234567',
        customerId: null,
        customerDisplayName: 'Khach Moi',
        metadataJson: null,
        unreadCount: 0,
        isReplied: false,
        lastMessageAt: new Date('2026-04-01T01:00:00.000Z'),
        customer: null,
        channelAccount: null,
        evaluations: []
      }
    ]);
    prisma.client.customer.findMany.mockResolvedValue([
      {
        id: 'cus_suggest_1',
        fullName: 'Khach Goi Y',
        phone: '0901234567',
        phoneNormalized: '0901234567',
        email: 'goiy@example.com',
        ownerStaffId: 'staff_1'
      }
    ]);
    prisma.client.customerSocialIdentity.findMany.mockResolvedValue([]);

    const result = await service.listThreads({ limit: 30 } as any, {
      channel: 'ALL'
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].matchStatus).toBe('suggested');
    expect(result.items[0].suggestedCustomer?.id).toBe('cus_suggest_1');
  });

  it('quick-create is idempotent when social identity already exists', async () => {
    prisma.client.conversationThread.findFirst
      .mockResolvedValueOnce({
        id: 'thread_quick_1',
        channel: ConversationChannel.ZALO_PERSONAL,
        channelAccountId: 'acc_1',
        externalThreadId: 'uid_existing_1',
        customerId: null,
        customerDisplayName: 'Khach Quick'
      })
      .mockResolvedValueOnce({
        id: 'thread_quick_1',
        channel: ConversationChannel.ZALO_PERSONAL,
        channelAccountId: 'acc_1',
        externalThreadId: 'uid_existing_1',
        customerId: null,
        customerDisplayName: 'Khach Quick',
        customer: null,
        metadataJson: null
      });
    prisma.client.customerSocialIdentity.findFirst.mockResolvedValue({
      customerId: 'cus_existing_1'
    });
    prisma.client.customer.findFirst.mockResolvedValue({
      id: 'cus_existing_1',
      fullName: 'Khach Da Co',
      phone: '0909999999',
      email: 'khach@demo.test',
      ownerStaffId: null
    });
    prisma.client.conversationThread.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.conversationThread.findFirstOrThrow.mockResolvedValue({
      id: 'thread_quick_1',
      channel: ConversationChannel.ZALO_PERSONAL,
      channelAccountId: 'acc_1',
      externalThreadId: 'uid_existing_1',
      customerId: 'cus_existing_1',
      customerDisplayName: 'Khach Da Co',
      metadataJson: null,
      customer: {
        id: 'cus_existing_1',
        fullName: 'Khach Da Co',
        phone: '0909999999',
        email: 'khach@demo.test'
      },
      channelAccount: null,
      evaluations: []
    });

    const result = await service.quickCreateCustomerFromThread('thread_quick_1', {
      fullName: 'Khach Moi'
    });

    expect(result.deduplicated).toBe(true);
    expect(result.customer?.id).toBe('cus_existing_1');
    expect(prisma.client.customer.create).not.toHaveBeenCalled();
  });

  it('link-customer creates social identity from thread when missing', async () => {
    prisma.client.conversationThread.findFirst.mockResolvedValue({
      id: 'thread_link_1',
      channel: ConversationChannel.ZALO_PERSONAL,
      channelAccountId: 'acc_1',
      externalThreadId: 'uid_link_1',
      customerId: null,
      customerDisplayName: 'Khach Link',
      metadataJson: null
    });
    prisma.client.customer.findFirst.mockResolvedValue({
      id: 'cus_link_1',
      fullName: 'Khach Da Xac Dinh',
      phone: '0901111111',
      email: 'link@example.com',
      ownerStaffId: null
    });
    prisma.client.customerSocialIdentity.findFirst.mockResolvedValue(null);
    prisma.client.customerSocialIdentity.create.mockResolvedValue({
      id: 'identity_1'
    });
    prisma.client.conversationThread.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.conversationThread.findFirstOrThrow.mockResolvedValue({
      id: 'thread_link_1',
      channel: ConversationChannel.ZALO_PERSONAL,
      channelAccountId: 'acc_1',
      externalThreadId: 'uid_link_1',
      customerId: 'cus_link_1',
      customerDisplayName: 'Khach Da Xac Dinh',
      metadataJson: null,
      customer: {
        id: 'cus_link_1',
        fullName: 'Khach Da Xac Dinh',
        phone: '0901111111',
        email: 'link@example.com'
      },
      channelAccount: null,
      evaluations: []
    });

    const result = await service.linkThreadCustomer('thread_link_1', {
      customerId: 'cus_link_1'
    });

    expect(prisma.client.customerSocialIdentity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        platform: 'ZALO',
        externalUserId: 'uid_link_1',
        customerId: 'cus_link_1'
      })
    }));
    expect(result.matchStatus).toBe('matched');
    expect(result.customerId).toBe('cus_link_1');
  });

  it('link-customer supports manual linking by customer phone', async () => {
    prisma.client.conversationThread.findFirst.mockResolvedValue({
      id: 'thread_link_phone_1',
      channel: ConversationChannel.ZALO_PERSONAL,
      channelAccountId: 'acc_1',
      externalThreadId: 'uid_link_phone_1',
      customerId: null,
      customerDisplayName: 'Khach So Dien Thoai',
      metadataJson: null
    });
    prisma.client.customer.findFirst.mockResolvedValue({
      id: 'cus_link_phone_1',
      fullName: 'Khach Theo So',
      phone: '0901234567',
      email: 'phone@example.com',
      ownerStaffId: null
    });
    prisma.client.customerSocialIdentity.findFirst.mockResolvedValue(null);
    prisma.client.customerSocialIdentity.create.mockResolvedValue({
      id: 'identity_phone_1'
    });
    prisma.client.conversationThread.updateMany.mockResolvedValue({ count: 1 });
    prisma.client.conversationThread.findFirstOrThrow.mockResolvedValue({
      id: 'thread_link_phone_1',
      channel: ConversationChannel.ZALO_PERSONAL,
      channelAccountId: 'acc_1',
      externalThreadId: 'uid_link_phone_1',
      customerId: 'cus_link_phone_1',
      customerDisplayName: 'Khach Theo So',
      metadataJson: null,
      customer: {
        id: 'cus_link_phone_1',
        fullName: 'Khach Theo So',
        phone: '0901234567',
        email: 'phone@example.com'
      },
      channelAccount: null,
      evaluations: []
    });

    const result = await service.linkThreadCustomer('thread_link_phone_1', {
      customerPhone: '0901234567'
    });

    expect(prisma.client.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        phoneNormalized: '0901234567'
      },
      select: expect.any(Object)
    }));
    expect(result.customerId).toBe('cus_link_phone_1');
    expect(result.matchStatus).toBe('matched');
  });
});
