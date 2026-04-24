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
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
    // Low default sample rate — error events are always captured; traces
    // are a cost knob tuned by the operator via SENTRY_TRACES_SAMPLE_RATE.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.0),
  });
  console.info('[Sentry] Initialized');
}
