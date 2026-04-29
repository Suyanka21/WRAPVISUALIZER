/**
 * POST /api/segment — accepts a car photo upload (multipart/form-data),
 * sends it to the Replicate meta/sam-2 API for vehicle body panel
 * segmentation, and returns the masked image URL for wrap overlay.
 */

import { Router } from 'express';
import multer from 'multer';
import { segmentImage } from '../services/replicate.js';
import { sniffImageType } from '../utils/image-validation.js';
import { handleSegmentError } from '../utils/segment-errors.js';

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

    // Magic-byte content sniff (audit V2). The browser-supplied
    // mimetype was already filtered by multer, but the *content* may
    // not match — a curl with --form 'image=@evil.exe;type=image/jpeg'
    // sails past the header check. Sniff the first 12 bytes and
    // require an actual image header before we send anything to
    // Replicate (or, worse, return our own "no_vehicle_detected"
    // for what was never an image to begin with).
    const sniffed = sniffImageType(req.file.buffer);
    if (!sniffed || sniffed !== req.file.mimetype) {
      console.warn(
        `[Segment] Magic-byte sniff rejected upload mime=${req.file.mimetype} sniffed=${sniffed}`,
      );
      return res.status(400).json({
        success: false,
        code: 'invalid_image_content',
        message: 'Only JPEG, PNG, and WebP images are supported.',
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

    // Convert buffer → base64 data URI. Use the sniffed type so an
    // attacker can't trick us into building a data:image/svg+xml URI
    // by spoofing the multipart Content-Type header.
    const base64 = req.file.buffer.toString('base64');
    const dataUri = `data:${sniffed};base64,${base64}`;

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
    return handleSegmentError(error, res);
  }
});

export default router;
