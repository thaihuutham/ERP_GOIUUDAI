import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationChannel, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

export type AiRoutingMode = 'legacy' | 'n8n' | 'shadow';

export type AiRoutingRuntime = {
  mode: AiRoutingMode;
  chatEventsUrl: string;
  outboundHmacSecret: string;
  callbackHmacSecret: string;
  debounceSeconds: number;
  dispatchTimeoutMs: number;
  maxRetryAttempts: number;
  retryBackoffSeconds: [number, number, number];
};

export type ResolvedAiRoute = {
  industryId: string;
  industryKey: string;
  industryName: string;
  knowledgeSpaceRef: string | null;
  piiMaskEnabled: boolean;
  piiMaskConfigJson: Prisma.JsonValue | null;
  workflowKey: string;
  agentKey: string | null;
  webhookPath: string | null;
};

@Injectable()
export class ZaloAiRoutingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  async getRuntimeConfig(): Promise<AiRoutingRuntime> {
    const integrationDomain = await this.runtimeSettings.getDomain('integrations');
    const aiRouting = this.toRecord(this.toRecord(integrationDomain).aiRouting);

    const mode = this.parseMode(this.readString(aiRouting.mode, this.readString(this.config.get('AI_ROUTING_MODE'), 'legacy')));
    const retryBackoffSeconds = this.parseRetryBackoff(
      this.readString(aiRouting.retryBackoffSeconds),
      this.readString(this.config.get('AI_N8N_RETRY_BACKOFF_SECONDS'))
    );

    return {
      mode,
      chatEventsUrl: this.readString(aiRouting.chatEventsUrl, this.readString(this.config.get('AI_N8N_CHAT_EVENTS_URL'))),
      outboundHmacSecret: this.readString(aiRouting.outboundHmacSecret, this.readString(this.config.get('AI_N8N_OUTBOUND_HMAC_SECRET'))),
      callbackHmacSecret: this.readString(aiRouting.callbackHmacSecret, this.readString(this.config.get('AI_N8N_CALLBACK_HMAC_SECRET'))),
      debounceSeconds: this.toInt(
        aiRouting.debounceSeconds,
        this.toInt(this.config.get('AI_N8N_DEBOUNCE_SECONDS'), 8, 1, 120),
        1,
        120
      ),
      dispatchTimeoutMs: this.toInt(
        aiRouting.dispatchTimeoutMs,
        this.toInt(this.config.get('AI_N8N_DISPATCH_TIMEOUT_MS'), 25_000, 1_000, 120_000),
        1_000,
        120_000
      ),
      maxRetryAttempts: this.toInt(
        aiRouting.maxRetryAttempts,
        this.toInt(this.config.get('AI_N8N_MAX_RETRY_ATTEMPTS'), 3, 1, 10),
        1,
        10
      ),
      retryBackoffSeconds
    };
  }

  async listIndustries(query: PaginationQueryDto) {
    const take = this.resolveTake(query.limit, 25, 200);
    const keyword = this.cleanString(query.q);

    const rows = await this.prisma.client.aiIndustry.findMany({
      where: {
        ...(keyword
          ? {
              OR: [
                { industryKey: { contains: keyword, mode: 'insensitive' } },
                { name: { contains: keyword, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      limit: take
    };
  }

  async createIndustry(payload: Record<string, unknown>) {
    const industryKey = this.normalizeIndustryKey(payload.industryKey);
    const name = this.requiredString(payload.name, 'Thiếu tên ngành.');

    return this.prisma.client.aiIndustry.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        industryKey,
        name,
        description: this.cleanString(payload.description) || null,
        knowledgeSpaceRef: this.cleanString(payload.knowledgeSpaceRef) || null,
        piiMaskEnabled: this.toBool(payload.piiMaskEnabled, true),
        piiMaskConfigJson: this.toNullableJson(payload.piiMaskConfigJson),
        isActive: this.toBool(payload.isActive, true),
        metadataJson: this.toNullableJson(payload.metadataJson)
      }
    });
  }

  async updateIndustry(industryIdRaw: string, payload: Record<string, unknown>) {
    const industryId = this.requiredString(industryIdRaw, 'Thiếu industryId.');
    await this.ensureIndustry(industryId);

    await this.prisma.client.aiIndustry.updateMany({
      where: { id: industryId },
      data: {
        industryKey: payload.industryKey === undefined ? undefined : this.normalizeIndustryKey(payload.industryKey),
        name: payload.name === undefined ? undefined : this.requiredString(payload.name, 'Tên ngành không hợp lệ.'),
        description: payload.description === undefined ? undefined : this.cleanString(payload.description) || null,
        knowledgeSpaceRef: payload.knowledgeSpaceRef === undefined ? undefined : this.cleanString(payload.knowledgeSpaceRef) || null,
        piiMaskEnabled: payload.piiMaskEnabled === undefined ? undefined : this.toBool(payload.piiMaskEnabled, true),
        piiMaskConfigJson: payload.piiMaskConfigJson === undefined ? undefined : this.toNullableJson(payload.piiMaskConfigJson),
        isActive: payload.isActive === undefined ? undefined : this.toBool(payload.isActive, true),
        metadataJson: payload.metadataJson === undefined ? undefined : this.toNullableJson(payload.metadataJson)
      }
    });

    return this.ensureIndustry(industryId);
  }

  async listChannelMappings(query: PaginationQueryDto, filters: Record<string, unknown>) {
    const take = this.resolveTake(query.limit, 25, 200);
    const keyword = this.cleanString(query.q);
    const channel = this.parseChannel(filters.channel, null);
    const isActive = this.parseOptionalBoolean(filters.isActive);
    const channelAccountId = this.cleanString(filters.channelAccountId);

    const rows = await this.prisma.client.aiRoutingChannelAccount.findMany({
      where: {
        ...(channel ? { channel } : {}),
        ...(channelAccountId ? { channelAccountId } : {}),
        ...(isActive === null ? {} : { isActive }),
        ...(keyword
          ? {
              OR: [
                { channelAccountId: { contains: keyword, mode: 'insensitive' } },
                { industry: { industryKey: { contains: keyword, mode: 'insensitive' } } },
                { industry: { name: { contains: keyword, mode: 'insensitive' } } }
              ]
            }
          : {})
      },
      include: {
        industry: {
          select: {
            id: true,
            industryKey: true,
            name: true,
            isActive: true
          }
        }
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      limit: take
    };
  }

  async upsertChannelMapping(payload: Record<string, unknown>) {
    const channel = this.parseChannel(payload.channel, ConversationChannel.ZALO_PERSONAL);
    const channelAccountId = this.requiredString(payload.channelAccountId, 'Thiếu channelAccountId.');
    const industry = await this.resolveIndustryByPayload(payload);

    const existing = await this.prisma.client.aiRoutingChannelAccount.findFirst({
      where: {
        channel,
        channelAccountId
      },
      select: { id: true }
    });

    if (existing?.id) {
      await this.prisma.client.aiRoutingChannelAccount.updateMany({
        where: { id: existing.id },
        data: {
          industryId: industry.id,
          isActive: this.toBool(payload.isActive, true),
          metadataJson: this.toNullableJson(payload.metadataJson)
        }
      });
      return this.prisma.client.aiRoutingChannelAccount.findFirstOrThrow({
        where: { id: existing.id },
        include: {
          industry: {
            select: {
              id: true,
              industryKey: true,
              name: true,
              isActive: true
            }
          }
        }
      });
    }

    return this.prisma.client.aiRoutingChannelAccount.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        channel,
        channelAccountId,
        industryId: industry.id,
        isActive: this.toBool(payload.isActive, true),
        metadataJson: this.toNullableJson(payload.metadataJson)
      },
      include: {
        industry: {
          select: {
            id: true,
            industryKey: true,
            name: true,
            isActive: true
          }
        }
      }
    });
  }

  async updateChannelMapping(mappingIdRaw: string, payload: Record<string, unknown>) {
    const mappingId = this.requiredString(mappingIdRaw, 'Thiếu mappingId.');
    const current = await this.prisma.client.aiRoutingChannelAccount.findFirst({
      where: { id: mappingId },
      select: {
        id: true,
        channel: true,
        channelAccountId: true
      }
    });
    if (!current) {
      throw new NotFoundException('Không tìm thấy mapping kênh/ngành.');
    }

    let nextIndustryId: string | undefined;
    if (payload.industryId !== undefined || payload.industryKey !== undefined) {
      nextIndustryId = (await this.resolveIndustryByPayload(payload)).id;
    }

    const nextChannel = payload.channel === undefined
      ? current.channel
      : this.parseChannel(payload.channel, current.channel);
    const nextChannelAccountId = payload.channelAccountId === undefined
      ? current.channelAccountId
      : this.requiredString(payload.channelAccountId, 'channelAccountId không hợp lệ.');

    await this.prisma.client.aiRoutingChannelAccount.updateMany({
      where: { id: mappingId },
      data: {
        channel: nextChannel,
        channelAccountId: nextChannelAccountId,
        industryId: nextIndustryId,
        isActive: payload.isActive === undefined ? undefined : this.toBool(payload.isActive, true),
        metadataJson: payload.metadataJson === undefined ? undefined : this.toNullableJson(payload.metadataJson)
      }
    });

    return this.prisma.client.aiRoutingChannelAccount.findFirstOrThrow({
      where: { id: mappingId },
      include: {
        industry: {
          select: {
            id: true,
            industryKey: true,
            name: true,
            isActive: true
          }
        }
      }
    });
  }

  async listIndustryBindings(query: PaginationQueryDto, filters: Record<string, unknown>) {
    const take = this.resolveTake(query.limit, 25, 200);
    const keyword = this.cleanString(query.q);
    const isActive = this.parseOptionalBoolean(filters.isActive);

    const rows = await this.prisma.client.aiIndustryBinding.findMany({
      where: {
        ...(isActive === null ? {} : { isActive }),
        ...(keyword
          ? {
              OR: [
                { workflowKey: { contains: keyword, mode: 'insensitive' } },
                { agentKey: { contains: keyword, mode: 'insensitive' } },
                { industry: { industryKey: { contains: keyword, mode: 'insensitive' } } },
                { industry: { name: { contains: keyword, mode: 'insensitive' } } }
              ]
            }
          : {})
      },
      include: {
        industry: {
          select: {
            id: true,
            industryKey: true,
            name: true,
            isActive: true
          }
        }
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      limit: take
    };
  }

  async upsertIndustryBinding(payload: Record<string, unknown>) {
    const industry = await this.resolveIndustryByPayload(payload);
    const workflowKey = this.requiredString(payload.workflowKey, 'Thiếu workflowKey.').toLowerCase();

    const existing = await this.prisma.client.aiIndustryBinding.findFirst({
      where: { industryId: industry.id },
      select: { id: true }
    });

    if (existing?.id) {
      await this.prisma.client.aiIndustryBinding.updateMany({
        where: { id: existing.id },
        data: {
          workflowKey,
          agentKey: this.cleanString(payload.agentKey) || null,
          webhookPath: this.cleanString(payload.webhookPath) || null,
          isActive: this.toBool(payload.isActive, true),
          metadataJson: this.toNullableJson(payload.metadataJson)
        }
      });

      return this.prisma.client.aiIndustryBinding.findFirstOrThrow({
        where: { id: existing.id },
        include: {
          industry: {
            select: {
              id: true,
              industryKey: true,
              name: true,
              isActive: true
            }
          }
        }
      });
    }

    return this.prisma.client.aiIndustryBinding.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        industryId: industry.id,
        workflowKey,
        agentKey: this.cleanString(payload.agentKey) || null,
        webhookPath: this.cleanString(payload.webhookPath) || null,
        isActive: this.toBool(payload.isActive, true),
        metadataJson: this.toNullableJson(payload.metadataJson)
      },
      include: {
        industry: {
          select: {
            id: true,
            industryKey: true,
            name: true,
            isActive: true
          }
        }
      }
    });
  }

  async updateIndustryBinding(bindingIdRaw: string, payload: Record<string, unknown>) {
    const bindingId = this.requiredString(bindingIdRaw, 'Thiếu bindingId.');
    const current = await this.prisma.client.aiIndustryBinding.findFirst({
      where: { id: bindingId },
      select: { id: true }
    });
    if (!current) {
      throw new NotFoundException('Không tìm thấy binding ngành/workflow.');
    }

    let nextIndustryId: string | undefined;
    if (payload.industryId !== undefined || payload.industryKey !== undefined) {
      nextIndustryId = (await this.resolveIndustryByPayload(payload)).id;
    }

    await this.prisma.client.aiIndustryBinding.updateMany({
      where: { id: bindingId },
      data: {
        industryId: nextIndustryId,
        workflowKey: payload.workflowKey === undefined ? undefined : this.requiredString(payload.workflowKey, 'workflowKey không hợp lệ.').toLowerCase(),
        agentKey: payload.agentKey === undefined ? undefined : this.cleanString(payload.agentKey) || null,
        webhookPath: payload.webhookPath === undefined ? undefined : this.cleanString(payload.webhookPath) || null,
        isActive: payload.isActive === undefined ? undefined : this.toBool(payload.isActive, true),
        metadataJson: payload.metadataJson === undefined ? undefined : this.toNullableJson(payload.metadataJson)
      }
    });

    return this.prisma.client.aiIndustryBinding.findFirstOrThrow({
      where: { id: bindingId },
      include: {
        industry: {
          select: {
            id: true,
            industryKey: true,
            name: true,
            isActive: true
          }
        }
      }
    });
  }

  async resolveActiveRoute(channel: ConversationChannel, channelAccountId: string): Promise<ResolvedAiRoute | null> {
    const normalizedChannelAccountId = this.cleanString(channelAccountId);
    if (!normalizedChannelAccountId) {
      return null;
    }

    const mapping = await this.prisma.client.aiRoutingChannelAccount.findFirst({
      where: {
        channel,
        channelAccountId: normalizedChannelAccountId,
        isActive: true
      },
      include: {
        industry: {
          include: {
            industryBinding: {
              where: { isActive: true },
              take: 1,
              orderBy: { updatedAt: 'desc' }
            }
          }
        }
      }
    });

    if (!mapping?.industry || !mapping.industry.isActive) {
      return null;
    }

    const binding = mapping.industry.industryBinding[0];
    if (!binding || !binding.isActive) {
      return null;
    }

    return {
      industryId: mapping.industry.id,
      industryKey: mapping.industry.industryKey,
      industryName: mapping.industry.name,
      knowledgeSpaceRef: mapping.industry.knowledgeSpaceRef,
      piiMaskEnabled: mapping.industry.piiMaskEnabled,
      piiMaskConfigJson: mapping.industry.piiMaskConfigJson,
      workflowKey: binding.workflowKey,
      agentKey: binding.agentKey,
      webhookPath: binding.webhookPath
    };
  }

  private async resolveIndustryByPayload(payload: Record<string, unknown>) {
    const industryId = this.cleanString(payload.industryId);
    const industryKey = this.cleanString(payload.industryKey);

    if (!industryId && !industryKey) {
      throw new BadRequestException('Thiếu industryId hoặc industryKey.');
    }

    const industry = await this.prisma.client.aiIndustry.findFirst({
      where: industryId
        ? { id: industryId }
        : { industryKey: this.normalizeIndustryKey(industryKey) }
    });

    if (!industry) {
      throw new NotFoundException('Không tìm thấy ngành cấu hình AI.');
    }

    return industry;
  }

  private async ensureIndustry(industryId: string) {
    const industry = await this.prisma.client.aiIndustry.findFirst({ where: { id: industryId } });
    if (!industry) {
      throw new NotFoundException('Không tìm thấy ngành cấu hình AI.');
    }
    return industry;
  }

  private parseRetryBackoff(preferred: string | undefined, fallback: string | undefined): [number, number, number] {
    const raw = this.cleanString(preferred) || this.cleanString(fallback) || '10,30,90';
    const parts = raw
      .split(/[;,\s]+/)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item >= 1)
      .map((item) => Math.round(item));
    const normalized = [parts[0] ?? 10, parts[1] ?? 30, parts[2] ?? 90] as [number, number, number];
    return normalized;
  }

  private parseMode(input: string): AiRoutingMode {
    const candidate = String(input ?? '').trim().toLowerCase();
    if (candidate === 'n8n' || candidate === 'shadow') {
      return candidate;
    }
    return 'legacy';
  }

  private parseChannel(input: unknown, fallback: ConversationChannel): ConversationChannel;
  private parseChannel(input: unknown, fallback: ConversationChannel | null): ConversationChannel | null;
  private parseChannel(input: unknown, fallback: ConversationChannel | null) {
    const candidate = this.cleanString(input)?.toUpperCase();
    if (!candidate) {
      return fallback;
    }
    if ((Object.values(ConversationChannel) as string[]).includes(candidate)) {
      return candidate as ConversationChannel;
    }
    throw new BadRequestException('channel không hợp lệ.');
  }

  private normalizeIndustryKey(input: unknown) {
    const value = this.requiredString(input, 'Thiếu industryKey.').toLowerCase();
    if (!/^[a-z0-9_\-.]{2,64}$/.test(value)) {
      throw new BadRequestException('industryKey chỉ được chứa chữ thường, số, _, -, . (2-64 ký tự).');
    }
    return value;
  }

  private resolveTake(limit: number | undefined, fallback: number, max: number) {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    if (parsed < 1) {
      return 1;
    }
    if (parsed > max) {
      return max;
    }
    return Math.round(parsed);
  }

  private parseOptionalBoolean(input: unknown): boolean | null {
    if (input === undefined || input === null || input === '') {
      return null;
    }
    return this.toBool(input, false);
  }

  private toBool(input: unknown, fallback: boolean) {
    if (input === undefined || input === null) {
      return fallback;
    }
    if (typeof input === 'boolean') {
      return input;
    }
    const normalized = String(input).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
    return fallback;
  }

  private toInt(input: unknown, fallback: number, min: number, max: number) {
    if (input === undefined || input === null || input === '') {
      return fallback;
    }
    const value = Number(input);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return Math.round(value);
  }

  private toNullableJson(input: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (input === undefined) {
      return undefined;
    }
    if (input === null) {
      return Prisma.JsonNull;
    }
    return input as Prisma.InputJsonValue;
  }

  private requiredString(input: unknown, message: string) {
    const value = this.cleanString(input);
    if (!value) {
      throw new BadRequestException(message);
    }
    return value;
  }

  private readString(input: unknown, fallback = '') {
    const normalized = this.cleanString(input);
    return normalized || fallback;
  }

  private cleanString(input: unknown) {
    if (input === undefined || input === null) {
      return '';
    }
    return String(input).trim();
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }
}
