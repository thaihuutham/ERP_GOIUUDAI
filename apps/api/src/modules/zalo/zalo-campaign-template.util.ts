export type CampaignTemplateRenderInput = {
  template: string;
  context: Record<string, unknown>;
  allowedVariableKeys: string[];
};

export type CampaignTemplateRenderResult = {
  ok: boolean;
  content: string;
  missingVariables: string[];
};

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const SPIN_PATTERN = /\{([^{}]+)\}/g;

export const CAMPAIGN_VARIABLE_ALIAS_MAP: Record<string, string> = {
  ten_khach: 'customer.fullName',
  customer_name: 'customer.fullName',
  customer_phone: 'customer.phone',
  customer_email: 'customer.email',
  ma_khuyen_mai: 'customer.promoCode',
  promo_code: 'customer.promoCode',
  campaign_name: 'campaign.name',
  campaign_code: 'campaign.code'
};

export const DEFAULT_CAMPAIGN_ALLOWED_VARIABLE_KEYS = [
  'ten_khach',
  'customer_name',
  'customer_phone',
  'customer_email',
  'ma_khuyen_mai',
  'promo_code',
  'customer.id',
  'customer.code',
  'customer.fullName',
  'customer.phone',
  'customer.email',
  'customer.customerStage',
  'customer.segment',
  'customer.source',
  'customer.tags',
  'customer.promoCode',
  'campaign.id',
  'campaign.name',
  'campaign.code',
  'account.id',
  'account.displayName'
];

function normalizeKey(raw: string) {
  return String(raw ?? '').trim();
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function resolvePath(input: Record<string, unknown>, path: string) {
  const normalized = normalizeKey(path);
  if (!normalized) {
    return undefined;
  }

  const parts = normalized.split('.').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }

  let current: unknown = input;
  for (const part of parts) {
    const currentRecord = toRecord(current);
    if (!currentRecord) {
      return undefined;
    }
    current = currentRecord[part];
  }

  return current;
}

function maskPlaceholders(template: string) {
  const mappings: Array<{ token: string; key: string }> = [];
  let index = 0;
  const masked = template.replace(PLACEHOLDER_PATTERN, (_, variableKey: string) => {
    const token = `__ERP_CAMPAIGN_VAR_${index}__`;
    mappings.push({ token, key: normalizeKey(variableKey) });
    index += 1;
    return token;
  });
  return {
    masked,
    mappings
  };
}

function expandSpinSyntax(input: string, randomProvider: () => number = Math.random) {
  let current = input;
  for (let loop = 0; loop < 20; loop += 1) {
    let replaced = false;
    current = current.replace(SPIN_PATTERN, (full, inner: string) => {
      const options = inner
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean);

      if (options.length <= 1) {
        return full;
      }

      replaced = true;
      const randomIndex = Math.floor(randomProvider() * options.length);
      return options[randomIndex] ?? options[0];
    });

    if (!replaced) {
      break;
    }
  }

  return current;
}

function normalizeAllowedKeys(rawKeys: string[]) {
  const normalized = Array.from(
    new Set(
      rawKeys
        .map((item) => normalizeKey(item))
        .filter(Boolean)
    )
  );
  if (normalized.length > 0) {
    return normalized;
  }
  return [...DEFAULT_CAMPAIGN_ALLOWED_VARIABLE_KEYS];
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function renderCampaignTemplate(input: CampaignTemplateRenderInput): CampaignTemplateRenderResult {
  const template = String(input.template ?? '');
  if (!template.trim()) {
    return {
      ok: false,
      content: '',
      missingVariables: ['template.empty']
    };
  }

  const allowedKeys = normalizeAllowedKeys(input.allowedVariableKeys);
  const context = toRecord(input.context) ?? {};
  const { masked, mappings } = maskPlaceholders(template);
  let rendered = expandSpinSyntax(masked);

  const missingVariables: string[] = [];

  for (const mapping of mappings) {
    const requestedKey = normalizeKey(mapping.key);
    const resolvedKey = CAMPAIGN_VARIABLE_ALIAS_MAP[requestedKey] ?? requestedKey;

    if (!allowedKeys.includes(requestedKey) && !allowedKeys.includes(resolvedKey)) {
      missingVariables.push(requestedKey);
      continue;
    }

    const resolvedValue = resolvePath(context, resolvedKey);
    if (resolvedValue === undefined || resolvedValue === null || String(resolvedValue).trim() === '') {
      missingVariables.push(requestedKey);
      continue;
    }

    rendered = rendered.split(mapping.token).join(stringifyValue(resolvedValue));
  }

  if (missingVariables.length > 0) {
    return {
      ok: false,
      content: rendered,
      missingVariables: Array.from(new Set(missingVariables))
    };
  }

  rendered = rendered.replace(/\s+/g, ' ').trim();
  return {
    ok: true,
    content: rendered,
    missingVariables: []
  };
}

export function pickRandomDelaySeconds(minSeconds: number, maxSeconds: number) {
  const min = Number.isFinite(minSeconds) ? Math.max(1, Math.trunc(minSeconds)) : 1;
  const max = Number.isFinite(maxSeconds) ? Math.max(min, Math.trunc(maxSeconds)) : min;
  if (max === min) {
    return min;
  }
  return min + Math.floor(Math.random() * (max - min + 1));
}
