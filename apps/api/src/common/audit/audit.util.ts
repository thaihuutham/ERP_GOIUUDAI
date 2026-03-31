import { createHash } from 'crypto';

const REDACTED = '***REDACTED***';
const SENSITIVE_PATTERNS = [
  'password',
  'secret',
  'token',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'mfa',
  'otp',
  'pin',
  'salt',
  'bankaccount',
  'bank_account',
  'creditcard',
  'cardnumber',
  'cvv',
  'ssn',
  'nationalid',
  'taxcode'
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
  return SENSITIVE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function maskSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveFields(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      output[key] = REDACTED;
      continue;
    }
    output[key] = maskSensitiveFields(raw);
  }
  return output;
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const chunks = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${chunks.join(',')}}`;
  }

  return JSON.stringify(String(value));
}

export function createAuditHash(payload: Record<string, unknown>) {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function collectDiffPaths(before: unknown, after: unknown, basePath: string, sink: string[]) {
  if (stableStringify(before) === stableStringify(after)) {
    return;
  }

  const beforeObject = isPlainObject(before);
  const afterObject = isPlainObject(after);

  if (beforeObject && afterObject) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    for (const key of keys) {
      const nextPath = basePath ? `${basePath}.${key}` : key;
      collectDiffPaths(before[key], after[key], nextPath, sink);
    }
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      sink.push(basePath || '$');
      return;
    }

    for (let index = 0; index < before.length; index += 1) {
      const nextPath = basePath ? `${basePath}[${index}]` : `[${index}]`;
      collectDiffPaths(before[index], after[index], nextPath, sink);
    }
    return;
  }

  sink.push(basePath || '$');
}

export function computeChangedFields(beforeData: unknown, afterData: unknown): string[] {
  const collector: string[] = [];
  collectDiffPaths(beforeData, afterData, '', collector);
  return Array.from(new Set(collector));
}
