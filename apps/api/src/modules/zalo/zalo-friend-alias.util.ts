import { normalizeVietnamPhone } from '../../common/validation/phone.validation';

export function normalizeAliasPhone(input: unknown) {
  const normalized = normalizeVietnamPhone(String(input ?? '').trim());
  if (!normalized) {
    return null;
  }

  const compact = normalized.replace(/[^\d+]/g, '');
  if (!compact) {
    return null;
  }

  if (compact.startsWith('+84')) {
    return `0${compact.slice(3)}`;
  }
  if (compact.startsWith('84')) {
    return `0${compact.slice(2)}`;
  }
  return compact;
}

export function buildFriendAlias(displayNameInput: unknown, phoneInput: unknown) {
  const displayName = String(displayNameInput ?? '').replace(/\s+/g, ' ').trim();
  const normalizedPhone = normalizeAliasPhone(phoneInput);
  if (!displayName || !normalizedPhone) {
    return null;
  }

  const rawAlias = `${displayName} - ${normalizedPhone}`;
  if (rawAlias.length <= 80) {
    return rawAlias;
  }

  const maxNameLength = Math.max(1, 80 - (` - ${normalizedPhone}`).length);
  return `${displayName.slice(0, maxNameLength)} - ${normalizedPhone}`;
}
