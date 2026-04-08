/**
 * Replicate API Service
 *
 * Handles all communication with the Replicate API for
 * the SAM2 (meta/sam-2) image segmentation model.
 */

import axios from 'axios';

// Replicate model: meta/sam-2 — latest version hash
const SAM2_VERSION =
  'fe97b453a6455861e3bac769b441ca1f1086110da7466dbb65cf1eecfd60dc83';
const REPLICATE_API = 'https://api.replicate.com/v1';

/**
 * Polls a Replicate prediction until it succeeds, fails, or times out.
 * Replicate timeout: 30 seconds. Poll interval: 2 seconds.
 */
async function pollPrediction(predictionUrl, token) {
  const TIMEOUT_MS = 30000;
  const POLL_INTERVAL = 2000;
  const start = Date.now();

  while (Date.now() - start < TIMEOUT_MS) {
    const { data } = await axios.get(predictionUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (data.status === 'succeeded') {
      return { output: data.output, processingTime: Date.now() - start };
    }
    if (data.status === 'failed') {
      throw new Error(data.error || 'AI model processing failed.');
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  throw new Error('TIMEOUT');
}

/**
 * Sends an image to the Replicate SAM2 model for segmentation.
 * Uses the Prefer: wait header for faster synchronous responses.
 * Falls back to polling if the model doesn't respond immediately.
 *
 * Returns: { combinedMask: string, individualMasks: string[], processingTime: number }
 */
export async function segmentImage(dataUri, token) {
  const { data: prediction } = await axios.post(
    `${REPLICATE_API}/predictions`,
    {
      version: SAM2_VERSION,
      input: {
        image: dataUri,
        use_m2m: true,
        points_per_side: 32,
        pred_iou_thresh: 0.88,
        stability_score_thresh: 0.95,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
    },
  );

  // Synchronous response (Prefer: wait resolved)
  if (prediction.status === 'succeeded' && prediction.output) {
    return {
      combinedMask: prediction.output.combined_mask || null,
      individualMasks: prediction.output.individual_masks || [],
      processingTime: 0,
    };
  }

  // Async fallback — poll until complete
  const predictionUrl = prediction.urls?.get;
  if (!predictionUrl) {
    throw new Error('Replicate did not return a polling URL.');
  }

  const { output, processingTime } = await pollPrediction(predictionUrl, token);
  return {
    combinedMask: output?.combined_mask || null,
    individualMasks: output?.individual_masks || [],
    processingTime,
  };
}
