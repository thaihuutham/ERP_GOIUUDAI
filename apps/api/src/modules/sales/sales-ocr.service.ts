import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { RuntimeSettingsService } from '../../common/settings/runtime-settings.service';

const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const MAX_REMOTE_FILE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class SalesOcrService {
  private readonly logger = new Logger(SalesOcrService.name);
  private activeKeyIndex = 0;

  constructor(
    @Inject(RuntimeSettingsService) private readonly runtimeSettings: RuntimeSettingsService
  ) {}

  async extractCertificateData(fileBuffer: Buffer, mimeType: string): Promise<CertificateExtractResult> {
    const normalizedMimeType = this.normalizeMimeType(mimeType || 'application/octet-stream');
    const safeMimeType = normalizedMimeType === 'application/octet-stream'
      ? this.detectMimeTypeFromBuffer(fileBuffer)
      : normalizedMimeType;
    const contentBase64 = fileBuffer.toString('base64');
    return this.extractWithConfiguredProvider({
      mimeType: safeMimeType,
      contentBase64,
      source: 'upload',
    });
  }

  async extractCertificateDataFromUrl(certificateLink: string): Promise<CertificateExtractResult> {
    const link = this.readString(certificateLink);
    if (!link) {
      throw new BadRequestException('Thiếu certificateLink.');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(link);
    } catch {
      throw new BadRequestException('certificateLink không hợp lệ.');
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new BadRequestException('certificateLink chỉ hỗ trợ http/https.');
    }

    const response = await fetch(parsedUrl.toString());
    if (!response.ok) {
      throw new BadRequestException(`Không tải được file từ link (${response.status}).`);
    }

    const lengthHeader = this.readString(response.headers.get('content-length'));
    const contentLength = Number(lengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_FILE_BYTES) {
      throw new BadRequestException(`File từ link quá lớn (> ${MAX_REMOTE_FILE_BYTES / (1024 * 1024)}MB).`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new BadRequestException('File từ link rỗng.');
    }
    if (buffer.length > MAX_REMOTE_FILE_BYTES) {
      throw new BadRequestException(`File từ link quá lớn (> ${MAX_REMOTE_FILE_BYTES / (1024 * 1024)}MB).`);
    }

    const normalizedMimeType = this.normalizeMimeType(
      this.readString(response.headers.get('content-type')).split(';')[0] || this.inferMimeTypeFromUrl(parsedUrl.pathname)
    );
    const mimeType = normalizedMimeType === 'application/octet-stream'
      ? this.detectMimeTypeFromBuffer(buffer)
      : normalizedMimeType;

    return this.extractWithConfiguredProvider({
      mimeType,
      contentBase64: buffer.toString('base64'),
      source: 'url',
      certificateLink: parsedUrl.toString(),
    });
  }

  private async extractWithConfiguredProvider(input: OcrInput): Promise<CertificateExtractResult> {
    const config = await this.resolveOcrConfig();
    const startIndex = this.resolveStartIndex(config.keyRotationMode, config.keyPool.length);

    for (let attempt = 0; attempt < config.keyPool.length; attempt++) {
      const keyIndex = (startIndex + attempt) % config.keyPool.length;
      const apiKey = config.keyPool[keyIndex];
      const keyLabel = `key#${keyIndex + 1}/${config.keyPool.length}`;

      try {
        const result = config.providerKind === 'openai_compat'
          ? await this.callOpenAiCompat(input, config, apiKey)
          : await this.callGemini(input, config, apiKey);
        this.activeKeyIndex = keyIndex;
        this.logger.log(`OCR success via ${config.providerKind} (${keyLabel}, source=${input.source})`);
        return result;
      } catch (error) {
        if (this.isRotatableKeyError(error)) {
          this.logger.warn(`OCR rotate key: ${keyLabel} failed (status=${this.extractStatusCode(error) ?? 'n/a'})`);
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException(
      `Tất cả ${config.keyPool.length} API key đều lỗi. Vui lòng kiểm tra quota/key hoặc thêm key mới trong AI Connector.`
    );
  }

  private async resolveOcrConfig(): Promise<OcrResolvedConfig> {
    const integrations = await this.runtimeSettings.getIntegrationRuntime();
    const intDomain = await this.runtimeSettings.getDomain('integrations');
    const rawAi = this.toRecord(intDomain.ai);
    const aiOcr = this.toRecord(intDomain.aiOcr);

    // Legacy sales policy fallback
    const salesPolicy = await this.runtimeSettings.getSalesCrmPolicyRuntime();
    const legacyAiConfig = (salesPolicy as Record<string, unknown>).aiIntegration as LegacyAiConfig | undefined;

    const ocrEnabled = this.toBool(aiOcr.enabled) || this.toBool(aiOcr.ocrEnabled) || legacyAiConfig?.ocrEnabled;
    if (!ocrEnabled) {
      throw new BadRequestException('Tính năng OCR chưa bật. Vui lòng bật tại Cài đặt > Integrations > AI OCR.');
    }

    const providerKind = this.normalizeProviderKind(this.readString(aiOcr.providerKind));
    const provider = this.readString(aiOcr.provider)
      || legacyAiConfig?.provider
      || (providerKind === 'gemini' ? DEFAULT_GEMINI_BASE_URL : integrations.ai.baseUrl || DEFAULT_OPENAI_BASE_URL);

    const model = this.readString(aiOcr.ocrModel)
      || legacyAiConfig?.ocrModel
      || (providerKind === 'gemini' ? DEFAULT_GEMINI_MODEL : integrations.ai.model || DEFAULT_OPENAI_MODEL);

    const keyRotationMode = this.normalizeKeyRotationMode(rawAi.keyRotationMode);
    const keyPool = this.resolveKeyPool(rawAi, integrations.ai, legacyAiConfig);
    if (keyPool.length === 0) {
      throw new BadRequestException('Chưa có API key AI. Vui lòng nhập key trong AI Connector (apiKey hoặc Key Pool).');
    }

    return {
      providerKind,
      provider,
      model,
      keyRotationMode,
      keyPool,
    };
  }

  private async callGemini(
    input: OcrInput,
    config: OcrResolvedConfig,
    apiKey: string
  ): Promise<CertificateExtractResult> {
    const baseUrl = config.provider.replace(/\/$/, '') || DEFAULT_GEMINI_BASE_URL;
    const endpoint = `${baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: CERTIFICATE_EXTRACTION_PROMPT },
              {
                inlineData: {
                  mimeType: input.mimeType,
                  data: input.contentBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          maxOutputTokens: 2048,
          // Disable long "thinking" traces to avoid consuming output token budget,
          // which can truncate JSON and make parsing fail on PDF OCR.
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new OcrApiError(
        `Gemini OCR lỗi (${response.status}). ${errorText.slice(0, 160)}`,
        response.status
      );
    }

    const result = await response.json() as GeminiGenerateContentResponse;
    const content = this.extractGeminiText(result);
    return this.parseExtractedContent(content);
  }

  private async callOpenAiCompat(
    input: OcrInput,
    config: OcrResolvedConfig,
    apiKey: string
  ): Promise<CertificateExtractResult> {
    const dataUri = `data:${input.mimeType};base64,${input.contentBase64}`;
    const endpoint = `${config.provider.replace(/\/$/, '')}/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: CERTIFICATE_EXTRACTION_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Đọc giấy chứng nhận bảo hiểm này và trả JSON theo yêu cầu.',
              },
              {
                type: 'image_url',
                image_url: { url: dataUri, detail: 'high' },
              },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new OcrApiError(
        `AI OCR lỗi (${response.status}). ${errorText.slice(0, 160)}`,
        response.status
      );
    }

    const result = await response.json() as OpenAICompletionResponse;
    const content = this.readString(result.choices?.[0]?.message?.content);
    return this.parseExtractedContent(content);
  }

  private parseExtractedContent(content: string): CertificateExtractResult {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.warn('OCR response does not contain JSON payload.');
      return { success: false, fields: {}, rawText: content };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const flat = this.flattenRecord(parsed);
      const pick = (...aliases: string[]) => this.pickFromAliases(flat, aliases);

      const holderName = pick('holderName', 'ownerFullName', 'ownerName', 'tenChuXe');
      const vehiclePlate = pick('vehiclePlate', 'plateNumber', 'bienSo', 'licensePlate');
      const vehicleType = pick('vehicleType', 'loaiXe');
      const vehicleBrand = pick('vehicleBrand', 'brand', 'hangXe');
      const engineNumber = pick('engineNumber', 'soMay');
      const frameNumber = pick('frameNumber', 'chassisNumber', 'soKhung');
      const certificateNumber = pick('certificateNumber', 'soGCN', 'auto.soGCN', 'moto.soGCN', 'gcnNumber');
      const issueDate = this.normalizeDateString(pick('issueDate', 'issuedAt', 'auto.issuedAt', 'moto.issuedAt'));
      const effectiveDate = this.normalizeDateString(pick('effectiveDate', 'effectiveFrom', 'policyFromAt', 'auto.policyFromAt', 'moto.policyFromAt'));
      const expiryDate = this.normalizeDateString(pick('expiryDate', 'effectiveTo', 'policyToAt', 'auto.policyToAt', 'moto.policyToAt'));
      const insurerName = pick('insurerName', 'insuranceCompany', 'companyName', 'donViBaoHiem');
      const premium = this.normalizeMoneyString(pick('premium', 'premiumWithVat', 'phiBaoHiem', 'auto.premiumWithVat', 'moto.premiumWithVat'));
      const coverage = pick('coverage', 'tnInsuredAmountPerEvent', 'mucBoiThuong');
      const termDays = this.normalizeIntegerString(pick('termDays', 'coverageDays', 'durationDays'));

      const fields: Record<string, string> = {};

      this.assignIfValue(fields, 'holderName', holderName);
      this.assignIfValue(fields, 'vehiclePlate', vehiclePlate);
      this.assignIfValue(fields, 'vehicleType', vehicleType);
      this.assignIfValue(fields, 'vehicleBrand', vehicleBrand);
      this.assignIfValue(fields, 'engineNumber', engineNumber);
      this.assignIfValue(fields, 'frameNumber', frameNumber);
      this.assignIfValue(fields, 'certificateNumber', certificateNumber);
      this.assignIfValue(fields, 'issueDate', issueDate);
      this.assignIfValue(fields, 'effectiveDate', effectiveDate);
      this.assignIfValue(fields, 'expiryDate', expiryDate);
      this.assignIfValue(fields, 'insurerName', insurerName);
      this.assignIfValue(fields, 'premium', premium);
      this.assignIfValue(fields, 'coverage', coverage);
      this.assignIfValue(fields, 'termDays', termDays);

      // Aliases matching current checkout template field keys
      this.assignIfValue(fields, 'ownerFullName', holderName);
      this.assignIfValue(fields, 'plateNumber', vehiclePlate);
      this.assignIfValue(fields, 'chassisNumber', frameNumber);
      this.assignIfValue(fields, 'effectiveFrom', effectiveDate);
      this.assignIfValue(fields, 'effectiveTo', expiryDate);
      this.assignIfValue(fields, 'auto.soGCN', certificateNumber);
      this.assignIfValue(fields, 'moto.soGCN', certificateNumber);
      this.assignIfValue(fields, 'auto.policyFromAt', effectiveDate);
      this.assignIfValue(fields, 'moto.policyFromAt', effectiveDate);
      this.assignIfValue(fields, 'auto.policyToAt', expiryDate);
      this.assignIfValue(fields, 'moto.policyToAt', expiryDate);
      this.assignIfValue(fields, 'auto.issuedAt', issueDate);
      this.assignIfValue(fields, 'moto.issuedAt', issueDate);
      this.assignIfValue(fields, 'auto.premiumWithVat', premium);
      this.assignIfValue(fields, 'moto.premiumWithVat', premium);

      return {
        success: Object.keys(fields).length > 0,
        fields,
        rawText: content,
      };
    } catch (error) {
      this.logger.warn(`OCR JSON parse failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return { success: false, fields: {}, rawText: content };
    }
  }

  private resolveStartIndex(mode: KeyRotationMode, poolSize: number): number {
    if (poolSize <= 0) return 0;
    const normalized = ((this.activeKeyIndex % poolSize) + poolSize) % poolSize;
    if (mode === 'round_robin') {
      return (normalized + 1) % poolSize;
    }
    return normalized;
  }

  private isRotatableKeyError(error: unknown): boolean {
    const statusCode = this.extractStatusCode(error);
    if (statusCode === null) return false;
    return statusCode === 401 || statusCode === 403 || statusCode === 429;
  }

  private extractStatusCode(error: unknown): number | null {
    if (error instanceof OcrApiError) return error.statusCode;
    return null;
  }

  private extractGeminiText(result: GeminiGenerateContentResponse): string {
    const candidate = result.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const textParts = parts
      .map((part) => this.readString(part?.text))
      .filter(Boolean);
    return textParts.join('\n').trim();
  }

  private resolveKeyPool(
    rawAiDomain: Record<string, unknown>,
    aiConnector: { apiKey: string; apiKeyRef: string },
    legacyConfig?: LegacyAiConfig
  ): string[] {
    const keys: string[] = [];
    const seen = new Set<string>();

    const addKey = (value: unknown) => {
      const key = this.readString(value);
      if (!key || seen.has(key)) return;
      seen.add(key);
      keys.push(key);
    };

    const rawPool = rawAiDomain.apiKeyPool;
    if (Array.isArray(rawPool)) {
      for (const item of rawPool) {
        if (typeof item === 'string') {
          addKey(item);
          continue;
        }
        if (item && typeof item === 'object') {
          const row = item as Record<string, unknown>;
          addKey(row.key);
          addKey(row.apiKey);
        }
      }
    }

    addKey(aiConnector.apiKey);

    if (aiConnector.apiKeyRef) {
      addKey(process.env[aiConnector.apiKeyRef]);
    }

    if (legacyConfig?.apiKeyRef) {
      addKey(process.env[legacyConfig.apiKeyRef]);
    }

    addKey(process.env['AI_GEMINI_API_KEY']);
    addKey(process.env['AI_OPENAI_COMPAT_API_KEY']);

    return keys;
  }

  private normalizeProviderKind(raw: string): ProviderKind {
    const value = raw.toLowerCase();
    if (value === 'openai_compat' || value === 'openai-compatible' || value === 'openai') {
      return 'openai_compat';
    }
    return 'gemini';
  }

  private normalizeKeyRotationMode(value: unknown): KeyRotationMode {
    const mode = this.readString(value).toLowerCase();
    if (mode === 'round_robin' || mode === 'manual') return mode;
    return 'fallback';
  }

  private assignIfValue(target: Record<string, string>, key: string, value: string) {
    const normalized = this.readString(value);
    if (normalized) {
      target[key] = normalized;
    }
  }

  private pickFromAliases(source: Record<string, string>, aliases: string[]): string {
    for (const alias of aliases) {
      const normalizedAlias = this.normalizeKey(alias);
      for (const [key, value] of Object.entries(source)) {
        if (this.normalizeKey(key) === normalizedAlias) {
          const normalizedValue = this.readString(value);
          if (normalizedValue) return normalizedValue;
        }
      }
    }
    return '';
  }

  private flattenRecord(value: unknown, prefix = ''): Record<string, string> {
    const output: Record<string, string> = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return output;
    }
    const record = value as Record<string, unknown>;
    for (const [key, nested] of Object.entries(record)) {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        Object.assign(output, this.flattenRecord(nested, nextKey));
        continue;
      }
      output[nextKey] = this.readString(nested);
    }
    return output;
  }

  private normalizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  }

  private normalizeDateString(value: string): string {
    const raw = this.readString(value);
    if (!raw) return '';
    const ymd = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (ymd) {
      return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
    }
    const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    return raw;
  }

  private normalizeMoneyString(value: string): string {
    const raw = this.readString(value);
    if (!raw) return '';
    const digits = raw.replace(/[^\d]/g, '');
    return digits || raw;
  }

  private normalizeIntegerString(value: string): string {
    const raw = this.readString(value);
    if (!raw) return '';
    const digits = raw.replace(/[^\d]/g, '');
    return digits || raw;
  }

  private normalizeMimeType(mimeType: string): string {
    const normalized = this.readString(mimeType).toLowerCase();
    if (normalized.startsWith('image/')) return normalized;
    if (normalized === 'application/pdf') return normalized;
    return 'application/octet-stream';
  }

  private detectMimeTypeFromBuffer(buffer: Buffer): string {
    if (!buffer || buffer.length < 4) {
      return 'application/octet-stream';
    }

    // PDF signature: %PDF-
    if (
      buffer[0] === 0x25
      && buffer[1] === 0x50
      && buffer[2] === 0x44
      && buffer[3] === 0x46
    ) {
      return 'application/pdf';
    }

    // PNG signature: 89 50 4E 47
    if (
      buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47
    ) {
      return 'image/png';
    }

    // JPEG signature: FF D8 FF
    if (
      buffer[0] === 0xff
      && buffer[1] === 0xd8
      && buffer[2] === 0xff
    ) {
      return 'image/jpeg';
    }

    // WEBP signature: RIFF....WEBP
    if (
      buffer.length >= 12
      && buffer[0] === 0x52 // R
      && buffer[1] === 0x49 // I
      && buffer[2] === 0x46 // F
      && buffer[3] === 0x46 // F
      && buffer[8] === 0x57 // W
      && buffer[9] === 0x45 // E
      && buffer[10] === 0x42 // B
      && buffer[11] === 0x50 // P
    ) {
      return 'image/webp';
    }

    return 'application/octet-stream';
  }

  private inferMimeTypeFromUrl(pathname: string): string {
    const normalized = pathname.toLowerCase();
    if (normalized.endsWith('.pdf')) return 'application/pdf';
    if (normalized.endsWith('.png')) return 'image/png';
    if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
    if (normalized.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private toBool(value: unknown): boolean {
    return value === true || value === 'true';
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}

type ProviderKind = 'gemini' | 'openai_compat';
type KeyRotationMode = 'fallback' | 'round_robin' | 'manual';

type OcrInput = {
  mimeType: string;
  contentBase64: string;
  source: 'upload' | 'url';
  certificateLink?: string;
};

type OcrResolvedConfig = {
  providerKind: ProviderKind;
  provider: string;
  model: string;
  keyRotationMode: KeyRotationMode;
  keyPool: string[];
};

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

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

class OcrApiError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'OcrApiError';
  }
}

const CERTIFICATE_EXTRACTION_PROMPT = `Bạn là hệ thống OCR chuyên đọc Giấy chứng nhận bảo hiểm xe tại Việt Nam.

Hãy trích xuất và trả về JSON duy nhất (không markdown), ưu tiên các key sau:
{
  "holderName": "",
  "ownerFullName": "",
  "vehiclePlate": "",
  "plateNumber": "",
  "vehicleType": "",
  "vehicleBrand": "",
  "engineNumber": "",
  "frameNumber": "",
  "chassisNumber": "",
  "certificateNumber": "",
  "issueDate": "",
  "effectiveDate": "",
  "expiryDate": "",
  "insurerName": "",
  "premium": "",
  "coverage": "",
  "termDays": "",
  "auto": {
    "soGCN": "",
    "policyFromAt": "",
    "policyToAt": "",
    "issuedAt": "",
    "premiumWithVat": ""
  },
  "moto": {
    "soGCN": "",
    "policyFromAt": "",
    "policyToAt": "",
    "issuedAt": "",
    "premiumWithVat": ""
  }
}

Quy tắc:
- Nếu không chắc thì để chuỗi rỗng.
- Không tự bịa thông tin.
- Date chuẩn YYYY-MM-DD nếu suy ra được.
- premium chỉ giữ số (không ký hiệu tiền tệ).`;
