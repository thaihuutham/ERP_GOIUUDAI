import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildReminderDedupeKey,
  computeReminderDueAt,
  computeRenewalBaseDate,
  resolveTelecomTermDays
} from '../src/modules/crm/crm-renewal.util';

describe('crm-renewal.util', () => {
  it('maps telecom terms to fixed day durations', () => {
    expect(resolveTelecomTermDays('1m')).toBe(30);
    expect(resolveTelecomTermDays('3m')).toBe(90);
    expect(resolveTelecomTermDays('6m')).toBe(180);
    expect(resolveTelecomTermDays('7m')).toBe(210);
    expect(resolveTelecomTermDays('12m')).toBe(360);
    expect(resolveTelecomTermDays('14m')).toBe(420);
    expect(resolveTelecomTermDays('24m')).toBe(720);
    expect(resolveTelecomTermDays(180)).toBe(180);
    expect(resolveTelecomTermDays('')).toBeNull();
  });

  it('computes renewal from max(currentExpiryAt, transactionDate) + termDays', () => {
    const currentExpiryAt = new Date('2026-05-10T00:00:00.000Z');
    const transactionDate = new Date('2026-04-01T00:00:00.000Z');
    const base = computeRenewalBaseDate(currentExpiryAt, transactionDate);
    const nextExpiry = addDays(base, 90);

    expect(base.toISOString()).toBe('2026-05-10T00:00:00.000Z');
    expect(nextExpiry.toISOString()).toBe('2026-08-08T00:00:00.000Z');
  });

  it('computes reminder due date and dedupe key deterministically', () => {
    const endsAt = new Date('2026-12-31T00:00:00.000Z');
    const dueAt = computeReminderDueAt(endsAt, 30);
    const dedupeKey = buildReminderDedupeKey('GOIUUDAI', 'contract_1', '2026-12-01');

    expect(dueAt.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(dedupeKey).toBe('GOIUUDAI:contract_1:2026-12-01');
  });
});
