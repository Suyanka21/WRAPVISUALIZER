# WrapVisualizer — Project Status Report
> Last updated: 23 April 2026

---

## 1. Project Identity

**WrapVisualizer** is a mobile-first vehicle wrap visualization and **lead generation tool** targeting high-end wrap shops in Nairobi, Kenya. Users select a vehicle, choose a wrap finish/color, optionally write a short design brief, and hand off to the shop via **WhatsApp**. **Pricing is never shown** — the shop replies with a tailored quote over chat.

> **Business Model:** This is NOT a booking/payment platform. It's a visualization + inquiry funnel. The wrap shop closes the deal over WhatsApp.

---

## 2. Architecture Overview

```
WRAPVISUALIZER/
├── frontend/                    # Static HTML + compiled Tailwind
│   ├── screen1-upload.html      # Vehicle upload + template selection
│   ├── screen2-studio.html      # Finish, color, vision configurator
│   ├── screen3-quote.html       # Review & send (no prices) + WhatsApp CTA
│   ├── screen4-confirmation.html # Inquiry-sent confirmation
│   ├── a11y.js                  # Shared accessibility shim
│   ├── src/input.css            # Tailwind source
│   └── assets/
│       ├── css/tailwind.css     # Compiled (via `npm run build:css`)
│       ├── js/
│       │   ├── analytics.js     # window.wvTrack() telemetry helper
│       │   ├── partners.js      # Single source of truth for WhatsApp #s
│       │   └── screen{1..4}-*.js
│       ├── vehicles/            # 7 local template photos
│       ├── gallery/             # 6 local gallery photos
│       └── hero/, video/        # Hero assets
├── backend/                     # Express API relay (port 3001)
│   ├── server.js                # App bootstrap, static serving, handlers
│   ├── middleware/
│   │   ├── cors.js              # Allowlist + no-Origin POST blocker
│   │   ├── errors.js            # 404 + global error handler
│   │   ├── rateLimits.js        # /api/segment → 10 req/min/IP
│   │   ├── security.js          # Helmet + strict CSP
│   │   └── sentry.js            # Optional Sentry (no-op without DSN)
│   ├── routes/
│   │   ├── segment.js           # POST /api/segment — Replicate SAM-2
│   │   └── events.js            # POST /api/events — client telemetry
│   └── services/replicate.js    # meta/sam-2 with retry + 90 s timeout
├── tests/viewport.spec.js       # Playwright 375 px regression suite
├── playwright.config.js
├── docs/
│   ├── PROJECT_STATUS.md        # (this file)
│   ├── wrapvisualizer-failure-audit.md
│   └── issues-remaining-from-report.md
├── .env.example
├── .gitignore
├── package.json                 # Root: tailwind build + playwright
└── GEMINI.md                    # Project rules
```

**Stack:**
- Frontend: HTML + Tailwind CSS (**compiled**, self-hosted). No CDN.
- Backend: Node.js + Express (serves static frontend + `/api/segment`, `/api/events`, `/api/health`).
- AI: Replicate API (`meta/sam-2`) — model identifier, no pinned hash.
- Communication: WhatsApp `wa.me` deep links — dual partner numbers via `assets/js/partners.js`.
- State: Browser `sessionStorage` with `wv_` prefix.
- Telemetry: `window.wvTrack()` → `POST /api/events` → structured stdout (pipe to any log aggregator). Optional Sentry for backend errors.

---

## 3. Partner Contact Numbers

| Partner | WhatsApp Number | Status |
|---------|----------------|--------|
| Line 1  | +254 705 040 033 | ✅ Wired via `partners.js` |
| Line 2  | +254 700 419 444 | ✅ Wired via `partners.js` |

Both numbers appear as WhatsApp CTAs on screens 1, 3, and 4. The pre-filled message includes vehicle, finish, color, and (if provided) the user's design notes — **never a price**.

---

## 4. What Has Been Built

### ✅ Backend

| Endpoint | Method | Description | Status |
|---|---|---|---|
| `/` | GET | Root → serves Screen 1 directly | ✅ Working |
| `/api/health` | GET | Reports server + Replicate-config status | ✅ Working |
| `/api/segment` | POST | Replicate SAM-2 segmentation | ✅ Built (needs REPLICATE_API_TOKEN) |
| `/api/events` | POST | Structured client telemetry | ✅ Working |

Hardening (post-audit):
- Helmet + strict CSP (`script-src 'self'`, `frame-ancestors 'none'`)
- Rate limit: 10 req/min/IP on `/api/segment`, 30/min/IP on `/api/events`
- `blockNoOriginMutations` — POST/PUT/DELETE/PATCH without an `Origin` header → 403
- Replicate: retry on 429/5xx, 90 s timeout, `meta/sam-2` model id (not version-pinned)
- SIGTERM/SIGINT graceful shutdown with 10 s hard-kill fallback
- Optional Sentry error forwarding (enabled when `SENTRY_DSN` is set)

### ✅ Frontend (4 Screens)

| Screen | Purpose | Key Features |
|---|---|---|
| **Screen 1 — Home** | Vehicle selection | 7 local templates, file upload w/ 10 MB cap, dual WhatsApp teaser, segmentation preview passes to screen 2 |
| **Screen 2 — Studio** | Customization | 8 finishes, 5 colors, vision prompt, dismissible banner on segment failure |
| **Screen 3 — Review & Send** | Inquiry funnel | Summary only (no prices), 2× WhatsApp CTAs, copy-number fallback, visibilitychange-gated screen 4 navigation |
| **Screen 4 — Sent** | Confirmation | Summary + "Open WhatsApp Again" + "Start New Configuration" |

---

## 5. Roadmap Progress

### 🔴 Priority 1 — Launch Essentials

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Single URL (`:3001`) | ✅ Done | Root serves Screen 1 directly |
| 2 | WhatsApp dual partners | ✅ Done | Wired via `partners.js` on all screens |
| 3 | Client-side WhatsApp links | ✅ Done | No backend call needed |
| 4 | M-Pesa removal | ✅ Done | Routes, files, and references fully removed |
| 5 | Pricing removal | ✅ Done | No prices anywhere; shop quotes over WhatsApp |
| 6 | Deployment | ⬜ Pending | Needs Railway + custom domain |

### 🟡 Priority 2 — Quality & Polish

| # | Item | Status | Notes |
|---|------|--------|-------|
| 7 | SEO meta tags | ✅ Done | Title, description, OG tags on all 4 screens |
| 8 | Accessibility (a11y) | ✅ Partial | Bake-in ARIA labels + `a11y.js` shim; still JS-dependent for skip-to-content |
| 9 | Font preconnect hints | ✅ Done | All 4 screens |
| 10 | Lazy loading images | ✅ Done | `loading="lazy"` on templates + gallery |
| 11 | CORS hardening | ✅ Done | Allowlist + no-Origin POST guard |
| 12 | Vehicle segmentation test | ⬜ Pending | Needs Replicate credits |
| 13 | Gallery / Portfolio | ✅ Done | 6 local gallery images wired |
| 14 | Tailwind self-host | ✅ Done | Compiled at `assets/css/tailwind.css`; no CDN |
| 15 | 375 px viewport regression | ✅ Done | `npx playwright test` — 10 passing |
| 16 | Copy-number WhatsApp fallback | ✅ Done | Screen 3 banner + clipboard API |
| 17 | Honest "Message Sent" flow | ✅ Done | `visibilitychange` gating before screen 4 |
| 18 | Telemetry (`/api/events`) | ✅ Done | `window.wvTrack()` → stdout `[Event] {…}` |

### 🟢 Priority 3 — Growth Features

| # | Item | Status | Notes |
|---|------|--------|-------|
| 19 | Multi-shop support | ⬜ Future | SaaS model for multiple wrap shops |
| 20 | Analytics provider wiring | ⬜ Future | Replace `wvTrack()` with Plausible/GA4/Mixpanel |
| 21 | Real wrap visualization | ⬜ Future | Overlay chosen color/finish on segmented photo |

---

## 6. Current Rating

### Backend: 9 / 10

| Aspect | Score | Notes |
|---|---|---|
| API Design | 9/10 | 2 active POST endpoints + health — lean and focused |
| Security | 9/10 | Helmet + CSP, rate limit, Origin-gated writes, optional Sentry |
| Error Handling | 9/10 | Multer → 400, typed Replicate errors, graceful shutdown |
| Simplicity | 10/10 | Sole purpose: hide `REPLICATE_API_TOKEN` + forward events |
| Deployment Readiness | 8/10 | `node backend/server.js` — ready for Railway/Fly; needs platform-level env vars |

### Frontend: 9 / 10

| Aspect | Score | Notes |
|---|---|---|
| Visual Design | 9/10 | Premium dark theme, glass effects |
| Mobile Responsiveness | 9/10 | 375 × 667 Playwright regression covers all screens |
| Navigation | 9/10 | Bottom nav, hamburger menu, back flows |
| Interactivity | 9/10 | Templates, finish/color, segmentation preview |
| Conversion Flow | 9/10 | Dual WhatsApp CTAs + copy-number fallback + visibilitychange gating |
| Accessibility | 7/10 | ARIA labels baked in; skip-to-content still JS-dependent |
| SEO | 7/10 | Title, meta, OG on all screens. No structured data yet. |
| Performance | 9/10 | Tailwind compiled & minified; no CDN dependencies |

### Overall: 9 / 10

---

## 7. What's Left for 10/10

| Item | Effort | Impact |
|---|---|---|
| **Deploy to production** (Railway/Fly + custom domain) | Medium | Must-have for launch |
| **Real device smoke test** (Android Chrome, iPhone Safari) | Low | Catches the last hover/viewport edge cases |
| **Vehicle segmentation visualization** (Replicate credits + color overlay) | Medium | Wow-factor; currently a ghost preview |
| **Analytics provider** (swap stdout logs for Plausible or GA4) | Low | Real conversion dashboards |
| **Structured data** (JSON-LD for local business) | Low | Google rich results |

---

## 8. Quick Start

```bash
# 1. Install dependencies (root + backend + Playwright)
npm install
npm install --prefix backend

# 2. Configure environment
cp .env.example .env.local
# Set REPLICATE_API_TOKEN (optional — required only for /api/segment)
# Set SENTRY_DSN (optional — enables backend error forwarding)

# 3. Build CSS (one-time after changes to `frontend/src/input.css`)
npm run build:css

# 4. Start the server
npm start           # or: node backend/server.js

# 5. Open in browser
# http://localhost:3001
```

Run the 375 px regression suite:

```bash
npx playwright test
```

---

## 9. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 8 Apr 2026 | Removed M-Pesa integration | Shop handles payments directly |
| 8 Apr 2026 | WhatsApp as sole conversion | Shops close deals via WhatsApp |
| 8 Apr 2026 | Dual partner numbers | Two business partners share the shop |
| 8 Apr 2026 | Client-side WhatsApp links | No backend call needed |
| 8 Apr 2026 | Shared `a11y.js` | Cross-screen ARIA + keyboard nav |
| 8 Apr 2026 | SEO meta tags on all pages | OG tags, description, proper titles |
| 10 Apr 2026 | Failure-mode audit done | All P0s and most P1s resolved in subsequent PRs |
| 18 Apr 2026 | Removed pricing from UI entirely | Lead-gen only — shop quotes over WhatsApp |
| 18 Apr 2026 | Centralized partner numbers | Single source of truth in `partners.js` |
| 18 Apr 2026 | Swapped Tailwind CDN → compiled | Production-ready styles, CSP-friendly |
| 23 Apr 2026 | Added `/api/events` + `wvTrack()` | Measurable conversion funnel without a SaaS account |
| 23 Apr 2026 | visibilitychange-gated screen 4 | Ends false-positive "Message Sent" conversions |
| 23 Apr 2026 | Playwright 375 px regression | Audit P2 mobile-viewport claim now automated |
| 23 Apr 2026 | Optional Sentry (DSN-gated) | Backend error observability without forced dependency |

---

*This document should be updated as features are completed.*
