import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, hashPassword, validatePasswordByPolicy, verifyPassword } from '../src/common/auth/password.util';

describe('password.util', () => {
  it('hashes and verifies password correctly', async () => {
    const plain = 'TempPass123!';
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    await expect(verifyPassword(plain, hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-pass', hash)).resolves.toBe(false);
  });

  it('generates temporary password with expected length', () => {
    const value = generateTemporaryPassword(14);
    expect(value).toHaveLength(14);
  });

  it('validates password by policy', () => {
    const policy = {
      minLength: 8,
      requireUppercase: true,
      requireNumber: true,
      requireSpecial: true
    };

    expect(validatePasswordByPolicy('Abc12345!', policy)).toEqual([]);
    expect(validatePasswordByPolicy('abc12345', policy).length).toBeGreaterThan(0);
  });
});

