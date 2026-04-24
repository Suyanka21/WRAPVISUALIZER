/**
 * Lightweight client-side telemetry.
 *
 * Exposes `window.wvTrack(event, props)` — fire-and-forget POST to
 * /api/events with { event, props }. Uses `navigator.sendBeacon` when
 * available so the request survives page unloads (critical for tracking
 * clicks that immediately navigate away, e.g. WhatsApp deep links).
 *
 * Every call is safe: failures are swallowed, there is no retry, and
 * no user-visible side effect. This is the hook an operator replaces
 * with a Plausible / GA4 / Mixpanel snippet later — the events fired
 * by the rest of the app (wa_click, wa_copy_number, segment_failed,
 * etc.) are all emitted through this one function.
 */
(function () {
  'use strict';

  var MAX_EVENT_LEN = 64;
  var ALLOWED = /^[a-z0-9_.-]{1,64}$/i;

  function track(event, props) {
    if (typeof event !== 'string' || !ALLOWED.test(event) || event.length > MAX_EVENT_LEN) {
      return;
    }
    var body;
    try {
      body = JSON.stringify({ event: event, props: props || null });
    } catch (_e) {
      return;
    }

    try {
      // sendBeacon is best-effort and survives page unload — preferred for
      // click handlers that immediately call window.open / location.href.
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon('/api/events', blob)) return;
      }
    } catch (_e) {
      // fall through to fetch
    }

    try {
      // `keepalive: true` lets the fetch outlive the page navigation in
      // modern browsers; any failure is silently dropped.
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function () {});
    } catch (_e) {
      // Never let telemetry break the UI.
    }
  }

  window.wvTrack = track;
})();
