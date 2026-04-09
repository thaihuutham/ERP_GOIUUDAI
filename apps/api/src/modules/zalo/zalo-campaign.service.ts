import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerZaloNickType,
  ConversationChannel,
  Prisma,
  ZaloCampaignAccountStatus,
  ZaloCampaignAttemptStatus,
  ZaloCampaignRecipientStatus,
  ZaloCampaignSelectionPolicy,
  ZaloCampaignStatus,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AUTH_USER_CONTEXT_KEY } from '../../common/request/request.constants';
import { normalizeVietnamPhone } from '../../common/validation/phone.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { ZaloService } from './zalo.service';
import {
  DEFAULT_CAMPAIGN_ALLOWED_VARIABLE_KEYS,
  pickRandomDelaySeconds,
  renderCampaignTemplate,
} from './zalo-campaign-template.util';

type AuthActor = {
  userId: string | null;
  role: string;
};

type CampaignAccountInput = {
  zaloAccountId: string;
  templateContent: string;
  quota: number;
  status: ZaloCampaignAccountStatus;
};

type CampaignOperatorInput = {
  userId: string;
};

type CampaignWithAccounts = Prisma.ZaloCampaignGetPayload<{
  include: {
    accounts: {
      include: {
        zaloAccount: {
          select: {
            id: true;
            displayName: true;
            status: true;
          };
        };
      };
    };
  };
}>;

type CampaignAccountWithZalo = CampaignWithAccounts['accounts'][number];

type RecipientWithPayload = Prisma.ZaloCampaignRecipientGetPayload<{
  select: {
    id: true;
    campaignId: true;
    customerId: true;
    externalThreadId: true;
    targetAccountId: true;
    status: true;
    attemptCount: true;
    variablePayloadJson: true;
    customerSnapshotJson: true;
  };
}>;

type SchedulerTickResult = {
  scannedCampaigns: number;
  processedCampaigns: number;
  sent: number;
  failed: number;
  skipped: number;
};

type ProcessCampaignResult = {
  processed: boolean;
  sent: number;
  failed: number;
  skipped: number;
};

type CampaignStats = {
  pending: number;
  inProgress: number;
  sent: number;
  skipped: number;
  failed: number;
};

type RecipientCompatibilityDecision = {
  allowed: boolean;
  reason?: string;
};

type CandidateThread = {
  channelAccountId: string | null;
  externalThreadId: string;
  lastMessageAt: Date | null;
};

type JsonRecord = Record<string, unknown>;

type PrismaTx = Prisma.TransactionClient;

type CampaignMutationData = {
  code: string | null;
  name: string;
  status: ZaloCampaignStatus;
  timezone: string;
  selectionPolicy: ZaloCampaignSelectionPolicy;
  allowedVariableKeys: string[];
  recipientFilterJson?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  maxConsecutiveErrors: number;
  maxRecipients: number | null;
  windowMorningStartMinutes: number;
  windowMorningEndMinutes: number;
  windowAfternoonStartMinutes: number;
  windowAfternoonEndMinutes: number;
  metadataJson?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
};

const SYSTEM_TIMEZONE = 'Asia/Ho_Chi_Minh';
const MAX_RECIPIENT_ATTEMPTS = 3;
const DEFAULT_SNAPSHOT_LIMIT = 2_000;
const MAX_SNAPSHOT_LIMIT = 20_000;
const DEFAULT_WINDOW_MORNING_START = 7 * 60;
const DEFAULT_WINDOW_MORNING_END = 11 * 60 + 30;
const DEFAULT_WINDOW_AFTERNOON_START = 14 * 60;
const DEFAULT_WINDOW_AFTERNOON_END = 20 * 60;
const DEFAULT_RECIPIENT_ZALO_NICK_TYPES: CustomerZaloNickType[] = [
  CustomerZaloNickType.CHUA_KIEM_TRA,
  CustomerZaloNickType.GUI_DUOC_TIN_NHAN,
];

@Injectable()
export class ZaloCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly zaloService: ZaloService,
  ) {}

  async listCampaigns() {
    const tenantId = this.prisma.getTenantId();
    const actor = this.readActor();

    const where: Prisma.ZaloCampaignWhereInput = {
      tenant_Id: tenantId,
    };

    if (!this.isSystemContext(actor) && !this.isAdmin(actor)) {
      where.operators = {
        some: {
          tenant_Id: tenantId,
          userId: actor.userId ?? '',
          revokedAt: null,
        },
      };
    }

    const campaigns = await this.prisma.client.zaloCampaign.findMany({
      where,
      include: {
        accounts: {
          include: {
            zaloAccount: {
              select: {
                id: true,
                displayName: true,
                status: true,
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }],
        },
        operators: {
          where: {
            revokedAt: null,
          },
          orderBy: [{ assignedAt: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const statsByCampaign = await this.collectCampaignStats(campaigns.map((item) => item.id));

    return campaigns.map((campaign) => ({
      ...campaign,
      stats: statsByCampaign[campaign.id] ?? this.emptyStats(),
    }));
  }

  async getCampaignById(campaignId: string) {
    const campaign = await this.requireCampaignAccess(campaignId);
    const statsByCampaign = await this.collectCampaignStats([campaign.id]);
    return {
      ...campaign,
      stats: statsByCampaign[campaign.id] ?? this.emptyStats(),
    };
  }

  async createCampaign(payload: Record<string, unknown>) {
    const actor = this.readActor();
    this.assertAdmin(actor);

    const tenantId = this.prisma.getTenantId();
    const accountInputs = this.parseCampaignAccountInputs(payload.accounts);
    const operatorInputs = this.parseCampaignOperatorInputs(payload.operatorUserIds);
    await this.validatePersonalAccounts(accountInputs.map((item) => item.zaloAccountId));
    await this.validateUsers(operatorInputs.map((item) => item.userId));

    const campaignData = this.buildCampaignMutationData(payload, {
      fallbackStatus: ZaloCampaignStatus.DRAFT,
      existing: null,
    });

    const created = await this.prisma.client.$transaction(async (tx) => {
      const createData: Prisma.ZaloCampaignUncheckedCreateInput = {
        ...campaignData,
        tenant_Id: tenantId,
        createdBy: actor.userId,
      };

      const campaign = await tx.zaloCampaign.create({
        data: createData,
      });

      if (accountInputs.length > 0) {
        await tx.zaloCampaignAccount.createMany({
          data: accountInputs.map((account) => ({
            tenant_Id: tenantId,
            campaignId: campaign.id,
            zaloAccountId: account.zaloAccountId,
            templateContent: account.templateContent,
            quota: account.quota,
            status: account.status,
          })),
        });
      }

      if (operatorInputs.length > 0) {
        await tx.zaloCampaignOperator.createMany({
          data: operatorInputs.map((operator) => ({
            tenant_Id: tenantId,
            campaignId: campaign.id,
            userId: operator.userId,
            assignedBy: actor.userId,
          })),
        });
      }

      return campaign;
    });

    return this.getCampaignById(created.id);
  }

  async updateCampaign(campaignId: string, payload: Record<string, unknown>) {
    const actor = this.readActor();
    const existing = await this.requireCampaignAccess(campaignId);

    const campaignData = this.buildCampaignMutationData(payload, {
      fallbackStatus: existing.status,
      existing,
    });

    const hasAccountsInPayload = Object.prototype.hasOwnProperty.call(payload, 'accounts');
    const hasOperatorsInPayload = Object.prototype.hasOwnProperty.call(payload, 'operatorUserIds');

    if (hasAccountsInPayload && existing.status !== ZaloCampaignStatus.DRAFT) {
      throw new BadRequestException('Chỉ cho phép thay danh sách account khi campaign đang ở trạng thái DRAFT.');
    }

    if (hasOperatorsInPayload) {
      this.assertAdmin(actor);
    }

    const accountInputs = hasAccountsInPayload
      ? this.parseCampaignAccountInputs(payload.accounts)
      : null;
    const operatorInputs = hasOperatorsInPayload
      ? this.parseCampaignOperatorInputs(payload.operatorUserIds)
      : null;

    if (accountInputs) {
      await this.validatePersonalAccounts(accountInputs.map((item) => item.zaloAccountId));
    }

    if (operatorInputs) {
      await this.validateUsers(operatorInputs.map((item) => item.userId));
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.zaloCampaign.update({
        where: { id: campaignId },
        data: {
          ...campaignData,
        },
      });

      if (accountInputs) {
        await tx.zaloCampaignAccount.deleteMany({
          where: {
            tenant_Id: this.prisma.getTenantId(),
            campaignId,
          },
        });

        if (accountInputs.length > 0) {
          await tx.zaloCampaignAccount.createMany({
            data: accountInputs.map((item) => ({
              tenant_Id: this.prisma.getTenantId(),
              campaignId,
              zaloAccountId: item.zaloAccountId,
              templateContent: item.templateContent,
              quota: item.quota,
              status: item.status,
            })),
          });
        }
      }

      if (operatorInputs) {
        const now = new Date();
        await tx.zaloCampaignOperator.updateMany({
          where: {
            tenant_Id: this.prisma.getTenantId(),
            campaignId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        });

        if (operatorInputs.length > 0) {
          await tx.zaloCampaignOperator.createMany({
            data: operatorInputs.map((item) => ({
              tenant_Id: this.prisma.getTenantId(),
              campaignId,
              userId: item.userId,
              assignedBy: actor.userId,
            })),
          });
        }
      }
    });

    return this.getCampaignById(campaignId);
  }

  async startCampaign(campaignId: string) {
    const campaign = await this.requireCampaignAccess(campaignId);

    if (campaign.status === ZaloCampaignStatus.RUNNING) {
      return this.getCampaignById(campaignId);
    }

    if (
      campaign.status === ZaloCampaignStatus.CANCELED
      || campaign.status === ZaloCampaignStatus.COMPLETED
    ) {
      throw new BadRequestException('Campaign đã kết thúc/cancel, không thể start lại trong V1.');
    }

    const accountIds = campaign.accounts.map((item) => item.zaloAccountId);
    if (accountIds.length === 0) {
      throw new BadRequestException('Campaign chưa có account để chạy.');
    }

    await this.assertNoRunningAccountConflict(campaignId, accountIds);

    await this.prisma.client.$transaction(async (tx) => {
      const recipientCount = await tx.zaloCampaignRecipient.count({
        where: {
          tenant_Id: this.prisma.getTenantId(),
          campaignId,
        },
      });

      if (recipientCount === 0) {
        await this.createCampaignRecipientsSnapshot(tx, campaign);
      }

      const now = new Date();
      await tx.zaloCampaign.update({
        where: { id: campaignId },
        data: {
          status: ZaloCampaignStatus.RUNNING,
          startedAt: campaign.startedAt ?? now,
          pausedAt: null,
          completedAt: null,
          canceledAt: null,
          lastRunAt: now,
        },
      });

      const accounts = await tx.zaloCampaignAccount.findMany({
        where: {
          tenant_Id: this.prisma.getTenantId(),
          campaignId,
        },
      });

      const timezone = this.cleanString(campaign.timezone) || SYSTEM_TIMEZONE;
      const dayKey = this.getDateKeyInTimezone(now, timezone);

      for (const account of accounts) {
        if (account.status === ZaloCampaignAccountStatus.DISABLED) {
          continue;
        }
        const isLegacyDoneWithoutDayKey =
          account.status === ZaloCampaignAccountStatus.DONE
          && !this.cleanString(account.dailyQuotaDate);
        const initializedDailySentCount = isLegacyDoneWithoutDayKey
          ? account.quota
          : account.dailySentCount;

        await tx.zaloCampaignAccount.update({
          where: { id: account.id },
          data: {
            status: ZaloCampaignAccountStatus.READY,
            nextSendAt: now,
            dailyQuotaDate: account.dailyQuotaDate || dayKey,
            dailySentCount: initializedDailySentCount,
          },
        });
      }
    });

    return this.getCampaignById(campaignId);
  }

  async pauseCampaign(campaignId: string) {
    await this.requireCampaignAccess(campaignId);

    await this.prisma.client.zaloCampaign.update({
      where: { id: campaignId },
      data: {
        status: ZaloCampaignStatus.PAUSED,
        pausedAt: new Date(),
      },
    });

    return this.getCampaignById(campaignId);
  }

  async resumeCampaign(campaignId: string) {
    const campaign = await this.requireCampaignAccess(campaignId);
    if (campaign.status !== ZaloCampaignStatus.PAUSED) {
      throw new BadRequestException('Chỉ campaign đang PAUSED mới được resume.');
    }

    const accountIds = campaign.accounts.map((item) => item.zaloAccountId);
    await this.assertNoRunningAccountConflict(campaignId, accountIds);

    const now = new Date();
    await this.prisma.client.$transaction(async (tx) => {
      await tx.zaloCampaign.update({
        where: { id: campaignId },
        data: {
          status: ZaloCampaignStatus.RUNNING,
          pausedAt: null,
          lastRunAt: now,
        },
      });

      await tx.zaloCampaignAccount.updateMany({
        where: {
          tenant_Id: this.prisma.getTenantId(),
          campaignId,
          status: ZaloCampaignAccountStatus.PAUSED_ERROR,
        },
        data: {
          status: ZaloCampaignAccountStatus.READY,
          nextSendAt: now,
          consecutiveErrorCount: 0,
        },
      });
    });

    return this.getCampaignById(campaignId);
  }

  async cancelCampaign(campaignId: string) {
    await this.requireCampaignAccess(campaignId);

    await this.prisma.client.zaloCampaign.update({
      where: { id: campaignId },
      data: {
        status: ZaloCampaignStatus.CANCELED,
        canceledAt: new Date(),
      },
    });

    return this.getCampaignById(campaignId);
  }

  async deleteCampaign(campaignId: string) {
    const actor = this.readActor();
    this.assertAdmin(actor);

    const campaign = await this.requireCampaignExists(campaignId);
    if (campaign.status !== ZaloCampaignStatus.DRAFT) {
      throw new BadRequestException('Chỉ cho phép xóa campaign ở trạng thái DRAFT.');
    }

    await this.prisma.client.zaloCampaign.delete({
      where: {
        id: campaignId,
      },
    });

    return {
      success: true,
      campaignId,
    };
  }

  async assignOperator(campaignId: string, userIdRaw: string) {
    const actor = this.readActor();
    this.assertAdmin(actor);
    await this.requireCampaignExists(campaignId);

    const userId = this.cleanString(userIdRaw);
    if (!userId) {
      throw new BadRequestException('Thiếu userId operator.');
    }

    await this.validateUsers([userId]);

    const tenantId = this.prisma.getTenantId();
    const existing = await this.prisma.client.zaloCampaignOperator.findFirst({
      where: {
        tenant_Id: tenantId,
        campaignId,
        userId,
        revokedAt: null,
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.client.zaloCampaignOperator.create({
      data: {
        tenant_Id: tenantId,
        campaignId,
        userId,
        assignedBy: actor.userId,
      },
    });
  }

  async revokeOperator(campaignId: string, userIdRaw: string) {
    const actor = this.readActor();
    this.assertAdmin(actor);
    await this.requireCampaignExists(campaignId);

    const userId = this.cleanString(userIdRaw);
    if (!userId) {
      throw new BadRequestException('Thiếu userId operator.');
    }

    const result = await this.prisma.client.zaloCampaignOperator.updateMany({
      where: {
        tenant_Id: this.prisma.getTenantId(),
        campaignId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      success: true,
      revokedCount: result.count,
    };
  }

  async listRecipients(campaignId: string, query: { status?: string; limit?: number } = {}) {
    await this.requireCampaignAccess(campaignId);

    const normalizedStatus = this.parseRecipientStatusOrNull(query.status);
    const take = this.toInt(query.limit, 100, 1, 500);

    const rows = await this.prisma.client.zaloCampaignRecipient.findMany({
      where: {
        tenant_Id: this.prisma.getTenantId(),
        campaignId,
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
      },
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
        targetAccount: {
          select: {
            id: true,
            displayName: true,
            status: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take,
    });

    return rows;
  }

  async listAttempts(campaignId: string, query: { status?: string; limit?: number } = {}) {
    await this.requireCampaignAccess(campaignId);

    const normalizedStatus = this.parseAttemptStatusOrNull(query.status);
    const take = this.toInt(query.limit, 100, 1, 500);

    const rows = await this.prisma.client.zaloCampaignMessageAttempt.findMany({
      where: {
        tenant_Id: this.prisma.getTenantId(),
        campaignId,
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
      },
      include: {
        campaignAccount: {
          select: {
            id: true,
            zaloAccountId: true,
          },
        },
        recipient: {
          select: {
            id: true,
            customerId: true,
            status: true,
          },
        },
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
        zaloAccount: {
          select: {
            id: true,
            displayName: true,
            status: true,
          },
        },
      },
      orderBy: [{ attemptedAt: 'desc' }],
      take,
    });

    return rows;
  }

  async runSchedulerTick(maxCampaignsRaw?: number): Promise<SchedulerTickResult> {
    const tenantId = this.prisma.getTenantId();
    const maxCampaigns = this.toInt(maxCampaignsRaw, 20, 1, 100);

    const campaigns = await this.prisma.client.zaloCampaign.findMany({
      where: {
        tenant_Id: tenantId,
        status: ZaloCampaignStatus.RUNNING,
      },
      include: {
        accounts: {
          include: {
            zaloAccount: {
              select: {
                id: true,
                displayName: true,
                status: true,
              },
            },
          },
          orderBy: [{ nextSendAt: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ lastRunAt: 'asc' }, { createdAt: 'asc' }],
      take: maxCampaigns,
    });

    let processedCampaigns = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const campaign of campaigns) {
      const result = await this.processRunningCampaign(campaign, new Date());
      if (result.processed) {
        processedCampaigns += 1;
      }
      sent += result.sent;
      failed += result.failed;
      skipped += result.skipped;
    }

    return {
      scannedCampaigns: campaigns.length,
      processedCampaigns,
      sent,
      failed,
      skipped,
    };
  }

  private async processRunningCampaign(
    campaign: CampaignWithAccounts,
    now: Date,
  ): Promise<ProcessCampaignResult> {
    if (!this.isWithinCampaignWindow(campaign, now)) {
      return {
        processed: false,
        sent: 0,
        failed: 0,
        skipped: 0,
      };
    }

    if (campaign.accounts.length === 0) {
      await this.failCampaign(campaign.id, 'CAMPAIGN_NO_ACCOUNT');
      return {
        processed: true,
        sent: 0,
        failed: 1,
        skipped: 0,
      };
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const account of campaign.accounts) {
      if (
        account.status === ZaloCampaignAccountStatus.DISABLED
        || account.status === ZaloCampaignAccountStatus.PAUSED_ERROR
      ) {
        continue;
      }

      const accountWithDailyQuota = await this.ensureDailyQuotaWindow(campaign, account, now);
      if (accountWithDailyQuota.status !== ZaloCampaignAccountStatus.READY) {
        continue;
      }

      if (accountWithDailyQuota.dailySentCount >= accountWithDailyQuota.quota) {
        continue;
      }

      if (accountWithDailyQuota.nextSendAt && accountWithDailyQuota.nextSendAt.getTime() > now.getTime()) {
        continue;
      }

      if (String(accountWithDailyQuota.zaloAccount.status ?? '').toUpperCase() !== 'CONNECTED') {
        await this.pauseCampaignAccountByError(
          campaign,
          accountWithDailyQuota,
          'ACCOUNT_NOT_CONNECTED',
          now,
        );
        failed += 1;
        continue;
      }

      const claimed = await this.claimNextRecipient(campaign, accountWithDailyQuota, now);
      if (!claimed) {
        continue;
      }

      const outcome = await this.processRecipientDelivery({
        campaign,
        account: accountWithDailyQuota,
        recipient: claimed,
        now,
      });

      sent += outcome.sent;
      failed += outcome.failed;
      skipped += outcome.skipped;
    }

    await this.prisma.client.zaloCampaign.update({
      where: { id: campaign.id },
      data: {
        lastRunAt: now,
      },
    });

    await this.syncCampaignTerminalStatus(campaign.id);

    return {
      processed: true,
      sent,
      failed,
      skipped,
    };
  }

  private async processRecipientDelivery(args: {
    campaign: CampaignWithAccounts;
    account: CampaignAccountWithZalo;
    recipient: RecipientWithPayload;
    now: Date;
  }) {
    const { campaign, account, recipient, now } = args;

    const context = this.buildTemplateContext(campaign, account, recipient);
    const allowedVariableKeys = campaign.allowedVariableKeys.length > 0
      ? campaign.allowedVariableKeys
      : DEFAULT_CAMPAIGN_ALLOWED_VARIABLE_KEYS;

    const rendered = renderCampaignTemplate({
      template: account.templateContent,
      context,
      allowedVariableKeys,
    });

    if (!rendered.ok) {
      const reason = `MISSING_VARIABLES:${rendered.missingVariables.join(',')}`;
      await this.prisma.client.$transaction(async (tx) => {
        await tx.zaloCampaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: ZaloCampaignRecipientStatus.SKIPPED,
            skippedReason: reason,
            failedReason: null,
            messagePreview: rendered.content || null,
          },
        });

        await tx.zaloCampaignMessageAttempt.create({
          data: {
            tenant_Id: this.prisma.getTenantId(),
            campaignId: campaign.id,
            campaignAccountId: account.id,
            recipientId: recipient.id,
            customerId: recipient.customerId,
            zaloAccountId: account.zaloAccountId,
            externalThreadId: recipient.externalThreadId,
            status: ZaloCampaignAttemptStatus.SKIPPED,
            renderedContent: rendered.content || null,
            missingVariables: rendered.missingVariables,
            errorMessage: reason,
            attemptedAt: now,
            responseJson: {
              reason,
            },
          },
        });

        await tx.zaloCampaignAccount.update({
          where: { id: account.id },
          data: {
            skippedCount: {
              increment: 1,
            },
            consecutiveErrorCount: 0,
            nextSendAt: new Date(now.getTime() + 1_000),
          },
        });
      });

      return {
        sent: 0,
        failed: 0,
        skipped: 1,
      };
    }

    const variablePayload = this.toRecord(recipient.variablePayloadJson);
    const customerPayload = this.toRecord(variablePayload.customer);
    const recipientPhone = this.normalizeCampaignPhone(
      customerPayload.phoneNormalized
      ?? customerPayload.phone
      ?? variablePayload.normalizedPhone,
    );
    const recipientDisplayName = this.cleanString(
      customerPayload.fullName
      ?? customerPayload.displayName
      ?? customerPayload.zaloName,
    ) || null;
    let effectiveExternalThreadId = this.cleanString(recipient.externalThreadId) || null;

    try {
      const deliveryResult = await this.zaloService.sendPersonalMessage(account.zaloAccountId, {
        externalThreadId: effectiveExternalThreadId,
        phone: recipientPhone || undefined,
        customerPhone: recipientPhone || undefined,
        customerDisplayName: recipientDisplayName || undefined,
        content: rendered.content,
        origin: 'CAMPAIGN',
      });
      const resolvedExternalThreadId = this.cleanString(
        this.toRecord(deliveryResult).externalThreadId,
      );
      if (resolvedExternalThreadId) {
        effectiveExternalThreadId = resolvedExternalThreadId;
      }

      const timezone = this.cleanString(campaign.timezone) || SYSTEM_TIMEZONE;
      const quotaDateKey = this.getDateKeyInTimezone(now, timezone);
      const nextDailySentCount = account.dailySentCount + 1;
      const reachedDailyQuota = nextDailySentCount >= account.quota;
      const delaySeconds = pickRandomDelaySeconds(campaign.delayMinSeconds, campaign.delayMaxSeconds);
      const nextSendAt = reachedDailyQuota
        ? this.getNextDailyResetAt(now, timezone)
        : new Date(now.getTime() + delaySeconds * 1_000);

      await this.prisma.client.$transaction(async (tx) => {
        await tx.zaloCampaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: ZaloCampaignRecipientStatus.SENT,
            sentAt: now,
            externalThreadId: effectiveExternalThreadId,
            failedReason: null,
            skippedReason: null,
            targetAccountId: account.zaloAccountId,
            messagePreview: rendered.content,
          },
        });

        await tx.zaloCampaignMessageAttempt.create({
          data: {
            tenant_Id: this.prisma.getTenantId(),
            campaignId: campaign.id,
            campaignAccountId: account.id,
            recipientId: recipient.id,
            customerId: recipient.customerId,
            zaloAccountId: account.zaloAccountId,
            externalThreadId: effectiveExternalThreadId,
            status: ZaloCampaignAttemptStatus.SENT,
            renderedContent: rendered.content,
            missingVariables: [],
            attemptedAt: now,
            responseJson: {
              delivered: true,
            },
          },
        });

        await tx.zaloCampaignAccount.update({
          where: { id: account.id },
          data: {
            sentCount: {
              increment: 1,
            },
            dailySentCount: {
              increment: 1,
            },
            dailyQuotaDate: quotaDateKey,
            consecutiveErrorCount: 0,
            status: ZaloCampaignAccountStatus.READY,
            nextSendAt,
            lastSentAt: now,
            lastErrorAt: null,
            lastErrorMessage: null,
          },
        });

        await tx.customerInteraction.create({
          data: {
            tenant_Id: this.prisma.getTenantId(),
            customerId: recipient.customerId,
            interactionType: 'ZALO_CAMPAIGN',
            channel: 'ZALO',
            content: rendered.content,
            resultTag: 'campaign_sent',
            staffName: account.zaloAccount.displayName ?? null,
            staffCode: account.zaloAccountId,
            interactionAt: now,
          },
        });

        await tx.customer.updateMany({
          where: {
            id: recipient.customerId,
            tenant_Id: this.prisma.getTenantId(),
          },
          data: {
            lastContactAt: now,
            zaloNickType: CustomerZaloNickType.GUI_DUOC_TIN_NHAN,
          },
        });
      });

      return {
        sent: 1,
        failed: 0,
        skipped: 0,
      };
    } catch (error) {
      const errorMessage = this.normalizeError(error);
      const shouldMarkNoZaloNick = this.isLookupUidNotFoundError(errorMessage);
      const shouldMarkStrangerBlocked = this.isStrangerBlockedError(errorMessage);
      const shouldFailRecipient = recipient.attemptCount >= MAX_RECIPIENT_ATTEMPTS;
      const recipientNextStatus = shouldFailRecipient
        ? ZaloCampaignRecipientStatus.FAILED
        : ZaloCampaignRecipientStatus.PENDING;

      const nextConsecutive = account.consecutiveErrorCount + 1;
      const shouldPauseAccount = nextConsecutive >= campaign.maxConsecutiveErrors;
      const delaySeconds = pickRandomDelaySeconds(campaign.delayMinSeconds, campaign.delayMaxSeconds);
      const nextSendAt = shouldPauseAccount ? null : new Date(now.getTime() + delaySeconds * 1_000);

      await this.prisma.client.$transaction(async (tx) => {
        await tx.zaloCampaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: recipientNextStatus,
            failedReason: errorMessage,
          },
        });

        await tx.zaloCampaignMessageAttempt.create({
          data: {
            tenant_Id: this.prisma.getTenantId(),
            campaignId: campaign.id,
            campaignAccountId: account.id,
            recipientId: recipient.id,
            customerId: recipient.customerId,
            zaloAccountId: account.zaloAccountId,
            externalThreadId: effectiveExternalThreadId,
            status: ZaloCampaignAttemptStatus.FAILED,
            renderedContent: rendered.content,
            errorMessage,
            attemptedAt: now,
            responseJson: {
              error: errorMessage,
            },
          },
        });

        await tx.zaloCampaignAccount.update({
          where: { id: account.id },
          data: {
            failedCount: {
              increment: 1,
            },
            consecutiveErrorCount: nextConsecutive,
            status: shouldPauseAccount
              ? ZaloCampaignAccountStatus.PAUSED_ERROR
              : ZaloCampaignAccountStatus.READY,
            nextSendAt,
            lastErrorAt: now,
            lastErrorMessage: errorMessage,
          },
        });

        if (shouldMarkNoZaloNick || shouldMarkStrangerBlocked) {
          await tx.customer.updateMany({
            where: {
              id: recipient.customerId,
              tenant_Id: this.prisma.getTenantId(),
            },
            data: {
              zaloNickType: shouldMarkStrangerBlocked
                ? CustomerZaloNickType.CHAN_NGUOI_LA
                : CustomerZaloNickType.CHUA_CO_NICK_ZALO,
            },
          });
        }
      });

      return {
        sent: 0,
        failed: 1,
        skipped: 0,
      };
    }
  }

  private async claimNextRecipient(
    campaign: CampaignWithAccounts,
    account: CampaignAccountWithZalo,
    now: Date,
  ): Promise<RecipientWithPayload | null> {
    const candidates = await this.prisma.client.zaloCampaignRecipient.findMany({
      where: {
        tenant_Id: this.prisma.getTenantId(),
        campaignId: campaign.id,
        status: ZaloCampaignRecipientStatus.PENDING,
      },
      select: {
        id: true,
        campaignId: true,
        customerId: true,
        externalThreadId: true,
        targetAccountId: true,
        status: true,
        attemptCount: true,
        variablePayloadJson: true,
        customerSnapshotJson: true,
      },
      orderBy: [{ createdAt: 'asc' }],
      take: 80,
    });

    for (const candidate of candidates) {
      const compatibility = this.evaluateRecipientCompatibility(campaign, account, candidate);
      if (!compatibility.allowed) {
        if (compatibility.reason === 'NO_THREAD' || compatibility.reason === 'NO_ZALO_NICK') {
          const skipReason = compatibility.reason === 'NO_ZALO_NICK'
            ? 'NO_ZALO_NICK'
            : 'NO_TARGET_THREAD';
          await this.skipRecipientByReason(campaign.id, account.id, candidate.id, skipReason, now);
        }
        continue;
      }

      const claimed = await this.prisma.client.zaloCampaignRecipient.updateMany({
        where: {
          id: candidate.id,
          status: ZaloCampaignRecipientStatus.PENDING,
        },
        data: {
          status: ZaloCampaignRecipientStatus.IN_PROGRESS,
          attemptCount: {
            increment: 1,
          },
          lastAttemptAt: now,
        },
      });

      if (claimed.count !== 1) {
        continue;
      }

      const row = await this.prisma.client.zaloCampaignRecipient.findFirst({
        where: { id: candidate.id },
        select: {
          id: true,
          campaignId: true,
          customerId: true,
          externalThreadId: true,
          targetAccountId: true,
          status: true,
          attemptCount: true,
          variablePayloadJson: true,
          customerSnapshotJson: true,
        },
      });

      if (row) {
        return row;
      }
    }

    return null;
  }

  private async skipRecipientByReason(
    campaignId: string,
    campaignAccountId: string,
    recipientId: string,
    reason: string,
    now: Date,
  ) {
    await this.prisma.client.$transaction(async (tx) => {
      const recipient = await tx.zaloCampaignRecipient.findFirst({
        where: {
          id: recipientId,
          status: ZaloCampaignRecipientStatus.PENDING,
        },
      });
      if (!recipient) {
        return;
      }

      await tx.zaloCampaignRecipient.update({
        where: { id: recipientId },
        data: {
          status: ZaloCampaignRecipientStatus.SKIPPED,
          skippedReason: reason,
        },
      });

      await tx.zaloCampaignMessageAttempt.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          campaignId,
          campaignAccountId,
          recipientId,
          customerId: recipient.customerId,
          status: ZaloCampaignAttemptStatus.SKIPPED,
          errorMessage: reason,
          attemptedAt: now,
        },
      });

      await tx.zaloCampaignAccount.update({
        where: { id: campaignAccountId },
        data: {
          skippedCount: {
            increment: 1,
          },
        },
      });

      if (reason === 'NO_TARGET_THREAD' || reason === 'NO_ZALO_NICK') {
        await tx.customer.updateMany({
          where: {
            id: recipient.customerId,
            tenant_Id: this.prisma.getTenantId(),
          },
          data: {
            zaloNickType: CustomerZaloNickType.CHUA_CO_NICK_ZALO,
          },
        });
      }
    });
  }

  private evaluateRecipientCompatibility(
    campaign: CampaignWithAccounts,
    account: CampaignAccountWithZalo,
    recipient: RecipientWithPayload,
  ): RecipientCompatibilityDecision {
    const variablePayload = this.toRecord(recipient.variablePayloadJson);
    const customerPayload = this.toRecord(variablePayload.customer);
    const customerZaloNickType = this.parseCustomerZaloNickType(
      customerPayload.zaloNickType,
      CustomerZaloNickType.CHUA_KIEM_TRA,
    );
    const externalThreadId = this.cleanString(recipient.externalThreadId);

    if (customerZaloNickType === CustomerZaloNickType.CHUA_CO_NICK_ZALO) {
      return {
        allowed: false,
        reason: 'NO_ZALO_NICK',
      };
    }

    if (customerZaloNickType === CustomerZaloNickType.CHAN_NGUOI_LA) {
      const requiredTargetAccountId = this.cleanString(recipient.targetAccountId);
      if (!requiredTargetAccountId || !externalThreadId) {
        return {
          allowed: false,
          reason: 'NO_THREAD',
        };
      }
      if (requiredTargetAccountId !== account.zaloAccountId) {
        return {
          allowed: false,
          reason: 'TARGET_ACCOUNT_MISMATCH',
        };
      }
      return {
        allowed: true,
      };
    }

    if (!externalThreadId) {
      const normalizedPhone = this.cleanString(
        variablePayload.normalizedPhone
        ?? customerPayload.phoneNormalized
        ?? customerPayload.phone,
      );
      if (!normalizedPhone) {
        return {
          allowed: false,
          reason: 'NO_THREAD',
        };
      }

      const reachableAccountIds = this.parseStringArray(variablePayload.reachableAccountIds);
      if (reachableAccountIds.length > 0 && !reachableAccountIds.includes(account.zaloAccountId)) {
        return {
          allowed: false,
          reason: 'ACCOUNT_NOT_REACHABLE',
        };
      }
    }

    if (
      campaign.selectionPolicy === ZaloCampaignSelectionPolicy.PRIORITIZE_RECENT_INTERACTION
      && recipient.targetAccountId
      && recipient.targetAccountId !== account.zaloAccountId
    ) {
      return {
        allowed: false,
        reason: 'TARGET_ACCOUNT_MISMATCH',
      };
    }

    if (campaign.selectionPolicy === ZaloCampaignSelectionPolicy.AVOID_PREVIOUSLY_INTERACTED_ACCOUNT) {
      const resolvedFromPhoneLookup = Boolean(variablePayload.resolvedFromPhoneLookup);
      if (resolvedFromPhoneLookup) {
        const reachableAccountIds = this.parseStringArray(variablePayload.reachableAccountIds);
        if (reachableAccountIds.length > 0 && !reachableAccountIds.includes(account.zaloAccountId)) {
          return {
            allowed: false,
            reason: 'ACCOUNT_NOT_REACHABLE',
          };
        }
      }

      const interactedAccountIds = this.parseStringArray(variablePayload.interactedAccountIds);
      if (interactedAccountIds.includes(account.zaloAccountId)) {
        return {
          allowed: false,
          reason: 'ACCOUNT_ALREADY_INTERACTED',
        };
      }
    }

    return {
      allowed: true,
    };
  }

  private async syncCampaignTerminalStatus(campaignId: string) {
    const [pendingCount, inProgressCount, runnableAccountCount] = await Promise.all([
      this.prisma.client.zaloCampaignRecipient.count({
        where: {
          tenant_Id: this.prisma.getTenantId(),
          campaignId,
          status: ZaloCampaignRecipientStatus.PENDING,
        },
      }),
      this.prisma.client.zaloCampaignRecipient.count({
        where: {
          tenant_Id: this.prisma.getTenantId(),
          campaignId,
          status: ZaloCampaignRecipientStatus.IN_PROGRESS,
        },
      }),
      this.prisma.client.zaloCampaignAccount.count({
        where: {
          tenant_Id: this.prisma.getTenantId(),
          campaignId,
          status: {
            in: [
              ZaloCampaignAccountStatus.READY,
              ZaloCampaignAccountStatus.DONE,
            ],
          },
          zaloAccount: {
            is: {
              status: 'CONNECTED',
            },
          },
        },
      }),
    ]);

    if (pendingCount === 0 && inProgressCount === 0) {
      await this.prisma.client.zaloCampaign.update({
        where: { id: campaignId },
        data: {
          status: ZaloCampaignStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      return;
    }

    if (pendingCount > 0 && inProgressCount === 0 && runnableAccountCount === 0) {
      await this.failCampaign(campaignId, 'NO_RUNNABLE_ACCOUNT');
    }
  }

  private async failCampaign(campaignId: string, reason: string) {
    await this.prisma.client.zaloCampaign.update({
      where: { id: campaignId },
      data: {
        status: ZaloCampaignStatus.FAILED,
        completedAt: new Date(),
        metadataJson: {
          reason,
        },
      },
    });
  }

  private async pauseCampaignAccountByError(
    campaign: CampaignWithAccounts,
    account: CampaignAccountWithZalo,
    reason: string,
    now: Date,
  ) {
    const nextConsecutive = account.consecutiveErrorCount + 1;
    const shouldPause = nextConsecutive >= campaign.maxConsecutiveErrors;
    const nextDelaySeconds = pickRandomDelaySeconds(campaign.delayMinSeconds, campaign.delayMaxSeconds);

    await this.prisma.client.zaloCampaignAccount.update({
      where: { id: account.id },
      data: {
        failedCount: {
          increment: 1,
        },
        consecutiveErrorCount: nextConsecutive,
        status: shouldPause ? ZaloCampaignAccountStatus.PAUSED_ERROR : ZaloCampaignAccountStatus.READY,
        nextSendAt: shouldPause ? null : new Date(now.getTime() + nextDelaySeconds * 1_000),
        lastErrorAt: now,
        lastErrorMessage: reason,
      },
    });

    await this.prisma.client.zaloCampaignMessageAttempt.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        campaignId: campaign.id,
        campaignAccountId: account.id,
        customerId: null,
        recipientId: null,
        zaloAccountId: account.zaloAccountId,
        externalThreadId: null,
        status: ZaloCampaignAttemptStatus.FAILED,
        errorMessage: reason,
        attemptedAt: now,
      },
    });
  }

  private async requireCampaignAccess(campaignId: string) {
    const campaign = await this.prisma.client.zaloCampaign.findFirst({
      where: {
        id: campaignId,
        tenant_Id: this.prisma.getTenantId(),
      },
      include: {
        accounts: {
          include: {
            zaloAccount: {
              select: {
                id: true,
                displayName: true,
                status: true,
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }],
        },
        operators: {
          where: {
            revokedAt: null,
          },
          orderBy: [{ assignedAt: 'asc' }],
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Không tìm thấy campaign.');
    }

    const actor = this.readActor();
    if (this.isSystemContext(actor) || this.isAdmin(actor)) {
      return campaign;
    }

    const isOperator = campaign.operators.some((item) => item.userId === actor.userId);
    if (!isOperator) {
      throw new ForbiddenException('Bạn không có quyền truy cập campaign này.');
    }

    return campaign;
  }

  private async requireCampaignExists(campaignId: string) {
    const campaign = await this.prisma.client.zaloCampaign.findFirst({
      where: {
        id: campaignId,
        tenant_Id: this.prisma.getTenantId(),
      },
    });
    if (!campaign) {
      throw new NotFoundException('Không tìm thấy campaign.');
    }
    return campaign;
  }

  private async assertNoRunningAccountConflict(campaignId: string, accountIds: string[]) {
    if (accountIds.length === 0) {
      return;
    }

    const conflicts = await this.prisma.client.zaloCampaignAccount.findMany({
      where: {
        tenant_Id: this.prisma.getTenantId(),
        campaignId: {
          not: campaignId,
        },
        zaloAccountId: {
          in: accountIds,
        },
        campaign: {
          status: ZaloCampaignStatus.RUNNING,
        },
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        zaloAccount: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    if (conflicts.length === 0) {
      return;
    }

    const labels = conflicts.map((item) => {
      const accountName = item.zaloAccount.displayName || item.zaloAccount.id;
      const campaignName = item.campaign.name || item.campaign.id;
      return `${accountName} (campaign ${campaignName})`;
    });

    throw new BadRequestException(
      `Có account đã thuộc campaign RUNNING khác: ${labels.join('; ')}`,
    );
  }

  private async createCampaignRecipientsSnapshot(tx: PrismaTx, campaign: CampaignWithAccounts) {
    const tenantId = this.prisma.getTenantId();
    const filter = this.toRecord(campaign.recipientFilterJson);

    const requestedLimit = this.toInt(
      filter.limit,
      0,
      0,
      MAX_SNAPSHOT_LIMIT,
    );

    const capByMaxRecipients = campaign.maxRecipients ?? null;
    const capByRequested = requestedLimit > 0 ? requestedLimit : null;
    let snapshotLimit = capByMaxRecipients ?? capByRequested ?? DEFAULT_SNAPSHOT_LIMIT;
    if (capByMaxRecipients !== null && capByRequested !== null) {
      snapshotLimit = Math.min(capByMaxRecipients, capByRequested);
    }
    snapshotLimit = Math.min(snapshotLimit, MAX_SNAPSHOT_LIMIT);
    snapshotLimit = Math.max(1, snapshotLimit);

    const customerWhere: Prisma.CustomerWhereInput = {
      tenant_Id: tenantId,
    };

    const customerIds = this.parseStringArray(filter.customerIds);
    if (customerIds.length > 0) {
      customerWhere.id = {
        in: customerIds,
      };
    }

    const tagFilters = this.parseStringArray(filter.tags);
    if (tagFilters.length > 0) {
      customerWhere.tags = {
        hasSome: tagFilters,
      };
    }

    const stage = this.cleanString(filter.stage);
    if (stage) {
      customerWhere.customerStage = stage;
    }

    const source = this.cleanString(filter.source);
    if (source) {
      customerWhere.source = source;
    }

    const requestedZaloNickTypes = this.parseCustomerZaloNickTypes(filter.zaloNickTypes);
    const effectiveZaloNickTypes = requestedZaloNickTypes.length > 0
      ? requestedZaloNickTypes
      : DEFAULT_RECIPIENT_ZALO_NICK_TYPES;
    customerWhere.zaloNickType = {
      in: effectiveZaloNickTypes,
    };

    const customers = await tx.customer.findMany({
      where: customerWhere,
      select: {
        id: true,
        code: true,
        fullName: true,
        phone: true,
        phoneNormalized: true,
        email: true,
        customerStage: true,
        segment: true,
        source: true,
        tags: true,
        zaloNickType: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: snapshotLimit,
    });

    if (customers.length === 0) {
      return;
    }

    const threads = await tx.conversationThread.findMany({
      where: {
        tenant_Id: tenantId,
        customerId: {
          in: customers.map((item) => item.id),
        },
        channel: {
          in: [ConversationChannel.ZALO_PERSONAL, ConversationChannel.ZALO_OA],
        },
      },
      select: {
        customerId: true,
        channelAccountId: true,
        externalThreadId: true,
        lastMessageAt: true,
      },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    });

    const threadByCustomer = new Map<string, CandidateThread[]>();
    for (const thread of threads) {
      const customerId = this.cleanString(thread.customerId);
      if (!customerId) {
        continue;
      }
      const externalThreadId = this.cleanString(thread.externalThreadId);
      if (!externalThreadId) {
        continue;
      }
      const rows = threadByCustomer.get(customerId) ?? [];
      rows.push({
        channelAccountId: thread.channelAccountId,
        externalThreadId,
        lastMessageAt: thread.lastMessageAt,
      });
      threadByCustomer.set(customerId, rows);
    }

    const phoneKeyByCustomer = new Map<string, string>();
    const phonesForLookup = new Set<string>();
    for (const customer of customers) {
      const normalizedPhone = this.normalizeCampaignPhone(customer.phoneNormalized ?? customer.phone);
      if (!normalizedPhone) {
        continue;
      }
      phoneKeyByCustomer.set(customer.id, normalizedPhone);
      phonesForLookup.add(normalizedPhone);
    }

    const lookupAccountIds = campaign.accounts
      .filter((account) => account.status !== ZaloCampaignAccountStatus.DISABLED)
      .map((account) => account.zaloAccountId);

    const contactThreadByPhone = phonesForLookup.size > 0
      ? await this.zaloService.resolvePersonalThreadsByPhones(
        lookupAccountIds,
        [...phonesForLookup],
      )
      : {};

    const defaultPromoCode = this.cleanString(filter.defaultPromoCode) || null;

    const rows: Prisma.ZaloCampaignRecipientCreateManyInput[] = customers.map((customer) => {
      const interactionThreadCandidates = threadByCustomer.get(customer.id) ?? [];
      const phoneKey = phoneKeyByCustomer.get(customer.id) ?? null;
      const phoneResolvedCandidates = phoneKey
        ? (contactThreadByPhone[phoneKey] ?? []).map((candidate) => ({
          channelAccountId: candidate.accountId,
          externalThreadId: candidate.externalThreadId,
          lastMessageAt: null,
        }))
        : [];

      const dedupedPhoneResolvedCandidates: CandidateThread[] = [];
      const seenResolvedKeys = new Set<string>();
      for (const candidate of phoneResolvedCandidates) {
        const accountKey = this.cleanString(candidate.channelAccountId);
        const threadKey = this.cleanString(candidate.externalThreadId);
        if (!threadKey) {
          continue;
        }
        const dedupeKey = `${accountKey}::${threadKey}`;
        if (seenResolvedKeys.has(dedupeKey)) {
          continue;
        }
        seenResolvedKeys.add(dedupeKey);
        dedupedPhoneResolvedCandidates.push(candidate);
      }

      const resolvedFromPhoneLookup = (
        interactionThreadCandidates.length === 0
        && dedupedPhoneResolvedCandidates.length > 0
      );

      const customerZaloNickType = customer.zaloNickType ?? CustomerZaloNickType.CHUA_KIEM_TRA;
      const effectiveThreadCandidates = customerZaloNickType === CustomerZaloNickType.CHAN_NGUOI_LA
        ? interactionThreadCandidates
        : (interactionThreadCandidates.length > 0 ? interactionThreadCandidates : dedupedPhoneResolvedCandidates);
      const mostRecentThread = effectiveThreadCandidates[0] ?? null;
      const externalThreadId = this.cleanString(mostRecentThread?.externalThreadId) || null;

      const interactedAccountIds = Array.from(
        new Set(
          interactionThreadCandidates
            .map((item) => this.cleanString(item.channelAccountId))
            .filter((item) => Boolean(item)),
        ),
      );

      const reachableAccountIds = Array.from(
        new Set(
          dedupedPhoneResolvedCandidates
            .map((item) => this.cleanString(item.channelAccountId))
            .filter((item) => Boolean(item)),
        ),
      );

      const targetAccountId = customerZaloNickType === CustomerZaloNickType.CHAN_NGUOI_LA
        ? (this.cleanString(interactionThreadCandidates[0]?.channelAccountId) || null)
        : (campaign.selectionPolicy === ZaloCampaignSelectionPolicy.PRIORITIZE_RECENT_INTERACTION
          ? (this.cleanString(mostRecentThread?.channelAccountId) || null)
          : null);
      const canResolveByPhone = customerZaloNickType === CustomerZaloNickType.CHAN_NGUOI_LA
        ? false
        : Boolean(phoneKey);
      const mustSkipNoZaloNick = customerZaloNickType === CustomerZaloNickType.CHUA_CO_NICK_ZALO;
      const mustSkipForStrangerNoAccount = (
        customerZaloNickType === CustomerZaloNickType.CHAN_NGUOI_LA
        && !targetAccountId
      );
      const canRunRecipient = !mustSkipNoZaloNick
        && !mustSkipForStrangerNoAccount
        && (Boolean(externalThreadId) || canResolveByPhone);
      const skippedReason = mustSkipNoZaloNick
        ? 'NO_ZALO_NICK'
        : (mustSkipForStrangerNoAccount
          ? 'STRANGER_BLOCK_NEEDS_RECENT_INTERACTION_ACCOUNT'
          : ((externalThreadId || canResolveByPhone) ? null : 'NO_TARGET_THREAD'));

      const promoCode = defaultPromoCode || this.cleanString(customer.code) || null;
      const variablePayload: JsonRecord = {
        customer: {
          id: customer.id,
          code: customer.code,
          fullName: customer.fullName,
          phone: customer.phone,
          phoneNormalized: customer.phoneNormalized,
          email: customer.email,
          customerStage: customer.customerStage,
          segment: customer.segment,
          source: customer.source,
          tags: customer.tags,
          zaloNickType: customerZaloNickType,
          promoCode,
        },
        campaign: {
          id: campaign.id,
          code: campaign.code,
          name: campaign.name,
        },
        interactedAccountIds,
        reachableAccountIds,
        resolvedFromPhoneLookup,
        normalizedPhone: phoneKey,
      };

      const snapshot: JsonRecord = {
        customer: {
          id: customer.id,
          code: customer.code,
          fullName: customer.fullName,
          phone: customer.phone,
          email: customer.email,
          customerStage: customer.customerStage,
          segment: customer.segment,
          source: customer.source,
          tags: customer.tags,
          zaloNickType: customerZaloNickType,
        },
        threads: interactionThreadCandidates,
        resolvedThreadsByPhone: dedupedPhoneResolvedCandidates,
      };

      return {
        tenant_Id: tenantId,
        campaignId: campaign.id,
        customerId: customer.id,
        externalThreadId,
        targetAccountId,
        status: canRunRecipient
          ? ZaloCampaignRecipientStatus.PENDING
          : ZaloCampaignRecipientStatus.SKIPPED,
        skippedReason,
        variablePayloadJson: variablePayload as Prisma.InputJsonValue,
        customerSnapshotJson: snapshot as Prisma.InputJsonValue,
      };
    });

    await tx.zaloCampaignRecipient.createMany({
      data: rows,
      skipDuplicates: true,
    });
  }

  private buildTemplateContext(
    campaign: CampaignWithAccounts,
    account: CampaignAccountWithZalo,
    recipient: RecipientWithPayload,
  ): JsonRecord {
    const variablePayload = this.toRecord(recipient.variablePayloadJson);
    const customerPayload = this.toRecord(variablePayload.customer);
    const campaignPayload = this.toRecord(variablePayload.campaign);

    return {
      ...variablePayload,
      customer: {
        ...customerPayload,
      },
      campaign: {
        id: campaign.id,
        code: campaign.code,
        name: campaign.name,
        ...campaignPayload,
      },
      account: {
        id: account.zaloAccountId,
        displayName: account.zaloAccount.displayName,
      },
    };
  }

  private async collectCampaignStats(campaignIds: string[]) {
    const normalized = [...new Set(campaignIds.map((item) => this.cleanString(item)).filter(Boolean))];
    if (normalized.length === 0) {
      return {} as Record<string, CampaignStats>;
    }

    const grouped = await this.prisma.client.zaloCampaignRecipient.groupBy({
      by: ['campaignId', 'status'],
      where: {
        tenant_Id: this.prisma.getTenantId(),
        campaignId: {
          in: normalized,
        },
      },
      _count: {
        _all: true,
      },
    });

    const output: Record<string, CampaignStats> = {};
    for (const campaignId of normalized) {
      output[campaignId] = this.emptyStats();
    }

    for (const row of grouped) {
      const stats = output[row.campaignId] ?? this.emptyStats();
      const count = row._count._all;
      if (row.status === ZaloCampaignRecipientStatus.PENDING) {
        stats.pending = count;
      } else if (row.status === ZaloCampaignRecipientStatus.IN_PROGRESS) {
        stats.inProgress = count;
      } else if (row.status === ZaloCampaignRecipientStatus.SENT) {
        stats.sent = count;
      } else if (row.status === ZaloCampaignRecipientStatus.SKIPPED) {
        stats.skipped = count;
      } else if (row.status === ZaloCampaignRecipientStatus.FAILED) {
        stats.failed = count;
      }
      output[row.campaignId] = stats;
    }

    return output;
  }

  private emptyStats(): CampaignStats {
    return {
      pending: 0,
      inProgress: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    };
  }

  private buildCampaignMutationData(
    payload: Record<string, unknown>,
    options: {
      fallbackStatus: ZaloCampaignStatus;
      existing: CampaignWithAccounts | null;
    },
  ): CampaignMutationData {
    const fallback = options.existing;

    const code = this.nullableString(payload.code);
    const name = this.requiredString(
      payload.name ?? fallback?.name,
      'Thiếu tên campaign.',
    );

    const selectionPolicy = this.parseSelectionPolicy(
      payload.selectionPolicy,
      fallback?.selectionPolicy ?? ZaloCampaignSelectionPolicy.PRIORITIZE_RECENT_INTERACTION,
    );

    const allowedVariableKeys = this.parseAllowedVariableKeys(
      Object.prototype.hasOwnProperty.call(payload, 'allowedVariableKeys')
        ? payload.allowedVariableKeys
        : (fallback?.allowedVariableKeys ?? []),
    );

    const recipientFilterJson = Object.prototype.hasOwnProperty.call(payload, 'recipientFilterJson')
      ? this.parseRecipientFilter(payload.recipientFilterJson, { allowNull: true })
      : this.normalizeExistingJsonValue(fallback?.recipientFilterJson);

    const timezone = this.cleanString(payload.timezone)
      || fallback?.timezone
      || SYSTEM_TIMEZONE;

    const delayMinSeconds = this.toInt(
      payload.delayMinSeconds,
      fallback?.delayMinSeconds ?? 180,
      1,
      3_600,
    );

    const delayMaxSeconds = this.toInt(
      payload.delayMaxSeconds,
      fallback?.delayMaxSeconds ?? 300,
      delayMinSeconds,
      7_200,
    );

    const maxConsecutiveErrors = this.toInt(
      payload.maxConsecutiveErrors,
      fallback?.maxConsecutiveErrors ?? 3,
      1,
      50,
    );

    const maxRecipients = this.optionalInt(
      payload.maxRecipients,
      fallback?.maxRecipients ?? null,
      1,
      MAX_SNAPSHOT_LIMIT,
    );

    const windowMorningStartMinutes = this.toInt(
      payload.windowMorningStartMinutes,
      fallback?.windowMorningStartMinutes ?? DEFAULT_WINDOW_MORNING_START,
      0,
      1_439,
    );

    const windowMorningEndMinutes = this.toInt(
      payload.windowMorningEndMinutes,
      fallback?.windowMorningEndMinutes ?? DEFAULT_WINDOW_MORNING_END,
      windowMorningStartMinutes,
      1_439,
    );

    const windowAfternoonStartMinutes = this.toInt(
      payload.windowAfternoonStartMinutes,
      fallback?.windowAfternoonStartMinutes ?? DEFAULT_WINDOW_AFTERNOON_START,
      0,
      1_439,
    );

    const windowAfternoonEndMinutes = this.toInt(
      payload.windowAfternoonEndMinutes,
      fallback?.windowAfternoonEndMinutes ?? DEFAULT_WINDOW_AFTERNOON_END,
      windowAfternoonStartMinutes,
      1_439,
    );

    const metadataJson = Object.prototype.hasOwnProperty.call(payload, 'metadataJson')
      ? this.parseRecipientFilter(payload.metadataJson, { allowNull: true })
      : this.normalizeExistingJsonValue(fallback?.metadataJson);

    return {
      code,
      name,
      status: options.fallbackStatus,
      timezone,
      selectionPolicy,
      allowedVariableKeys,
      recipientFilterJson,
      delayMinSeconds,
      delayMaxSeconds,
      maxConsecutiveErrors,
      maxRecipients,
      windowMorningStartMinutes,
      windowMorningEndMinutes,
      windowAfternoonStartMinutes,
      windowAfternoonEndMinutes,
      metadataJson,
    };
  }

  private parseCampaignAccountInputs(input: unknown): CampaignAccountInput[] {
    if (!Array.isArray(input) || input.length === 0) {
      throw new BadRequestException('Campaign phải có ít nhất 1 account.');
    }

    const rows: CampaignAccountInput[] = [];
    const seenAccountIds = new Set<string>();

    for (const item of input) {
      const record = this.toRecord(item);
      const zaloAccountId = this.requiredString(record.zaloAccountId, 'Thiếu zaloAccountId trong danh sách account.');
      const templateContent = this.requiredString(record.templateContent, 'Thiếu templateContent cho account campaign.');
      const quota = this.toInt(record.quota, 0, 1, 20_000);
      const status = this.parseCampaignAccountStatus(
        record.status,
        ZaloCampaignAccountStatus.READY,
      );

      if (seenAccountIds.has(zaloAccountId)) {
        throw new BadRequestException(`Tài khoản ${zaloAccountId} bị lặp trong campaign.`);
      }
      seenAccountIds.add(zaloAccountId);

      rows.push({
        zaloAccountId,
        templateContent,
        quota,
        status,
      });
    }

    return rows;
  }

  private parseCampaignOperatorInputs(input: unknown): CampaignOperatorInput[] {
    if (!input) {
      return [];
    }
    if (!Array.isArray(input)) {
      throw new BadRequestException('operatorUserIds phải là danh sách userId.');
    }

    const output: CampaignOperatorInput[] = [];
    const seen = new Set<string>();

    for (const value of input) {
      const userId = this.cleanString(value);
      if (!userId || seen.has(userId)) {
        continue;
      }
      seen.add(userId);
      output.push({ userId });
    }

    return output;
  }

  private parseRecipientFilter(
    input: unknown,
    options: { allowNull?: boolean } = {},
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (input === null) {
      return options.allowNull ? Prisma.DbNull : undefined;
    }

    if (input === undefined) {
      return undefined;
    }

    if (typeof input === 'string') {
      const normalized = input.trim();
      if (!normalized) {
        return options.allowNull ? Prisma.DbNull : undefined;
      }
      return {
        query: normalized,
      };
    }

    if (typeof input === 'number' || typeof input === 'boolean') {
      return {
        value: input,
      };
    }

    if (Array.isArray(input)) {
      return {
        values: input,
      };
    }

    if (typeof input === 'object') {
      return input as Prisma.InputJsonValue;
    }

    return options.allowNull ? Prisma.DbNull : undefined;
  }

  private normalizeExistingJsonValue(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    return value as Prisma.InputJsonValue;
  }

  private parseAllowedVariableKeys(input: unknown) {
    if (Array.isArray(input)) {
      return Array.from(
        new Set(
          input
            .map((item) => this.cleanString(item))
            .filter(Boolean),
        ),
      );
    }

    if (typeof input === 'string') {
      return Array.from(
        new Set(
          input
            .split(/[\n,]+/)
            .map((item) => this.cleanString(item))
            .filter(Boolean),
        ),
      );
    }

    return [];
  }

  private parseSelectionPolicy(input: unknown, fallback: ZaloCampaignSelectionPolicy) {
    const value = this.cleanString(input).toUpperCase();
    if (value === ZaloCampaignSelectionPolicy.AVOID_PREVIOUSLY_INTERACTED_ACCOUNT) {
      return ZaloCampaignSelectionPolicy.AVOID_PREVIOUSLY_INTERACTED_ACCOUNT;
    }
    if (value === ZaloCampaignSelectionPolicy.PRIORITIZE_RECENT_INTERACTION) {
      return ZaloCampaignSelectionPolicy.PRIORITIZE_RECENT_INTERACTION;
    }
    return fallback;
  }

  private parseCampaignAccountStatus(input: unknown, fallback: ZaloCampaignAccountStatus) {
    const value = this.cleanString(input).toUpperCase();
    if (value === ZaloCampaignAccountStatus.READY) {
      return ZaloCampaignAccountStatus.READY;
    }
    if (value === ZaloCampaignAccountStatus.DISABLED) {
      return ZaloCampaignAccountStatus.DISABLED;
    }
    if (value === ZaloCampaignAccountStatus.PAUSED_ERROR) {
      return ZaloCampaignAccountStatus.PAUSED_ERROR;
    }
    if (value === ZaloCampaignAccountStatus.DONE) {
      return ZaloCampaignAccountStatus.DONE;
    }
    return fallback;
  }

  private parseRecipientStatusOrNull(input: unknown) {
    const value = this.cleanString(input).toUpperCase();
    if (value === ZaloCampaignRecipientStatus.PENDING) {
      return ZaloCampaignRecipientStatus.PENDING;
    }
    if (value === ZaloCampaignRecipientStatus.IN_PROGRESS) {
      return ZaloCampaignRecipientStatus.IN_PROGRESS;
    }
    if (value === ZaloCampaignRecipientStatus.SENT) {
      return ZaloCampaignRecipientStatus.SENT;
    }
    if (value === ZaloCampaignRecipientStatus.SKIPPED) {
      return ZaloCampaignRecipientStatus.SKIPPED;
    }
    if (value === ZaloCampaignRecipientStatus.FAILED) {
      return ZaloCampaignRecipientStatus.FAILED;
    }
    return null;
  }

  private parseAttemptStatusOrNull(input: unknown) {
    const value = this.cleanString(input).toUpperCase();
    if (value === ZaloCampaignAttemptStatus.SENT) {
      return ZaloCampaignAttemptStatus.SENT;
    }
    if (value === ZaloCampaignAttemptStatus.FAILED) {
      return ZaloCampaignAttemptStatus.FAILED;
    }
    if (value === ZaloCampaignAttemptStatus.SKIPPED) {
      return ZaloCampaignAttemptStatus.SKIPPED;
    }
    return null;
  }

  private async validatePersonalAccounts(accountIds: string[]) {
    if (accountIds.length === 0) {
      return;
    }

    const rows = await this.prisma.client.zaloAccount.findMany({
      where: {
        tenant_Id: this.prisma.getTenantId(),
        id: {
          in: accountIds,
        },
        accountType: 'PERSONAL',
      },
      select: {
        id: true,
      },
    });

    const existing = new Set(rows.map((item) => item.id));
    const missing = accountIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Không tìm thấy account PERSONAL: ${missing.join(', ')}`);
    }
  }

  private async validateUsers(userIds: string[]) {
    if (userIds.length === 0) {
      return;
    }

    const rows = await this.prisma.client.user.findMany({
      where: {
        tenant_Id: this.prisma.getTenantId(),
        id: {
          in: userIds,
        },
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    const existing = new Set(rows.map((item) => item.id));
    const missing = userIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`User không hợp lệ hoặc đã inactive: ${missing.join(', ')}`);
    }
  }

  private isWithinCampaignWindow(campaign: CampaignWithAccounts, now: Date) {
    const timezone = this.cleanString(campaign.timezone) || SYSTEM_TIMEZONE;
    const minutes = this.getMinutesInTimezone(now, timezone);

    const inMorning = (
      minutes >= campaign.windowMorningStartMinutes
      && minutes <= campaign.windowMorningEndMinutes
    );

    const inAfternoon = (
      minutes >= campaign.windowAfternoonStartMinutes
      && minutes <= campaign.windowAfternoonEndMinutes
    );

    return inMorning || inAfternoon;
  }

  private async ensureDailyQuotaWindow(
    campaign: CampaignWithAccounts,
    account: CampaignAccountWithZalo,
    now: Date,
  ): Promise<CampaignAccountWithZalo> {
    const timezone = this.cleanString(campaign.timezone) || SYSTEM_TIMEZONE;
    const quotaDateKey = this.getDateKeyInTimezone(now, timezone);
    const storedQuotaDate = this.cleanString(account.dailyQuotaDate);

    const isNewDay = Boolean(storedQuotaDate) && storedQuotaDate !== quotaDateKey;
    const hasNoStoredDate = !storedQuotaDate;
    const shouldPromoteDone = account.status === ZaloCampaignAccountStatus.DONE;
    const isLegacyDoneWithoutDate = shouldPromoteDone && hasNoStoredDate;

    let nextDailySentCount = account.dailySentCount;
    if (isNewDay) {
      nextDailySentCount = 0;
    } else if (isLegacyDoneWithoutDate) {
      nextDailySentCount = account.quota;
    }

    const needsDateUpdate = isNewDay || hasNoStoredDate;
    const needsCounterUpdate = nextDailySentCount !== account.dailySentCount;
    const needsStatusUpdate = shouldPromoteDone;

    let nextSendAt = account.nextSendAt;
    let needsNextSendAtUpdate = false;

    if (isNewDay && (!nextSendAt || nextSendAt.getTime() > now.getTime())) {
      nextSendAt = now;
      needsNextSendAtUpdate = true;
    }

    if (shouldPromoteDone) {
      if (nextDailySentCount >= account.quota) {
        const resetAt = this.getNextDailyResetAt(now, timezone);
        const currentNextSendAtMs = account.nextSendAt?.getTime() ?? null;
        if (currentNextSendAtMs !== resetAt.getTime()) {
          nextSendAt = resetAt;
          needsNextSendAtUpdate = true;
        }
      } else if (!nextSendAt || nextSendAt.getTime() > now.getTime()) {
        nextSendAt = now;
        needsNextSendAtUpdate = true;
      }
    }

    if (!needsDateUpdate && !needsCounterUpdate && !needsStatusUpdate && !needsNextSendAtUpdate) {
      return account;
    }

    const updated = await this.prisma.client.zaloCampaignAccount.update({
      where: { id: account.id },
      data: {
        ...(needsDateUpdate ? { dailyQuotaDate: quotaDateKey } : {}),
        ...(needsCounterUpdate ? { dailySentCount: nextDailySentCount } : {}),
        ...(needsStatusUpdate ? { status: ZaloCampaignAccountStatus.READY } : {}),
        ...(needsNextSendAtUpdate ? { nextSendAt } : {}),
      },
      include: {
        zaloAccount: {
          select: {
            id: true,
            displayName: true,
            status: true,
          },
        },
      },
    });

    return updated as CampaignAccountWithZalo;
  }

  private getMinutesInTimezone(date: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });

    const parts = formatter.formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

    return hour * 60 + minute;
  }

  private getDateKeyInTimezone(date: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
    const month = parts.find((part) => part.type === 'month')?.value ?? '01';
    const day = parts.find((part) => part.type === 'day')?.value ?? '01';
    return `${year}-${month}-${day}`;
  }

  private getNextDailyResetAt(now: Date, timezone: string) {
    const currentDateKey = this.getDateKeyInTimezone(now, timezone);
    const probe = new Date(now.getTime());
    probe.setUTCSeconds(0, 0);

    let candidate = new Date(probe.getTime() + 60_000);
    const maxIterations = 24 * 60 + 180;
    for (let index = 0; index < maxIterations; index += 1) {
      if (this.getDateKeyInTimezone(candidate, timezone) !== currentDateKey) {
        return candidate;
      }
      candidate = new Date(candidate.getTime() + 60_000);
    }

    return new Date(now.getTime() + 24 * 60 * 60 * 1_000);
  }

  private readActor(): AuthActor {
    const raw = this.toRecord(this.cls.get(AUTH_USER_CONTEXT_KEY));
    const userId = this.cleanString(raw.userId ?? raw.sub) || null;
    const roleRaw = this.cleanString(raw.role).toUpperCase();
    const role = roleRaw === 'ADMIN' ? 'ADMIN' : 'USER';
    return {
      userId,
      role,
    };
  }

  private assertAdmin(actor: AuthActor) {
    if (this.isSystemContext(actor)) {
      return;
    }
    if (this.isAdmin(actor)) {
      return;
    }
    throw new ForbiddenException('Chỉ ADMIN mới có quyền thực hiện thao tác này.');
  }

  private isAdmin(actor: AuthActor) {
    return actor.role === 'ADMIN';
  }

  private isSystemContext(actor: AuthActor) {
    return !actor.userId;
  }

  private requiredString(value: unknown, message: string) {
    const normalized = this.cleanString(value);
    if (!normalized) {
      throw new BadRequestException(message);
    }
    return normalized;
  }

  private nullableString(value: unknown) {
    const normalized = this.cleanString(value);
    return normalized || null;
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }

  private toInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }

  private optionalInt(value: unknown, fallback: number | null, min: number, max: number) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }

  private normalizeError(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error ?? 'UNKNOWN_ERROR');
  }

  private toRecord(value: unknown): JsonRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as JsonRecord;
  }

  private parseStringArray(value: unknown) {
    if (Array.isArray(value)) {
      return Array.from(
        new Set(
          value
            .map((item) => this.cleanString(item))
            .filter(Boolean),
        ),
      );
    }

    if (typeof value === 'string') {
      return Array.from(
        new Set(
          value
            .split(/[\n,]+/)
            .map((item) => this.cleanString(item))
            .filter(Boolean),
        ),
      );
    }

    return [];
  }

  private parseCustomerZaloNickType(
    value: unknown,
    fallback: CustomerZaloNickType,
  ): CustomerZaloNickType {
    const normalized = this.cleanString(value).toUpperCase();
    if (
      normalized === CustomerZaloNickType.CHUA_KIEM_TRA
      || normalized === CustomerZaloNickType.CHUA_CO_NICK_ZALO
      || normalized === CustomerZaloNickType.CHAN_NGUOI_LA
      || normalized === CustomerZaloNickType.GUI_DUOC_TIN_NHAN
    ) {
      return normalized as CustomerZaloNickType;
    }
    return fallback;
  }

  private parseCustomerZaloNickTypes(value: unknown): CustomerZaloNickType[] {
    const rawValues = this.parseStringArray(value);
    const output: CustomerZaloNickType[] = [];
    for (const rawValue of rawValues) {
      const parsed = this.parseCustomerZaloNickType(rawValue, CustomerZaloNickType.CHUA_KIEM_TRA);
      if (rawValue.trim().toUpperCase() !== parsed) {
        continue;
      }
      if (!output.includes(parsed)) {
        output.push(parsed);
      }
    }
    return output;
  }

  private normalizeCampaignPhone(value: unknown) {
    const normalized = normalizeVietnamPhone(String(value ?? '').trim());
    if (!normalized) {
      return null;
    }
    const compact = normalized.replace(/[^\d+]/g, '');
    if (!compact) {
      return null;
    }
    if (compact.startsWith('+84')) {
      return `0${compact.slice(3)}`;
    }
    if (compact.startsWith('84')) {
      return `0${compact.slice(2)}`;
    }
    return compact;
  }

  private isLookupUidNotFoundError(message: string): boolean {
    const normalized = this.cleanString(message).toLowerCase();
    if (!normalized) {
      return false;
    }
    return (
      normalized.includes('khong tim duoc thread')
      || normalized.includes('không tìm được thread')
      || normalized.includes('no_target_thread')
      || normalized.includes('no_zalo_nick')
      || normalized.includes('khong ton tai')
      || normalized.includes('không tồn tại')
      || (normalized.includes('uid') && (
        normalized.includes('not found')
        || normalized.includes('missing')
      ))
    );
  }

  private isStrangerBlockedError(message: string): boolean {
    const normalized = this.cleanString(message).toLowerCase();
    if (!normalized) {
      return false;
    }
    return (
      normalized.includes('chan nguoi la')
      || normalized.includes('chặn người lạ')
      || normalized.includes('stranger')
      || normalized.includes('only receive messages from friends')
      || normalized.includes('khong nhan tin nhan tu nguoi la')
      || normalized.includes('không nhận tin nhắn từ người lạ')
    );
  }
}
