/**
 * Sentry instrumentation entry point.
 *
 * @sentry/node 8.x requires `Sentry.init()` to run BEFORE any
 * auto-instrumented modules are imported (express, http, etc.).
 * Otherwise HTTP / Express spans and breadcrumbs will be silently
 * missing at runtime even with SENTRY_DSN set. This file is the very
 * first thing imported by server.js — keep it at the top.
 *
 * Docs: https://docs.sentry.io/platforms/javascript/guides/express/
 */

import * as Sentry from '@sentry/node';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load .env.local from the project root so SENTRY_DSN is available
// here even when the server is started via `node backend/server.js`
// without a shell-exported env. Platform env vars (Railway/Fly) take
// precedence over dotenv by default, so prod deploys are unaffected.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  // Audit SF4: a malformed DSN (e.g. a copy-paste error in a deploy
  // env panel) used to throw synchronously from Sentry.init and
  // crash the process before listen(). Wrap it so the server still
  // boots; an operator who misconfigures Sentry shouldn't take the
  // whole site down.
  // CodeRabbit (PR #24): Number(env || 0.0) silently produces NaN on a
  // typo'd value (e.g. `SENTRY_TRACES_SAMPLE_RATE=invalid`). @sentry/node
  // 8.x's parseSampleRate then returns undefined and the SDK falls back
  // to sampling 100% of transactions — exactly the opposite of what an
  // operator who set the env var was trying to do (lower the cost).
  // Parse, validate, and clamp to [0, 1]; refuse non-finite values.
  const rawSample = process.env.SENTRY_TRACES_SAMPLE_RATE;
  const parsedSample = rawSample == null || rawSample === '' ? 0 : Number(rawSample);
  const tracesSampleRate = Number.isFinite(parsedSample)
    ? Math.min(1, Math.max(0, parsedSample))
    : 0;
  try {
    Sentry.init({
      dsn,
      environment:
        process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
      // Low default sample rate — error events are always captured; traces
      // are a cost knob tuned by the operator via SENTRY_TRACES_SAMPLE_RATE.
      tracesSampleRate,
    });
    console.info('[Sentry] Initialized');
  } catch (err) {
    console.error(
      '[Sentry] init failed — server will continue without error reporting.',
      err && err.message ? err.message : err,
    );
  }
}
