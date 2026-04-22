# WrapVisualizer — Failure-Mode Audit

**Role:** Failure-mode auditor. No rewrites, no new features, no refactors.
**Scope:** Frontend + backend as shipped in `Suyanka21/WRAPVISUALIZER` (main, depth=1 clone).
**Objective:** Identify where this system will break under real-world conditions.

Ratings use severity × likelihood:
- **P0 — will break in production, near-certain**
- **P1 — will break under realistic conditions (abuse, scale, real devices)**
- **P2 — degraded UX, long-tail, or reputational**
- **P3 — nit / future-proofing**

---

## 0. TL;DR — Top 10 ways this breaks

1. **`API='http://localhost:3001'` is hardcoded in `screen1-upload.html:293` and `screen2-studio.html:244`.** The deployed site on Vercel/Railway will call localhost from the user's browser → every estimate/segmentation call fails. Currently masked by silent fallbacks. **P0.**
2. **No rate limiting anywhere.** `/api/segment` calls Replicate (billable, ~$/call). A single curl loop from one IP drains the Replicate account. No IP throttle, no auth, no CAPTCHA, no per-session quota. **P0 for cost.**
3. **CORS allows requests with `no origin` (file://, curl, Postman, mobile WebView, scrapers).** Combined with #2, the "CORS protection" is cosmetic against abuse. **P1.**
4. **Dead M-Pesa code path still live.** `routes/mpesa.js` is mounted at `/api/mpesa/*` in `server.js:90`, even though `PROJECT_STATUS.md §5.P1.4` says M-Pesa was removed. Anyone can hit `/api/mpesa/initiate` with any phone number → Safaricom sends STK prompts to arbitrary Kenyans on behalf of the shop. **P0 (abuse, reputation, possibly legal).**
5. **Replicate model pinned to a specific version hash** (`replicate.js:11`). Replicate deprecates versions; the day Meta/Replicate retires `fe97b453…`, segmentation returns 404 silently and users get the generic "Image processing failed" message forever. **P1.**
6. **Base64 data-URI sent as JSON body to Replicate.** `replicate.js:50-69` inlines the full image into the JSON payload. A 10 MB upload (Multer cap) becomes ~13.5 MB base64 in memory, then again in the outbound HTTPS body — hits Replicate's input limits and blows Railway's memory on concurrent requests. **P1.**
7. **Silent fallback to fake pricing when the estimate API fails.** `screen2-studio.html:334-358` catches both `success:false` and network errors and invents `estimate_low/estimate_high` from a stale client-side `selFinishPrice`. Backend pricing changes never reach users whose calls are blocked; users on file:// see made-up numbers they think came from the shop. **P1 (commercial trust).**
8. **Pricing floor check returns HTTP 500 with "Pricing error. Please contact support."** `estimate.js:94-99` — a legitimate sub-50,000 KES quote (small car + gloss, no add-ons) looks like a server crash to the user, and triggers the fallback in #7. **P2.**
9. **WhatsApp deep-link conversion has no fallback.** `wa.me` on desktop Chrome without WhatsApp Desktop just opens a web.whatsapp.com page that requires a QR scan; iOS Safari with WhatsApp uninstalled opens App Store. No telemetry, no copy-the-number fallback, no email/SMS option. Your entire conversion funnel is one deep-link that fails silently. **P1.**
10. **Tailwind via CDN on all 4 screens** (`cdn.tailwindcss.com?plugins=forms,container-queries`). CDN outage = every page renders unstyled. Per Tailwind's own docs, the Play CDN is explicitly **not for production**. **P1 (availability + perf).**

---

## 1. "Does it need a backend?" — concrete answer

**Not as it stands. The backend is ~80% removable today.** Here is the actual dependency matrix:

| Current backend endpoint | Does the frontend actually use it? | Needs server? | Evidence |
|---|---|---|---|
| `GET /` → screen1 | Yes (if deployed on Railway) | No — Vercel can serve static HTML | `server.js:79-82` |
| `GET /api/health` | No | No | not called anywhere |
| `POST /api/estimate` | **Yes**, `screen2-studio.html:306` | **No — pricing is static JSON** | calc is pure data lookup × multiplier; ship `pricing.json` to frontend |
| `POST /api/segment` | Yes (optional, swallowed on failure), `screen1-upload.html:356` | **Yes — only to hide `REPLICATE_API_TOKEN`** | the *only* thing requiring a server |
| `GET /api/whatsapp` | **No** | No | screen3 builds `wa.me` URLs client-side (`screen3-quote.html:281`); PROJECT_STATUS §5.P1.3 admits this |
| `POST /api/mpesa/*` | **No** (removed from UI) | **No — should be deleted**, not just unused | dead & dangerous; still mounted |

**So: you need exactly one serverless function — a Replicate proxy** — and nothing else. Everything else is static. Current architecture pays for a full Railway Node process to hide one API key and run arithmetic that belongs in the browser.

Corollary failure modes of keeping the backend:
- Two deployment targets (Vercel frontend + Railway backend) × two env files × two CORS origins → one of them will drift and break the other.
- A cold Railway dyno adds 1-3s to the first `/api/estimate` call → users abandon before the quote renders.
- Keeping an Express server open as your only API invites scope creep (mpesa.js is Exhibit A).

---

## 2. Frontend failure modes

### 2.1 Hardcoded localhost — P0
- `screen1-upload.html:293` and `screen2-studio.html:244`:
  ```js
  var API='http://localhost:3001';
  ```
  Ships to production as-is. No env substitution, no build step, no `window.location.origin`. On any domain other than `localhost`, both `fetch(API+...)` calls fail.
- It's **masked** because both callers silently catch errors: segmentation is fire-and-forget (`screen1:359`), and estimate falls back to a fabricated number (`screen2:348-358`). So the app "works" — but with fake prices and no AI segmentation. Worst kind of failure: silent and confident.
- Additionally: if you do deploy the backend at an HTTPS URL, `http://localhost:3001` on a TLS-served page is a **mixed-content block** — browser refuses the call before network even happens.

### 2.2 Estimate fallback invents numbers — P1
`screen2-studio.html:334-358` — on both `success:false` and network error, the client synthesizes:
```
estimate_low = selFinishPrice          // e.g. 4500 for Satin
estimate_high = selFinishPrice * 1.4
```
That's price-**per-sqm** being shown as total cost, then ±15% banded on screen 3 (`screen3:234-238`). The user can see a "KES 4,500 – KES 6,300" quote for a Land Cruiser satin wrap — off by ~20×. WhatsApp message sent to the partner (`screen3:261-273`) includes this bogus range, which the shop then has to correct on the phone. **Commercial damage.**

### 2.3 sessionStorage is the whole state layer — P2
- Reload on screen 2/3 without going through screen 1 → `wv_vehicle_id` missing → defaults to Land Cruiser. Quote is silently wrong.
- iOS Safari in private mode caps sessionStorage writes; some Android WebViews (in-app browsers from WhatsApp, Facebook) clear sessionStorage between redirects.
- Opening WhatsApp from screen 3 on mobile **backgrounds Safari**; when user returns they land on screen 4, but if they close the tab and reopen the site, sessionStorage is gone → flow restart.

### 2.4 WhatsApp conversion is fragile — P1
- Desktop Chrome w/o WhatsApp Desktop → web.whatsapp.com QR scan. Non-obvious to a desktop shopper.
- iOS w/o WhatsApp → App Store. User never gets back.
- Android in-app browsers (Instagram, FB, TikTok) frequently strip `target="_blank"` and open WhatsApp inside the in-app browser shell, which then can't hand off to the native app.
- No `click`-level analytics, no "copy number" fallback, no email/SMS alt. If deep-links fail for 10% of users, you will never know.
- Emojis (`🚗 🎨 ✨` etc.) in the pre-filled message are URL-encoded into the `wa.me/…?text=…` URL. On older Android WhatsApp builds this has been reported to truncate or mangle the message. Low risk, but it's in screen3:261-273 too.

### 2.5 Dual partner numbers — P2
- Both `254705040033` and `254700419444` are **hardcoded in four HTML files** (screens 1, 2, 3, 4). Changing a partner number requires editing 8+ string literals across 4 files. Guaranteed drift the first time one partner leaves.
- No "which partner is on duty" logic; both numbers buzz on every lead → duplicate responses or worse, neither partner picks up because each thinks the other will.

### 2.6 Image integrity — P1 (already documented)
`docs/car-image-inconsistencies.md` says **7/7 template-card vehicle photos are wrong** (2 are 404s, 1 is a portrait of an elderly woman). This is the first thing a user sees on screen 1. No CSP or `onerror` fallback — broken images just show alt text. The doc exists; no fix exists.

### 2.7 Tailwind Play CDN — P1
- `<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries">` on all 4 screens.
- Official Tailwind docs: *"The Play CDN is designed for development purposes… We don't recommend using it in production."*
- Flash of Unstyled Content (FOUC) on every load while the CDN script parses.
- Kenyan mobile networks (Safaricom 3G in low-signal areas) add 1-3s to this. Lighthouse mobile perf will tank.
- **Availability risk:** cdn.tailwindcss.com outage → entire UI is plain HTML.

### 2.8 Google Fonts + Unsplash — P2
- All hero/template images fetched from `images.unsplash.com`. Unsplash rate-limits hotlinking; at scale they'll 429 your thumbnails or strip them. You do not own your own marketing photos.
- Google Fonts is blocked in some corporate networks and throttled in parts of China/Iran. Not your target market, but any PR post from a tech blog there breaks.

### 2.9 Accessibility claims don't match reality — P2
- PROJECT_STATUS says a11y: 7/10 and "✅ ARIA labels, keyboard nav, focus-visible". `a11y.js` is a 75-line shim that monkey-patches aria-labels at runtime based on icon text. If JS fails to load, **every button is unlabeled to screen readers**. That's a regression from doing nothing.
- `div[role=button]` added via JS (a11y.js:36-45) — fine, but clickable `<div>`s with no native semantics were the problem in the first place.
- "Skip to content" link injected by JS — disappears without JS.

### 2.10 Mobile viewport claim — P2
GEMINI.md rule 8: *"every function must work on a 375px viewport Android Chrome"*. No tests, no Playwright, no screenshots committed for 375px. PROJECT_STATUS §5.P2.12 admits real-device testing is pending. Claim is unverified.

---

## 3. Backend failure modes

### 3.1 CORS is weaker than it looks — P1
`server.js:42-65`:
```js
if (!origin) return callback(null, true);  // allow no-origin
```
- `curl`, Postman, native mobile apps, `file://` → pass.
- Browser same-origin `POST` from an attacker's page? That *is* gated by `allowedOrigins`, good.
- But the threat model isn't just browsers — it's abuse bots. **A 3-line Node script hitting `/api/segment` in a loop has no Origin header → unlimited access**. Your Replicate bill is one `while true` away.
- `credentials: true` combined with `origin: (origin, cb) => cb(null, true)` when `!origin` is a known CORS anti-pattern; harmless here only because you don't use cookies.

### 3.2 No rate limiting, no auth, no CAPTCHA — P0 (cost)
- `/api/segment` costs real money per call. No `express-rate-limit`, no `helmet`, no IP throttle, no per-session token, no CAPTCHA on screen 1, no quota per REPLICATE token.
- A single script with a 1 MB JPEG in a loop = unbounded spend. You will find out about this only via your Replicate invoice.
- `/api/estimate` is cheap but can be used to scrape your pricing model (vehicle × finish × brand matrix) — trivial competitive recon.

### 3.3 M-Pesa endpoints are live & dangerous — P0
- `server.js:90` still mounts `mpesaRouter`.
- `POST /api/mpesa/initiate` requires only `{phone, amount, ref}` in the body. No auth, no CORS-sensitive preflight (it's JSON, so it *is* preflighted — but see 3.1, curl bypasses).
- Attacker posts `{phone: "2547XXXXXXXX", amount: 1, ref: "spam"}` repeatedly → Safaricom sends STK Push prompts to arbitrary numbers *from your shop's paybill/shortcode*. This is **SMS-spam-via-M-Pesa**, which Safaricom takes seriously and can deactivate the merchant for.
- Only saved by the fact that `MPESA_PASSKEY` / `MPESA_CONSUMER_KEY` are probably not set in prod (route returns 500 early). That is configuration-dependent — one day someone sets them to "test the old flow" and now it's live.
- **Delete the route mount and the route files.** They shouldn't ship with a product that declares M-Pesa removed.

### 3.4 M-Pesa callback accepts malformed payloads silently — P2 (if ever re-enabled)
`mpesa.js:153-196`:
- No signature verification of Safaricom callback (Daraja doesn't sign, but you should at least IP-allowlist Safaricom's callback ranges).
- Logs success/failure to stdout only — no DB, no idempotency key storage. Same `CheckoutRequestID` can be "processed" many times.
- Always returns 200 even on parse failure (`mpesa.js:159-161`) — silent data loss.

### 3.5 Replicate integration brittleness — P1
`services/replicate.js`:
- **Version pin** (`SAM2_VERSION = 'fe97b453...'`, line 11). Replicate version hashes are immutable but the *model* gets deprecated. When it does, you get a 404 with no friendly fallback.
- **No retry on 429/5xx.** Replicate's own docs say transient 5xx are expected; you surface them as "Image processing failed."
- **Hard 30s timeout in the poller** (line 20). SAM-2 on a cold worker can legitimately take 40-60s. Frontend then sees 503 "AI processing is taking longer than usual"; user retries, doubling your bill.
- **Prefer: wait header** is used (line 66) — good — but falls through to `prediction.urls.get` polling. If the initial POST ever returns a 202 with no `urls.get` (rare but observed), line 83 throws "Replicate did not return a polling URL" → user sees the generic 500.
- **Data URI input** — Replicate's input limits documented at ~256KB for JSON-embedded images; larger inputs *should* use a pre-uploaded URL. You will hit silent 413s on larger phone photos (modern Android phones shoot 3-6 MB JPEGs; 10 MB Multer cap is too lenient for this code path).

### 3.6 Error handling masks root cause — P2
- `estimate.js:94-99` returns HTTP 500 for a *valid* calculation under 50,000 KES. That's a business-logic guard, not a server error. Clients treat 500 as transient and retry; the logic will never pass.
- Multer file-type filter throws `new Error('Only JPEG...')` (segment.js:30) — by default Multer surfaces this as a 500 via the global handler (`server.js:127-146`), not the 400 it should be. User sees "Something went wrong on our end."
- Global handler strips `err.stack` — good for users, but there is **no structured logging** (no request ID, no user agent). Debugging a production incident means grepping Railway logs by timestamp.

### 3.7 Path traversal / static-serve surface — P2
`server.js:77-78`:
```js
app.use('/frontend', express.static(frontendPath));
app.use(express.static(frontendPath));
```
Two overlapping static mounts. Doesn't hurt, but means `/screen1-upload.html` and `/frontend/screen1-upload.html` both work — duplicate canonical URLs hurt SEO. No dotfile protection (`dotfiles: 'ignore'` default in Express 4 is safe; worth stating).

### 3.8 No health check for dependencies — P3
`/api/health` returns `{status: 'ok'}` unconditionally (server.js:96-103). Doesn't ping Replicate, doesn't validate `REPLICATE_API_TOKEN` is set, doesn't check `pricing.json` loaded. Railway marks the box healthy even when every feature is broken.

### 3.9 `pricing.json` loaded synchronously once at boot — P3
`estimate.js:23`: `JSON.parse(readFileSync(…))`. Pricing is baked into the dyno. Changing a price = redeploy. Fine for this stage, but it's not a pricing *system*, it's a committed constant.

### 3.10 `dotenv` path is fragile — P3
`server.js:22`: `dotenv.config({ path: path.resolve(__dirname_env, '..', '.env.local') })`. On Railway/Docker you usually get env vars from the platform, not a file. If the file doesn't exist, dotenv is silent. If it exists but shadows the platform env (unlikely but possible depending on Docker build order), you deploy with stale values. Prefer plain `dotenv.config()` in dev and pure platform env in prod.

---

## 4. Security / abuse surface

| Vector | Exposure | Severity |
|---|---|---|
| Replicate API token | server-only via `REPLICATE_API_TOKEN`. **Good.** But unlimited use by anyone who reaches `/api/segment`. | P0 (cost, see 3.2) |
| M-Pesa credentials | server-only. Route is alive & unauth'd. | P0 (see 3.3) |
| Shop WhatsApp numbers | hardcoded in frontend HTML. Not secret. Intended. Scrape-able for spam against the shop. | P2 |
| Pricing model | exposed via `/api/estimate` brute-force. | P3 |
| Path traversal | none observed. | — |
| XSS in vision prompt | frontend never renders user input into innerHTML; `sessionStorage` only. Backend doesn't render HTML from input. **Clean.** | — |
| CSRF | no cookies/auth; no state-changing authenticated endpoints. **Not applicable.** | — |
| Helmet / security headers | **none.** No `X-Content-Type-Options`, no `X-Frame-Options`, no `Referrer-Policy`, no CSP. Your site can be iframed and click-jacked. | P2 |
| Log injection | `console.error('[Segment Error]', error.message, detail || '')` — `error.message` can contain CRLF from a crafted upstream response. Not exploitable without a log aggregator that interprets CRLF. | P3 |

---

## 5. Real-world scale / ops failure modes

1. **Cold start on Railway free tier:** first request wakes the dyno (~3-10s). Users on screen 2 clicking "Get Quote" see the loading spinner for 10s, assume it's broken, click WhatsApp teaser instead. You just lost the tool's only purpose on the first click.
2. **Node single-process Multer memory storage** (segment.js:25). 10 concurrent uploads of 10 MB = 100 MB of buffers in RAM, before base64 doubles it to ~200 MB. Railway's smallest dynos are 512 MB. OOM kill under a mild traffic spike.
3. **No graceful shutdown.** `server.js` end: no `SIGTERM` handler. Mid-request Replicate polls get killed during Railway redeploys → zombie Replicate predictions you've already paid for.
4. **No queue / backpressure.** Two simultaneous segmentation requests both block on 30s polls in the same process. Event loop is fine (axios is async), but the user-perceived latency scales linearly past ~5 concurrent uploads.
5. **Timezone on `generateTimestamp()` (mpesa.js:40-51).** Uses server local time. Railway dynos default to UTC. Daraja expects East Africa Time (UTC+3). `Daraja` will reject the STK Push with "Bad Request - timestamp out of range" during the first hour after midnight UTC. (Dead code, but will bite if reactivated.)
6. **No observability.** No Sentry, no GA4, no Plausible, no Axiom. You cannot distinguish "nobody visits" from "everybody visits but conversion silently fails." Business-critical for a lead-gen funnel.
7. **Dual-origin deploy drift:** Vercel frontend + Railway backend means `FRONTEND_URL` on Railway must match Vercel's preview/prod domain. Vercel gives different URLs per branch (`wrap-visualizer-git-main-user.vercel.app` etc.) → preview deploys are CORS-blocked unless you whitelist a regex (you don't, see 3.1).
8. **No CDN/caching for static HTML.** Express `express.static` with defaults serves `Cache-Control: public, max-age=0` → every pageview is a full HTML re-download. On 3G Nairobi this is ~1s per screen.

---

## 6. UX / funnel-integrity failure modes

1. Screen 1 "Continue" button without a selection **silently defaults to Land Cruiser** (`screen1:342-346`). User who just wanted to browse Subaru gets a Land Cruiser quote.
2. Screen 2 starting `selFinishPrice=85000` (line 250) — that's the **per-sqm price displayed as the total** until the user clicks a finish. Confusing anchor.
3. Screen 3 estimate band is `±15%` on `sub` (line 325-326). Combined with the estimate fallback, the "low" can be as low as `4500 * 0.85 ≈ 3825` KES — the app will quote a Land Cruiser wrap for under four thousand shillings.
4. Screen 3 PPF toggle is always-on-top of the range (`+35000`). But PPF on a Land Cruiser (22 sqm) at actual `ppf_coating` addon price (35k flat, not per sqm) is unrealistic for a real service. Hardcoded amount masquerades as a quote.
5. Screen 4 "Message Sent" confirmation is shown **regardless of whether the user actually sent the WhatsApp message.** `sessionStorage.wv_wa_sent` is set before `window.open`, and `window.open` returns synchronously whether the app opened or not. False-positive conversion tracking.
6. No "back" undo from screen 4 → home other than manual link. `sessionStorage` still holds stale selection.
7. All four screens ship the full vehicle menu, color swatches, and Tailwind CDN. No code-split. ~200 KB per pageview repeated.

---

## 7. Documentation / ground-truth drift

These are the gaps between `docs/` claims and the code:

| Claim | Reality |
|---|---|
| §5.P1.3 "Client-side WhatsApp links — No backend call needed" | True for screens, but `routes/whatsapp.js` still exists and is mounted. Dead code. |
| §5.P1.4 "M-Pesa removed from all screens and scripts" | **Backend routes still mounted.** Dead + dangerous. |
| §6 "Security 8/10 — CORS configured, env vars for secrets" | No rate limit, no helmet, no CSP, M-Pesa open, CORS bypass-able via no-origin. Closer to 4/10. |
| §6 "Error Handling 8/10 — All endpoints have try/catch" | Try/catch exists but many errors wrong-code (500 for 400s, 500 for business-logic floor). |
| §5.P2.11 "CORS fix ✅ Added localhost:3001 to allowed origins" | A CORS *origin* is a scheme+host+port of the *caller*, not the API itself. Adding `http://localhost:3001` to the allowlist on a server that *is* localhost:3001 doesn't do what the author thinks. Harmless, but reveals a misunderstanding. |
| GEMINI.md "Never hardcode API keys. Always use environment variables" | Rule is followed for secrets ✅, but hardcoded partner phone numbers and hardcoded `API='http://localhost:3001'` violate the spirit. |
| GEMINI.md "All API responses must include proper error handling with user-friendly messages" | Frontend swallows many errors into fake successes (see 2.2) — worse than raw errors. |

---

## 8. What an attacker / bad user does first

1. `curl -X POST -F 'image=@/tmp/anything.jpg' https://api.yoursite.com/api/segment` in a shell loop → your Replicate bill.
2. `curl -X POST -H 'Content-Type: application/json' -d '{"phone":"2547...","amount":1,"ref":"x"}' https://api.yoursite.com/api/mpesa/initiate` → STK spam from your shortcode.
3. Embed your site in an `<iframe>` on a phishing page, overlay "Get your wrap quote free" click-jacking — no `X-Frame-Options` or `frame-ancestors` CSP blocks it.
4. Scrape `/api/estimate` × 7 vehicles × 8 finishes × 2 brands × 7 addon combos = 784 calls to dump your entire pricing model.

---

## 9. Prioritized fix list (no implementation — you asked for audit only)

**Stop-the-bleeding (P0):**
- [ ] Remove `API='http://localhost:3001'` hardcode (or ship config from env at build time).
- [ ] Unmount `routes/mpesa.js` until genuinely re-enabled; delete the files if removal is permanent.
- [ ] Add rate limiting to `/api/segment` (IP + per-session) and consider a lightweight client-side proof-of-work or Turnstile.

**Commercial integrity (P1):**
- [ ] Kill the estimate fallback that invents prices. Fail loud; don't lie to users.
- [ ] Replace Tailwind Play CDN with a compiled CSS file.
- [ ] Replace all 7 broken template images (doc already exists, zero fixes applied).
- [ ] Add WhatsApp deep-link fallback ("Number didn't open? Copy +254…").
- [ ] Move Replicate timeout to 60-90s with retry, add `Retry-After` on 503.

**Architecture (P1):**
- [ ] Decide: keep the backend *only* as a Replicate proxy (single serverless function) OR drop `/api/estimate` and ship `pricing.json` to the client. The current hybrid is the worst of both.

**Security / ops (P2):**
- [ ] `helmet()` middleware, CSP, X-Frame-Options.
- [ ] Structured logs, request IDs, Sentry.
- [ ] Real health check that validates env vars & Replicate reachability.
- [ ] Stop accepting requests with no Origin on mutating endpoints.

**Doc hygiene (P3):**
- [ ] PROJECT_STATUS.md ratings are ~2 points too high across the board.

---

*End of audit. No code was modified. No PR was opened.*
