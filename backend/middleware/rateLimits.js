/**
 * Rate limiters.
 *
 * `segmentRateLimit` caps /api/segment at 10 requests per minute per
 * client IP. This is the only endpoint that costs real money (Replicate
 * is billed per call), so an unthrottled abuse loop would drain the
 * Replicate balance within seconds.
 *
 * Relies on `app.set('trust proxy', 1)` being set in server.js so that
 * `req.ip` resolves to the real client behind Railway / Fly / similar
 * single-hop PaaS proxies, instead of the proxy's loopback address.
 */

import rateLimit from 'express-rate-limit';

export const segmentRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 segmentations per client per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please wait a moment and try again.',
  },
});
