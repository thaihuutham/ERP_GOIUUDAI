const ensure = (key: string, value: string) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
};

// Keep API tests deterministic regardless of local .env overrides.
ensure('NODE_ENV', 'test');
ensure('AUTH_ENABLED', 'true');
ensure('NEXT_PUBLIC_AUTH_ENABLED', 'true');
ensure('DEV_AUTH_BYPASS_ENABLED', 'false');
ensure('TENANCY_MODE', 'single');
ensure('DEFAULT_TENANT_ID', 'GOIUUDAI');
ensure('JWT_SECRET', 'test-jwt-secret-not-for-production');
ensure('PRISMA_SKIP_CONNECT', 'true');
