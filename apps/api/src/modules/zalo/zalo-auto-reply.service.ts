import { BadRequestException, Injectable } from '@nestjs/common';
import { ConversationSenderType } from '@prisma/client';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';
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

@Injectable()
export class ZaloAutoReplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  async hasAgentReplyAfter(threadId: string, sentAt: Date) {
    const count = await this.prisma.client.conversationMessage.count({
      where: {
        threadId,
        senderType: ConversationSenderType.AGENT,
        sentAt: { gt: sentAt }
      }
    });
    return count > 0;
  }

  async generateReplyForThread(threadId: string) {
    const messages = await this.prisma.client.conversationMessage.findMany({
      where: {
        threadId,
        isDeleted: false
      },
      orderBy: { sentAt: 'asc' },
      take: 80
    });

    if (messages.length === 0) {
      return null;
    }

    const latestCustomerMessage = [...messages]
      .reverse()
      .find((message) => message.senderType === ConversationSenderType.CUSTOMER);

    if (!latestCustomerMessage) {
      return null;
    }

    const transcript = this.buildTranscript(messages.slice(-30));
    const aiRaw = await this.callOpenAiCompatible({
      transcript,
      latestCustomerContent: this.normalizeMessageContent(latestCustomerMessage.contentType, latestCustomerMessage.content)
    });

    return this.normalizeAssistantReply(aiRaw.content);
  }

  private async callOpenAiCompatible(input: { transcript: string; latestCustomerContent: string }) {
    const integrationRuntime = await this.runtimeSettings.getIntegrationRuntime();
    const apiBaseUrl = this.cleanString(integrationRuntime.ai.baseUrl) ?? process.env.AI_OPENAI_COMPAT_BASE_URL?.trim();
    const apiKey = this.cleanString(integrationRuntime.ai.apiKey) ?? process.env.AI_OPENAI_COMPAT_API_KEY?.trim();
    const model = this.cleanString(integrationRuntime.ai.model) ?? process.env.AI_OPENAI_COMPAT_MODEL?.trim() ?? 'gpt-4o-mini';
    const timeoutMs = this.toInt(
      integrationRuntime.ai.timeoutMs ?? process.env.AI_OPENAI_COMPAT_TIMEOUT_MS,
      45_000,
      5_000,
      300_000
    );

    if (!apiBaseUrl) {
      throw new BadRequestException('Thiếu cấu hình AI base URL trong settings.integrations.ai hoặc ENV.');
    }
    if (!apiKey) {
      throw new BadRequestException('Thiếu API key AI trong settings.integrations.ai hoặc ENV.');
    }

    const systemPrompt = [
      'Bạn là trợ lý CSKH Zalo của doanh nghiệp bán lẻ.',
      'Mục tiêu: trả lời lịch sự, rõ ràng, ngắn gọn, tập trung vào nhu cầu ngay trước mắt của khách.',
      'Nguyên tắc bắt buộc:',
      '- Trả lời bằng tiếng Việt tự nhiên, tối đa 3 câu.',
      '- Không bịa đặt thông tin về giá/chính sách nếu không có trong ngữ cảnh.',
      '- Nếu thiếu dữ liệu để chốt, hãy hỏi lại đúng 1 câu ngắn để làm rõ.',
      '- Không dùng Markdown, không dùng emoji, không xưng là AI trừ khi khách hỏi trực tiếp.'
    ].join('\n');

    const userPrompt = [
      'Đây là hội thoại gần nhất (mới nhất ở cuối):',
      input.transcript,
      '',
      `Tin nhắn mới nhất của khách: ${input.latestCustomerContent}`,
      '',
      'Hãy soạn đúng 1 tin nhắn phản hồi gửi cho khách.'
    ].join('\n');

    const url = `${apiBaseUrl.replace(/\/$/, '')}/chat/completions`;
    const requestBody = {
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
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

  private buildTranscript(
    messages: Array<{
      senderType: ConversationSenderType;
      senderName: string | null;
      content: string | null;
      contentType: string;
      sentAt: Date;
    }>
  ) {
    return messages
      .map((message) => {
        const label = this.cleanString(message.senderName) || message.senderType;
        const text = this.normalizeMessageContent(message.contentType, message.content);
        const hour = message.sentAt.toISOString().slice(11, 16);
        return `[${hour}] ${label}: ${text}`;
      })
      .join('\n');
  }

  private normalizeMessageContent(contentTypeRaw: string | null | undefined, contentRaw: string | null | undefined) {
    const contentType = String(contentTypeRaw ?? '').trim().toUpperCase();
    const content = this.cleanString(contentRaw);
    if (content) {
      return content;
    }
    if (!contentType || contentType === 'TEXT') {
      return '[không có nội dung văn bản]';
    }
    return `[${contentType}]`;
  }

  private normalizeAssistantReply(raw: string) {
    const stripped = this.stripMarkdownCodeFence(raw);
    const compact = stripped.replace(/\s+/g, ' ').trim();
    if (!compact) {
      return null;
    }
    if (compact.length <= 800) {
      return compact;
    }
    return `${compact.slice(0, 797)}...`;
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

  private cleanString(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized || undefined;
  }

  private toInt(input: unknown, fallback: number, min: number, max: number) {
    if (input === null || input === undefined || input === '') {
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
}
