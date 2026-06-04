/**
 * Wire Express middleware + static asset serving + API route mounts.
 *
 * Extracted from backend/server.js per CodeRabbit (PR #24, round 3)
 * to keep server.js focused on boot/lifecycle (validators, scheduler,
 * listen, graceful shutdown).
 *
 * Order matters here:
 *   1. trust proxy   — must precede rate-limit and CORS so req.ip
 *                      reflects the real client, not the PaaS hop.
 *   2. Sentry req    — wraps every downstream handler in a span.
 *   3. helmet/CORS   — security headers + origin allowlist before
 *                      any body parser sees untrusted bytes.
 *   4. body parsers  — JSON/urlencoded; segment.js handles multipart
 *                      itself with multer.
 *   5. static        — frontend HTML and the lc30-morph asset dir.
 *   6. API routers   — segment + events, both gated by
 *                      blockNoOriginMutations so a no-Origin POST
 *                      can never mutate state.
 */

import express from 'express';
import path from 'node:path';

import segmentRouter from '../routes/segment.js';
import eventsRouter from '../routes/events.js';
import maskProxyRouter from '../routes/mask-proxy.js';
import { securityMiddleware } from './security.js';
import { segmentRateLimit } from './rateLimits.js';
import { corsMiddleware, blockNoOriginMutations } from './cors.js';
import { sentryRequestHandler } from './sentry.js';

/**
 * Apply every cross-cutting middleware and mount the API routers on
 * the supplied Express app.
 *
 * @param {import('express').Express} app
 * @param {object} paths
 * @param {string} paths.frontendPath - absolute path to /frontend
 * @param {string} paths.morphPath    - absolute path to /lc30-morph
 */
export function wireMiddleware(app, { frontendPath, morphPath }) {
  // Trust the first proxy hop (Railway / Fly / similar PaaS) so that
  // req.ip reflects the real client IP and express-rate-limit can
  // key off it instead of the proxy's loopback address.
  app.set('trust proxy', 1);

  // Sentry request context (pass-through if not initialized).
  app.use(sentryRequestHandler);

  // Helmet + Content Security Policy.
  app.use(securityMiddleware);

  // CORS allowlist.
  app.use(corsMiddleware);

  // Parse JSON request bodies (capped at 2 MB; segment.js handles
  // multipart itself).
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Frontend static assets.
  app.use(express.static(frontendPath));

  // LC300 morph frames for the scroll-driven hero animation.
  app.use('/lc30-morph', express.static(morphPath, { maxAge: '7d' }));

  // Root URL → opens the upload screen directly.
  app.get('/', (_req, res) => {
    res.sendFile(path.join(frontendPath, 'screen1-upload.html'));
  });

  // API routes.
  app.use(
    '/api/segment',
    blockNoOriginMutations,
    segmentRateLimit,
    segmentRouter,
  );
  app.use('/api/events', blockNoOriginMutations, eventsRouter);
  app.use('/api/mask-proxy', maskProxyRouter);
}
