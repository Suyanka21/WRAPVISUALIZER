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
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename_env = fileURLToPath(import.meta.url);
const __dirname_env = path.dirname(__filename_env);

// Load environment variables from the project root .env.local (dev only;
// platform env vars on Railway/Fly take precedence).
dotenv.config({ path: path.resolve(__dirname_env, '..', '.env.local') });

// Route modules
import segmentRouter from './routes/segment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Configure CORS to allow requests from the frontend.
 * In development, the frontend is served from the same origin (Express
 * static) or localhost dev servers. In production, the frontend origin
 * must be declared via the FRONTEND_URL env var.
 */
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Same-origin browser requests have no Origin header — allow them.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

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

app.use('/api/segment', segmentRouter);

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

// ---------------------------------------------------------------------------
// 404 Handler
// ---------------------------------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found.',
  });
});

// ---------------------------------------------------------------------------
// Global Error Handler
// ---------------------------------------------------------------------------

/**
 * Catches all unhandled errors and returns a user-friendly message.
 * Raw error codes and stack traces are never sent to the client.
 */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err.message);

  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({
      success: false,
      message: 'Cross-origin request blocked.',
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.userMessage || 'Something went wrong on our end. Please try again.',
  });
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

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
