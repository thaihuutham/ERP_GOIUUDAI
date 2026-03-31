export type RuntimeLocale = {
  timezone: string;
  numberFormat: string;
  currency: string;
  dateFormat?: string;
  firstDayOfWeek?: string;
  fiscalYearStartMonth?: number;
};

const RUNTIME_LOCALE_STORAGE_KEY = 'erp_runtime_locale_v1';

const DEFAULT_LOCALE: RuntimeLocale = {
  timezone: 'Asia/Ho_Chi_Minh',
  numberFormat: 'vi-VN',
  currency: 'VND'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getRuntimeLocale(): RuntimeLocale {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }

  const raw = window.localStorage.getItem(RUNTIME_LOCALE_STORAGE_KEY);
  if (!raw) return DEFAULT_LOCALE;

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_LOCALE;

    return {
      timezone: String(parsed.timezone ?? DEFAULT_LOCALE.timezone),
      numberFormat: String(parsed.numberFormat ?? DEFAULT_LOCALE.numberFormat),
      currency: String(parsed.currency ?? DEFAULT_LOCALE.currency),
      dateFormat: parsed.dateFormat ? String(parsed.dateFormat) : undefined,
      firstDayOfWeek: parsed.firstDayOfWeek ? String(parsed.firstDayOfWeek) : undefined,
      fiscalYearStartMonth: parsed.fiscalYearStartMonth ? Number(parsed.fiscalYearStartMonth) : undefined
    };
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function setRuntimeLocale(locale: Partial<RuntimeLocale> | null | undefined) {
  if (typeof window === 'undefined') return;
  if (!locale) return;

  const next: RuntimeLocale = {
    ...DEFAULT_LOCALE,
    ...locale
  };
  window.localStorage.setItem(RUNTIME_LOCALE_STORAGE_KEY, JSON.stringify(next));
}

export function formatRuntimeCurrency(value: unknown) {
  const locale = getRuntimeLocale();
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '--';
  return amount.toLocaleString(locale.numberFormat, {
    style: 'currency',
    currency: locale.currency
  });
}

export function formatRuntimeNumber(value: unknown) {
  const locale = getRuntimeLocale();
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return '--';
  return number.toLocaleString(locale.numberFormat);
}

export function formatRuntimeDateTime(value: unknown) {
  if (!value) return '--';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  const locale = getRuntimeLocale();
  return new Intl.DateTimeFormat(locale.numberFormat, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: locale.timezone
  }).format(date);
}
