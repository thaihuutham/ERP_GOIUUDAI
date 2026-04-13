import { BadRequestException } from '@nestjs/common';

const ISO_DATE_PREFIX_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:$|[Tt\s])/;

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

function assertCalendarDatePrefix(raw: string, fieldName: string) {
  const matched = raw.match(ISO_DATE_PREFIX_REGEX);
  if (!matched) {
    return;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);

  if (!Number.isFinite(year) || year < 1 || year > 9999) {
    throw new BadRequestException(`${fieldName} không hợp lệ (năm).`);
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    throw new BadRequestException(`${fieldName} không hợp lệ (tháng phải từ 1 đến 12).`);
  }

  const maxDay = daysInMonth(year, month);
  if (!Number.isFinite(day) || day < 1 || day > maxDay) {
    throw new BadRequestException(`${fieldName} không hợp lệ (ngày phải từ 1 đến ${maxDay} của tháng ${month}).`);
  }
}

export function parseStrictDate(value: unknown, fieldName: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException(`${fieldName} không hợp lệ.`);
    }
    return new Date(value.getTime());
  }

  const raw = String(value ?? '').trim();
  if (!raw) {
    throw new BadRequestException(`${fieldName} không hợp lệ.`);
  }

  assertCalendarDatePrefix(raw, fieldName);

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${fieldName} không hợp lệ.`);
  }
  return parsed;
}

export function parseOptionalStrictDate(value: unknown, fieldName: string): Date | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return parseStrictDate(value, fieldName);
}
