import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, devices } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const testPort = Number(process.env.PLAYWRIGHT_PORT ?? process.env.PORT ?? 3100);
const testBaseUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  reporter: 'list',
  use: {
    baseURL: testBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    cwd: repoRoot,
    command: `NEXT_DEV_INSTANCE=e2e NEXT_PUBLIC_AUTH_ENABLED=false NEXT_PUBLIC_DEV_AUTH_BYPASS_ENABLED=true AUTH_ENABLED=false DEV_AUTH_BYPASS_ENABLED=true PORT=${testPort} npm run dev --workspace @erp/web`,
    url: testBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
