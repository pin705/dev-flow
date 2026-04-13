import { defineConfig } from '@playwright/test';

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  reporter: 'list',
  workers: 1,
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  webServer: {
    command: `pnpm --dir apps/web exec next start --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DIFFMINT_DISABLE_CLERK: 'true',
      NEXT_PUBLIC_DIFFMINT_DISABLE_CLERK: 'true',
      NEXT_TELEMETRY_DISABLED: '1'
    }
  }
});
