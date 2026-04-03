import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GenericStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AssistantDispatchChannelsQueryDto,
  CreateAssistantDispatchChannelDto,
  UpdateAssistantDispatchChannelDto
} from './dto/assistant.dto';
import { AssistantEffectiveAccess } from './assistant.types';
import { isArtifactScopeWithinChannelScope, normalizeScopeType, toStringArray, uniqueStringArray } from './assistant-scope.util';

@Injectable()
export class AssistantDispatchService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listChannels(query: AssistantDispatchChannelsQueryDto) {
    const take = this.take(query.limit);
    const where: Prisma.AssistantDispatchChannelWhereInput = {};

    if (query.channelType) {
      where.channelType = String(query.channelType).toUpperCase();
    }
    if (query.scopeType) {
      where.scopeType = normalizeScopeType(query.scopeType);
    }
    if (query.isActive === 'true') {
      where.isActive = true;
    }
    if (query.isActive === 'false') {
      where.isActive = false;
    }
    if (query.q) {
      const keyword = query.q.trim();
      if (keyword) {
        where.OR = [
          { name: { contains: keyword, mode: 'insensitive' } },
          { endpointUrl: { contains: keyword, mode: 'insensitive' } }
        ];
      }
    }

    const rows = await this.prisma.client.assistantDispatchChannel.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take
    });

    return {
      items: rows,
      count: rows.length
    };
  }

  async createChannel(dto: CreateAssistantDispatchChannelDto, access: AssistantEffectiveAccess) {
    const scopeType = normalizeScopeType(dto.scopeType ?? access.scope.type, access.scope.type);
    const scopeRefIds = uniqueStringArray(dto.scopeRefIds ?? access.scope.scopeRefIds);
    const allowedReportPacks = uniqueStringArray(dto.allowedReportPacks);

    return this.prisma.client.assistantDispatchChannel.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        name: this.cleanString(dto.name),
        channelType: String(dto.channelType ?? '').toUpperCase(),
        endpointUrl: this.cleanString(dto.endpointUrl),
        webhookSecretRef: this.cleanString(dto.webhookSecretRef) || null,
        scopeType,
        scopeRefIds: scopeRefIds as Prisma.InputJsonValue,
        allowedReportPacks: allowedReportPacks as Prisma.InputJsonValue,
        metadataJson: {
          createdByUserId: access.actor.userId,
          createdByRole: access.actor.role
        } as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true
      }
    });
  }

  async updateChannel(channelIdRaw: string, dto: UpdateAssistantDispatchChannelDto, access: AssistantEffectiveAccess) {
    const channelId = this.cleanString(channelIdRaw);
    await this.ensureChannel(channelId);

    const nextScopeType = dto.scopeType ? normalizeScopeType(dto.scopeType) : undefined;
    const nextScopeRefIds = dto.scopeRefIds ? uniqueStringArray(dto.scopeRefIds) : undefined;
    const nextReportPacks = dto.allowedReportPacks ? uniqueStringArray(dto.allowedReportPacks) : undefined;

    await this.prisma.client.assistantDispatchChannel.updateMany({
      where: { id: channelId },
      data: {
        name: dto.name ? this.cleanString(dto.name) : undefined,
        channelType: dto.channelType ? String(dto.channelType).toUpperCase() : undefined,
        endpointUrl: dto.endpointUrl ? this.cleanString(dto.endpointUrl) : undefined,
        webhookSecretRef: dto.webhookSecretRef === undefined
          ? undefined
          : this.cleanString(dto.webhookSecretRef) || null,
        scopeType: nextScopeType,
        scopeRefIds: nextScopeRefIds === undefined
          ? undefined
          : (nextScopeRefIds as Prisma.InputJsonValue),
        allowedReportPacks: nextReportPacks === undefined
          ? undefined
          : (nextReportPacks as Prisma.InputJsonValue),
        isActive: dto.isActive,
        metadataJson: {
          updatedByUserId: access.actor.userId,
          updatedByRole: access.actor.role,
          updatedAt: new Date().toISOString()
        } as Prisma.InputJsonValue
      }
    });

    return this.ensureChannel(channelId);
  }

  async testChannel(channelIdRaw: string) {
    const channelId = this.cleanString(channelIdRaw);
    const channel = await this.ensureChannel(channelId);

    const payload = {
      type: 'assistant_channel_test',
      channelId: channel.id,
      testedAt: new Date().toISOString()
    };

    const result = await this.postWebhook(channel.endpointUrl, payload, 15_000);

    await this.prisma.client.assistantDispatchChannel.updateMany({
      where: { id: channel.id },
      data: {
        lastTestedAt: new Date()
      }
    });

    return {
      channelId: channel.id,
      ok: result.ok,
      statusCode: result.statusCode,
      message: result.message
    };
  }

  async dispatchArtifactToChannels(input: {
    artifactId: string;
    reportPacks: string[];
    access: AssistantEffectiveAccess;
  }) {
    const artifact = await this.prisma.client.assistantReportArtifact.findFirst({
      where: { id: input.artifactId },
      include: {
        run: true
      }
    });

    if (!artifact) {
      throw new NotFoundException(`Assistant artifact not found: ${input.artifactId}`);
    }

    const channels = await this.prisma.client.assistantDispatchChannel.findMany({
      where: {
        isActive: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    const dispatchResults: Array<Record<string, unknown>> = [];
    for (const channel of channels) {
      if (!this.channelAllowsReportPacks(channel.allowedReportPacks, input.reportPacks)) {
        continue;
      }

      const scopeCompatible = isArtifactScopeWithinChannelScope({
        artifactScopeType: artifact.scopeType,
        artifactScopeRefIds: artifact.scopeRefIds,
        channelScopeType: channel.scopeType,
        channelScopeRefIds: channel.scopeRefIds
      });

      if (!scopeCompatible) {
        dispatchResults.push({
          channelId: channel.id,
          status: 'SCOPE_MISMATCH'
        });
        continue;
      }

      const payload = {
        type: 'assistant_report',
        artifactId: artifact.id,
        runId: artifact.runId,
        scopeType: artifact.scopeType,
        scopeRefIds: toStringArray(artifact.scopeRefIds),
        reportPacks: input.reportPacks,
        content: artifact.contentJson,
        generatedAt: new Date().toISOString()
      };

      const attempt = await this.createAttempt(channel.id, artifact.id, payload);
      const response = await this.postWebhook(channel.endpointUrl, payload, 20_000);

      await this.prisma.client.assistantDispatchAttempt.updateMany({
        where: { id: attempt.id },
        data: {
          status: response.ok ? 'SUCCESS' : 'FAILED',
          dispatchedAt: new Date(),
          responsePayload: {
            statusCode: response.statusCode,
            message: response.message
          } as Prisma.InputJsonValue,
          errorMessage: response.ok ? null : response.message,
          nextRetryAt: response.ok ? null : this.nextRetryTime(attempt.attemptNo)
        }
      });

      if (response.ok) {
        await this.prisma.client.assistantReportArtifact.updateMany({
          where: { id: artifact.id },
          data: {
            channelId: channel.id,
            publishedAt: new Date(),
            status: GenericStatus.APPROVED
          }
        });
      }

      dispatchResults.push({
        channelId: channel.id,
        status: response.ok ? 'SUCCESS' : 'FAILED',
        statusCode: response.statusCode,
        message: response.message
      });
    }

    return {
      artifactId: artifact.id,
      dispatchCount: dispatchResults.length,
      results: dispatchResults
    };
  }

  validateArtifactChannelCompatibility(input: {
    artifactScopeType: string;
    artifactScopeRefIds: unknown;
    channelScopeType: string;
    channelScopeRefIds: unknown;
  }) {
    return isArtifactScopeWithinChannelScope(input);
  }

  private async createAttempt(channelId: string, artifactId: string, payload: Record<string, unknown>) {
    const latest = await this.prisma.client.assistantDispatchAttempt.findFirst({
      where: {
        channelId,
        artifactId
      },
      orderBy: {
        attemptNo: 'desc'
      }
    });
    const attemptNo = (latest?.attemptNo ?? 0) + 1;

    return this.prisma.client.assistantDispatchAttempt.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        channelId,
        artifactId,
        attemptNo,
        status: 'PENDING',
        requestPayload: payload as Prisma.InputJsonValue
      }
    });
  }

  private channelAllowsReportPacks(rawAllowedReportPacks: Prisma.JsonValue | null, requestedPacks: string[]) {
    const allowed = uniqueStringArray(rawAllowedReportPacks).map((item) => item.toLowerCase());
    if (allowed.length === 0) {
      return true;
    }

    return requestedPacks.some((item) => allowed.includes(item.toLowerCase()));
  }

  private nextRetryTime(attemptNo: number) {
    const delayMinutes = Math.min(60, Math.max(1, attemptNo * 5));
    return new Date(Date.now() + delayMinutes * 60 * 1000);
  }

  private async postWebhook(urlRaw: string, payload: Record<string, unknown>, timeoutMs: number) {
    const endpointUrl = this.cleanString(urlRaw);
    if (!endpointUrl) {
      throw new BadRequestException('Dispatch channel thiếu endpointUrl.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      return {
        ok: response.ok,
        statusCode: response.status,
        message: response.ok ? 'ok' : `status_${response.status}`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'dispatch_failed';
      return {
        ok: false,
        statusCode: 0,
        message
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async ensureChannel(channelId: string) {
    const channel = await this.prisma.client.assistantDispatchChannel.findFirst({
      where: { id: channelId }
    });

    if (!channel) {
      throw new NotFoundException(`Assistant channel not found: ${channelId}`);
    }

    return channel;
  }

  private take(limitRaw: number | undefined) {
    const parsed = Number(limitRaw ?? 50);
    if (!Number.isFinite(parsed)) {
      return 50;
    }
    return Math.min(Math.max(Math.trunc(parsed), 1), 200);
  }

  private cleanString(value: unknown) {
    return String(value ?? '').trim();
  }
}
