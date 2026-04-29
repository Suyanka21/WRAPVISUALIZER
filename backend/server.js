/**
 * WrapVisualizer — Express backend (boot + lifecycle entrypoint).
 *
 * Minimal relay for the one thing that genuinely needs a server:
 * hiding the Replicate API token used for AI-assisted car
 * segmentation. Everything else (pricing, M-Pesa deposits, WhatsApp
 * URL building) has been removed — this app is a WhatsApp-only lead
 * generator. No prices are shown anywhere in the UI; the shop
 * replies with a tailored quote over WhatsApp.
 *
 * Mobile-first: every function must work on a 375px viewport.
 */

// Sentry instrumentation MUST be imported first — before express
// and any other auto-instrumented module. See backend/instrument.js
// for the reasoning; @sentry/node 8.x requires init-before-import
// for HTTP/Express spans to be captured at all.
import './instrument.js';

import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { notFoundHandler, errorHandler } from './middleware/errors.js';
import { sentryErrorHandler } from './middleware/sentry.js';
import { wireMiddleware } from './middleware/wireMiddleware.js';
import { registerHealthRoute } from './routes/health.js';
import {
  validateMorphOrExit,
  validateFrontendAssetsOrExit,
} from './boot/morph-validator.js';
import {
  parseRevalidateMs,
  startReplicateReadinessScheduler,
} from './boot/replicate-ready-scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the project root .env.local (dev
// only; platform env vars on Railway/Fly take precedence).
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// ---------------------------------------------------------------------------
// Boot-time invariants (fail fast on deploy misconfiguration)
// ---------------------------------------------------------------------------

const frontendPath = path.join(__dirname, '..', 'frontend');
const morphPath = path.join(__dirname, '..', 'lc30-morph');

validateFrontendAssetsOrExit(frontendPath, [
  'screen1-upload.html',
  'screen2-studio.html',
  'screen3-quote.html',
  'screen4-confirmation.html',
  'assets/js/partners.js',
]);

// Hero morph: enumerate ezgif-frame-001..240.jpg exactly so a count
// match with a stray orphan frame can't slip past (CodeRabbit, PR #24).
validateMorphOrExit(morphPath);

// ---------------------------------------------------------------------------
// App + Replicate readiness state
// ---------------------------------------------------------------------------

const app = express();
const PORT = process.env.PORT || 3000;

// Replicate readiness snapshot, mutated by the scheduler and read by
// /api/health. `reachable=null` until the boot check completes.
const replicateState = {
  reachable: null,
  checkedAt: null,
  reason: null, // 'missing_token' | 'invalid_token' | 'timeout' | 'network_error' | 'unexpected_status' | 'init_error'
};

// Wire cross-cutting middleware, static assets, and API routes.
wireMiddleware(app, { frontendPath, morphPath });

// /api/health — server status + Replicate readiness snapshot.
registerHealthRoute(app, replicateState);

// 404 + global error handler. Sentry capture runs before the
// user-facing response shaper so breadcrumbs attach correctly.
app.use(notFoundHandler);
app.use(sentryErrorHandler);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start server + lifecycle
// ---------------------------------------------------------------------------

if (!process.env.REPLICATE_API_TOKEN) {
  console.warn(
    '[WrapVisualizer] WARNING: REPLICATE_API_TOKEN is not set. ' +
      '/api/segment will return a 500 for every request until it is configured.',
  );
}

// Boot-time + periodic Replicate readiness validation. Self-scheduling
// setTimeout — never two /v1/account calls in flight at once.
startReplicateReadinessScheduler({
  token: process.env.REPLICATE_API_TOKEN,
  replicateState,
  intervalMs: parseRevalidateMs(process.env.REPLICATE_REVALIDATE_MS),
});

const server = app.listen(PORT, () => {
  console.log(`[WrapVisualizer] Listening on :${PORT}`);
  console.log(
    `[WrapVisualizer] Replicate token configured: ${Boolean(process.env.REPLICATE_API_TOKEN)}`,
  );
});

// Graceful shutdown — let in-flight Replicate polls finish, then
// hard-kill after 10s if `server.close` stalls on a hung connection.
function shutdown(signal) {
  console.log(`[WrapVisualizer] ${signal} received — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
