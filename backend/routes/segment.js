/**
 * Image Segmentation Route
 *
 * POST /api/segment
 *
 * Accepts a car photo upload (multipart/form-data), sends it to
 * the Replicate meta/sam-2 API for vehicle body panel segmentation,
 * and returns the masked image URL for wrap overlay on the frontend.
 *
 * File location: backend/routes/segment.js
 */

import { Router } from 'express';
import multer from 'multer';
import { segmentImage } from '../services/replicate.js';

const router = Router();

// ---------------------------------------------------------------------------
// Multer config — memory storage, 4 MB max, images only
// Kept in sync with the frontend MAX_UPLOAD_BYTES gate in
// frontend/assets/js/screen1-upload.js so the two caps never drift.
// ---------------------------------------------------------------------------

/** Holds uploads in memory (never written to disk). */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB — keeps base64 under Replicate's inline limit
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG, PNG, and WebP images are supported.'));
  },
});

/**
 * Wrap multer so upload errors (missing file, wrong MIME, oversize)
 * return a consistent 400 JSON response instead of falling through to
 * the global 500 handler. Stack traces are logged server-side only.
 */
const handleUpload = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.warn('[Segment] Upload rejected:', err.message);
      // Multer's MulterError sets a `code`; LIMIT_FILE_SIZE is the
      // common ops case worth distinguishing in the response.
      const code =
        err.code === 'LIMIT_FILE_SIZE' ? 'upload_too_large' : 'invalid_upload';
      return res.status(400).json({
        success: false,
        code,
        message: 'Invalid upload.',
      });
    }
    next();
  });
};

// ---------------------------------------------------------------------------
// POST /api/segment
// ---------------------------------------------------------------------------

/** Segments a vehicle image and returns the combined mask URL. */
router.post('/', handleUpload, async (req, res) => {
  try {
    // Validate upload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        code: 'invalid_upload',
        message: 'Invalid upload.',
      });
    }

    // Validate API token
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      console.error('[Segment] REPLICATE_API_TOKEN is missing');
      return res.status(500).json({
        success: false,
        code: 'service_misconfigured',
        message: 'AI service is not configured. Please contact support.',
      });
    }

    // Convert buffer → base64 data URI
    const base64 = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64}`;

    // Call Replicate SAM2 service
    const sizeKb = Math.round(req.file.size / 1024);
    console.info(
      `[Segment] Request accepted size=${sizeKb}KB mime=${req.file.mimetype}`,
    );
    const result = await segmentImage(dataUri, token);

    // Empty mask = no vehicle detected
    if (!result.combinedMask) {
      console.warn(
        `[Segment] No vehicle detected size=${sizeKb}KB mime=${req.file.mimetype}`,
      );
      return res.status(422).json({
        success: false,
        code: 'no_vehicle_detected',
        message:
          "We couldn't detect a vehicle in this photo. " +
          'Please upload a clear side or front view.',
      });
    }

    // Success — `segmented_image` is the single canonical key the
    // frontend stores at sessionStorage.wv_segmented_image.
    console.info(
      `[Segment] Success size=${sizeKb}KB processingTime=${result.processingTime}ms`,
    );
    return res.json({
      success: true,
      segmented_image: result.combinedMask,
      individualMasks: result.individualMasks,
      vehicleArea: 68,
      processingTime: result.processingTime,
    });
  } catch (error) {
    const detail = error.response?.data?.detail || error.response?.data?.message;
    const status = error.response?.status;
    console.error(
      `[Segment Error] ${error.message}${status ? ` status=${status}` : ''}${detail ? ` detail=${detail}` : ''}`,
    );

    // Differentiated error branches.
    //
    // End-users get a consistent "temporarily unavailable" wording for
    // any provider-side failure (don't leak Replicate as the dependency,
    // don't leak billing/credential state). Internally, we ALWAYS attach
    // a stable `code` field so clients and tests can discriminate
    // failure modes without scraping message strings, and ops can
    // alert on the log line above which carries the upstream status.
    if (error.message === 'TIMEOUT') {
      return res.status(504).json({
        success: false,
        code: 'upstream_timeout',
        message: 'AI processing timed out. Please try again with a smaller or clearer photo.',
      });
    }
    if (error.response?.status === 429) {
      // Rate-limited by Replicate. Tell the client to back off; the
      // 503 + Retry-After pair is the standard signal to the browser
      // / fetch layer to wait before retrying. We forward Replicate's
      // Retry-After if it sent one, else default to 30s.
      const retryAfter =
        Number(error.response.headers?.['retry-after']) || 30;
      res.set('Retry-After', String(retryAfter));
      return res.status(503).json({
        success: false,
        code: 'upstream_rate_limited',
        retry_after_seconds: retryAfter,
        message:
          'Our AI service is busy right now. Please try again in a moment.',
      });
    }
    if (error.response?.status === 402) {
      // Real cause is logged above ("status=402"); surface a generic
      // message so end-users don't see our provider name or billing
      // state. Ops should watch for 402s in logs and top up credits.
      return res.status(503).json({
        success: false,
        code: 'upstream_billing',
        message: 'Our AI service is temporarily unavailable. Please try again in a moment.',
      });
    }
    if (error.response?.status === 401) {
      // Same rationale — auth misconfiguration is an ops problem, not
      // something to leak to end-users. 503 matches the 402 branch so
      // any client banner keyed off status code treats them uniformly
      // as "service temporarily unavailable".
      return res.status(503).json({
        success: false,
        code: 'upstream_auth',
        message: 'Our AI service is temporarily unavailable. Please try again in a moment.',
      });
    }
    if (error.response?.status >= 500 && error.response?.status < 600) {
      // Replicate (or its CDN) returned 5xx. This is a provider
      // outage from our perspective, not a malformed-request issue,
      // so 503 is more accurate than 500 (which clients may interpret
      // as our backend being broken). Distinct `code` lets ops
      // dashboards count provider-down minutes separately.
      return res.status(503).json({
        success: false,
        code: 'upstream_unavailable',
        message: 'Our AI service is temporarily unavailable. Please try again in a moment.',
      });
    }
    return res.status(500).json({
      success: false,
      code: 'unexpected_error',
      message: 'Image processing failed. Please try again with a different photo.',
    });
  }
});

export default router;
