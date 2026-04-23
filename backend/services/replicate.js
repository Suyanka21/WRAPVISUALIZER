/**
 * Replicate API Service
 *
 * Handles all communication with the Replicate API for
 * the SAM2 (meta/sam-2) image segmentation model.
 *
 * Uses the model identifier (`meta/sam-2`) instead of a pinned
 * version hash so Replicate auto-routes to the latest active
 * version. If a specific version is needed, set the
 * REPLICATE_SAM2_VERSION env var.
 *
 * Includes retry logic for transient 429/5xx errors and a
 * configurable timeout (default 90 s) to accommodate cold
 * Replicate workers.
 */

import axios from 'axios';

const REPLICATE_API = 'https://api.replicate.com/v1';

// Model identifier — Replicate resolves this to the latest active
// version automatically. Override with an env var if you need to
// pin to a specific version hash.
const SAM2_MODEL = 'meta/sam-2';
const SAM2_VERSION = process.env.REPLICATE_SAM2_VERSION || null;

// Timeout and retry configuration
const TIMEOUT_MS = 90_000; // 90 seconds (cold workers can take 40-60 s)
const POLL_INTERVAL = 2_000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_BASE = 2_000; // 2 s, 4 s

/**
 * Determines whether an HTTP error response is retryable.
 * 429 (rate-limited) and 5xx (server errors) are transient.
 */
function isRetryable(error) {
  const status = error.response?.status;
  if (!status) return false;
  return status === 429 || status >= 500;
}

/**
 * Sleeps for the given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Polls a Replicate prediction until it succeeds, fails, or times out.
 */
async function pollPrediction(predictionUrl, token) {
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

    await sleep(POLL_INTERVAL);
  }

  throw new Error('TIMEOUT');
}

/**
 * Sends an image to the Replicate SAM2 model for segmentation.
 * Uses the Prefer: wait header for faster synchronous responses.
 * Falls back to polling if the model doesn't respond immediately.
 * Retries up to MAX_RETRIES times on transient 429/5xx errors.
 *
 * Returns: { combinedMask: string, individualMasks: string[], processingTime: number }
 */
export async function segmentImage(dataUri, token) {
  // Build the prediction payload — use the model identifier when no
  // explicit version is pinned, so Replicate auto-routes to the
  // latest active version.
  const payload = {
    input: {
      image: dataUri,
      use_m2m: true,
      points_per_side: 32,
      pred_iou_thresh: 0.88,
      stability_score_thresh: 0.95,
    },
  };
  if (SAM2_VERSION) {
    payload.version = SAM2_VERSION;
  } else {
    payload.model = SAM2_MODEL;
  }

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = RETRY_BACKOFF_BASE * attempt;
        console.info(`[Replicate] Retry ${attempt}/${MAX_RETRIES} after ${backoff}ms`);
        await sleep(backoff);
      }

      const { data: prediction } = await axios.post(
        `${REPLICATE_API}/predictions`,
        payload,
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
    } catch (error) {
      lastError = error;

      // Only retry on transient server errors, not on client errors
      // like 401 (bad token) or 402 (no credits).
      if (attempt < MAX_RETRIES && isRetryable(error)) {
        continue;
      }
      throw error;
    }
  }

  // Should not reach here, but safety net.
  throw lastError;
}
