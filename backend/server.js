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
import fs from 'node:fs';
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
import { validateToken } from './services/replicate.js';

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

for (const rel of REQUIRED_FRONTEND_FILES) {
  const abs = path.join(frontendPath, rel);
  if (!fs.existsSync(abs)) {
    console.error(
      `[Boot] FATAL: required frontend asset missing at ${abs}. ` +
        'Make sure the deploy artifact includes the frontend/ directory.',
    );
    process.exit(1);
  }
}

// The hero morph sequence is large (240 JPGs); a missing directory or
// a partial copy degrades the landing page silently. Spot-check the
// first and last frames — if either is missing, fail loudly.
const MORPH_SENTINEL_FRAMES = ['ezgif-frame-001.jpg', 'ezgif-frame-240.jpg'];
if (!fs.existsSync(morphPath)) {
  console.error(`[Boot] FATAL: lc30-morph/ directory missing at ${morphPath}.`);
  process.exit(1);
}
for (const frame of MORPH_SENTINEL_FRAMES) {
  if (!fs.existsSync(path.join(morphPath, frame))) {
    console.error(
      `[Boot] FATAL: hero morph frame ${frame} missing in ${morphPath}.`,
    );
    process.exit(1);
  }
}

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
 *     authenticated against the Replicate API at boot. `null` while
 *     the boot-time check is still in flight.
 *   - `replicate_check_age_ms` is how long ago the boot check ran;
 *     useful for alerting if the value gets very large (the check is
 *     not periodically re-run, so this only grows with uptime).
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

// Boot-time async token validation. We don't block listen() on this
// — the server should accept traffic immediately — but we surface the
// result through /api/health and a clear log line so an operator who
// pasted a typo'd token finds out within seconds of deploy instead of
// after the first paying customer hits /api/segment.
(async () => {
  const result = await validateToken(process.env.REPLICATE_API_TOKEN);
  replicateState.reachable = result.valid;
  replicateState.checkedAt = Date.now();
  replicateState.reason = result.valid ? null : result.reason;
  if (result.valid) {
    console.info(`[Replicate] Token validated for account=${result.account}`);
  } else {
    console.error(
      `[Replicate] Token validation FAILED reason=${result.reason}` +
        (result.status ? ` status=${result.status}` : '') +
        ' — /api/segment will fail until the token is fixed.',
    );
  }
})();

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
