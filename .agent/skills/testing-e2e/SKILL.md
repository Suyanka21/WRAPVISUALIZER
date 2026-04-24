---
name: testing-e2e
description: Use this skill when testing the WrapVisualizer 4-screen flow
  end-to-end — from template selection or photo upload to the WhatsApp
  handoff and screen 4 confirmation. Covers server startup, API
  verification, sessionStorage flow, and the 375 px viewport regression
  suite.
---

# E2E Testing Skill

## Goal
Verify the full 4-screen lead-generation flow works correctly:
screen1 (upload/template) → screen2 (studio) → screen3 (quote review)
→ screen4 (confirmation). The app is WhatsApp-only — there are **no
prices** in the UI; the shop replies with a tailored quote over chat.

## Prerequisites

### Start the Server
```bash
cd /home/ubuntu/repos/WRAPVISUALIZER
npm install --prefix backend
node backend/server.js
# Server runs on port 3001 and serves both the API and the static
# frontend from the same origin.
```

### Devin Secrets Needed
- `REPLICATE_API_TOKEN` (optional) — required only for live AI
  segmentation on `/api/segment`. Without it the app still runs;
  the segment call returns a 500 and screen 2 shows the dismissible
  banner sourced from `wv_segment_error`.
- `SENTRY_DSN` (optional) — if set, backend errors are forwarded to
  Sentry. No-op otherwise.

## Testing Steps

### 1. Verify API Contract First (curl)
Before testing the UI, verify the backend endpoints respond correctly:

```bash
# Health check — reports whether Replicate is configured.
curl -s http://localhost:3001/api/health | jq .

# Events endpoint — fire a telemetry event (Origin header required).
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://localhost:3001/api/events \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3001' \
  -d '{"event":"wa_click","props":{"screen":"test"}}'
# → 204. Watch the server log for `[Event] {...}`.

# No-Origin POSTs on mutating routes should be 403.
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://localhost:3001/api/events \
  -H 'Content-Type: application/json' \
  -d '{"event":"wa_click"}'
# → 403 (blockNoOriginMutations).

# Segment rate limit — more than 10 per minute/IP returns 429.
```

### 2. Screen 1 → Screen 2
- Open `http://localhost:3001/` (root redirects to screen 1).
- Either click a template card (auto-advances) or pick a file and
  click **Initialize Customizer**.
- Clicking **Initialize Customizer** with *no* selection and no file
  must NOT navigate — it should briefly show the "Select a vehicle
  or upload a photo" prompt and stay on screen 1. (Audit §6.1.)
- If a file was picked, screen 1 `POST`s `/api/segment` in the
  background; the result (or a `wv_segment_error` banner) is surfaced
  on screen 2.

### 3. Screen 2 → Screen 3
- Verify the vehicle name appears in the context bar.
- Pick a finish (one of Matte, Satin, Gloss, Chrome, Carbon, PPF,
  Metallic, Flat) and a color swatch.
- Click **GET MY QUOTE** → navigates to screen 3.

### 4. Screen 3 → Screen 4
- Screen 3 is a pure **Review & Send** summary — vehicle, finish,
  color, optional notes. **No price is computed or shown.**
- Click a WhatsApp button. The app opens `wa.me/...`, emits a
  `wa_click` telemetry event, and shows the "Didn't open? Copy the
  number" fallback banner.
- Screen 3 only navigates to screen 4 if the tab actually loses
  visibility within 3 s of the click (indicating WhatsApp opened).
  If it doesn't, the user stays on screen 3 with the copy-number
  fallback — a `wa_open_unverified` event is emitted.
- On successful handoff, a `wa_opened` event is emitted and
  `wv_wa_sent='true'` is written before navigating.

### 5. Screen 4 — Confirmation
- Shows the vehicle / finish / color summary pulled from
  sessionStorage.
- **Open WhatsApp Again** re-opens the same partner chat and
  emits `wa_reopen`.
- **Start New Configuration** returns to screen 1.
- An `inquiry_sent` event fires once on screen 4 load.

### 6. Console Error Check
- Open browser console on each screen.
- There should be **no** TypeError / uncaught exceptions.
- The only acceptable warning is the one-off `[WV] Segmentation
  skipped/failed` log when Replicate is not configured.

### 7. Automated 375 px viewport regression
```bash
npx playwright test
```
Runs the suite in `tests/viewport.spec.js` at 375 × 667:
- Each screen must have no horizontal overflow.
- Each screen's primary CTA must be attached.
- The screen-1 no-selection guard must fire.
- `/api/events` must 204 on a valid event.

## Common Gotchas

### sessionStorage Keys
All keys use the `wv_` prefix:
- `wv_vehicle_id`, `wv_vehicle_label`, `wv_vehicle_image`,
  `wv_vehicle_image_uploaded` — screen 1 → screen 2
- `wv_finish`, `wv_color`, `wv_color_hex`, `wv_vision`
  — screen 2 → screen 3
- `wv_segmented_image` — screen 1 (`POST /api/segment`) → screen 2
- `wv_segment_error` — screen 1 → screen 2 (dismissible banner)
- `wv_wa_partner`, `wv_wa_sent` — screen 3 → screen 4

### Telemetry
`window.wvTrack(name, props)` posts a JSON line to
`/api/events` using `navigator.sendBeacon` (or `fetch` with
`keepalive: true`) so click handlers that immediately navigate
still deliver the event. Events are logged to stdout as
`[Event] {...}` lines; an operator can pipe these into any
analytics backend.

### Segmentation Failures
- The `/api/segment` route returns a user-friendly JSON error for
  401 (bad token), 402 (no credits), TIMEOUT, and 500 (generic).
- The frontend never blocks navigation on a segmentation failure —
  it surfaces the message via `wv_segment_error` on screen 2.
