/**
 * WrapVisualizer — Express backend
 *
 * Minimal relay for the one thing that genuinely needs a server:
 * hiding the Replicate API token used for AI-assisted car segmentation.
 *
 * Everything else (pricing, M-Pesa deposits, WhatsApp URL building)
 * has been removed — this app is a WhatsApp-only lead generator. No
 * prices are shown anywhere in the UI; the shop replies to the user
 * with a tailored quote over WhatsApp.
 *
 * Mobile-first: every function must work on a 375px viewport.
 */

// Sentry instrumentation MUST be imported first — before express and
// any other auto-instrumented module. See backend/instrument.js for
// the reasoning; @sentry/node 8.x requires init-before-import for
// HTTP/Express spans to be captured at all.
import './instrument.js';

import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename_env = fileURLToPath(import.meta.url);
const __dirname_env = path.dirname(__filename_env);

// Load environment variables from the project root .env.local (dev only;
// platform env vars on Railway/Fly take precedence).
dotenv.config({ path: path.resolve(__dirname_env, '..', '.env.local') });

// Route modules and middleware
import segmentRouter from './routes/segment.js';
import eventsRouter from './routes/events.js';
import { securityMiddleware } from './middleware/security.js';
import { segmentRateLimit } from './middleware/rateLimits.js';
import { corsMiddleware, blockNoOriginMutations } from './middleware/cors.js';
import { notFoundHandler, errorHandler } from './middleware/errors.js';
import {
  sentryRequestHandler,
  sentryErrorHandler,
} from './middleware/sentry.js';
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

// ---------------------------------------------------------------------------
// Boot-time invariants
//
// Fail-fast on deploy misconfiguration so the operator finds out from
// platform logs (where it gets paged) instead of a real customer
// loading a blank page. Every check here must be cheap and synchronous.
// ---------------------------------------------------------------------------

const frontendPath = path.join(__dirname, '..', 'frontend');
const morphPath = path.join(__dirname, '..', 'lc30-morph');

const REQUIRED_FRONTEND_FILES = [
  'screen1-upload.html',
  'screen2-studio.html',
  'screen3-quote.html',
  'screen4-confirmation.html',
  'assets/js/partners.js',
];

// Required frontend assets — missing any of these means the deploy
// artifact is incomplete and the funnel won't render. Implementation
// lives in backend/boot/morph-validator.js.
validateFrontendAssetsOrExit(frontendPath, REQUIRED_FRONTEND_FILES);

// Hero morph sequence — 240 JPGs (`ezgif-frame-001.jpg` …
// `ezgif-frame-240.jpg`). A missing middle frame freezes the
// scroll-driven animation on a paying customer's landing page.
// Implementation enumerates exact filenames (CodeRabbit, PR #24) so
// a count-only pass with a stray orphan frame can't slip through.
validateMorphOrExit(morphPath);

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Replicate readiness state
//
// Health is reported as three additive fields on /api/health (existing
// `replicate_configured` retains its original env-var-presence semantic
// for any external monitor that already polls it; new fields are opt-in).
// ---------------------------------------------------------------------------
const replicateState = {
  // True if /v1/account returned 2xx with a username at boot.
  reachable: null,
  // Wall clock of the last check (ms since epoch).
  checkedAt: null,
  // 'missing_token' | 'invalid_token' | 'timeout' | 'network_error' |
  // 'unexpected_status' | null when reachable.
  reason: null,
};

// Trust the first proxy hop (Railway / Fly / similar PaaS) so that
// req.ip reflects the real client IP and express-rate-limit can key
// off it instead of the proxy's loopback address.
app.set('trust proxy', 1);

// Sentry request context (pass-through if not initialized).
app.use(sentryRequestHandler);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Helmet + Content Security Policy (see middleware/security.js).
app.use(securityMiddleware);

// CORS allowlist (see middleware/cors.js).
app.use(corsMiddleware);

// Parse JSON request bodies (capped at 2 MB; segment.js handles multipart).
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Serve the frontend HTML files as static assets.
app.use(express.static(frontendPath));

// Serve LC300 morph frames for the scroll-driven hero animation.
app.use('/lc30-morph', express.static(morphPath, { maxAge: '7d' }));

// Root URL → opens the upload screen directly
app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'screen1-upload.html'));
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

app.use('/api/segment', blockNoOriginMutations, segmentRateLimit, segmentRouter);
app.use('/api/events', blockNoOriginMutations, eventsRouter);

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/**
 * Returns server status.
 *
 * `replicate_configured` keeps its original semantic (env var present)
 * for backward compatibility with any external monitor already polling
 * it. New fields are additive:
 *   - `replicate_reachable` reflects whether the token actually
 *     authenticated against the Replicate API on the most recent
 *     check. `null` while the boot-time check is still in flight.
 *   - `replicate_check_age_ms` is how long ago the most recent check
 *     ran. The token is re-validated every REPLICATE_REVALIDATE_MS
 *     (default 60_000 ms), so this value should normally stay below
 *     ~1 minute. If it grows past several minutes, the re-validation
 *     interval has stalled — alert on it.
 *
 * Intentionally does NOT call any external API per request so /api/health
 * stays fast, cheap, and never costs a Replicate billing event.
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    replicate_configured: Boolean(process.env.REPLICATE_API_TOKEN),
    replicate_reachable: replicateState.reachable,
    replicate_check_age_ms:
      replicateState.checkedAt === null
        ? null
        : Date.now() - replicateState.checkedAt,
  });
});

// 404 + global error handler (see middleware/errors.js).
app.use(notFoundHandler);
// Sentry error capture runs first, then the user-facing response shaper.
app.use(sentryErrorHandler);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

// Warn loudly (but don't crash) if the Replicate token is missing.
// The health endpoint reports this too, but a clear startup log makes
// the misconfiguration obvious in deployment logs.
if (!process.env.REPLICATE_API_TOKEN) {
  console.warn(
    '[WrapVisualizer] WARNING: REPLICATE_API_TOKEN is not set. ' +
      '/api/segment will return a 500 for every request until it is configured.',
  );
}

// Boot-time + periodic Replicate readiness validation. Implementation
// lives in backend/boot/replicate-ready-scheduler.js — it runs the
// boot check fire-and-forget, then self-schedules subsequent checks
// off each completion (no overlap, no concurrent /v1/account calls).
//
// REPLICATE_REVALIDATE_MS overrides the default 60_000 ms cadence;
// set to 0 to disable re-validation entirely (still runs the boot
// check). The returned `stop()` is unused in production — process
// exit is the canonical shutdown — but kept available for tests.
startReplicateReadinessScheduler({
  token: process.env.REPLICATE_API_TOKEN,
  replicateState,
  intervalMs: parseRevalidateMs(process.env.REPLICATE_REVALIDATE_MS),
});

const server = app.listen(PORT, () => {
  console.log(`[WrapVisualizer] Listening on :${PORT}`);
  console.log(`[WrapVisualizer] Replicate token configured: ${Boolean(process.env.REPLICATE_API_TOKEN)}`);
});

// Graceful shutdown — let in-flight Replicate polls finish.
function shutdown(signal) {
  console.log(`[WrapVisualizer] ${signal} received — shutting down`);
  server.close(() => process.exit(0));
  // Hard-kill after 10s if close stalls.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
