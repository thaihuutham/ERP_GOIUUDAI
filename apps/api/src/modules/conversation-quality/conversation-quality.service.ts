import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConversationChannel,
  ConversationEvaluationVerdict,
  ConversationSenderType,
  Prisma
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type OpenAICompatibleUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
};

type OpenAICompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: OpenAICompatibleUsage;
};

type QualityViolationResult = {
  severity?: string;
  rule?: string;
  evidence?: string;
  explanation?: string;
  suggestion?: string;
  confidence?: number;
};

type QualityEvaluationResult = {
  verdict?: string;
  score?: number;
  review?: string;
  summary?: string;
  violations?: QualityViolationResult[];
};

type ChannelFilter = {
  channels: ConversationChannel[];
  accountIds: string[];
};

@Injectable()
export class ConversationQualityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConversationQualityService.name);
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly runningJobs = new Set<string>();
  private polling = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.pollTimer = setInterval(() => {
      void this.pollScheduledJobs().catch((error) => {
        this.logger.error(`pollScheduledJobs failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 60_000);

    void this.pollScheduledJobs().catch((error) => {
      this.logger.error(`pollScheduledJobs init failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  onModuleDestroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async listJobs() {
    return this.prisma.client.conversationEvaluationJob.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  async createJob(payload: Record<string, unknown>) {
    const name = this.requiredString(payload.name, 'Thiếu tên job.');

    return this.prisma.client.conversationEvaluationJob.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        name,
        description: this.optionalString(payload.description) ?? null,
        jobType: this.optionalString(payload.jobType)?.toUpperCase() ?? 'QC_ANALYSIS',
        isActive: this.parseBoolean(payload.isActive, true),
        intervalMinutes: this.parseInt(payload.intervalMinutes, 120, 1, 1440),
        nextRunAt: this.parseDateOptional(payload.nextRunAt),
        lookbackHours: this.parseInt(payload.lookbackHours, 24, 1, 24 * 30),
        maxConversationsPerRun: this.parseInt(payload.maxConversationsPerRun, 30, 1, 500),
        batchSize: this.parseInt(payload.batchSize, 5, 1, 20),
        aiProvider: this.optionalString(payload.aiProvider)?.toUpperCase() ?? 'OPENAI_COMPATIBLE',
        aiModel: this.optionalString(payload.aiModel) ?? null,
        channelFilterJson: this.normalizeChannelFilter(payload.channelFilterJson) as Prisma.InputJsonValue,
        rulesContent: this.optionalString(payload.rulesContent) ?? null,
        skipConditions: this.optionalString(payload.skipConditions) ?? null
      }
    });
  }

  async updateJob(id: string, payload: Record<string, unknown>) {
    const current = await this.prisma.client.conversationEvaluationJob.findFirst({ where: { id } });
    if (!current) {
      throw new BadRequestException('Không tìm thấy job cần cập nhật.');
    }

    await this.prisma.client.conversationEvaluationJob.updateMany({
      where: { id },
      data: {
        name: payload.name !== undefined ? this.requiredString(payload.name, 'Tên job không hợp lệ.') : undefined,
        description: payload.description !== undefined ? this.optionalString(payload.description) ?? null : undefined,
        jobType: payload.jobType !== undefined ? this.optionalString(payload.jobType)?.toUpperCase() : undefined,
        isActive: payload.isActive !== undefined ? this.parseBoolean(payload.isActive, current.isActive) : undefined,
        intervalMinutes: payload.intervalMinutes !== undefined
          ? this.parseInt(payload.intervalMinutes, current.intervalMinutes, 1, 1440)
          : undefined,
        nextRunAt: payload.nextRunAt !== undefined ? this.parseDateOptional(payload.nextRunAt) : undefined,
        lookbackHours: payload.lookbackHours !== undefined
          ? this.parseInt(payload.lookbackHours, current.lookbackHours, 1, 24 * 30)
          : undefined,
        maxConversationsPerRun: payload.maxConversationsPerRun !== undefined
          ? this.parseInt(payload.maxConversationsPerRun, current.maxConversationsPerRun, 1, 500)
          : undefined,
        batchSize: payload.batchSize !== undefined
          ? this.parseInt(payload.batchSize, current.batchSize, 1, 20)
          : undefined,
        aiProvider: payload.aiProvider !== undefined
          ? this.optionalString(payload.aiProvider)?.toUpperCase()
          : undefined,
        aiModel: payload.aiModel !== undefined ? this.optionalString(payload.aiModel) ?? null : undefined,
        channelFilterJson: payload.channelFilterJson !== undefined
          ? (this.normalizeChannelFilter(payload.channelFilterJson) as Prisma.InputJsonValue)
          : undefined,
        rulesContent: payload.rulesContent !== undefined ? this.optionalString(payload.rulesContent) ?? null : undefined,
        skipConditions: payload.skipConditions !== undefined ? this.optionalString(payload.skipConditions) ?? null : undefined
      }
    });

    return this.prisma.client.conversationEvaluationJob.findFirst({ where: { id } });
  }

  async listRuns(jobId?: string) {
    return this.prisma.client.conversationEvaluationRun.findMany({
      where: jobId ? { jobId } : undefined,
      include: {
        job: {
          select: {
            id: true,
            name: true,
            jobType: true
          }
        }
      },
      orderBy: { startedAt: 'desc' },
      take: 100
    });
  }

  async getRun(runId: string) {
    const run = await this.prisma.client.conversationEvaluationRun.findFirst({
      where: { id: runId },
      include: {
        evaluations: {
          include: {
            thread: {
              select: {
                id: true,
                channel: true,
                externalThreadId: true,
                customerDisplayName: true
              }
            },
            violations: true
          },
          orderBy: { evaluatedAt: 'desc' }
        }
      }
    });

    if (!run) {
      throw new BadRequestException('Không tìm thấy run.');
    }

    return run;
  }

  async runJobNow(jobId: string) {
    return this.runJob(jobId, 'MANUAL');
  }

  private async pollScheduledJobs() {
    if (!this.hasPrismaClient()) {
      return;
    }

    if (this.polling) {
      return;
    }

    this.polling = true;
    try {
      const now = new Date();
      const dueJobs = await this.prisma.client.conversationEvaluationJob.findMany({
        where: {
          isActive: true,
          OR: [
            { nextRunAt: null },
            { nextRunAt: { lte: now } }
          ]
        },
        orderBy: { createdAt: 'asc' },
        take: 20
      });

      for (const job of dueJobs) {
        if (this.runningJobs.has(job.id)) {
          continue;
        }
        void this.runJob(job.id, 'SCHEDULED');
      }
    } finally {
      this.polling = false;
    }
  }

  private async runJob(jobId: string, triggerType: 'SCHEDULED' | 'MANUAL') {
    if (this.runningJobs.has(jobId)) {
      return { message: 'Job đang chạy, bỏ qua trigger mới.' };
    }

    this.runningJobs.add(jobId);
    const now = new Date();
    const job = await this.prisma.client.conversationEvaluationJob.findFirst({ where: { id: jobId } });
    if (!job) {
      this.runningJobs.delete(jobId);
      throw new BadRequestException('Không tìm thấy job.');
    }

    const run = await this.prisma.client.conversationEvaluationRun.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        jobId: job.id,
        startedAt: now,
        status: 'RUNNING',
        summaryJson: {
          triggerType,
          startedAt: now.toISOString()
        } as Prisma.InputJsonValue
      }
    });

    try {
      const lookbackSince = new Date(Date.now() - job.lookbackHours * 60 * 60 * 1000);
      const channelFilter = this.normalizeChannelFilter(job.channelFilterJson);

      const where: Prisma.ConversationThreadWhereInput = {
        lastMessageAt: { gte: lookbackSince },
        ...(channelFilter.channels.length ? { channel: { in: channelFilter.channels } } : {}),
        ...(channelFilter.accountIds.length ? { channelAccountId: { in: channelFilter.accountIds } } : {})
      };

      const threads = await this.prisma.client.conversationThread.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        take: job.maxConversationsPerRun
      });

      let evaluatedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      let totalViolationCount = 0;

      for (let index = 0; index < threads.length; index += job.batchSize) {
        const batch = threads.slice(index, index + job.batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(async (thread) => this.evaluateOneThread(job, run.id, thread.id))
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            evaluatedCount += 1;
            totalViolationCount += result.value.violationCount;
            if (result.value.verdict === ConversationEvaluationVerdict.SKIP) {
              skippedCount += 1;
            }
            continue;
          }

          failedCount += 1;
          this.logger.error(
            `runJob thread error: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
          );
        }
      }

      const finishedAt = new Date();
      const nextRunAt = new Date(Date.now() + job.intervalMinutes * 60 * 1000);
      const summary = {
        triggerType,
        startedAt: run.startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        totalThreads: threads.length,
        evaluatedCount,
        failedCount,
        skippedCount,
        totalViolationCount
      };

      await this.prisma.client.$transaction(async (tx) => {
        await tx.conversationEvaluationRun.updateMany({
          where: { id: run.id },
          data: {
            status: failedCount > 0 && evaluatedCount === 0 ? 'ERROR' : 'SUCCESS',
            finishedAt,
            summaryJson: summary as Prisma.InputJsonValue
          }
        });

        await tx.conversationEvaluationJob.updateMany({
          where: { id: job.id },
          data: {
            lastRunAt: finishedAt,
            lastRunStatus: failedCount > 0 && evaluatedCount === 0 ? 'ERROR' : 'SUCCESS',
            nextRunAt
          }
        });
      });

      return {
        runId: run.id,
        summary
      };
    } catch (error) {
      const finishedAt = new Date();
      const nextRunAt = new Date(Date.now() + job.intervalMinutes * 60 * 1000);
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.prisma.client.$transaction(async (tx) => {
        await tx.conversationEvaluationRun.updateMany({
          where: { id: run.id },
          data: {
            status: 'ERROR',
            finishedAt,
            errorMessage
          }
        });

        await tx.conversationEvaluationJob.updateMany({
          where: { id: job.id },
          data: {
            lastRunAt: finishedAt,
            lastRunStatus: 'ERROR',
            nextRunAt
          }
        });
      });

      throw error;
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  private async evaluateOneThread(
    job: { aiModel: string | null; rulesContent: string | null; skipConditions: string | null },
    runId: string,
    threadId: string
  ) {
    const messages = await this.prisma.client.conversationMessage.findMany({
      where: { threadId },
      orderBy: { sentAt: 'asc' },
      take: 200
    });

    if (messages.length === 0) {
      const evaluation = await this.prisma.client.conversationEvaluation.create({
        data: {
          tenant_Id: this.prisma.getTenantId(),
          threadId,
          runId,
          verdict: ConversationEvaluationVerdict.SKIP,
          score: 0,
          review: 'Không có tin nhắn để đánh giá.',
          summary: 'EMPTY_THREAD',
          provider: 'OPENAI_COMPATIBLE',
          model: job.aiModel ?? this.getDefaultModel()
        }
      });

      return { evaluationId: evaluation.id, verdict: evaluation.verdict, violationCount: 0 };
    }

    const transcript = this.buildTranscript(messages);
    const aiRaw = await this.callOpenAICompatible(job, transcript);
    const parsed = this.parseEvaluationResult(aiRaw.content);
    const verdict = this.normalizeVerdict(parsed.verdict);

    const createdEvaluation = await this.prisma.client.conversationEvaluation.create({
      data: {
        tenant_Id: this.prisma.getTenantId(),
        threadId,
        runId,
        verdict,
        score: this.normalizeScore(parsed.score),
        review: this.optionalString(parsed.review) ?? null,
        summary: this.optionalString(parsed.summary) ?? null,
        provider: 'OPENAI_COMPATIBLE',
        model: aiRaw.model,
        rawResponseJson: parsed.rawJson,
        inputTokens: aiRaw.promptTokens,
        outputTokens: aiRaw.completionTokens,
        evaluatedAt: new Date()
      }
    });

    const violations = this.normalizeViolations(parsed.violations);
    if (violations.length > 0) {
      await this.prisma.client.conversationViolation.createMany({
        data: violations.map((item) => ({
          tenant_Id: this.prisma.getTenantId(),
          evaluationId: createdEvaluation.id,
          severity: item.severity,
          ruleName: item.rule,
          evidence: item.evidence,
          explanation: item.explanation,
          suggestion: item.suggestion,
          confidence: item.confidence
        }))
      });
    }

    await this.prisma.client.conversationMessage.updateMany({
      where: { threadId, aiProcessedAt: null },
      data: { aiProcessedAt: new Date() }
    });

    return { evaluationId: createdEvaluation.id, verdict, violationCount: violations.length };
  }

  private async callOpenAICompatible(
    job: { aiModel: string | null; rulesContent: string | null; skipConditions: string | null },
    transcript: string
  ) {
    const apiBaseUrl = this.requiredEnv('AI_OPENAI_COMPAT_BASE_URL');
    const apiKey = this.requiredEnv('AI_OPENAI_COMPAT_API_KEY');
    const model = job.aiModel ?? this.getDefaultModel();
    const timeoutMs = this.parseInt(process.env.AI_OPENAI_COMPAT_TIMEOUT_MS, 45_000, 5_000, 300_000);

    const prompt = this.buildQcPrompt(job.rulesContent ?? '', job.skipConditions ?? '');
    const url = `${apiBaseUrl.replace(/\/$/, '')}/chat/completions`;

    const requestBody = {
      model,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: transcript }
      ]
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`OpenAI-compatible API error ${response.status}: ${responseText}`);
      }

      const decoded = JSON.parse(responseText) as OpenAICompatibleResponse;
      const content = decoded.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new Error('OpenAI-compatible response missing message content.');
      }

      return {
        content,
        model,
        promptTokens: decoded.usage?.prompt_tokens,
        completionTokens: decoded.usage?.completion_tokens
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`OpenAI-compatible API timeout after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildQcPrompt(rulesContent: string, skipConditions: string) {
    const sanitizedRules = rulesContent.trim()
      || 'Không có rules tùy chỉnh. Đánh giá theo chuẩn CSKH lịch sự, rõ ràng, xử lý vấn đề chính xác.';
    const skipSection = skipConditions.trim()
      ? `\n\nĐiều kiện bỏ qua:\n${skipConditions.trim()}\nNếu thỏa điều kiện bỏ qua thì verdict=SKIP, score=0, violations=[] và nêu lý do ngắn gọn.`
      : '';

    return [
      'Bạn là chuyên gia đánh giá chất lượng chăm sóc khách hàng.',
      'Hãy đọc transcript và trả về JSON object duy nhất theo schema:',
      '{"verdict":"PASS|FAIL|SKIP","score":0-100,"review":"string","summary":"string","violations":[{"severity":"NGHIEM_TRONG|CAN_CAI_THIEN","rule":"string","evidence":"string","explanation":"string","suggestion":"string","confidence":0-1}]}',
      'Không trả lời ngoài JSON.',
      'Rules áp dụng:',
      sanitizedRules,
      skipSection
    ].join('\n');
  }

  private buildTranscript(
    messages: Array<{
      senderType: ConversationSenderType;
      senderName: string | null;
      content: string | null;
      sentAt: Date;
    }>
  ) {
    return messages
      .map((message) => {
        const label = message.senderName?.trim() || message.senderType;
        const text = message.content?.trim() || '';
        const hour = message.sentAt.toISOString().slice(11, 16);
        return `[${hour}] ${label}: ${text}`;
      })
      .join('\n');
  }

  private parseEvaluationResult(rawContent: string) {
    const cleaned = this.stripMarkdownCodeFence(rawContent);
    try {
      const json = JSON.parse(cleaned) as QualityEvaluationResult;
      return {
        rawJson: json as Prisma.InputJsonValue,
        verdict: json.verdict,
        score: json.score,
        review: json.review,
        summary: json.summary,
        violations: json.violations ?? []
      };
    } catch {
      return {
        rawJson: {
          parseError: true,
          content: cleaned
        } as Prisma.InputJsonValue,
        verdict: 'ERROR',
        score: 0,
        review: 'Không parse được JSON kết quả từ model.',
        summary: 'PARSE_ERROR',
        violations: []
      };
    }
  }

  private normalizeViolations(input: QualityViolationResult[]) {
    const normalized: Array<{
      severity: string;
      rule: string;
      evidence: string | null;
      explanation: string | null;
      suggestion: string | null;
      confidence: number | null;
    }> = [];

    for (const item of input) {
      const rule = this.optionalString(item.rule);
      if (!rule) {
        continue;
      }

      const confidence = item.confidence !== undefined && item.confidence !== null
        ? this.clamp(Number(item.confidence), 0, 1)
        : null;

      normalized.push({
        severity: this.optionalString(item.severity)?.toUpperCase() || 'CAN_CAI_THIEN',
        rule,
        evidence: this.optionalString(item.evidence) ?? null,
        explanation: this.optionalString(item.explanation) ?? null,
        suggestion: this.optionalString(item.suggestion) ?? null,
        confidence
      });
    }

    return normalized;
  }

  private normalizeVerdict(input: unknown): ConversationEvaluationVerdict {
    const candidate = String(input ?? '').trim().toUpperCase();
    if ((Object.values(ConversationEvaluationVerdict) as string[]).includes(candidate)) {
      return candidate as ConversationEvaluationVerdict;
    }
    return ConversationEvaluationVerdict.ERROR;
  }

  private normalizeScore(input: unknown) {
    if (input === null || input === undefined || input === '') {
      return null;
    }
    const score = Number(input);
    if (!Number.isFinite(score)) {
      return null;
    }
    return Math.round(this.clamp(score, 0, 100));
  }

  private normalizeChannelFilter(input: unknown): ChannelFilter {
    if (!input || typeof input !== 'object') {
      return { channels: [], accountIds: [] };
    }

    const data = input as Record<string, unknown>;
    const channels = Array.isArray(data.channels)
      ? data.channels
        .map((item) => String(item).trim().toUpperCase())
        .filter((item): item is ConversationChannel =>
          (Object.values(ConversationChannel) as string[]).includes(item)
        )
      : [];

    const accountIds = Array.isArray(data.accountIds)
      ? data.accountIds
        .map((item) => String(item).trim())
        .filter(Boolean)
      : [];

    return { channels, accountIds };
  }

  private stripMarkdownCodeFence(content: string) {
    const raw = content.trim();
    if (!raw.startsWith('```')) {
      return raw;
    }

    const firstNewLine = raw.indexOf('\n');
    const body = firstNewLine >= 0 ? raw.slice(firstNewLine + 1) : raw;
    const lastFence = body.lastIndexOf('```');
    return (lastFence >= 0 ? body.slice(0, lastFence) : body).trim();
  }

  private parseInt(input: unknown, fallback: number, min: number, max: number) {
    if (input === null || input === undefined || input === '') {
      return fallback;
    }
    const value = Number(input);
    if (!Number.isInteger(value)) {
      throw new BadRequestException('Giá trị số nguyên không hợp lệ.');
    }
    return this.clamp(value, min, max);
  }

  private parseBoolean(input: unknown, fallback: boolean) {
    if (input === null || input === undefined) {
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

  private parseDateOptional(input: unknown) {
    if (input === null || input === undefined || input === '') {
      return null;
    }
    const parsed = new Date(String(input));
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Giá trị ngày giờ không hợp lệ.');
    }
    return parsed;
  }

  private requiredString(input: unknown, message: string) {
    const value = this.optionalString(input);
    if (!value) {
      throw new BadRequestException(message);
    }
    return value;
  }

  private optionalString(input: unknown) {
    if (input === null || input === undefined) {
      return undefined;
    }
    const value = String(input).trim();
    return value || undefined;
  }

  private requiredEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new BadRequestException(`Thiếu biến môi trường ${name}.`);
    }
    return value;
  }

  private getDefaultModel() {
    return process.env.AI_OPENAI_COMPAT_MODEL?.trim() || 'gpt-4o-mini';
  }

  private clamp(value: number, min: number, max: number) {
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  }

  private hasPrismaClient() {
    return Boolean((this.prisma as unknown as { client?: unknown })?.client);
  }
}
