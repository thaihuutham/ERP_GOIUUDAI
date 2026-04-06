import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  ZaloCampaignSelectionPolicy,
  ZaloCampaignStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZaloCampaignService } from '../src/modules/zalo/zalo-campaign.service';

function makePrismaMock() {
  return {
    getTenantId: vi.fn(() => 'GOIUUDAI'),
    client: {
      zaloCampaign: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      zaloCampaignRecipient: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
      zaloCampaignAccount: {
        findMany: vi.fn(),
      },
    },
  } as any;
}

function makeCampaign(overrides?: Record<string, unknown>) {
  return {
    id: 'campaign_1',
    tenant_Id: 'GOIUUDAI',
    name: 'Campaign demo',
    code: 'CP_DEMO',
    status: ZaloCampaignStatus.DRAFT,
    timezone: 'Asia/Ho_Chi_Minh',
    selectionPolicy: ZaloCampaignSelectionPolicy.PRIORITIZE_RECENT_INTERACTION,
    delayMinSeconds: 180,
    delayMaxSeconds: 300,
    maxConsecutiveErrors: 3,
    maxRecipients: null,
    allowedVariableKeys: [],
    recipientFilterJson: null,
    windowMorningStartMinutes: 420,
    windowMorningEndMinutes: 690,
    windowAfternoonStartMinutes: 840,
    windowAfternoonEndMinutes: 1200,
    createdBy: 'admin_1',
    startedAt: null,
    pausedAt: null,
    completedAt: null,
    canceledAt: null,
    lastRunAt: null,
    metadataJson: null,
    createdAt: new Date('2026-04-06T06:00:00.000Z'),
    updatedAt: new Date('2026-04-06T06:00:00.000Z'),
    accounts: [],
    operators: [],
    ...overrides,
  };
}

describe('ZaloCampaignService', () => {
  let prisma: any;
  let cls: any;
  let zaloService: any;
  let service: ZaloCampaignService;

  beforeEach(() => {
    prisma = makePrismaMock();
    cls = {
      get: vi.fn(() => ({})),
    } as any;
    zaloService = {
      sendPersonalMessage: vi.fn(),
    } as any;
    service = new ZaloCampaignService(prisma, cls, zaloService);
  });

  it('filters campaign list by operator for non-admin actor', async () => {
    cls.get.mockReturnValue({
      userId: 'staff_1',
      role: 'STAFF',
    });
    prisma.client.zaloCampaign.findMany.mockResolvedValue([]);

    await service.listCampaigns();

    expect(prisma.client.zaloCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_Id: 'GOIUUDAI',
          operators: {
            some: {
              tenant_Id: 'GOIUUDAI',
              userId: 'staff_1',
              revokedAt: null,
            },
          },
        }),
      }),
    );
  });

  it('denies campaign detail for actor not assigned as operator', async () => {
    cls.get.mockReturnValue({
      userId: 'staff_2',
      role: 'STAFF',
    });
    prisma.client.zaloCampaign.findFirst.mockResolvedValue(
      makeCampaign({
        operators: [{ userId: 'staff_1' }],
      }),
    );

    await expect(service.getCampaignById('campaign_1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks start campaign when account is already used by another running campaign', async () => {
    cls.get.mockReturnValue({
      userId: 'admin_1',
      role: 'ADMIN',
    });
    prisma.client.zaloCampaign.findFirst.mockResolvedValue(
      makeCampaign({
        accounts: [
          {
            id: 'campaign_account_1',
            campaignId: 'campaign_1',
            zaloAccountId: 'zalo_acc_1',
            sentCount: 0,
            quota: 20,
            status: 'READY',
            nextSendAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            zaloAccount: {
              id: 'zalo_acc_1',
              displayName: 'Zalo CSKH 01',
              status: 'CONNECTED',
            },
          },
        ],
      }),
    );
    prisma.client.zaloCampaignAccount.findMany.mockResolvedValue([
      {
        id: 'conflict_1',
        campaignId: 'campaign_running',
        zaloAccountId: 'zalo_acc_1',
        campaign: {
          id: 'campaign_running',
          name: 'Campaign đang chạy',
          status: ZaloCampaignStatus.RUNNING,
        },
        zaloAccount: {
          id: 'zalo_acc_1',
          displayName: 'Zalo CSKH 01',
        },
      },
    ]);

    try {
      await service.startCampaign('campaign_1');
      throw new Error('Expected startCampaign to throw conflict error.');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(String((error as Error).message ?? error)).toMatch(/Có account đã thuộc campaign RUNNING khác/);
    }
  });

  it('allows deleting draft campaign for admin', async () => {
    cls.get.mockReturnValue({
      userId: 'admin_1',
      role: 'ADMIN',
    });
    prisma.client.zaloCampaign.findFirst.mockResolvedValue(
      makeCampaign({
        status: ZaloCampaignStatus.DRAFT,
      }),
    );
    prisma.client.zaloCampaign.delete.mockResolvedValue({
      id: 'campaign_1',
    });

    const result = await service.deleteCampaign('campaign_1');

    expect(prisma.client.zaloCampaign.delete).toHaveBeenCalledWith({
      where: {
        id: 'campaign_1',
      },
    });
    expect(result).toEqual({
      success: true,
      campaignId: 'campaign_1',
    });
  });

  it('rejects deleting campaign when status is not DRAFT', async () => {
    cls.get.mockReturnValue({
      userId: 'admin_1',
      role: 'ADMIN',
    });
    prisma.client.zaloCampaign.findFirst.mockResolvedValue(
      makeCampaign({
        status: ZaloCampaignStatus.RUNNING,
      }),
    );

    await expect(service.deleteCampaign('campaign_1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects deleting campaign for non-admin actor', async () => {
    cls.get.mockReturnValue({
      userId: 'staff_1',
      role: 'STAFF',
    });

    await expect(service.deleteCampaign('campaign_1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
