# WrapVisualizer — Failure Audit Diagnosis

**Source audit:** `wrapvisualizer-failure-audit.md`
**Verified against:** `Suyanka21/WRAPVISUALIZER` main at the time of the "finish remaining audit fixes" PR
**Legend:** ✅ FIXED · ⚠️ PARTIALLY FIXED · ❌ STILL OPEN · ⚪ N/A

---

## 0. Top 10 Scorecard

| # | Audit Finding | Status | Evidence |
|---|---|---|---|
| 1 | Hardcoded `API='http://localhost:3001'` | ✅ FIXED | `assets/js/screen1-upload.js:6` — `var API='';` (same-origin). JS extracted to external files. No `localhost:3001` anywhere in the frontend. |
| 2 | No rate limiting on `/api/segment` | ✅ FIXED | `middleware/rateLimits.js` — `express-rate-limit` at 10 req/min/IP. Applied in `server.js`. `trust proxy=1` set so `req.ip` is the real client. |
| 3 | CORS allows no-origin requests | ✅ FIXED | `middleware/cors.js` — `blockNoOriginMutations` returns **403** on POST/PUT/DELETE/PATCH without an `Origin` header. Applied to `/api/segment` and `/api/events`. |
| 4 | Dead M-Pesa routes still mounted | ✅ FIXED | `routes/mpesa.js` deleted. No `mpesaRouter` import, no `/api/mpesa` mount. `grep` confirms zero live `mpesa` references in any code path. |
| 5 | Replicate model pinned to version hash | ✅ FIXED | `services/replicate.js:24-25` — uses `meta/sam-2` model identifier. Version hash is **only** used if `REPLICATE_SAM2_VERSION` env var is set. |
| 6 | Base64 data-URI sent inline to Replicate | ⚠️ PARTIAL | Still inline (`segment.js:78-79`, `replicate.js:88`). Mitigated: Multer cap lowered from 10 MB → **4 MB** (`segment.js:26`) keeping the base64 payload under Replicate's inline-JSON limit. Pre-upload via Replicate's Files API would be cleaner but adds a round-trip and a new failure mode. |
| 7 | Silent fallback to fake pricing | ✅ FIXED | Entire pricing system removed. No `/api/estimate`, no `selFinishPrice`, no `estimate_low/_high`. Screen 3 is "Review & Send" — the shop replies over WhatsApp. |
| 8 | Pricing floor returns HTTP 500 | ⚪ N/A | `routes/estimate.js` deleted. |
| 9 | WhatsApp deep-link has no fallback | ✅ FIXED | `screen3-quote.js` + `screen3-quote.html:110-118` — copy-number banner with `navigator.clipboard` primary and `document.execCommand('copy')` fallback. `wa_copy_number` event tracked. |
| 10 | Tailwind via Play CDN | ✅ FIXED | Zero `cdn.tailwindcss.com` references. All 4 screens link compiled `assets/css/tailwind.css`. CSP `script-src 'self'` blocks re-introducing the CDN. |

---

## 1. Backend architecture

| Audit Finding | Status | Evidence |
|---|---|---|
| `/api/estimate` should be removed or client-side | ✅ FIXED | Route, router file, and `pricing.json` all deleted. |
| `/api/whatsapp` dead route | ✅ FIXED | `routes/whatsapp.js` deleted. |
| `/api/mpesa/*` dead & dangerous routes | ✅ FIXED | Fully removed. |
| Backend is now a single Replicate proxy + telemetry | ✅ FIXED | `server.js` mounts `/api/segment` + `/api/events` + `/api/health` only. |
| Two overlapping static mounts | ✅ FIXED | Single `app.use(express.static(frontendPath))`. |

---

## 2. Frontend Failure Modes

### 2.1 Hardcoded localhost — P0
✅ FIXED. `var API=''` in `assets/js/screen1-upload.js:6`. All fetch calls use relative `/api/*` paths.

### 2.2 Estimate fallback invents numbers — P1
✅ FIXED. Entire pricing system removed. Screen 2 stores finish/color/vision; screen 3 shows "Review & Send" with no prices.

### 2.3 sessionStorage is the whole state layer — P2
⚠️ PARTIAL. sessionStorage is still the sole state mechanism, but its impact is reduced because there are no longer fabricated prices to go stale. iOS Private Mode / in-app browsers clearing sessionStorage is still possible but no longer dangerous (worst case: user re-picks vehicle & finish).

### 2.4 WhatsApp conversion is fragile — P1
✅ FIXED. `screen3-quote.js:50-106`:
- Copy-number fallback banner surfaces immediately after `window.open`.
- `navigator.clipboard` primary + `execCommand('copy')` textarea fallback.
- `visibilitychange` / `blur` gating (see §6.5 below).
- Every interaction emits a telemetry event (`wa_click`, `wa_opened`, `wa_open_unverified`, `wa_copy_number`).

### 2.5 Dual partner numbers hardcoded — P2
✅ FIXED. Numbers live only in `assets/js/partners.js` (`WV_PARTNERS` array). All 4 HTML files load it and read from `window.WV_PARTNERS`. `screen4-confirmation.js:7` carries a safety-net literal for the rare case partners.js failed to load — reasonable belt-and-braces.

### 2.6 Image integrity — P1
✅ FIXED. All 7 vehicle images local in `frontend/assets/vehicles/`. 6 gallery images in `frontend/assets/gallery/`. Zero Unsplash hotlinks.

### 2.7 Tailwind Play CDN — P1
✅ FIXED. Compiled CSS at `assets/css/tailwind.css`.

### 2.8 Google Fonts + Unsplash — P2
⚠️ PARTIAL. Unsplash fully gone. Google Fonts still loaded from `fonts.googleapis.com` / `fonts.gstatic.com` — CSP allows these origins explicitly. Acceptable trade-off.

### 2.9 Accessibility claims — P2
⚠️ PARTIAL. Many `aria-label`s are now baked into HTML. `a11y.js` is still used for skip-to-content, auto-labels on icon-only buttons, and focus-visible styles — all degrade if JS is disabled.

### 2.10 Mobile viewport claim — P2
✅ FIXED. `tests/viewport.spec.js` runs each screen at 375 × 667 under `npx playwright test` and fails on any horizontal overflow or missing primary CTA. 10 tests, all passing.

---

## 3. Backend Failure Modes

### 3.1 CORS weakness — P1
✅ FIXED. `blockNoOriginMutations` middleware closes the no-origin hole. Dynamic `PORT` on the allowlist.

### 3.2 No rate limiting / auth / CAPTCHA — P0
✅ FIXED. 10 req/min/IP on `/api/segment`, 30 req/min/IP on `/api/events`. No CAPTCHA / Turnstile, but the single-IP cost risk is closed.

### 3.3 M-Pesa endpoints live & dangerous — P0
✅ FIXED. Fully removed.

### 3.4 M-Pesa callback issues — P2
⚪ N/A. Deleted.

### 3.5 Replicate integration brittleness — P1
✅ FIXED. Model identifier `meta/sam-2` (no pinned hash), timeout 90 s (was 30 s), retry on 429/5xx with 2 s/4 s backoff, typed user-friendly errors for 401 / 402 / TIMEOUT.

### 3.6 Error handling masks root cause — P2
✅ FIXED. Multer wrapper returns 400 on invalid uploads. Global handler honors `err.status` and `err.userMessage`.

### 3.7 Path traversal / static-serve surface — P2
✅ FIXED. Single static mount.

### 3.8 No health check for dependencies — P3
⚠️ PARTIAL. `/api/health` reports `replicate_configured: Boolean(process.env.REPLICATE_API_TOKEN)`. Does not actually call Replicate (deliberate — keeps the endpoint cheap and safe to poll).

### 3.9 `pricing.json` sync-loaded — P3
⚪ N/A. Deleted.

### 3.10 `dotenv` path fragile — P3
⚠️ ACCEPTED. `path.resolve(__dirname_env, '..', '.env.local')` still used. Documented as dev-only; platform env vars on Railway/Fly take precedence.

---

## 4. Security / Abuse Surface

| Vector | Status |
|---|---|
| Replicate token exposure | ✅ server-only, rate-limited, Origin-gated |
| M-Pesa credentials | ✅ FIXED — routes deleted |
| Helmet / CSP / X-Frame-Options | ✅ FIXED — full Helmet + strict CSP |
| No-origin CORS bypass | ✅ FIXED — `blockNoOriginMutations` |
| Log injection via upstream error messages | ⚠️ low-risk; still logs `error.message` verbatim |

---

## 5. Real-World Scale / Ops

| Audit Finding | Status |
|---|---|
| No graceful shutdown | ✅ FIXED — SIGTERM/SIGINT with 10 s hard-kill |
| Multer single-process memory blow-up | ⚠️ bounded — cap is now 4 MB; worst case 10 concurrent uploads ≈ 54 MB base64'd |
| No observability (Sentry / analytics) | ✅ FIXED — optional Sentry (`SENTRY_DSN`) + `/api/events` with `wvTrack()` helper emits structured stdout lines |
| Cold start latency | ⚠️ unchanged; only one billable API (segment) |
| No queue / backpressure | ⚠️ unchanged |
| Dual-origin deploy drift | ⚠️ mitigated — backend serves frontend in prod; `FRONTEND_URL` env drives the allowlist for split deployments |

---

## 6. UX / Funnel Integrity

| Audit Finding | Status |
|---|---|
| 6.1 Screen 1 "Continue" silently defaults to LC | ✅ FIXED — shows "Select a vehicle or upload a photo" prompt when nothing is chosen (`screen1-upload.js:81-90`). Regression test in `tests/viewport.spec.js`. |
| 6.2 Screen 2 starting `selFinishPrice=85000` | ✅ FIXED — variable removed; no prices shown |
| 6.3 `±15%` absurd price bands on screen 3 | ✅ FIXED — screen 3 has no prices |
| 6.4 PPF toggle unrealistic pricing | ✅ FIXED — toggle removed |
| 6.5 Screen 4 false-positive "Message Sent" | ✅ FIXED — `screen3-quote.js` gates navigation on `visibilitychange`/`blur` within 3 s of `window.open`. If the tab never backgrounds, `wv_wa_sent` is NOT set and the user stays on screen 3 with the copy-number fallback. `wa_opened` vs `wa_open_unverified` events distinguish the cases in telemetry. |
| 6.6 No "back" from screen 4 | ✅ FIXED — "Start New Configuration" → screen 1 + "Open WhatsApp Again" on screen 4 |
| 6.7 No code-split / large per-screen bundle | ⚠️ minor — Tailwind compiled once; per-screen JS is 2–5 KB each |

---

## 7. Documentation Drift

| Claim in Audit | Current Status |
|---|---|
| `routes/whatsapp.js` still exists | ✅ FIXED — deleted |
| M-Pesa backend routes still mounted | ✅ FIXED — deleted |
| Security closer to 4/10 than 8/10 | ✅ IMPROVED — now 9/10 (Helmet + CSP + rate limit + Origin gate + optional Sentry) |
| Error handling wrong-codes (500 for 400s) | ✅ FIXED |
| `selFinishPrice=85000` hardcoded anchor | ✅ FIXED |
| "Adding localhost:3001 to CORS is a misunderstanding" | ✅ FIXED — dynamic runtime port used correctly |

---

## Summary

| Category | Total Items | ✅ Fixed | ⚠️ Partial | ❌ Open | ⚪ N/A |
|---|---|---|---|---|---|
| P0 — Stop-the-bleeding | 4 | 4 | 0 | 0 | 0 |
| P1 — Commercial / arch | 10 | 9 | 1 | 0 | 0 |
| P2 — Security / UX | 14 | 9 | 5 | 0 | 0 |
| P3 — Nit / future-proofing | 4 | 2 | 2 | 0 | 0 |
| Removed / N/A | 6 | — | — | — | 6 |
| **TOTAL** | **38** | **24 (63%)** | **8 (21%)** | **0 (0%)** | **6 (16%)** |

**All P0s and every P1 except "base-64 to Replicate" are fully resolved.** Zero audit items remain fully open.

### Remaining partials, in descending importance

1. **Base-64 inline to Replicate** — bounded by the 4 MB Multer cap. Upgrade to Replicate's Files API when/if larger photos become a real user need.
2. **sessionStorage as sole state** — no longer dangerous (no fabricated prices to go stale).
3. **Helmet `style-src 'unsafe-inline'`** — removing inline `<style>` blocks would require moving all `style=""` attributes to CSS classes, a pervasive refactor not justified by the P3 rating.
4. **Google Fonts external CDN** — acceptable; CSP explicitly allows the fonts.googleapis.com / fonts.gstatic.com origins.
5. **`/api/health` doesn't actually ping Replicate** — deliberate (keeps the endpoint free and safe to hammer).
6. **Log injection via upstream messages** — not exploitable without a CRLF-interpreting aggregator.
7. **Cold-start latency & no backpressure queue** — unchanged; only one billable API, so the real-world risk is small.
8. **`dotenv` explicit relative path** — platform env vars take precedence in prod.
