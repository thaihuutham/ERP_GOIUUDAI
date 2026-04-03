import { describe, expect, it } from 'vitest';
import {
  decryptSettingsSecret,
  encryptSettingsSecret,
  getSettingsSecretEncryptionEnvKey,
  isEncryptedSettingsSecret
} from '../src/common/settings/settings-secret-crypto.util';

const MASTER_KEY = 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=';

describe('settings-secret-crypto util', () => {
  it('encrypts and decrypts plaintext secret with AES-256-GCM', () => {
    const encrypted = encryptSettingsSecret('my-secret-value', MASTER_KEY);
    expect(isEncryptedSettingsSecret(encrypted)).toBe(true);

    const decrypted = decryptSettingsSecret(encrypted, MASTER_KEY);
    expect(decrypted).toBe('my-secret-value');
  });

  it('passes through plaintext in decrypt for non-prefixed values', () => {
    expect(decryptSettingsSecret('plain-value', MASTER_KEY)).toBe('plain-value');
  });

  it('throws when encryption key is missing', () => {
    expect(() => encryptSettingsSecret('abc', '')).toThrow(getSettingsSecretEncryptionEnvKey());
  });
});
