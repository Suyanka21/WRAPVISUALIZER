/**
 * WrapVisualizer — Express backend
 *
 * Minimal relay for the one thing that genuinely needs a server:
 * hiding the Replicate API token used for AI-assisted car segmentation.
 *
 * Boot checks and Replicate readiness live in dedicated modules under
 * boot/ so this file stays focused on app wiring.
 */

// Sentry instrumentation MUST be imported first — before express and
// any other auto-instrumented module.
import './instrument.js';

import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Boot modules
import { runBootChecks } from './boot/validateAssets.js';
import {
  replicateState,
  initReplicateReadiness,
} from './boot/replicateReadiness.js';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the project root .env.local (dev only;
// platform env vars on Railway/Fly take precedence).
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// ---------------------------------------------------------------------------
// Boot-time invariants — fail fast on missing assets
// ---------------------------------------------------------------------------

const frontendPath = path.join(__dirname, '..', 'frontend');
const morphPath = path.join(__dirname, '..', 'lc30-morph');

runBootChecks(frontendPath, morphPath);

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the first proxy hop (Railway / Fly / similar PaaS).
app.set('trust proxy', 1);

// Sentry request context (pass-through if not initialized).
app.use(sentryRequestHandler);

// Middleware
app.use(securityMiddleware);
app.use(corsMiddleware);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Static assets
app.use(express.static(frontendPath));
app.use('/lc30-morph', express.static(morphPath, { maxAge: '7d' }));

// Root URL -> upload screen
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

// 404 + global error handler
app.use(notFoundHandler);
app.use(sentryErrorHandler);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

if (!process.env.REPLICATE_API_TOKEN) {
  console.warn(
    '[WrapVisualizer] WARNING: REPLICATE_API_TOKEN is not set. ' +
      '/api/segment will return a 500 for every request until it is configured.',
  );
}

initReplicateReadiness(process.env.REPLICATE_API_TOKEN);

const server = app.listen(PORT, () => {
  console.log(`[WrapVisualizer] Listening on :${PORT}`);
  console.log(`[WrapVisualizer] Replicate token configured: ${Boolean(process.env.REPLICATE_API_TOKEN)}`);
});

// Graceful shutdown — let in-flight Replicate polls finish.
function shutdown(signal) {
  console.log(`[WrapVisualizer] ${signal} received — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
