import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException
} from '@nestjs/common';
import {
  AiConversationJobStatus,
  AiConversationOutboxStatus,
  ConversationChannel,
  ConversationSenderType,
  Prisma
} from '@prisma/client';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { readZaloAutoReplyThreadState, patchZaloAutoReplyThreadState } from './zalo-auto-reply-state.util';
import { AiRoutingRuntime, ZaloAiRoutingService } from './zalo-ai-routing.service';

type EnqueueAiJobInput = {
  threadId: string;
  customerMessageId: string;
  customerSentAt: Date;
};

type RegisterCallbackResult =
  | {
      action: 'NOOP';
      duplicate: true;
      jobId: string;
      status: AiConversationJobStatus;
    }
  | {
      action: 'SKIP';
      duplicate: false;
      jobId: string;
      status: AiConversationJobStatus;
      reason: string;
    }
  | {
      action: 'SEND';
      duplicate: false;
      jobId: string;
      accountId: string;
      externalThreadId: string;
      replyText: string;
      eventId: string;
      metadata: Record<string, unknown>;
    };

@Injectable()
export class ZaloAiJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZaloAiJobsService.name);
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ZaloAiRoutingService) private readonly routingService: ZaloAiRoutingService
  ) {}

  onModuleInit() {
    this.flushTimer = setInterval(() => {
      void this.flushPendingOutbox().catch((error) => {
        this.logger.warn(`flushPendingOutbox failed: ${this.normalizeError(error)}`);
      });
    }, 5_000);
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async enqueueN8nJob(input: EnqueueAiJobInput) {
    const runtime = await this.routingService.getRuntimeConfig();
    if (runtime.mode === 'legacy') {
      return {
        queued: false,
        reason: 'ROUTING_MODE_LEGACY' as const
      };
    }

    const thread = await this.prisma.client.conversationThread.findFirst({
      where: { id: input.threadId },
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            phoneNormalized: true,
            email: true,
            emailNormalized: true,
            segment: true,
            source: true,
            totalOrders: true,
            totalSpent: true,
            lastOrderAt: true,
            lastContactAt: true,
            status: true,
            tags: true
          }
        }
      }
    });

    if (!thread) {
      throw new NotFoundException('Không tìm thấy hội thoại để queue AI job.');
    }

    const channelAccountId = this.cleanString(thread.channelAccountId);
    if (!channelAccountId) {
      return this.createSkippedJob({
        eventId: randomUUID(),
        thread,
        customerMessageId: input.customerMessageId,
        routingMode: runtime.mode,
        status: AiConversationJobStatus.HANDOFF,
        reason: 'MISSING_CHANNEL_ACCOUNT'
      });
    }

    const route = await this.routingService.resolveActiveRoute(thread.channel, channelAccountId);
    if (!route) {
      return this.createSkippedJob({
        eventId: randomUUID(),
        thread,
        customerMessageId: input.customerMessageId,
        routingMode: runtime.mode,
        status: AiConversationJobStatus.HANDOFF,
        reason: 'NO_ACTIVE_ROUTE'
      });
    }

    const eventId = randomUUID();
    const context = await this.buildThreadContext({
      threadId: thread.id,
      customer: thread.customer,
      piiMaskEnabled: route.piiMaskEnabled,
      piiMaskConfigJson: route.piiMaskConfigJson
    });

    const requestPayload = {
      eventId,
      threadId: thread.id,
      customerMessageId: input.customerMessageId,
      channel: thread.channel,
      channelAccountId,
      externalThreadId: thread.externalThreadId,
      industryKey: route.industryKey,
      workflowKey: route.workflowKey,
      agentKey: route.agentKey,
      knowledgeSpaceRef: route.knowledgeSpaceRef,
      routingMode: runtime.mode,
      takeoverPolicy: {
        mode: 'manual_takeover_pause',
        pauseSource: 'thread.metadata.zaloAutoReply.pauseUntil',
        recheckBeforeSend: true
      },
      context,
      generatedAt: new Date().toISOString()
    } as const;

    const created = await this.prisma.client.$transaction(async (tx) => {
      const job = await tx.aiConversationJob.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          eventId,
          threadId: thread.id,
          channel: thread.channel,
          channelAccountId,
          customerMessageId: input.customerMessageId,
          industryId: route.industryId,
          industryKeySnapshot: route.industryKey,
          workflowKeySnapshot: route.workflowKey,
          agentKeySnapshot: route.agentKey,
          routingMode: runtime.mode,
          status: AiConversationJobStatus.QUEUED,
          attemptCount: 0,
          requestPayloadJson: requestPayload as unknown as Prisma.InputJsonValue,
          queuedAt: new Date()
        }
      });

      const outbox = await tx.aiConversationOutbox.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          jobId: job.id,
          eventId,
          payloadJson: requestPayload as unknown as Prisma.InputJsonValue,
          status: AiConversationOutboxStatus.PENDING,
          attemptNo: 0
        }
      });

      return {
        job,
        outbox
      };
    });

    await this.dispatchOutboxById(created.outbox.id, runtime);

    return {
      queued: true,
      reason: null,
      eventId,
      jobId: created.job.id
    } as const;
  }

  async listJobs(query: {
    cursor?: string;
    limit?: number;
    q?: string;
    status?: string;
    channel?: string;
    channelAccountId?: string;
  }) {
    const take = this.resolveTake(query.limit, 25, 200);
    const keyword = this.cleanString(query.q);
    const channel = this.parseChannel(query.channel, null);
    const channelAccountId = this.cleanString(query.channelAccountId);
    const statuses = this.parseStatuses(query.status);

    const rows = await this.prisma.client.aiConversationJob.findMany({
      where: {
        ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
        ...(channel ? { channel } : {}),
        ...(channelAccountId ? { channelAccountId } : {}),
        ...(keyword
          ? {
              OR: [
                { eventId: { contains: keyword, mode: 'insensitive' } },
                { thread: { externalThreadId: { contains: keyword, mode: 'insensitive' } } },
                { industryKeySnapshot: { contains: keyword, mode: 'insensitive' } },
                { workflowKeySnapshot: { contains: keyword, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      include: {
        thread: {
          select: {
            id: true,
            externalThreadId: true,
            channel: true,
            channelAccountId: true,
            customerDisplayName: true,
            customerId: true
          }
        },
        industry: {
          select: {
            id: true,
            industryKey: true,
            name: true
          }
        }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

  async getJobById(jobIdRaw: string) {
    const jobId = this.requiredString(jobIdRaw, 'Thiếu jobId.');
    const job = await this.prisma.client.aiConversationJob.findFirst({
      where: { id: jobId },
      include: {
        thread: {
          select: {
            id: true,
            externalThreadId: true,
            channel: true,
            channelAccountId: true,
            customerDisplayName: true,
            customerId: true,
            metadataJson: true
          }
        },
        industry: {
          select: {
            id: true,
            industryKey: true,
            name: true,
            knowledgeSpaceRef: true
          }
        },
        outbox: {
          orderBy: [{ createdAt: 'asc' }]
        }
      }
    });

    if (!job) {
      throw new NotFoundException('Không tìm thấy AI job.');
    }

    return job;
  }

  async verifyCallbackSignature(rawBody: string, signatureHeader?: string) {
    const runtime = await this.routingService.getRuntimeConfig();
    const secret = this.cleanString(runtime.callbackHmacSecret);
    if (!secret) {
      throw new UnauthorizedException('Thiếu AI_N8N_CALLBACK_HMAC_SECRET.');
    }

    const incoming = this.extractHexSignature(signatureHeader);
    if (!incoming) {
      throw new UnauthorizedException('Thiếu chữ ký callback từ n8n.');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!this.isEqualSignature(expected, incoming)) {
      throw new UnauthorizedException('Chữ ký callback không hợp lệ.');
    }
  }

  async registerCallback(payloadRaw: Record<string, unknown>): Promise<RegisterCallbackResult> {
    const eventId = this.requiredString(payloadRaw.eventId, 'Thiếu eventId callback.');
    const shouldHandoff = this.toBool(payloadRaw.shouldHandoff, false);
    const replyText = this.normalizeReplyText(payloadRaw.replyText);

    const job = await this.prisma.client.aiConversationJob.findFirst({
      where: { eventId },
      include: {
        thread: {
          select: {
            id: true,
            channel: true,
            channelAccountId: true,
            externalThreadId: true,
            metadataJson: true
          }
        }
      }
    });

    if (!job) {
      throw new NotFoundException('Không tìm thấy AI job theo eventId.');
    }

    if (job.callbackPayloadJson) {
      return {
        action: 'NOOP',
        duplicate: true,
        jobId: job.id,
        status: job.status
      };
    }

    const metadata = {
      confidence: this.toNullableNumber(payloadRaw.confidence),
      workflowKey: this.cleanString(payloadRaw.workflowKey) || null,
      agentKey: this.cleanString(payloadRaw.agentKey) || null,
      tokenUsage: this.toNullableRecord(payloadRaw.tokenUsage),
      latencyMs: this.toNullableNumber(payloadRaw.latencyMs),
      safetyFlags: this.toNullableRecord(payloadRaw.safetyFlags)
    };

    await this.prisma.client.aiConversationJob.updateMany({
      where: { id: job.id },
      data: {
        status: AiConversationJobStatus.CALLBACK_RECEIVED,
        callbackPayloadJson: payloadRaw as unknown as Prisma.InputJsonValue,
        callbackReceivedAt: new Date(),
        resultMetadataJson: metadata as unknown as Prisma.InputJsonValue
      }
    });

    if (shouldHandoff) {
      await this.markAsFinalStatus(job.id, AiConversationJobStatus.HANDOFF, 'N8N requested human handoff.');
      return {
        action: 'SKIP',
        duplicate: false,
        jobId: job.id,
        status: AiConversationJobStatus.HANDOFF,
        reason: 'SHOULD_HANDOFF'
      };
    }

    if (!replyText) {
      await this.markAsFinalStatus(job.id, AiConversationJobStatus.HANDOFF, 'Callback missing replyText.');
      return {
        action: 'SKIP',
        duplicate: false,
        jobId: job.id,
        status: AiConversationJobStatus.HANDOFF,
        reason: 'MISSING_REPLY_TEXT'
      };
    }

    if (!job.thread || !job.thread.channelAccountId) {
      await this.markAsFinalStatus(job.id, AiConversationJobStatus.HANDOFF, 'Thread is missing channel account.');
      return {
        action: 'SKIP',
        duplicate: false,
        jobId: job.id,
        status: AiConversationJobStatus.HANDOFF,
        reason: 'MISSING_THREAD_CHANNEL_ACCOUNT'
      };
    }

    if (job.thread.channel !== ConversationChannel.ZALO_PERSONAL) {
      await this.markAsFinalStatus(job.id, AiConversationJobStatus.HANDOFF, 'Unsupported channel for current callback sender.');
      return {
        action: 'SKIP',
        duplicate: false,
        jobId: job.id,
        status: AiConversationJobStatus.HANDOFF,
        reason: 'UNSUPPORTED_CHANNEL'
      };
    }

    const account = await this.prisma.client.zaloAccount.findFirst({
      where: { id: job.thread.channelAccountId },
      select: {
        id: true,
        aiAutoReplyEnabled: true
      }
    });

    if (!account?.aiAutoReplyEnabled) {
      await this.markAsFinalStatus(job.id, AiConversationJobStatus.SKIPPED_DISABLED, 'Account auto-reply is disabled.');
      return {
        action: 'SKIP',
        duplicate: false,
        jobId: job.id,
        status: AiConversationJobStatus.SKIPPED_DISABLED,
        reason: 'ACCOUNT_AUTO_REPLY_DISABLED'
      };
    }

    const takeoverState = readZaloAutoReplyThreadState(job.thread.metadataJson);
    const pauseUntil = this.parseDate(takeoverState.pauseUntil);
    if (pauseUntil && pauseUntil.getTime() > Date.now()) {
      await this.markAsFinalStatus(job.id, AiConversationJobStatus.SKIPPED_TAKEOVER, 'Thread is currently paused by manual takeover.');
      return {
        action: 'SKIP',
        duplicate: false,
        jobId: job.id,
        status: AiConversationJobStatus.SKIPPED_TAKEOVER,
        reason: 'THREAD_MANUAL_TAKEOVER'
      };
    }

    if (job.customerMessageId) {
      const customerMessage = await this.prisma.client.conversationMessage.findFirst({
        where: {
          id: job.customerMessageId,
          threadId: job.thread.id,
          senderType: ConversationSenderType.CUSTOMER
        },
        select: {
          id: true,
          sentAt: true
        }
      });

      if (customerMessage) {
        const hasAgentReplyAfter = await this.prisma.client.conversationMessage.count({
          where: {
            threadId: job.thread.id,
            senderType: ConversationSenderType.AGENT,
            sentAt: {
              gt: customerMessage.sentAt
            }
          }
        });

        if (hasAgentReplyAfter > 0) {
          await this.markAsFinalStatus(job.id, AiConversationJobStatus.SKIPPED_TAKEOVER, 'Agent already replied after customer message.');
          return {
            action: 'SKIP',
            duplicate: false,
            jobId: job.id,
            status: AiConversationJobStatus.SKIPPED_TAKEOVER,
            reason: 'AGENT_ALREADY_REPLIED'
          };
        }
      }
    }

    return {
      action: 'SEND',
      duplicate: false,
      jobId: job.id,
      eventId,
      accountId: account.id,
      externalThreadId: job.thread.externalThreadId,
      replyText,
      metadata
    };
  }

  async markJobReplied(jobIdRaw: string, replyMessageId?: string) {
    const jobId = this.requiredString(jobIdRaw, 'Thiếu jobId.');

    const job = await this.prisma.client.aiConversationJob.findFirst({
      where: { id: jobId },
      select: {
        id: true,
        threadId: true
      }
    });

    if (!job) {
      throw new NotFoundException('Không tìm thấy job để cập nhật trạng thái replied.');
    }

    await this.prisma.client.aiConversationJob.updateMany({
      where: { id: job.id },
      data: {
        status: AiConversationJobStatus.REPLIED,
        replyMessageId: this.cleanString(replyMessageId) || null,
        completedAt: new Date(),
        nextRetryAt: null,
        lastErrorMessage: null
      }
    });

    const thread = await this.prisma.client.conversationThread.findFirst({
      where: { id: job.threadId },
      select: {
        id: true,
        metadataJson: true
      }
    });

    if (thread) {
      await this.prisma.client.conversationThread.updateMany({
        where: { id: thread.id },
        data: {
          metadataJson: patchZaloAutoReplyThreadState(thread.metadataJson, {
            clearPending: true,
            pauseUntil: null,
            lastAiReplyAt: new Date().toISOString()
          })
        }
      });
    }
  }

  async markJobFailed(jobIdRaw: string, error: unknown) {
    const jobId = this.requiredString(jobIdRaw, 'Thiếu jobId.');
    await this.markAsFinalStatus(jobId, AiConversationJobStatus.HANDOFF, this.normalizeError(error));
  }

  private async buildThreadContext(input: {
    threadId: string;
    customer: {
      id: string;
      fullName: string;
      phone: string | null;
      phoneNormalized: string | null;
      email: string | null;
      emailNormalized: string | null;
      segment: string | null;
      source: string | null;
      totalOrders: number;
      totalSpent: Prisma.Decimal | null;
      lastOrderAt: Date | null;
      lastContactAt: Date | null;
      status: string;
      tags: string[];
    } | null;
    piiMaskEnabled: boolean;
    piiMaskConfigJson: Prisma.JsonValue | null;
  }) {
    const [messages, totalMessageCount] = await Promise.all([
      this.prisma.client.conversationMessage.findMany({
        where: {
          threadId: input.threadId,
          isDeleted: false
        },
        orderBy: {
          sentAt: 'desc'
        },
        take: 20,
        select: {
          id: true,
          senderType: true,
          origin: true,
          senderName: true,
          content: true,
          contentType: true,
          sentAt: true
        }
      }),
      this.prisma.client.conversationMessage.count({
        where: {
          threadId: input.threadId,
          isDeleted: false
        }
      })
    ]);

    const orderedMessages = [...messages].reverse();
    const piiPolicy = this.buildPiiPolicy(input.piiMaskEnabled, input.piiMaskConfigJson);
    const transcript = orderedMessages.map((message) => {
      const actor = this.cleanString(message.senderName) || message.senderType;
      const hhmm = message.sentAt.toISOString().slice(11, 16);
      const content = this.cleanString(message.content) || `[${message.contentType}]`;
      return `[${hhmm}] ${actor}: ${content}`;
    });

    const customerSnapshot = input.customer
      ? {
          id: input.customer.id,
          fullName: input.customer.fullName,
          phone: piiPolicy.maskPhone ? this.maskPhone(input.customer.phone) : input.customer.phone,
          phoneNormalized: piiPolicy.maskPhone ? this.maskPhone(input.customer.phoneNormalized) : input.customer.phoneNormalized,
          email: piiPolicy.maskEmail ? this.maskEmail(input.customer.email) : input.customer.email,
          emailNormalized: piiPolicy.maskEmail ? this.maskEmail(input.customer.emailNormalized) : input.customer.emailNormalized,
          segment: input.customer.segment,
          source: input.customer.source,
          totalOrders: input.customer.totalOrders,
          totalSpent: input.customer.totalSpent ? Number(input.customer.totalSpent) : null,
          lastOrderAt: input.customer.lastOrderAt?.toISOString() ?? null,
          lastContactAt: input.customer.lastContactAt?.toISOString() ?? null,
          status: input.customer.status,
          tags: input.customer.tags
        }
      : null;

    const summary =
      totalMessageCount > orderedMessages.length
        ? `Conversation truncated: included ${orderedMessages.length} latest messages out of ${totalMessageCount} total messages.`
        : null;

    return {
      totalMessageCount,
      historySummary: summary,
      transcript,
      latestMessages: orderedMessages.map((message) => ({
        id: message.id,
        senderType: message.senderType,
        origin: message.origin,
        senderName: message.senderName,
        content: message.content,
        contentType: message.contentType,
        sentAt: message.sentAt.toISOString()
      })),
      customer: customerSnapshot
    };
  }

  private async dispatchOutboxById(outboxIdRaw: string, runtimeOverride?: AiRoutingRuntime) {
    const outboxId = this.requiredString(outboxIdRaw, 'Thiếu outboxId.');

    const outbox = await this.prisma.client.aiConversationOutbox.findFirst({
      where: { id: outboxId },
      include: {
        job: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    if (!outbox || !outbox.job) {
      return;
    }

    if (outbox.status === AiConversationOutboxStatus.SENT || outbox.status === AiConversationOutboxStatus.DEAD) {
      return;
    }

    const runtime = runtimeOverride ?? await this.routingService.getRuntimeConfig();
    if (runtime.mode === 'legacy') {
      return;
    }

    const endpointUrl = this.cleanString(runtime.chatEventsUrl);
    if (!endpointUrl) {
      await this.markOutboxAttemptFailed(outbox, runtime, 'Missing AI_N8N_CHAT_EVENTS_URL.');
      return;
    }

    const nextAttemptNo = outbox.attemptNo + 1;
    const requestBodyText = JSON.stringify(outbox.payloadJson ?? {});
    const hmacSecret = this.cleanString(runtime.outboundHmacSecret);
    const signature = hmacSecret
      ? createHmac('sha256', hmacSecret).update(requestBodyText).digest('hex')
      : '';

    await this.prisma.client.aiConversationJob.updateMany({
      where: { id: outbox.jobId },
      data: {
        status: AiConversationJobStatus.DISPATCHING,
        attemptCount: nextAttemptNo
      }
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), runtime.dispatchTimeoutMs);

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-erp-event-id': outbox.eventId,
          ...(signature ? { 'x-erp-signature': signature } : {})
        },
        body: requestBodyText,
        signal: controller.signal
      });

      if (!response.ok) {
        await this.markOutboxAttemptFailed(outbox, runtime, `n8n status ${response.status}`);
        return;
      }

      await this.prisma.client.$transaction(async (tx) => {
        await tx.aiConversationOutbox.updateMany({
          where: { id: outbox.id },
          data: {
            status: AiConversationOutboxStatus.SENT,
            attemptNo: nextAttemptNo,
            dispatchedAt: new Date(),
            nextRetryAt: null,
            lastErrorMessage: null
          }
        });

        await tx.aiConversationJob.updateMany({
          where: { id: outbox.jobId },
          data: {
            status: AiConversationJobStatus.DISPATCHED,
            dispatchedAt: new Date(),
            nextRetryAt: null,
            lastErrorMessage: null
          }
        });
      });
    } catch (error) {
      const message = (error as Error)?.name === 'AbortError'
        ? `Dispatch timeout after ${runtime.dispatchTimeoutMs}ms`
        : this.normalizeError(error);
      await this.markOutboxAttemptFailed(outbox, runtime, message);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async flushPendingOutbox() {
    const runtime = await this.routingService.getRuntimeConfig();
    if (runtime.mode === 'legacy') {
      return;
    }

    const rows = await this.prisma.client.aiConversationOutbox.findMany({
      where: {
        OR: [
          {
            status: AiConversationOutboxStatus.PENDING
          },
          {
            status: AiConversationOutboxStatus.FAILED,
            OR: [
              { nextRetryAt: null },
              { nextRetryAt: { lte: new Date() } }
            ]
          }
        ]
      },
      orderBy: [{ createdAt: 'asc' }],
      take: 20,
      select: {
        id: true
      }
    });

    for (const row of rows) {
      await this.dispatchOutboxById(row.id, runtime);
    }
  }

  private async markOutboxAttemptFailed(
    outbox: {
      id: string;
      jobId: string;
      attemptNo: number;
      eventId: string;
    },
    runtime: AiRoutingRuntime,
    errorMessage: string
  ) {
    const nextAttemptNo = outbox.attemptNo + 1;
    const maxAttempts = runtime.maxRetryAttempts;

    if (nextAttemptNo >= maxAttempts) {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.aiConversationOutbox.updateMany({
          where: { id: outbox.id },
          data: {
            status: AiConversationOutboxStatus.DEAD,
            attemptNo: nextAttemptNo,
            nextRetryAt: null,
            lastErrorMessage: errorMessage
          }
        });

        await tx.aiConversationJob.updateMany({
          where: { id: outbox.jobId },
          data: {
            status: AiConversationJobStatus.HANDOFF,
            attemptCount: nextAttemptNo,
            nextRetryAt: null,
            lastErrorMessage: errorMessage,
            completedAt: new Date()
          }
        });
      });
      return;
    }

    const backoffSeconds = runtime.retryBackoffSeconds[Math.min(nextAttemptNo - 1, runtime.retryBackoffSeconds.length - 1)] ?? 90;
    const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.aiConversationOutbox.updateMany({
        where: { id: outbox.id },
        data: {
          status: AiConversationOutboxStatus.FAILED,
          attemptNo: nextAttemptNo,
          nextRetryAt,
          lastErrorMessage: errorMessage
        }
      });

      await tx.aiConversationJob.updateMany({
        where: { id: outbox.jobId },
        data: {
          status: AiConversationJobStatus.RETRIED,
          attemptCount: nextAttemptNo,
          nextRetryAt,
          lastErrorMessage: errorMessage
        }
      });
    });
  }

  private async createSkippedJob(input: {
    eventId: string;
    thread: {
      id: string;
      channel: ConversationChannel;
      channelAccountId: string | null;
    };
    customerMessageId: string;
    routingMode: string;
    status: AiConversationJobStatus;
    reason: string;
  }) {
    const created = await this.prisma.client.aiConversationJob.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        eventId: input.eventId,
        threadId: input.thread.id,
        channel: input.thread.channel,
        channelAccountId: this.cleanString(input.thread.channelAccountId) || null,
        customerMessageId: input.customerMessageId,
        status: input.status,
        routingMode: input.routingMode,
        requestPayloadJson: {
          reason: input.reason
        } as Prisma.InputJsonValue,
        lastErrorMessage: input.reason,
        completedAt: new Date(),
        queuedAt: new Date()
      }
    });

    return {
      queued: false,
      reason: input.reason,
      eventId: input.eventId,
      jobId: created.id
    };
  }

  private async markAsFinalStatus(jobId: string, status: AiConversationJobStatus, errorMessage: string | null) {
    await this.prisma.client.aiConversationJob.updateMany({
      where: { id: jobId },
      data: {
        status,
        lastErrorMessage: this.cleanString(errorMessage) || null,
        completedAt: new Date(),
        nextRetryAt: null
      }
    });
  }

  private isEqualSignature(expectedHex: string, incomingHex: string) {
    try {
      const expected = Buffer.from(expectedHex, 'hex');
      const incoming = Buffer.from(incomingHex, 'hex');
      if (expected.length === 0 || incoming.length === 0 || expected.length !== incoming.length) {
        return false;
      }
      return timingSafeEqual(expected, incoming);
    } catch {
      return false;
    }
  }

  private extractHexSignature(signatureHeader?: string) {
    const normalized = this.cleanString(signatureHeader).toLowerCase();
    if (!normalized) {
      return '';
    }

    if (normalized.startsWith('sha256=')) {
      return normalized.slice('sha256='.length).trim();
    }

    return normalized;
  }

  private normalizeReplyText(input: unknown) {
    const raw = this.cleanString(input);
    if (!raw) {
      return '';
    }

    const compact = raw.replace(/\s+/g, ' ').trim();
    if (compact.length <= 800) {
      return compact;
    }
    return `${compact.slice(0, 797)}...`;
  }

  private maskPhone(input: string | null) {
    const value = this.cleanString(input);
    if (!value) {
      return null;
    }
    const digits = value.replace(/\D+/g, '');
    if (digits.length <= 4) {
      return '*'.repeat(digits.length || 4);
    }
    return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
  }

  private maskEmail(input: string | null) {
    const value = this.cleanString(input);
    if (!value.includes('@')) {
      return value || null;
    }
    const [local, domain] = value.split('@');
    if (!local) {
      return `***@${domain}`;
    }
    const head = local.slice(0, 1);
    return `${head}${'*'.repeat(Math.max(1, local.length - 1))}@${domain}`;
  }

  private parseStatuses(raw: string | undefined) {
    if (!raw) {
      return [] as AiConversationJobStatus[];
    }

    const candidates = raw
      .split(/[;,\s]+/)
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);

    const allowed = new Set(Object.values(AiConversationJobStatus));
    return Array.from(new Set(candidates.filter((item) => allowed.has(item as AiConversationJobStatus)))) as AiConversationJobStatus[];
  }

  private buildPiiPolicy(piiMaskEnabled: boolean, piiMaskConfigJson: Prisma.JsonValue | null) {
    if (!piiMaskEnabled) {
      return {
        maskPhone: false,
        maskEmail: false
      };
    }

    const allowRaw = new Set(this.extractAllowRawFields(piiMaskConfigJson));
    const canSeePhone = this.hasAnyAllowedField(allowRaw, ['phone', 'phoneNormalized']);
    const canSeeEmail = this.hasAnyAllowedField(allowRaw, ['email', 'emailNormalized']);

    return {
      maskPhone: !canSeePhone,
      maskEmail: !canSeeEmail
    };
  }

  private extractAllowRawFields(input: Prisma.JsonValue | null) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return [] as string[];
    }

    const source = input as Record<string, unknown>;
    const candidates = [
      source.allowRawFields,
      source.allowList,
      source.whitelist,
      source.allowedFields
    ];

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }

      return candidate
        .map((item) => String(item ?? '').trim().toLowerCase())
        .filter(Boolean);
    }

    return [] as string[];
  }

  private hasAnyAllowedField(allowRaw: Set<string>, fields: string[]) {
    for (const field of fields) {
      const normalized = field.toLowerCase();
      if (
        allowRaw.has(normalized) ||
        allowRaw.has(`customer.${normalized}`) ||
        allowRaw.has(`context.customer.${normalized}`)
      ) {
        return true;
      }
    }
    return false;
  }

  private parseChannel(raw: string | undefined, fallback: ConversationChannel | null) {
    const candidate = this.cleanString(raw).toUpperCase();
    if (!candidate) {
      return fallback;
    }
    if ((Object.values(ConversationChannel) as string[]).includes(candidate)) {
      return candidate as ConversationChannel;
    }
    throw new BadRequestException('channel không hợp lệ.');
  }

  private parseDate(raw: string | null | undefined) {
    const value = this.cleanString(raw);
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
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

  private toNullableNumber(input: unknown) {
    const value = Number(input);
    if (!Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private toNullableRecord(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }
    return input as Record<string, unknown>;
  }

  private requiredString(input: unknown, message: string) {
    const value = this.cleanString(input);
    if (!value) {
      throw new BadRequestException(message);
    }
    return value;
  }

  private cleanString(input: unknown) {
    if (input === undefined || input === null) {
      return '';
    }
    return String(input).trim();
  }

  private normalizeError(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error ?? 'UNKNOWN_ERROR');
  }
}
