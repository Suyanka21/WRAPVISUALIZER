/**
 * CORS middleware.
 *
 * The frontend is served from the same origin as the API in production
 * (Express serves the static HTML). Chromium still sends an `Origin`
 * header on same-origin `POST`s, so the server's own host:port must be
 * on the allowlist or it will reject its own frontend. The allowlist
 * covers:
 *
 *   - The backend's own origin (loopback on the runtime PORT)
 *   - Local dev servers (Vite on :5173, plain HTTP on :3000)
 *   - A separate deployed frontend, declared via the FRONTEND_URL env var
 *
 * Requests with **no** Origin header are allowed only for safe HTTP
 * methods (GET, HEAD, OPTIONS) — those are normal browser navigations
 * and preflight checks. Mutating methods (POST, PUT, DELETE, PATCH)
 * **must** carry an Origin so that curl/Postman/bot abuse is rejected
 * at the CORS layer, not just by rate-limiting.
 */

import cors from 'cors';

// Build the allowlist at import time from the runtime PORT so the backend's
// own host:port is always accepted — same-origin Chromium POSTs carry an
// Origin header and would otherwise be rejected below.
const runtimePort = process.env.PORT || 3001;
const allowedOrigins = [
  `http://localhost:${runtimePort}`,
  `http://127.0.0.1:${runtimePort}`,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

// HTTP methods that are safe (read-only). Requests using these methods
// legitimately lack an Origin header during normal browser navigation.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Allow same-origin GET/HEAD/OPTIONS without an Origin header (normal
// browser navigation), but require an Origin on mutating methods so
// that curl/bot requests without an Origin are rejected.
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Browsers omit Origin on same-origin GETs — allow those.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Additional guard: reject mutating requests that have no Origin header.
// The cors() middleware above already validates the Origin when present,
// but lets !origin through for same-origin navigations. This middleware
// closes that gap for POST/PUT/DELETE/PATCH so that curl/Postman/bot
// requests (which never send an Origin) are blocked on write endpoints.
export function blockNoOriginMutations(req, res, next) {
  if (!SAFE_METHODS.has(req.method) && !req.headers.origin) {
    return res.status(403).json({
      success: false,
      message: 'Origin header is required for this request.',
    });
  }
  next();
}
