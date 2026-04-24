---
name: ui-integration
description: Use this skill when connecting the static HTML frontend
  screens to backend API endpoints. Use when wiring up buttons, form
  submissions, file uploads, fetch calls, or any interaction between
  the frontend screens and the server. Also use when adding JavaScript
  event listeners to existing HTML elements without altering their
  design.
---

# UI Integration Skill

## Goal
Connect the four static HTML screens to live backend logic without
modifying any Tailwind classes, color values, or layout structure.
Functionality is added on top — design is never touched.

## Context
The frontend lives in `frontend/`. There are 4 screens:
- `screen1-upload.html` — car photo upload + vehicle template selection
- `screen2-studio.html` — wrap finish/color selection + vision prompt
- `screen3-quote.html` — review & send (no prices) + WhatsApp CTAs
- `screen4-confirmation.html` — inquiry-sent success state

All screen-specific JS lives in `frontend/assets/js/*.js`. The HTML
files link them via plain `<script src="…">` tags — there are **no
inline `<script>` blocks** (CSP `script-src 'self'` forbids them).

## Shared helpers (load before your screen script)
1. `assets/js/partners.js` — defines `window.WV_PARTNERS` (the single
   source of truth for partner WhatsApp numbers) and hydrates any
   `<div id="wv-partner-links">` container in the menu overlay.
2. `assets/js/analytics.js` — defines `window.wvTrack(event, props)`.
   Call this on every meaningful user action (WhatsApp click,
   copy-number click, segmentation failure, etc.). Events are posted
   to `POST /api/events` via `sendBeacon`; delivery is best-effort
   and failures are swallowed.
3. `a11y.js` — shared keyboard / ARIA / skip-to-content shim.

## Instructions

### When wiring a button or form:
1. Locate the exact HTML element by its existing id (every
   interactive element already has a `wv-*` id).
2. Write the listener in the screen's own JS file under
   `frontend/assets/js/` — never inline, never via `onclick`
   attributes.
3. Use `fetch()` (or `navigator.sendBeacon` for
   fire-and-forget telemetry) to call the appropriate `/api/*`
   endpoint with a relative URL (the backend serves the frontend,
   so same-origin always works).
4. On success: update only `textContent` or `.classList` /
   `.style.display` of result elements — never rewrite Tailwind
   classes.
5. On error: write a user-friendly message into the existing banner
   (`wv_segment_error` via sessionStorage → screen 2 banner is the
   reference pattern).
6. Emit a `wvTrack()` event so the action is observable.

### File Upload (Screen 1)
- The file input has id `wv-file-input`. Attach a `change` listener.
- Enforce the same 10 MB client-side cap as the backend.
- `POST /api/segment` with `FormData`; on failure, write the message
  into `sessionStorage.wv_segment_error` and let screen 2 render it
  as a dismissible banner.
- Fire `track('segment_success', {status})` / `track('segment_failed',
  {status|reason})`.

### WhatsApp Teaser Buttons (Screen 1)
The "Need Expert Advice?" section at the bottom of screen 1 renders one
button per entry in `window.WV_PARTNERS` into the container
`#wv-teaser-buttons` (see `assets/js/screen1-upload.js`). Each button
opens a partner's `wa.me` link with a short "interested in a wrap" prefill
and fires `track('wa_click', { screen: 'screen1', partner: p.id, … })`.
There is no visibilitychange gating here — screen 1 never navigates away
on teaser click; users who return continue the normal flow.

### Design Selection (Screen 2)
- Finish buttons (`.finish-btn`) and color swatches (`.swatch`) use
  click listeners that only mutate text and the selected state.
- "GET MY QUOTE" (`#wv-get-quote`) stores the chosen finish / color /
  vision in sessionStorage and navigates to screen 3.

### Review & Send (Screen 3)
- On load, read sessionStorage and render vehicle / finish / color /
  optional notes. **No price is computed or displayed.**
- Render one WhatsApp button per entry in `WV_PARTNERS`.
- When a WhatsApp button is clicked:
  1. Fire `track('wa_click', {screen:'screen3', partner:p.id, …})`.
  2. Show the "Didn't open? Copy the number" fallback banner.
  3. Call `window.open('https://wa.me/'+p.number+'?text='+buildMsg(),
     '_blank', 'noopener')`.
  4. Only mark `wv_wa_sent='true'` and navigate to screen 4 if the
     tab actually loses visibility (`visibilitychange` / `blur`)
     within 3 s — this is the honest conversion signal. Otherwise
     stay on screen 3 and fire `wa_open_unverified`.

### Confirmation (Screen 4)
- On load, fire `track('inquiry_sent', {partner})` exactly once.
- "Open WhatsApp Again" (`#wv-wa-again`) re-opens the chat and fires
  `wa_reopen`.
- "Start New Configuration" navigates back to screen 1.

## Constraints
- Never remove or rename existing HTML elements.
- Never modify any Tailwind class.
- Never use `document.write()`.
- Never use inline `<script>` / `onclick=""` (violates CSP).
- All sessionStorage keys must use the `wv_` prefix.
- Never introduce pricing UI. Prices are quoted exclusively over
  WhatsApp by the shop.
