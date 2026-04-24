/**
 * Optional Sentry error reporting.
 *
 * Enabled only when SENTRY_DSN is set. With no DSN, `initSentry()` is a
 * no-op, `sentryRequestHandler` / `sentryErrorHandler` are pass-throughs,
 * and the rest of the app runs unchanged — so the backend keeps working
 * for anyone who hasn't set up a Sentry project.
 *
 * Wire-up in server.js:
 *   import { initSentry, sentryRequestHandler, sentryErrorHandler } from './middleware/sentry.js';
 *   initSentry();
 *   app.use(sentryRequestHandler);  // before any route
 *   // ... routes and other middleware ...
 *   app.use(sentryErrorHandler);    // before the generic errorHandler
 *   app.use(errorHandler);
 */

import * as Sentry from '@sentry/node';

let initialized = false;

/** Initialize Sentry if SENTRY_DSN is present. Safe to call multiple times. */
export function initSentry() {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
    // Low default sample rate — error events are always captured; traces
    // are a cost knob tuned by the operator via SENTRY_TRACES_SAMPLE_RATE.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.0),
  });

  initialized = true;
  console.info('[Sentry] Initialized');
}

/** Per-request handler. No-op when Sentry isn't initialized. */
export function sentryRequestHandler(req, _res, next) {
  if (!initialized) return next();
  // Attach minimal request context to the active scope without pulling
  // in the SDK's deprecated requestHandler wrapper. Real user PII is
  // never sent — we scrub to the coarse fields Sentry needs for triage.
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
  if (initialized) {
    Sentry.captureException(err);
  }
  next(err);
}

/** Explicit capture for expected-but-noteworthy events (e.g. Replicate 5xx). */
export function captureMessage(message, level = 'info', extra = {}) {
  if (!initialized) return;
  Sentry.captureMessage(message, { level, extra });
}
