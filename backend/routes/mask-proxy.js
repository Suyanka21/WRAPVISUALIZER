/**
 * GET /api/mask-proxy?url=<replicate-delivery-url>
 *
 * Proxies a Replicate-hosted mask image so the frontend canvas can
 * read pixel data without hitting CORS restrictions. Only allows
 * URLs from the replicate.delivery CDN — any other domain is
 * rejected with a 400.
 */

import { Router } from 'express';
import axios from 'axios';

const router = Router();

/** Allowed CDN hostnames for mask images. */
const ALLOWED_HOSTS = [
  'replicate.delivery',
  'replicate.com',
  'tjzk.replicate.delivery',
  'pbxt.replicate.delivery',
];

/** Returns true when the URL points to a Replicate CDN host. */
function isAllowedUrl(raw) {
  try {
    const parsed = new URL(raw);
    return ALLOWED_HOSTS.some(
      (h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h),
    );
  } catch {
    return false;
  }
}

router.get('/', async (req, res) => {
  const url = req.query.url;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing ?url= parameter' });
  }

  if (!isAllowedUrl(url)) {
    return res.status(400).json({ error: 'URL not from allowed CDN' });
  }

  try {
    const upstream = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15_000,
    });

    // Forward the content-type from the CDN (image/png typically).
    const contentType =
      upstream.headers['content-type'] || 'application/octet-stream';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(upstream.data));
  } catch (err) {
    console.error('[MaskProxy] Failed to fetch mask:', err.message);
    res.status(502).json({ error: 'Failed to fetch mask image' });
  }
});

export default router;
