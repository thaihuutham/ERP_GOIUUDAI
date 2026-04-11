import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';

/**
 * C1: AI/OCR service for extracting data from insurance certificates.
 * Supports OpenAI-compatible APIs (e.g., OpenAI, Azure OpenAI, local LLM).
 *
 * Key resolution order:
 *   1. integrations.ai.apiKeyPool (key pool with rotation)
 *   2. integrations.ai.apiKey (single UI key)
 *   3. integrations.aiOcr.apiKeyRef → env var (legacy fallback)
 *   4. AI_OPENAI_COMPAT_API_KEY env var (.env fallback)
 */
@Injectable()
export class SalesOcrService {
  private readonly logger = new Logger(SalesOcrService.name);
  /** Tracks the current active key index for round-robin / fallback rotation */
  private activeKeyIndex = 0;

  constructor(
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  /**
   * Extract structured data from an uploaded insurance certificate image/PDF.
   * Returns parsed fields that can auto-fill the checkout form.
   */
  async extractCertificateData(fileBuffer: Buffer, mimeType: string): Promise<CertificateExtractResult> {
    // ── 1. Read config from integrations domain ──────────────────────
    const integrations = await this.runtimeSettings.getIntegrationRuntime();
    const aiConnector = integrations.ai;

    // Also read legacy sales config for backward compatibility
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    const legacyAiConfig = (salesPolicy as Record<string, unknown>).aiIntegration as LegacyAiConfig | undefined;

    // Check if OCR is enabled: read raw integrations domain for aiOcr sub-object
    const intDomain = await this.runtimeSettings.getDomain('integrations');
    const aiOcr = this.toRecord(intDomain.aiOcr);
    const ocrEnabled = this.toBool(aiOcr.enabled) || this.toBool(aiOcr.ocrEnabled) || legacyAiConfig?.ocrEnabled;
    const aiEnabled = aiConnector.enabled || legacyAiConfig?.enabled;

    if (!aiEnabled || !ocrEnabled) {
      throw new BadRequestException(
        'Tính năng AI/OCR chưa được bật. Admin hãy bật tại Cài đặt > Tích hợp > AI OCR.'
      );
    }

    // ── 2. Resolve API keys (pool → single → env) ──────────────────
    const rawAi = this.toRecord(intDomain.ai);
    const keyPool = this.resolveKeyPool(rawAi, aiConnector, legacyAiConfig);
    if (keyPool.length === 0) {
      throw new BadRequestException(
        'Chưa có API key nào. Vui lòng nhập key tại Cài đặt > Tích hợp > AI Connector.'
      );
    }

    // ── 3. Resolve provider & model ─────────────────────────────────
    const provider = aiConnector.baseUrl
      || this.readString(aiOcr.provider)
      || legacyAiConfig?.provider
      || 'https://api.openai.com/v1';

    const model = this.readString(aiOcr.ocrModel)
      || legacyAiConfig?.ocrModel
      || aiConnector.model
      || 'gpt-4o-mini';

    // ── 4. Call AI with key rotation ────────────────────────────────
    const base64Image = fileBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64Image}`;

    return this.callWithKeyRotation(keyPool, provider, model, dataUri);
  }

  /**
   * Try each key in the pool until one succeeds.
   * On quota/auth error (401/429), move to next key.
   */
  private async callWithKeyRotation(
    keyPool: string[],
    provider: string,
    model: string,
    dataUri: string
  ): Promise<CertificateExtractResult> {
    const startIndex = this.activeKeyIndex % keyPool.length;

    for (let attempt = 0; attempt < keyPool.length; attempt++) {
      const keyIndex = (startIndex + attempt) % keyPool.length;
      const apiKey = keyPool[keyIndex];
      const keyLabel = `key#${keyIndex + 1}/${keyPool.length}`;

      try {
        const result = await this.callOcrApi(apiKey, provider, model, dataUri);
        // Success — remember this key for next request
        this.activeKeyIndex = keyIndex;
        this.logger.log(`OCR succeeded with ${keyLabel}`);
        return result;
      } catch (error) {
        // Only rotate on quota/auth errors, re-throw others immediately
        if (this.isQuotaOrAuthError(error)) {
          this.logger.warn(`${keyLabel} failed (quota/auth), rotating to next key...`);
          continue;
        }
        throw error;
      }
    }

    // All keys exhausted
    this.logger.error(`All ${keyPool.length} keys in pool exhausted`);
    throw new BadRequestException(
      `Tất cả ${keyPool.length} API key trong pool đều bị lỗi. Vui lòng kiểm tra quota hoặc thêm key mới.`
    );
  }

  /**
   * Single API call to the AI provider.
   */
  private async callOcrApi(
    apiKey: string,
    provider: string,
    model: string,
    dataUri: string
  ): Promise<CertificateExtractResult> {
    const response = await fetch(`${provider}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: CERTIFICATE_EXTRACTION_PROMPT
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hãy đọc giấy chứng nhận bảo hiểm này và trích xuất thông tin theo format JSON.'
              },
              {
                type: 'image_url',
                image_url: { url: dataUri, detail: 'high' }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const status = response.status;
      this.logger.error(`OCR API error: ${status} ${errorText}`);
      throw new OcrApiError(`AI OCR lỗi (${status}). Vui lòng thử lại hoặc nhập thủ công.`, status);
    }

    const result = await response.json() as OpenAICompletionResponse;
    const content = result.choices?.[0]?.message?.content || '';

    return this.parseExtractedContent(content);
  }

  /**
   * Check if an error is a quota/auth error that warrants key rotation.
   */
  private isQuotaOrAuthError(error: unknown): boolean {
    if (error instanceof OcrApiError) {
      return [401, 403, 429].includes(error.statusCode);
    }
    return false;
  }

  /**
   * Build the ordered key pool from all available sources.
   * Priority: pool keys > single UI key > secretRef > env fallback.
   */
  private resolveKeyPool(
    rawAiDomain: Record<string, unknown>,
    aiConnector: { apiKey: string; apiKeyRef: string },
    legacyConfig?: LegacyAiConfig | null,
  ): string[] {
    const keys: string[] = [];
    const seen = new Set<string>();

    const addKey = (k: string | undefined | null) => {
      const trimmed = (k ?? '').trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        keys.push(trimmed);
      }
    };

    // 1. Key pool from integrations.ai.apiKeyPool (highest priority)
    const rawPool = rawAiDomain.apiKeyPool;
    if (Array.isArray(rawPool)) {
      for (const item of rawPool) {
        if (typeof item === 'string') addKey(item);
      }
    }

    // 2. Single key from AI connector UI
    addKey(aiConnector.apiKey);

    // 3. SecretRef fallback from integrations
    if (aiConnector.apiKeyRef) {
      addKey(process.env[aiConnector.apiKeyRef]);
    }

    // 4. Legacy sales config ref
    if (legacyConfig?.apiKeyRef) {
      addKey(process.env[legacyConfig.apiKeyRef]);
    }

    // 5. Default env var fallback
    addKey(process.env['AI_OPENAI_COMPAT_API_KEY']);

    return keys;
  }

  /**
   * Parse the AI response content into structured certificate data.
   */
  private parseExtractedContent(content: string): CertificateExtractResult {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.warn('No JSON found in OCR response');
      return { success: false, fields: {}, rawText: content };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
      const fields: Record<string, string> = {};

      if (parsed.holderName) fields.holderName = parsed.holderName;
      if (parsed.vehiclePlate) fields.vehiclePlate = parsed.vehiclePlate;
      if (parsed.vehicleType) fields.vehicleType = parsed.vehicleType;
      if (parsed.vehicleBrand) fields.vehicleBrand = parsed.vehicleBrand;
      if (parsed.engineNumber) fields.engineNumber = parsed.engineNumber;
      if (parsed.frameNumber) fields.frameNumber = parsed.frameNumber;
      if (parsed.certificateNumber) fields.certificateNumber = parsed.certificateNumber;
      if (parsed.issueDate) fields.issueDate = parsed.issueDate;
      if (parsed.expiryDate) fields.expiryDate = parsed.expiryDate;
      if (parsed.effectiveDate) fields.effectiveDate = parsed.effectiveDate;
      if (parsed.insurerName) fields.insurerName = parsed.insurerName;
      if (parsed.premium) fields.premium = parsed.premium;
      if (parsed.coverage) fields.coverage = parsed.coverage;
      if (parsed.termDays) fields.termDays = parsed.termDays;

      return {
        success: Object.keys(fields).length > 0,
        fields,
        rawText: content
      };
    } catch (parseError) {
      this.logger.warn('Failed to parse JSON from OCR response', parseError);
      return { success: false, fields: {}, rawText: content };
    }
  }

  // ── Utility helpers ──────────────────────────────────────────────────

  private toRecord(val: unknown): Record<string, unknown> {
    return typeof val === 'object' && val !== null ? (val as Record<string, unknown>) : {};
  }

  private toBool(val: unknown): boolean {
    return val === true || val === 'true';
  }

  private readString(val: unknown): string {
    return typeof val === 'string' ? val.trim() : '';
  }
}

// ── Types ────────────────────────────────────────────────────────────

type LegacyAiConfig = {
  enabled: boolean;
  provider: string;
  apiKeyRef: string;
  ocrEnabled: boolean;
  ocrModel: string;
};

export type CertificateExtractResult = {
  success: boolean;
  fields: Record<string, string>;
  rawText: string;
};

type OpenAICompletionResponse = {
  choices?: Array<{
    message?: { content?: string };
  }>;
};

class OcrApiError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'OcrApiError';
  }
}

// ── Prompt ───────────────────────────────────────────────────────────

const CERTIFICATE_EXTRACTION_PROMPT = `Bạn là hệ thống OCR chuyên trích xuất thông tin từ Giấy chứng nhận bảo hiểm xe (ô tô, xe máy) tại Việt Nam.

Hãy đọc hình ảnh giấy chứng nhận và trả về JSON với các trường sau (nếu tìm được):
{
  "holderName": "Tên chủ xe / người được bảo hiểm",
  "vehiclePlate": "Biển số xe (VD: 51F-123.45)",
  "vehicleType": "Loại xe (ô tô/xe máy)",
  "vehicleBrand": "Hãng xe (VD: Honda, Toyota)",
  "engineNumber": "Số máy",
  "frameNumber": "Số khung",
  "certificateNumber": "Số giấy chứng nhận",
  "issueDate": "Ngày cấp (YYYY-MM-DD)",
  "expiryDate": "Ngày hết hạn (YYYY-MM-DD)",
  "effectiveDate": "Ngày có hiệu lực (YYYY-MM-DD)",
  "insurerName": "Tên công ty bảo hiểm",
  "premium": "Phí bảo hiểm (số tiền VND)",
  "coverage": "Mức bồi thường tối đa",
  "termDays": "Thời hạn (số ngày, VD: 365)"
}

Quy tắc:
- Chỉ trả về JSON, không giải thích thêm.
- Nếu không đọc được trường nào, bỏ qua (không ghi null).
- Ngày tháng luôn format YYYY-MM-DD.
- Số tiền chỉ ghi số (VD: 500000), không ghi đơn vị.`;
