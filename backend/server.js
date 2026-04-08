/**
 * WrapVisualizer — Express Backend Server
 * 
 * Central API relay layer for the vehicle wrap visualization
 * and booking tool. Handles image segmentation, cost estimation,
 * M-Pesa payments, and WhatsApp booking.
 * 
 * All monetary values are in KES (Kenyan Shillings).
 * Mobile-first: every function must work on a 375px viewport.
 */

import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename_env = fileURLToPath(import.meta.url);
const __dirname_env = path.dirname(__filename_env);

// Load environment variables from the project root .env.local
dotenv.config({ path: path.resolve(__dirname_env, '..', '.env.local') });

// Route modules
import estimateRouter from './routes/estimate.js';
import segmentRouter from './routes/segment.js';
import mpesaRouter from './routes/mpesa.js';
import whatsappRouter from './routes/whatsapp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Configure CORS to allow requests from the frontend files.
 * In development, the frontend is served from file:// or a local server.
 * In production, it's served from the Vercel deployment URL.
 */
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,    // Vercel production URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (file://, mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Parse JSON request bodies (limit 2MB for general requests)
app.use(express.json({ limit: '2mb' }));

// Parse URL-encoded bodies (for M-Pesa callbacks)
app.use(express.urlencoded({ extended: true }));

// Serve the frontend HTML files as static assets (both at /frontend and at root)
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use('/frontend', express.static(frontendPath));
app.use(express.static(frontendPath));

// Root URL → opens the upload screen directly
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'screen1-upload.html'));
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

app.use('/api/estimate', estimateRouter);
app.use('/api/segment', segmentRouter);
app.use('/api/mpesa', mpesaRouter);
app.use('/api/whatsapp', whatsappRouter);

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/**
 * Returns server status and uptime. Used by Railway/Vercel
 * for health monitoring and by the frontend for connectivity checks.
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'WrapVisualizer API',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// 404 Handler
// ---------------------------------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found. Check the API documentation.',
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

  // CORS errors get a specific message
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({
      success: false,
      message: 'Cross-origin request blocked. Access denied.',
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

app.listen(PORT, () => {
  console.log(`\n🚀 WrapVisualizer running on http://localhost:${PORT}`);
  console.log(`❤️  Health check: http://localhost:${PORT}/api/health\n`);
});

export default app;
