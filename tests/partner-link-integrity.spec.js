// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Partner-link integrity suite.
 *
 * Trustless-audit CRITICAL-1 regression: a malformed window.WV_PARTNERS
 * (the array partners.js exports) used to slip past the `&&.length`
 * guard on screens 1, 3, and 4 and produce a `https://wa.me/undefined`
 * lead — silently killing the conversion funnel on every paid click.
 *
 * Strategy: override partners.js by inlining a polluted WV_PARTNERS via
 * page.addInitScript BEFORE any partners.js code runs, then assert that
 * every WhatsApp-button href / partner-side state on each screen is
 * either:
 *   - well-formed wa.me/2547XXXXXXXX (with optional ?text=… query), or
 *   - sourced from the per-screen WV_PARTNERS_FALLBACK (which is also
 *     2547XXXXXXXX by construction).
 *
 * The regex is the contract for GEMINI.md rule 5.
 */

const WAME_RE = /^https:\/\/wa\.me\/2547\d{8}(?:\?.*)?$/;

const FUNNEL_STATE = {
  wv_vehicle_label: 'Toyota Land Cruiser',
  wv_finish: 'Matte',
  wv_color: 'Black',
  wv_color_hex: '#0a0a0a',
};

/** Seed funnel state and override WV_PARTNERS before any screen script runs. */
async function seed(page, partners) {
  await page.addInitScript(
    ({ funnel, partners }) => {
      for (const [k, v] of Object.entries(funnel)) {
        sessionStorage.setItem(k, /** @type {string} */ (v));
      }
      // partners.js runs AFTER partners-validate.js, and re-assigns
      // window.WV_PARTNERS to its own validated array. To override,
      // we have to also stub partners.js out — easiest path is to
      // re-assign WV_PARTNERS in a second init script that runs after
      // DOMContentLoaded has fired. But for CRITICAL-1's regression
      // we want to test the validator's behavior on RAW data. The
      // cleanest way: replace window.WV_PARTNERS *after* partners.js
      // has self-sanitized, then verify that per-screen consumers
      // still re-validate via WV_PARTNER_VALIDATE.
      // We hook DOMContentLoaded to override AFTER partners.js runs,
      // BEFORE the per-screen consumer reads WV_PARTNERS.
      window.addEventListener(
        'DOMContentLoaded',
        () => {
          window.WV_PARTNERS = /** @type {any} */ (partners);
        },
        { once: true, capture: true },
      );
    },
    { funnel: FUNNEL_STATE, partners },
  );
}

const POLLUTED_LISTS = [
  { name: 'empty array', value: [] },
  { name: 'single empty object', value: [{}] },
  { name: 'array of nulls', value: [null, null] },
  { name: 'unnormalizable numbers', value: [{ number: 'abc' }, { number: '12345' }] },
  {
    name: 'mixed valid + invalid',
    value: [
      { number: 'abc' },
      {},
      { id: 'good', number: '0712345678', display: '+254 712 345 678', label: 'OK' },
    ],
  },
];

/** Collect every wa.me URL that the page currently exposes. */
async function collectWaUrls(page) {
  return page.evaluate(() => {
    const urls = new Set();
    // Anchor hrefs (menu overlay, screen2 contact links).
    document.querySelectorAll('a[href^="https://wa.me/"]').forEach((el) => {
      urls.add(/** @type {HTMLAnchorElement} */ (el).href);
    });
    // Buttons that expose data-href / data-wa-number for tests.
    document.querySelectorAll('button[data-wa-number]').forEach((el) => {
      const num = el.getAttribute('data-wa-number');
      if (num) urls.add('https://wa.me/' + num);
    });
    return Array.from(urls);
  });
}

for (const { name, value } of POLLUTED_LISTS) {
  test(`screen1 hero teaser builds well-formed wa.me URLs (${name})`, async ({ page }) => {
    await seed(page, value);
    await page.goto('/screen1-upload.html');
    await page.waitForLoadState('networkidle');
    // Click each teaser button, intercept window.open, and assert URL.
    const captured = await page.evaluate(() => {
      /** @type {string[]} */
      const out = [];
      const orig = window.open;
      window.open = function (url) {
        if (typeof url === 'string') out.push(url);
        return null;
      };
      document.querySelectorAll('#wv-teaser-buttons button').forEach((b) => {
        /** @type {HTMLButtonElement} */ (b).click();
      });
      window.open = orig;
      return out;
    });
    expect(captured.length).toBeGreaterThan(0);
    for (const url of captured) {
      expect(url).toMatch(WAME_RE);
    }
  });

  test(`screen3 review buttons build well-formed wa.me URLs (${name})`, async ({ page }) => {
    await seed(page, value);
    await page.goto('/screen3-quote.html');
    await page.waitForLoadState('networkidle');
    const captured = await page.evaluate(() => {
      /** @type {string[]} */
      const out = [];
      const orig = window.open;
      window.open = function (url) {
        if (typeof url === 'string') out.push(url);
        return null;
      };
      document.querySelectorAll('#wv-wa-buttons button').forEach((b) => {
        /** @type {HTMLButtonElement} */ (b).click();
      });
      window.open = orig;
      return out;
    });
    expect(captured.length).toBeGreaterThan(0);
    for (const url of captured) {
      expect(url).toMatch(WAME_RE);
    }
  });

  test(`screen4 "chat again" builds well-formed wa.me URL (${name})`, async ({ page }) => {
    await seed(page, value);
    await page.goto('/screen4-confirmation.html');
    await page.waitForLoadState('networkidle');
    const captured = await page.evaluate(() => {
      /** @type {string[]} */
      const out = [];
      const orig = window.open;
      window.open = function (url) {
        if (typeof url === 'string') out.push(url);
        return null;
      };
      const btn = document.getElementById('wv-wa-again');
      if (btn) /** @type {HTMLButtonElement} */ (btn).click();
      window.open = orig;
      return out;
    });
    expect(captured.length).toBe(1);
    expect(captured[0]).toMatch(WAME_RE);
  });
}

test('partners.js menu-overlay links are well-formed under valid partners', async ({ page }) => {
  // No override — exercise the actual partners.js source data path.
  await page.addInitScript((funnel) => {
    for (const [k, v] of Object.entries(funnel)) {
      sessionStorage.setItem(k, /** @type {string} */ (v));
    }
  }, FUNNEL_STATE);
  await page.goto('/screen3-quote.html');
  await page.waitForLoadState('networkidle');
  const urls = await collectWaUrls(page);
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) {
    expect(url).toMatch(WAME_RE);
  }
});

test('shared validator: WV_PARTNER_VALIDATE is loaded on every screen', async ({ page }) => {
  for (const path of [
    '/screen1-upload.html',
    '/screen2-studio.html',
    '/screen3-quote.html',
    '/screen4-confirmation.html',
  ]) {
    await page.addInitScript((funnel) => {
      for (const [k, v] of Object.entries(funnel)) {
        sessionStorage.setItem(k, /** @type {string} */ (v));
      }
    }, FUNNEL_STATE);
    await page.goto(path);
    await page.waitForLoadState('domcontentloaded');
    const present = await page.evaluate(() => {
      const v = /** @type {any} */ (window).WV_PARTNER_VALIDATE;
      return (
        v &&
        typeof v.normalizePartnerNumber === 'function' &&
        typeof v.validatePartner === 'function' &&
        typeof v.validatePartners === 'function'
      );
    });
    expect(present, `WV_PARTNER_VALIDATE on ${path}`).toBeTruthy();
  }
});
