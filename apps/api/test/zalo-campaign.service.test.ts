import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  CustomerZaloNickType,
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
      $transaction: vi.fn(),
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

function makeCampaignAccount(overrides?: Record<string, unknown>) {
  return {
    id: 'campaign_account_1',
    campaignId: 'campaign_1',
    zaloAccountId: 'zalo_acc_1',
    templateContent: 'Xin chào {{customer.fullName}}',
    quota: 20,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    consecutiveErrorCount: 0,
    dailySentCount: 0,
    dailyQuotaDate: null,
    status: 'READY',
    nextSendAt: null,
    lastSentAt: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    createdAt: new Date('2026-04-06T06:00:00.000Z'),
    updatedAt: new Date('2026-04-06T06:00:00.000Z'),
    zaloAccount: {
      id: 'zalo_acc_1',
      displayName: 'Zalo CSKH 01',
      status: 'CONNECTED',
    },
    ...overrides,
  };
}

function makeRecipient(overrides?: Record<string, unknown>) {
  return {
    id: 'recipient_1',
    campaignId: 'campaign_1',
    customerId: 'cus_1',
    externalThreadId: 'thread_1',
    targetAccountId: null,
    status: 'PENDING',
    attemptCount: 0,
    variablePayloadJson: {
      customer: {
        id: 'cus_1',
        fullName: 'Khách test',
        phone: '0912345678',
        phoneNormalized: '0912345678',
        zaloNickType: 'CHUA_KIEM_TRA',
      },
      campaign: {
        id: 'campaign_1',
        code: 'CP_DEMO',
        name: 'Campaign demo',
      },
      normalizedPhone: '0912345678',
      interactedAccountIds: [],
      reachableAccountIds: ['zalo_acc_1'],
      resolvedFromPhoneLookup: false,
    },
    customerSnapshotJson: {},
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
      role: 'USER',
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
      role: 'USER',
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
      role: 'USER',
    });

    await expect(service.deleteCampaign('campaign_1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses default recipient zaloNickType filter when campaign does not specify it', async () => {
    const tx = {
      customer: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any;

    await (service as any).createCampaignRecipientsSnapshot(tx, makeCampaign({
      recipientFilterJson: null,
      accounts: [],
    }));

    expect(tx.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_Id: 'GOIUUDAI',
          zaloNickType: {
            in: [
              CustomerZaloNickType.CHUA_KIEM_TRA,
              CustomerZaloNickType.GUI_DUOC_TIN_NHAN,
            ],
          },
        }),
      }),
    );
  });

  it('uses explicit recipient zaloNickType filter when provided by campaign', async () => {
    const tx = {
      customer: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any;

    await (service as any).createCampaignRecipientsSnapshot(tx, makeCampaign({
      recipientFilterJson: {
        zaloNickTypes: [CustomerZaloNickType.CHAN_NGUOI_LA],
      },
      accounts: [],
    }));

    expect(tx.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          zaloNickType: {
            in: [CustomerZaloNickType.CHAN_NGUOI_LA],
          },
        }),
      }),
    );
  });

  it('enforces CHAN_NGUOI_LA routing to the most recent interacted account only', () => {
    const campaign = makeCampaign({
      selectionPolicy: ZaloCampaignSelectionPolicy.AVOID_PREVIOUSLY_INTERACTED_ACCOUNT,
    }) as any;
    const account = makeCampaignAccount({
      zaloAccountId: 'zalo_acc_1',
    }) as any;

    const allowed = (service as any).evaluateRecipientCompatibility(
      campaign,
      account,
      makeRecipient({
        externalThreadId: 'thread_1',
        targetAccountId: 'zalo_acc_1',
        variablePayloadJson: {
          customer: { zaloNickType: CustomerZaloNickType.CHAN_NGUOI_LA },
        },
      }),
    );
    expect(allowed).toEqual({ allowed: true });

    const mismatch = (service as any).evaluateRecipientCompatibility(
      campaign,
      account,
      makeRecipient({
        externalThreadId: 'thread_1',
        targetAccountId: 'zalo_acc_2',
        variablePayloadJson: {
          customer: { zaloNickType: CustomerZaloNickType.CHAN_NGUOI_LA },
        },
      }),
    );
    expect(mismatch).toEqual({ allowed: false, reason: 'TARGET_ACCOUNT_MISMATCH' });
  });

  it('updates customer zaloNickType to GUI_DUOC_TIN_NHAN when delivery succeeds', async () => {
    const tx = {
      zaloCampaignRecipient: { update: vi.fn() },
      zaloCampaignMessageAttempt: { create: vi.fn() },
      zaloCampaignAccount: { update: vi.fn() },
      customerInteraction: { create: vi.fn() },
      customer: { updateMany: vi.fn() },
    };
    prisma.client.$transaction.mockImplementation(async (fn: (innerTx: any) => Promise<unknown>) => fn(tx));
    zaloService.sendPersonalMessage.mockResolvedValue({ externalThreadId: 'thread_sent' });

    const result = await (service as any).processRecipientDelivery({
      campaign: makeCampaign() as any,
      account: makeCampaignAccount() as any,
      recipient: makeRecipient() as any,
      now: new Date('2026-04-07T10:00:00.000Z'),
    });

    expect(result).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(tx.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          zaloNickType: CustomerZaloNickType.GUI_DUOC_TIN_NHAN,
        }),
      }),
    );
  });

  it('updates customer zaloNickType based on send failure pattern', async () => {
    const setupFailureTx = () => {
      const tx = {
        zaloCampaignRecipient: { update: vi.fn() },
        zaloCampaignMessageAttempt: { create: vi.fn() },
        zaloCampaignAccount: { update: vi.fn() },
        customer: { updateMany: vi.fn() },
      };
      prisma.client.$transaction.mockImplementation(async (fn: (innerTx: any) => Promise<unknown>) => fn(tx));
      return tx;
    };

    const notFoundTx = setupFailureTx();
    zaloService.sendPersonalMessage.mockRejectedValueOnce(new Error('Không tìm được thread theo UID'));
    const notFoundResult = await (service as any).processRecipientDelivery({
      campaign: makeCampaign() as any,
      account: makeCampaignAccount() as any,
      recipient: makeRecipient() as any,
      now: new Date('2026-04-07T10:10:00.000Z'),
    });
    expect(notFoundResult).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(notFoundTx.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          zaloNickType: CustomerZaloNickType.CHUA_CO_NICK_ZALO,
        }),
      }),
    );

    const strangerTx = setupFailureTx();
    zaloService.sendPersonalMessage.mockRejectedValueOnce(new Error('Bị chặn người lạ'));
    const strangerResult = await (service as any).processRecipientDelivery({
      campaign: makeCampaign() as any,
      account: makeCampaignAccount() as any,
      recipient: makeRecipient() as any,
      now: new Date('2026-04-07T10:20:00.000Z'),
    });
    expect(strangerResult).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(strangerTx.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          zaloNickType: CustomerZaloNickType.CHAN_NGUOI_LA,
        }),
      }),
    );
  });
});
