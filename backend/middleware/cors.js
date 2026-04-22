/**
 * CORS middleware.
 *
 * The frontend is served from the same origin as the API in production
 * (Express serves the static HTML), so most browser requests carry no
 * `Origin` header and are allowed by default. The allowlist exists for:
 *
 *   - Local dev servers (Vite on :5173, plain HTTP on :3000)
 *   - A separate deployed frontend, declared via the FRONTEND_URL env var
 *
 * Note: a backend listening on localhost:3001 is never itself the
 * *origin* of a cross-origin request, so `http://localhost:3001` is
 * deliberately not in this list.
 */

import cors from 'cors';

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Same-origin browser requests have no Origin header — allow them.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
