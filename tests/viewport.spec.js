// @ts-check
import { test, expect } from '@playwright/test';
import http from 'node:http';

/**
 * 375 px viewport regression suite.
 *
 * Enforces the audit's P2 "mobile viewport claim" — every screen
 * must render without horizontal overflow at the iPhone-SE width
 * (375 × 667), and the primary above-the-fold CTAs must be present.
 */

const SCREENS = [
  {
    path: '/screen1-upload.html',
    cta: '#wv-init-btn',
  },
  {
    path: '/screen2-studio.html',
    cta: '#wv-get-quote',
  },
  {
    path: '/screen3-quote.html',
    cta: '#wv-wa-buttons',
  },
  {
    path: '/screen4-confirmation.html',
    cta: '#wv-wa-again',
  },
];

for (const { path, cta } of SCREENS) {
  test(`screen ${path} has no horizontal overflow at 375px`, async ({ page }) => {
    await page.goto(path);
    // Let fonts / CSS settle before measuring.
    await page.waitForLoadState('networkidle');

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
    }));

    // Allow 1 px rounding tolerance.
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.clientWidth).toBe(metrics.innerWidth);
  });

  test(`screen ${path} renders its primary CTA`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const el = page.locator(cta);
    await expect(el).toBeAttached();
  });
}

test('screen1 Continue button prompts when nothing is selected', async ({ page }) => {
  // Regression for audit §6.1 — clicking Continue with no vehicle and
  // no file must NOT silently navigate or default to Land Cruiser.
  await page.goto('/screen1-upload.html');
  await page.waitForLoadState('networkidle');
  const initBtn = page.locator('#wv-init-btn');
  await initBtn.click();
  // Should stay on screen 1 (no navigation) and relabel the button.
  await expect(page).toHaveURL(/screen1-upload\.html/);
  await expect(initBtn).toContainText(/Select a vehicle|upload a photo/i);
});

test('/api/events accepts valid event when Origin is set', async ({ request }) => {
  const ok = await request.post('/api/events', {
    data: { event: 'wa_click', props: { screen: 'test' } },
    headers: { Origin: 'http://127.0.0.1:3000' },
  });
  expect(ok.status()).toBe(204);
});

test('/api/events rejects POST with no Origin header', async () => {
  // Playwright's APIRequest always sets Origin, so go through Node's raw
  // http module to actually exercise the blockNoOriginMutations guard.
  const status = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ event: 'wa_click' });
    const req = http.request(
      {
        method: 'POST',
        host: '127.0.0.1',
        port: 3000,
        path: '/api/events',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  expect(status).toBe(403);
});
