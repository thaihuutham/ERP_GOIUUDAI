export type NumberConstraints = {
  min?: number;
  max?: number;
  integer?: boolean;
};

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_PREFIX_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:$|[Tt\s])/;
const DATETIME_LOCAL_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }
  return 31;
}

export function isValidCalendarDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    return false;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return false;
  }
  if (!Number.isInteger(day) || day < 1) {
    return false;
  }
  return day <= daysInMonth(year, month);
}

export function hasValidCalendarDatePrefix(value: string) {
  const raw = value.trim();
  const matched = raw.match(ISO_DATE_PREFIX_REGEX);
  if (!matched) {
    return false;
  }
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  return isValidCalendarDate(year, month, day);
}

export function isStrictIsoDate(value: string) {
  const raw = value.trim();
  const matched = raw.match(ISO_DATE_REGEX);
  if (!matched) {
    return false;
  }
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  return isValidCalendarDate(year, month, day);
}

export function isStrictDateTimeLocal(value: string) {
  const raw = value.trim();
  const matched = raw.match(DATETIME_LOCAL_REGEX);
  if (!matched) {
    return false;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const hour = Number(matched[4]);
  const minute = Number(matched[5]);
  const second = matched[6] === undefined ? 0 : Number(matched[6]);

  if (!isValidCalendarDate(year, month, day)) {
    return false;
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return false;
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return false;
  }
  if (!Number.isInteger(second) || second < 0 || second > 59) {
    return false;
  }

  return true;
}

export function parseFiniteNumber(raw: string) {
  const normalized = raw.trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeNumberByConstraints(value: number, constraints: NumberConstraints = {}) {
  let next = value;
  if (typeof constraints.min === 'number' && next < constraints.min) {
    next = constraints.min;
  }
  if (typeof constraints.max === 'number' && next > constraints.max) {
    next = constraints.max;
  }
  if (constraints.integer) {
    next = Math.trunc(next);
  }
  return next;
}
