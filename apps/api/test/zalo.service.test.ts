import { BadRequestException } from '@nestjs/common';
import { ConversationChannel, ConversationSenderType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZaloService } from '../src/modules/zalo/zalo.service';

describe('ZaloService OA outbound', () => {
  const prisma = {
    client: {
      zaloAccount: {
        findFirst: vi.fn()
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

  const personalPool = {} as any;

  let service: ZaloService;

  beforeEach(() => {
    vi.restoreAllMocks();
    prisma.client.zaloAccount.findFirst.mockReset();
    conversationsService.ingestExternalMessage.mockReset();

    service = new ZaloService(prisma, config, conversationsService, personalPool);
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

    vi.spyOn((service as any).oaOutboundWorker, 'sendTextMessage').mockResolvedValue({
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

    expect((service as any).oaOutboundWorker.sendTextMessage).toHaveBeenCalledWith({
      account: {
        id: 'oa_account_1',
        accessTokenEnc: 'token_oa',
        metadataJson: { outboundUrl: 'https://example.test/zalo/oa/send' }
      },
      externalThreadId: 'oa_user_123',
      content: 'Xin chao tu OA',
      recipientId: undefined
    });

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
});
