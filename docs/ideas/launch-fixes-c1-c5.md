# Launch Fixes — C1–C5 + MV2/MV3

> Output of an `idea-refine` pass over the trustless-system-auditor
> findings on commit `2d7d163` (post-PR #21). One-pager artifact per
> the idea-refine skill; the actual code lives in this PR.

## Problem Statement

**How might we make every funnel-killer in WrapVisualizer fail loudly
and recoverably, without altering the Stitch design or the conversion
flow itself?**

The trustless audit identified five paths that quietly destroy the
upload-→-customize-→-quote-→-WhatsApp funnel without alerting anyone:

- **C1** Replicate POST has no socket timeout — a stalled worker holds
  an Express handler (and its 4 MB multer buffer) open indefinitely.
- **C2** If `partners.js` fails to load, screen 3 renders zero
  WhatsApp buttons. The shop pays for hosting and gets no leads.
- **C3** `/api/health` reports `replicate_configured: true` based on
  env-var presence alone; a typo'd or revoked token still passes.
- **C4** Screens 3 and 4 don't enforce funnel state; direct visits or
  cleared sessionStorage send leads with placeholder data.
- **C5** No deploy-time guarantee that `frontend/` and `lc30-morph/`
  ship in the artifact. Site outage with green health check.

## Target User

The Nairobi wrap-shop operator buying this app this week. They are not
an engineer. They install on Railway/Fly, paste a Replicate token,
point a domain, and start sending the link to customers.

## Success Criteria

1. Every paying customer who completes screen 1 either reaches a
   WhatsApp chat or sees a clear copy-number fallback.
2. No silent dead-ends: every failure surfaces in either platform
   logs, browser console, or a user-visible banner.
3. The shop owner finds out about a deploy misconfiguration from
   their PaaS log feed within seconds — not from a customer.

## Recommended Direction

Per-issue, the simplest fix that survives stress-testing:

| ID | Direction | Rationale |
|----|-----------|-----------|
| C1 | `axios.post(..., { timeout: 60_000 })` + map `ECONNABORTED` to existing `TIMEOUT` sentinel. Also add `timeout: 10_000` to each `axios.get` poll. | Reuses the existing 503 error path. No new error contract. One config knob, no new state. |
| C2 | Inline `WV_PARTNERS_FALLBACK` array in screens 1 / 3 / 4 that consume the data, with a `console.warn` when the fallback fires. `partners.js` remains the canonical source. | Failure mode is rare and bounded; duplication of two literal entries is cheaper than building a server-side endpoint. |
| C3 + MV2 | Boot-time async `validateToken()` against `GET /v1/account`. Result stored in `replicateState`; new additive fields on `/api/health`. Existing `replicate_configured` is unchanged for backward compatibility (Hyrum's Law). | Catches the typo'd-token launch-day mistake without making `/api/health` a billable surface. |
| C4 | Top-of-IIFE guard on screens 3 and 4: `if (!sessionStorage.getItem('wv_vehicle_label')) location.replace('screen1-upload.html')`. | Pure JS, zero design changes, no flicker, no flag-flipping; matches the rest of the app's state model. |
| C5 + MV3 | Synchronous `fs.existsSync` check at boot for required HTML files + the first/last morph frames. `process.exit(1)` on miss. | Fails at the earliest possible point; the exit code surfaces in PaaS dashboards and triggers their existing alerting. |

## API Contract Changes

Per the `api-and-interface-design` skill:

- **`GET /api/health`** — additive only:
  ```jsonc
  {
    "status": "ok",
    "replicate_configured": true,        // existing — env var presence
    "replicate_reachable": true,         // NEW — boot-time validation
    "replicate_check_age_ms": 12345      // NEW — uptime since check
  }
  ```
  No existing field changes shape or semantics. Old monitors keep
  working.
- **`POST /api/segment`** — error contract is **unchanged**. Internally
  we now translate axios `ECONNABORTED` to the same `TIMEOUT` sentinel
  the route already handles. Users see the same 503 + generic message.
- **Boot-time invariants** are not user-visible. They log
  `[Boot] FATAL …` on stderr and exit non-zero — no client surface.

## UI Design Notes

Per the `frontend-ui-engineering` skill:

- **No new visible UI strings, colors, or components** are introduced
  by this PR. The Stitch design system is preserved untouched.
- **Funnel-state guard** uses `location.replace` (not `.href`) so the
  back button doesn't bounce users to a broken state. The guard runs
  before any DOM read, so there is no flash-of-broken-content.
- **Partner fallback** is silent to the user when partners.js loads
  normally. When it fails, the user sees the same UI but the operator
  gets a `console.warn` they can pick up via Sentry's breadcrumbs.

## Key Assumptions

1. The shop operator will set `REPLICATE_API_TOKEN` correctly on first
   deploy ~90% of the time. The boot-time check covers the other 10%.
2. `partners.js` failures in production will be cache, CSP, or
   network-layer — not deliberate edits. A static fallback array is
   therefore safe.
3. `wv_vehicle_label` being present is a sufficient proxy for "user
   came through screen 1." (True today; if a future change adds a
   side-entry, the guard needs revisiting.)
4. Failing fast at boot is preferred over best-effort serving with
   broken pages. The shop owns the deploy.

## MVP Scope (this PR)

- `backend/services/replicate.js` — request timeouts + `validateToken()`
- `backend/server.js` — boot invariants + readiness state + enriched health
- `frontend/assets/js/screen1-upload.js` — partner fallback
- `frontend/assets/js/screen3-quote.js` — funnel guard + partner fallback
- `frontend/assets/js/screen4-confirmation.js` — funnel guard + partner fallback
- `docs/ideas/launch-fixes-c1-c5.md` — this artifact

## Not Doing (deliberately, in this PR)

- Funnel state in URL params (overkill, leaks vehicle to GA).
- Server-side session funnel tracking (state machine, DB, sessions).
- Replicate health check on every `/api/health` poll (creates a
  billable surface).
- Circuit breaker on Replicate (no current evidence we need it).
- Tailwind component library refactor for any boot-time error page.
- Periodic re-validation of the Replicate token (boot check is enough
  until we see real evidence of token rotation in the wild).
- New backend tests in this PR — flagged in audit as a separate gap.
- Build-time CI check that `frontend/` and `lc30-morph/` ship together
  (boot-time check is sufficient for v1; CI gate is a follow-up).

## Verification Strategy

- `node --check` on every edited backend file.
- Boot smoke test: `node backend/server.js` should:
  - log `[Replicate] Token validated for account=...` when a valid
    token is set, or `[Replicate] Token validation FAILED reason=...`
    when it isn't.
  - log `[Boot] FATAL` and exit non-zero when `frontend/` or sentinel
    morph frames are missing (verified by temporarily renaming a file).
- Playwright suite: all 11 viewport specs continue to pass.
- Manual: visit `/screen3-quote.html` with cleared sessionStorage —
  expect immediate redirect to `screen1-upload.html`.
