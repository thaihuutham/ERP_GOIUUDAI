import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

type OaAccountContext = {
  id: string;
  accessTokenEnc: string | null;
  metadataJson: unknown;
};

type SendOaMessageInput = {
  account: OaAccountContext;
  externalThreadId: string;
  content: string;
  recipientId?: string;
};

@Injectable()
export class ZaloOaOutboundWorkerService {
  async sendTextMessage(input: SendOaMessageInput) {
    const metadata = this.asRecord(input.account.metadataJson);
    const accessToken = this.resolveAccessToken(input.account.accessTokenEnc, metadata);
    const requestUrl = this.resolveRequestUrl(metadata);
    const recipientId = this.requiredString(input.recipientId ?? input.externalThreadId, 'Thiếu recipientId/externalThreadId cho OA outbound.');
    const timeoutMs = this.parseInt(process.env.ZALO_OA_OUTBOUND_TIMEOUT_MS, 20_000, 2_000, 180_000);

    const requestBody = {
      recipient: {
        user_id: recipientId
      },
      message: {
        text: input.content
      }
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: accessToken,
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      const responseText = await response.text();
      const responseJson = this.tryParseJson(responseText);

      if (!response.ok) {
        throw new BadGatewayException(
          `OA outbound API error ${response.status}: ${responseText || 'empty response'}`
        );
      }

      const externalMessageId = this.extractMessageId(responseJson);

      return {
        requestUrl,
        response: responseJson ?? responseText ?? null,
        externalMessageId
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new ServiceUnavailableException(`OA outbound timeout sau ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveRequestUrl(metadata: Record<string, unknown>) {
    const explicitUrl = this.readString(metadata.outboundUrl)
      ?? this.readString(metadata.oaOutboundUrl)
      ?? this.readString(process.env.ZALO_OA_OUTBOUND_URL);

    if (explicitUrl) {
      return explicitUrl;
    }

    const baseUrl = this.readString(process.env.ZALO_OA_API_BASE_URL) ?? 'https://openapi.zalo.me/v3.0/oa';
    return `${baseUrl.replace(/\/$/, '')}/message/cs`;
  }

  private resolveAccessToken(accessTokenEnc: string | null, metadata: Record<string, unknown>) {
    const token = this.readString(accessTokenEnc)
      ?? this.readString(metadata.accessToken)
      ?? this.readString(metadata.oaAccessToken)
      ?? this.readString(process.env.ZALO_OA_ACCESS_TOKEN);

    if (!token) {
      throw new ServiceUnavailableException(
        'Thiếu OA access token. Cấu hình `accessTokenEnc`/`metadataJson.accessToken` hoặc `ZALO_OA_ACCESS_TOKEN`.'
      );
    }

    return token;
  }

  private extractMessageId(responseJson: unknown) {
    if (!responseJson || typeof responseJson !== 'object') {
      return undefined;
    }

    const data = responseJson as Record<string, unknown>;
    const messageId = this.readString(data.message_id)
      ?? this.readString((data.data as Record<string, unknown> | undefined)?.message_id)
      ?? this.readString((data.data as Record<string, unknown> | undefined)?.msg_id)
      ?? this.readString(data.msg_id);

    return messageId || undefined;
  }

  private asRecord(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {} as Record<string, unknown>;
    }
    return input as Record<string, unknown>;
  }

  private tryParseJson(input: string) {
    if (!input) {
      return null;
    }
    try {
      return JSON.parse(input) as unknown;
    } catch {
      return null;
    }
  }

  private readString(input: unknown) {
    if (input === null || input === undefined) {
      return undefined;
    }
    const value = String(input).trim();
    return value || undefined;
  }

  private requiredString(input: unknown, message: string) {
    const value = this.readString(input);
    if (!value) {
      throw new BadRequestException(message);
    }
    return value;
  }

  private parseInt(input: unknown, fallback: number, min: number, max: number) {
    if (input === null || input === undefined || input === '') {
      return fallback;
    }
    const value = Number(input);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(Math.max(Math.trunc(value), min), max);
  }
}
