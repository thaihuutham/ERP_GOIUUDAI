import { describe, expect, it, vi } from 'vitest';
import { ZaloController } from '../src/modules/zalo/zalo.controller';

describe('ZaloController', () => {
  it('delegates OA outbound send to service', async () => {
    const zaloService = {
      sendOaMessage: vi.fn().mockResolvedValue({
        success: true,
        messageId: 'oa_msg_001'
      })
    } as any;

    const controller = new ZaloController(zaloService);
    const payload = {
      externalThreadId: 'oa_user_123',
      content: 'Xin chao tu OA'
    };

    const result = await controller.sendOaMessage('oa_account_1', payload);

    expect(zaloService.sendOaMessage).toHaveBeenCalledWith('oa_account_1', payload);
    expect(result).toEqual({
      success: true,
      messageId: 'oa_msg_001'
    });
  });
});
