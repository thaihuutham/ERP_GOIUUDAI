export const REPORT_DATE_RANGES = ['YESTERDAY', 'THIS_WEEK', 'LAST_WEEK', 'LAST_MONTH'] as const;

export type ReportDateRangeKey = (typeof REPORT_DATE_RANGES)[number];

export type ResolvedReportDateRange = {
  key: ReportDateRangeKey;
  label: string;
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function startOfDayLocal(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * ONE_DAY_MS);
}

function startOfWeekMonday(value: Date) {
  const start = startOfDayLocal(value);
  const day = start.getDay();
  const diff = (day + 6) % 7;
  return addDays(start, -diff);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonthExclusive(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 1, 0, 0, 0, 0);
}

function normalizeRangeKey(input?: string | null): ReportDateRangeKey {
  const normalized = String(input ?? '').trim().toUpperCase();
  if ((REPORT_DATE_RANGES as readonly string[]).includes(normalized)) {
    return normalized as ReportDateRangeKey;
  }
  return 'THIS_WEEK';
}

export function resolveReportDateRange(input?: string | null, now = new Date()): ResolvedReportDateRange {
  const key = normalizeRangeKey(input);
  const todayStart = startOfDayLocal(now);

  if (key === 'YESTERDAY') {
    const from = addDays(todayStart, -1);
    const to = todayStart;
    const previousFrom = addDays(from, -1);
    const previousTo = from;

    return {
      key,
      label: 'Hôm qua',
      from,
      to,
      previousFrom,
      previousTo
    };
  }

  if (key === 'LAST_WEEK') {
    const thisWeekStart = startOfWeekMonday(now);
    const from = addDays(thisWeekStart, -7);
    const to = thisWeekStart;
    const previousFrom = addDays(from, -7);
    const previousTo = from;

    return {
      key,
      label: 'Tuần trước',
      from,
      to,
      previousFrom,
      previousTo
    };
  }

  if (key === 'LAST_MONTH') {
    const thisMonthStart = startOfMonth(now);
    const from = startOfMonth(addDays(thisMonthStart, -1));
    const to = thisMonthStart;
    const previousFrom = startOfMonth(addDays(from, -1));
    const previousTo = from;

    return {
      key,
      label: 'Tháng trước',
      from,
      to,
      previousFrom,
      previousTo
    };
  }

  // THIS_WEEK (default)
  const from = startOfWeekMonday(now);
  const to = addDays(todayStart, 1);
  const previousFrom = addDays(from, -7);
  const previousTo = from;

  return {
    key: 'THIS_WEEK',
    label: 'Tuần này',
    from,
    to,
    previousFrom,
    previousTo
  };
}

export function buildDailyBuckets(range: Pick<ResolvedReportDateRange, 'from' | 'to'>) {
  const buckets: Date[] = [];
  let cursor = startOfDayLocal(range.from);
  const limit = 62;
  while (cursor < range.to && buckets.length < limit) {
    buckets.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return buckets;
}

export function formatBucketLabel(date: Date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function toBucketKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function endOfDayExclusive(date: Date) {
  return addDays(startOfDayLocal(date), 1);
}

export function normalizeDate(input: string | undefined | null) {
  if (!input) return null;
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function clampDateRange(startInput?: string | null, endInput?: string | null) {
  const start = normalizeDate(startInput);
  const end = normalizeDate(endInput);

  if (!start && !end) {
    return null;
  }

  const now = new Date();
  const from = start ? startOfDayLocal(start) : startOfDayLocal(addDays(now, -30));
  const to = end ? endOfDayExclusive(end) : endOfDayExclusive(now);

  if (from >= to) {
    return null;
  }

  return { from, to };
}
