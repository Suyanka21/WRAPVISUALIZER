/**
 * CORS middleware.
 *
 * The frontend is served from the same origin as the API in production
 * (Express serves the static HTML). Chromium still sends an `Origin`
 * header on same-origin `POST`s, so the server's own host:port must be
 * on the allowlist or it will reject its own frontend. The allowlist
 * covers:
 *
 *   - The backend's own origin (loopback on :3001, same as PORT)
 *   - Local dev servers (Vite on :5173, plain HTTP on :3000)
 *   - A separate deployed frontend, declared via the FRONTEND_URL env var
 */

import cors from 'cors';

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
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
