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
  initSentry,
  sentryRequestHandler,
  sentryErrorHandler,
} from './middleware/sentry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Sentry before the app is built so all middleware it adds
// runs before any route handler. No-op if SENTRY_DSN is unset.
initSentry();

const app = express();
const PORT = process.env.PORT || 3001;

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
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

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
 * Returns server status. Reports whether REPLICATE_API_TOKEN is
 * configured — without it, /api/segment will fail on every call.
 * Intentionally does NOT call any external APIs so it stays fast
 * and cheap to poll.
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    replicate_configured: Boolean(process.env.REPLICATE_API_TOKEN),
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
