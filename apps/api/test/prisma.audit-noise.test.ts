import { describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';

describe('PrismaService audit noise filters', () => {
  it('skips updateMany/deleteMany when count is zero', () => {
    const subject = Object.create(PrismaService.prototype) as any;

    expect(subject['shouldSkipWriteNoise']('updateMany', { count: 0 })).toBe(true);
    expect(subject['shouldSkipWriteNoise']('deleteMany', { count: 0 })).toBe(true);
    expect(subject['shouldSkipWriteNoise']('updateMany', { count: 2 })).toBe(false);
    expect(subject['shouldSkipWriteNoise']('create', { count: 0 })).toBe(false);
  });
});
