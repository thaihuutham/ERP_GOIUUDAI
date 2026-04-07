export const TELECOM_TERM_DAY_MAP: Record<string, number> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '7m': 210,
  '12m': 360,
  '14m': 420,
  '24m': 720,
  '1': 30,
  '3': 90,
  '6': 180,
  '7': 210,
  '12': 360,
  '14': 420,
  '24': 720
};

export function resolveTelecomTermDays(term: unknown): number | null {
  if (term === null || term === undefined) {
    return null;
  }

  if (typeof term === 'number' && Number.isFinite(term) && term > 0) {
    return Math.trunc(term);
  }

  const normalized = String(term).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const byMap = TELECOM_TERM_DAY_MAP[normalized];
  if (Number.isFinite(byMap) && byMap > 0) {
    return byMap;
  }

  return null;
}

export function computeRenewalBaseDate(currentExpiryAt: Date, transactionAt: Date) {
  return currentExpiryAt.getTime() > transactionAt.getTime() ? currentExpiryAt : transactionAt;
}

export function addDays(baseDate: Date, termDays: number) {
  return new Date(baseDate.getTime() + termDays * 24 * 60 * 60 * 1000);
}

export function computeReminderDueAt(endsAt: Date, leadDays: number) {
  return new Date(endsAt.getTime() - leadDays * 24 * 60 * 60 * 1000);
}

export function formatDateKeyInTimeZone(input: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(input);
}

export function buildReminderDedupeKey(tenantId: string, contractId: string, dueDateKey: string) {
  return `${tenantId}:${contractId}:${dueDateKey}`;
}
