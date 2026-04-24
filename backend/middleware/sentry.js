/**
 * Sentry middleware helpers.
 *
 * Initialization itself happens in `backend/instrument.js` — which
 * MUST be imported before any other module (Sentry v8 requires init
 * to run before express/http are loaded or auto-instrumentation is
 * silently disabled). This file just provides the per-request
 * context and error-forwarding handlers that `server.js` wires in.
 *
 * Both handlers are no-ops when `SENTRY_DSN` is unset — we detect
 * this by checking `Sentry.isInitialized()` at call time — so the
 * backend runs unchanged for anyone who hasn't set up a Sentry project.
 */

import * as Sentry from '@sentry/node';

function enabled() {
  return typeof Sentry.isInitialized === 'function'
    ? Sentry.isInitialized()
    : Boolean(Sentry.getClient && Sentry.getClient());
}

/** Per-request handler. No-op when Sentry isn't initialized. */
export function sentryRequestHandler(req, _res, next) {
  if (!enabled()) return next();
  // Attach minimal request context to the active scope. Real user
  // PII is never sent — we scrub to the coarse fields Sentry needs
  // for triage.
  Sentry.getCurrentScope().setContext('request', {
    method: req.method,
    url: req.originalUrl,
    user_agent: req.headers['user-agent'] || null,
  });
  next();
}

/** Global error handler. Forwards to Sentry then hands off to the next handler. */
// eslint-disable-next-line no-unused-vars
export function sentryErrorHandler(err, _req, _res, next) {
  if (enabled()) {
    Sentry.captureException(err);
  }
  next(err);
}

/** Explicit capture for expected-but-noteworthy events (e.g. Replicate 5xx). */
export function captureMessage(message, level = 'info', extra = {}) {
  if (!enabled()) return;
  Sentry.captureMessage(message, { level, extra });
}
