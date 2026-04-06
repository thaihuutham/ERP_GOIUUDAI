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
    const campaignService = {
      deleteCampaign: vi.fn(),
      listRecipients: vi.fn(),
      listAttempts: vi.fn(),
    } as any;

    const controller = new ZaloController(zaloService, campaignService);
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

  it('delegates campaign delete to campaign service', async () => {
    const zaloService = {} as any;
    const campaignService = {
      deleteCampaign: vi.fn().mockResolvedValue({
        success: true,
        campaignId: 'campaign_draft_1',
      }),
      listRecipients: vi.fn(),
      listAttempts: vi.fn(),
    } as any;

    const controller = new ZaloController(zaloService, campaignService);
    const result = await controller.deleteCampaign('campaign_draft_1');

    expect(campaignService.deleteCampaign).toHaveBeenCalledWith('campaign_draft_1');
    expect(result).toEqual({
      success: true,
      campaignId: 'campaign_draft_1',
    });
  });

  it('parses recipient limit query to number', async () => {
    const zaloService = {} as any;
    const campaignService = {
      deleteCampaign: vi.fn(),
      listRecipients: vi.fn().mockResolvedValue([]),
      listAttempts: vi.fn(),
    } as any;
    const controller = new ZaloController(zaloService, campaignService);

    await controller.listCampaignRecipients('campaign_1', 'PENDING', '55');

    expect(campaignService.listRecipients).toHaveBeenCalledWith('campaign_1', {
      status: 'PENDING',
      limit: 55,
    });
  });

  it('parses attempt limit query to number', async () => {
    const zaloService = {} as any;
    const campaignService = {
      deleteCampaign: vi.fn(),
      listRecipients: vi.fn(),
      listAttempts: vi.fn().mockResolvedValue([]),
    } as any;
    const controller = new ZaloController(zaloService, campaignService);

    await controller.listCampaignAttempts('campaign_1', 'FAILED', '80');

    expect(campaignService.listAttempts).toHaveBeenCalledWith('campaign_1', {
      status: 'FAILED',
      limit: 80,
    });
  });
});
