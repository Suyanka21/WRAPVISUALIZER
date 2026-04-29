/**
 * Lightweight telemetry endpoint.
 *
 * POST /api/events
 * Body: { event: string, props?: object }
 *
 * The frontend `wvTrack()` helper posts here whenever a meaningful user
 * action happens — WhatsApp click, copy-number click, segmentation
 * failure, etc. Events are written to stdout as a single structured
 * JSON line prefixed with `[Event]` so they can be scraped from Railway
 * / Fly log streams, ingested by Loki / Datadog / etc., or ignored.
 *
 * This is deliberately minimal — it is NOT a real analytics backend.
 * Operators who want GA4 / Plausible / Mixpanel can either:
 *   - Tail these logs and forward, or
 *   - Replace `wvTrack()` on the frontend with a provider SDK.
 *
 * The endpoint is rate-limited (30/min/IP) so a rogue page can't fill
 * disks with garbage events.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const router = Router();

const MAX_EVENT_LEN = 64;
const MAX_PROPS_LEN = 512; // JSON-stringified props cap
// Audit W5: previous regex /^[a-z0-9_.-]{1,64}$/i allowed UPPERCASE,
// dots, dashes, and a leading digit/underscore — none of which are
// produced by the canonical wvTrack() emitters in the frontend
// (snake_case ASCII only, lower-case, leading letter, e.g. 'wa_click',
// 'segment_failed'). Tightening the regex turns an unexpected
// uppercase or dotted event into a 204 no-op so an exfil-style event
// crafted by a tampered tab can't pollute the analytics pipeline.
const ALLOWED_EVENT_RE = /^[a-z][a-z0-9_]{0,62}$/;

const eventsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // Silently drop over-limit events — telemetry should never interrupt UX.
  handler: (_req, res) => res.status(204).end(),
});

/**
 * Accepts a single structured event and logs it. Always returns 204,
 * even on validation failure — we don't want client JS to retry or
 * surface errors for telemetry.
 */
router.post('/', eventsRateLimit, (req, res) => {
  try {
    const { event, props } = req.body || {};
    if (typeof event !== 'string' || event.length === 0 || event.length > MAX_EVENT_LEN) {
      return res.status(204).end();
    }
    if (!ALLOWED_EVENT_RE.test(event)) {
      return res.status(204).end();
    }
    let safeProps = null;
    if (props && typeof props === 'object' && !Array.isArray(props)) {
      try {
        const s = JSON.stringify(props);
        if (s.length <= MAX_PROPS_LEN) safeProps = props;
      } catch (_e) {
        safeProps = null;
      }
    }
    const line = {
      ts: new Date().toISOString(),
      ip: req.ip,
      ua: req.headers['user-agent'] || null,
      event,
      props: safeProps,
    };
    // Single-line structured log so tooling can parse it trivially.
    console.info('[Event] ' + JSON.stringify(line));
  } catch (_e) {
    // Never surface errors for telemetry.
  }
  res.status(204).end();
});

export default router;
