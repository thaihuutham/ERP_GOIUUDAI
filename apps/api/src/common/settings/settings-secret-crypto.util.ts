import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const SETTINGS_SECRET_ENCRYPTION_ENV_KEY = 'SETTINGS_ENCRYPTION_MASTER_KEY';
const SETTINGS_SECRET_CIPHER_PREFIX = 'enc:v1:gcm:';
const IV_BYTE_LENGTH = 12;

export class SettingsSecretCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsSecretCryptoError';
  }
}

function cleanString(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function parseMasterKey(masterKeyRaw: unknown) {
  const source = cleanString(masterKeyRaw);
  if (!source) {
    throw new SettingsSecretCryptoError(
      `${SETTINGS_SECRET_ENCRYPTION_ENV_KEY} chưa được cấu hình.`
    );
  }

  let buffer: Buffer | null = null;
  if (/^[a-fA-F0-9]{64}$/.test(source)) {
    buffer = Buffer.from(source, 'hex');
  } else {
    const candidate = source.startsWith('base64:') ? source.slice('base64:'.length) : source;
    try {
      buffer = Buffer.from(candidate, 'base64');
    } catch {
      buffer = null;
    }
  }

  if (!buffer || buffer.length !== 32) {
    throw new SettingsSecretCryptoError(
      `${SETTINGS_SECRET_ENCRYPTION_ENV_KEY} phải là khóa 32-byte (hex 64 ký tự hoặc base64).`
    );
  }

  return buffer;
}

function encodePart(value: Buffer) {
  return value.toString('base64url');
}

function decodePart(value: string, label: string) {
  try {
    return Buffer.from(value, 'base64url');
  } catch {
    throw new SettingsSecretCryptoError(`Cipher payload không hợp lệ ở phần ${label}.`);
  }
}

export function isEncryptedSettingsSecret(value: unknown) {
  return cleanString(value).startsWith(SETTINGS_SECRET_CIPHER_PREFIX);
}

export function encryptSettingsSecret(plainValue: unknown, masterKeyRaw = process.env[SETTINGS_SECRET_ENCRYPTION_ENV_KEY]) {
  const plain = cleanString(plainValue);
  if (!plain) {
    return '';
  }
  if (isEncryptedSettingsSecret(plain)) {
    return plain;
  }

  const key = parseMasterKey(masterKeyRaw);
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SETTINGS_SECRET_CIPHER_PREFIX}${encodePart(iv)}.${encodePart(tag)}.${encodePart(encrypted)}`;
}

export function decryptSettingsSecret(cipherValue: unknown, masterKeyRaw = process.env[SETTINGS_SECRET_ENCRYPTION_ENV_KEY]) {
  const encoded = cleanString(cipherValue);
  if (!encoded) {
    return '';
  }
  if (!isEncryptedSettingsSecret(encoded)) {
    return encoded;
  }

  const payload = encoded.slice(SETTINGS_SECRET_CIPHER_PREFIX.length);
  const segments = payload.split('.');
  if (segments.length !== 3) {
    throw new SettingsSecretCryptoError('Cipher payload không hợp lệ.');
  }

  const iv = decodePart(segments[0], 'iv');
  const tag = decodePart(segments[1], 'tag');
  const body = decodePart(segments[2], 'ciphertext');
  if (iv.length !== IV_BYTE_LENGTH) {
    throw new SettingsSecretCryptoError('Cipher payload có iv không hợp lệ.');
  }

  const key = parseMasterKey(masterKeyRaw);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(body), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    throw new SettingsSecretCryptoError('Không thể giải mã secret. Kiểm tra master key.');
  }
}

export function getSettingsSecretEncryptionEnvKey() {
  return SETTINGS_SECRET_ENCRYPTION_ENV_KEY;
}
