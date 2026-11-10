import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.NEX_E2E_PORT ?? 3101);
const HOST = process.env.NEX_E2E_HOST ?? 'localhost';
const REUSE_EXISTING = process.env.NEX_E2E_REUSE === '1';
const NO_ARTIFACTS = process.env.NEX_E2E_NO_ARTIFACTS === '1';
const chromePath = process.env.NEX_E2E_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results/playwright',
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    headless: true,
    // Tracing snapshots the DOM inside the page on every action and the video encodes every frame;
    // both cost main-thread time. Latency measurements switch them off (NEX_E2E_NO_ARTIFACTS=1).
    trace: NO_ARTIFACTS ? 'off' : 'retain-on-failure',
    screenshot: NO_ARTIFACTS ? 'off' : 'only-on-failure',
    video: NO_ARTIFACTS ? 'off' : 'retain-on-failure',
    launchOptions: {
      executablePath: chromePath,
      args: ['--no-sandbox'],
    },
  },
  projects: [
    {
      name: 'smoke',
      grep: /@smoke/,
    },
    {
      name: 'regression',
      grepInvert: /@smoke/,
    },
  ],
  webServer: {
    command: `npx next dev --webpack --hostname 127.0.0.1 --port ${PORT}`,
    url: `http://${HOST}:${PORT}`,
    reuseExistingServer: REUSE_EXISTING,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
  },
});
