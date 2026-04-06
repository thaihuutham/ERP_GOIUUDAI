import { ConversationChannel, ConversationSenderType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationsService } from '../src/modules/conversations/conversations.service';

describe('ConversationsService realtime emission', () => {
  const prisma = {
    getTenantId: vi.fn(() => 'tenant_demo_company'),
    client: {
      conversationThread: {
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        findFirstOrThrow: vi.fn()
      },
      conversationMessage: {
        findFirst: vi.fn(),
        create: vi.fn()
      }
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
  const cls = {
    get: vi.fn(() => ({}))
  } as any;

  let service: ConversationsService;

  beforeEach(() => {
    vi.restoreAllMocks();
    prisma.client.conversationThread.findFirst.mockReset();
    prisma.client.conversationThread.create.mockReset();
    prisma.client.conversationThread.updateMany.mockReset();
    prisma.client.conversationThread.findFirstOrThrow.mockReset();
    prisma.client.conversationMessage.findFirst.mockReset();
    prisma.client.conversationMessage.create.mockReset();
    zaloRealtime.emitScoped.mockReset();
    cls.get.mockReset();
    cls.get.mockReturnValue({});
    service = new ConversationsService(prisma, cls, zaloAssignment, zaloRealtime);
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
});
