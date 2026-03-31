import bcrypt from 'bcryptjs';

export type PasswordPolicy = {
  minLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
};

const DEFAULT_SALT_ROUNDS = 10;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, DEFAULT_SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string) {
  if (!hash) {
    return false;
  }
  return bcrypt.compare(password, hash);
}

export function generateTemporaryPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let password = '';
  while (password.length < length) {
    const index = Math.floor(Math.random() * chars.length);
    password += chars[index];
  }
  return password;
}

export function validatePasswordByPolicy(password: string, policy: PasswordPolicy) {
  const errors: string[] = [];
  const normalized = String(password ?? '');

  if (normalized.length < policy.minLength) {
    errors.push(`Mật khẩu phải có ít nhất ${policy.minLength} ký tự.`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(normalized)) {
    errors.push('Mật khẩu phải có ít nhất 1 chữ in hoa.');
  }
  if (policy.requireNumber && !/[0-9]/.test(normalized)) {
    errors.push('Mật khẩu phải có ít nhất 1 chữ số.');
  }
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(normalized)) {
    errors.push('Mật khẩu phải có ít nhất 1 ký tự đặc biệt.');
  }

  return errors;
}
