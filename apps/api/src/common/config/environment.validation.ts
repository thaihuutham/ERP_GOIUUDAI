type EnvInput = Record<string, unknown>;

const TRUE_VALUES = new Set(['1', 'true', 'yes']);
const FALSE_VALUES = new Set(['0', 'false', 'no']);
const DISALLOWED_JWT_SECRETS = new Set([
  '',
  'change_me_to_a_long_secret',
  'replace_me_with_secure_jwt_secret',
  'replace_with_secure_jwt_secret'
]);

function readString(input: EnvInput, key: string, fallback = ''): string {
  const raw = input[key];
  if (raw === undefined || raw === null) {
    return fallback;
  }
  return String(raw).trim();
}

function readBoolean(input: EnvInput, key: string, fallback: boolean, errors: string[]): boolean {
  const raw = readString(input, key, '');
  if (!raw) {
    return fallback;
  }

  const normalized = raw.toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  errors.push(`${key} must be a boolean value (true/false/1/0/yes/no).`);
  return fallback;
}

export function validateEnvironment(input: EnvInput): EnvInput {
  const errors: string[] = [];

  const nodeEnv = readString(input, 'NODE_ENV', 'development').toLowerCase();
  const isProduction = nodeEnv === 'production';
  const authEnabled = readBoolean(input, 'AUTH_ENABLED', true, errors);
  const webAuthEnabled = readBoolean(input, 'NEXT_PUBLIC_AUTH_ENABLED', true, errors);
  const permissionEngineEnabled = readBoolean(input, 'PERMISSION_ENGINE_ENABLED', true, errors);
  const devAuthBypassEnabled = readBoolean(input, 'DEV_AUTH_BYPASS_ENABLED', false, errors);
  const jwtSecret = readString(input, 'JWT_SECRET', '');

  if (isProduction && !authEnabled) {
    errors.push('AUTH_ENABLED=false is not allowed in production.');
  }

  if (isProduction && devAuthBypassEnabled) {
    errors.push('DEV_AUTH_BYPASS_ENABLED=true is not allowed in production.');
  }

  if (!authEnabled && !devAuthBypassEnabled) {
    errors.push(
      'AUTH_ENABLED=false requires DEV_AUTH_BYPASS_ENABLED=true (explicit dev-only bypass).'
    );
  }

  if (authEnabled && devAuthBypassEnabled) {
    errors.push(
      'DEV_AUTH_BYPASS_ENABLED=true cannot be combined with AUTH_ENABLED=true.'
    );
  }

  if (isProduction && authEnabled && !permissionEngineEnabled) {
    errors.push('PERMISSION_ENGINE_ENABLED=false is not allowed in production when auth is enabled.');
  }

  if (isProduction && authEnabled !== webAuthEnabled) {
    errors.push('AUTH_ENABLED and NEXT_PUBLIC_AUTH_ENABLED must match in production.');
  }

  if (authEnabled && DISALLOWED_JWT_SECRETS.has(jwtSecret.toLowerCase())) {
    errors.push('JWT_SECRET must be set to a secure non-placeholder value when AUTH_ENABLED=true.');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }

  return {
    ...input,
    NODE_ENV: nodeEnv,
    AUTH_ENABLED: String(authEnabled),
    NEXT_PUBLIC_AUTH_ENABLED: String(webAuthEnabled),
    PERMISSION_ENGINE_ENABLED: String(permissionEngineEnabled),
    DEV_AUTH_BYPASS_ENABLED: String(devAuthBypassEnabled)
  };
}
