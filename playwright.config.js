// @ts-check
import { defineConfig } from '@playwright/test';

/**
 * Playwright config.
 *
 * We run one project at the 375 × 667 viewport (iPhone-SE baseline) to
 * enforce GEMINI.md rule 8: every screen must work on a 375 px Android
 * Chrome viewport. The test suite boots the backend on port 3001 (same
 * process used in production) and checks each screen for horizontal
 * overflow + critical element visibility.
 *
 * Run locally: `npx playwright test`
 */

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-375',
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    },
  ],
  webServer: {
    command: 'node backend/server.js',
    url: 'http://127.0.0.1:3001/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      // Silence the "REPLICATE_API_TOKEN missing" warning during tests;
      // /api/segment isn't exercised by the viewport suite.
      REPLICATE_API_TOKEN: 'test-token-not-used-by-viewport-tests',
    },
  },
});
