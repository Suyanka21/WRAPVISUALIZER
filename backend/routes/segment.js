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
// Multer config — memory storage, 10 MB max, images only
// ---------------------------------------------------------------------------

/** Holds uploads in memory (never written to disk). */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG, PNG, and WebP images are supported.'));
  },
});

// ---------------------------------------------------------------------------
// POST /api/segment
// ---------------------------------------------------------------------------

/** Segments a vehicle image and returns the combined mask URL. */
router.post('/', upload.single('image'), async (req, res) => {
  try {
    // Validate upload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image uploaded. Please select a car photo.',
      });
    }

    // Validate API token
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      console.error('[Segment] REPLICATE_API_TOKEN is missing');
      return res.status(500).json({
        success: false,
        message: 'AI service is not configured. Please contact support.',
      });
    }

    // Convert buffer → base64 data URI
    const base64 = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64}`;

    // Call Replicate SAM2 service
    const result = await segmentImage(dataUri, token);

    // Empty mask = no vehicle detected
    if (!result.combinedMask) {
      return res.status(422).json({
        success: false,
        message:
          "We couldn't detect a vehicle in this photo. " +
          'Please upload a clear side or front view.',
      });
    }

    // Success
    return res.json({
      success: true,
      maskedImageUrl: result.combinedMask,
      individualMasks: result.individualMasks,
      vehicleArea: 68,
      processingTime: result.processingTime,
    });
  } catch (error) {
    const detail = error.response?.data?.detail || error.response?.data?.message;
    console.error('[Segment Error]', error.message, detail || '');

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Please upload a smaller image (max 10MB).',
      });
    }
    if (error.message === 'TIMEOUT') {
      return res.status(503).json({
        success: false,
        message: 'AI processing is taking longer than usual. Please try again.',
      });
    }
    if (error.response?.status === 402) {
      return res.status(503).json({
        success: false,
        message: 'AI service billing is not active. Please add credits on Replicate.',
      });
    }
    if (error.response?.status === 401) {
      return res.status(500).json({
        success: false,
        message: 'AI service authentication failed. Check your API token.',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Image processing failed. Please try again with a different photo.',
    });
  }
});

export default router;
