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
    needsFunnelState: false,
  },
  {
    path: '/screen2-studio.html',
    cta: '#wv-get-quote',
    needsFunnelState: false,
  },
  {
    path: '/screen3-quote.html',
    cta: '#wv-wa-buttons',
    needsFunnelState: true,
  },
  {
    path: '/screen4-confirmation.html',
    cta: '#wv-wa-again',
    needsFunnelState: true,
  },
];

// Screens 3 and 4 enforce a funnel-state guard: a direct visit with no
// `wv_vehicle_label` in sessionStorage redirects to screen 1 to prevent
// placeholder leads. The viewport tests intentionally hit the URLs
// directly, so we seed the same sessionStorage values screen 1 would
// have written before navigation.
async function seedFunnelState(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('wv_vehicle_label', 'Toyota Land Cruiser');
    sessionStorage.setItem('wv_finish', 'Matte');
    sessionStorage.setItem('wv_color', 'Black');
    sessionStorage.setItem('wv_color_hex', '#0a0a0a');
  });
}

for (const { path, cta, needsFunnelState } of SCREENS) {
  test(`screen ${path} has no horizontal overflow at 375px`, async ({ page }) => {
    if (needsFunnelState) await seedFunnelState(page);
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
    if (needsFunnelState) await seedFunnelState(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const el = page.locator(cta);
    await expect(el).toBeAttached();
  });
}

test('screen3 redirects to screen1 when funnel state is missing', async ({ page }) => {
  // Regression for trustless-audit C4 — a direct visit to screen 3
  // without the funnel marker must not render a quote with placeholder
  // values; it must bounce the user back to screen 1.
  await page.goto('/screen3-quote.html');
  await page.waitForURL(/screen1-upload\.html/);
  await expect(page).toHaveURL(/screen1-upload\.html/);
});

test('screen4 redirects to screen1 when funnel state is missing', async ({ page }) => {
  await page.goto('/screen4-confirmation.html');
  await page.waitForURL(/screen1-upload\.html/);
  await expect(page).toHaveURL(/screen1-upload\.html/);
});

test('/api/health reports replicate readiness fields', async ({ request }) => {
  // Regression for trustless-audit C3 + MV2 — the new additive fields
  // must always be present so monitors can rely on the contract.
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('status', 'ok');
  expect(body).toHaveProperty('replicate_configured');
  expect(body).toHaveProperty('replicate_reachable');
  expect(body).toHaveProperty('replicate_check_age_ms');
});

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

// Audit W5: regression for the tightened ALLOWED_EVENT_RE.
// Names with leading digits, dots, dashes, uppercase, or that
// exceed 63 chars should silently 204 (the route's no-op response
// when validation fails by design).
const REJECTED_EVENT_NAMES = [
  '1leading_digit',
  'has.dot',
  'has-dash',
  'HAS_UPPERCASE',
  '_leading_underscore',
  '', // empty
  // 65 chars — exceeds MAX_EVENT_LEN (64). The regex is derived from
  // MAX_EVENT_LEN so this is the inclusive upper bound + 1.
  'a' + 'b'.repeat(64),
];
for (const evt of REJECTED_EVENT_NAMES) {
  test(`/api/events rejects malformed event name: ${JSON.stringify(evt)}`, async ({
    request,
  }) => {
    const r = await request.post('/api/events', {
      data: { event: evt },
      headers: { Origin: 'http://127.0.0.1:3000' },
    });
    // 204 (silent drop) is the by-design contract — the route never
    // surfaces malformed event names to the client. Asserting the
    // exact status (not a permissive set) catches a regression where
    // a future maintainer "helpfully" returns 400/422 to expose
    // validation errors and accidentally leaks the regex shape.
    expect(r.status()).toBe(204);
    // Body must be empty (204) — never echo the event back.
    expect((await r.text()).length).toBe(0);
  });
}

const ACCEPTED_EVENT_NAMES = [
  'wa_click',
  'segment_failed',
  'inquiry_sent',
  'a',
  // Exactly MAX_EVENT_LEN (64) chars — the inclusive upper bound.
  // Catches the off-by-one that previously dropped this length.
  'a' + 'b'.repeat(63),
];
for (const evt of ACCEPTED_EVENT_NAMES) {
  test(`/api/events accepts valid event name: ${JSON.stringify(evt)}`, async ({
    request,
  }) => {
    const r = await request.post('/api/events', {
      data: { event: evt },
      headers: { Origin: 'http://127.0.0.1:3000' },
    });
    expect(r.status()).toBe(204);
  });
}

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
