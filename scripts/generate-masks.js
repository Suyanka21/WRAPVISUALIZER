/**
 * generate-masks.js
 *
 * One-shot script that generates pre-baked segmentation masks for
 * the 7 template vehicle images. For each vehicle:
 *   1. Read the JPEG from frontend/assets/vehicles/
 *   2. Send it to Replicate SAM-2 for segmentation
 *   3. Download every individual mask
 *   4. Pick the single largest mask (most white pixels = biggest segment)
 *   5. Save it to frontend/assets/masks/<vehicle_id>.png
 *
 * Usage:
 *   node scripts/generate-masks.js
 *
 * Requires REPLICATE_API_TOKEN in .env.local at the repo root.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Manual .env.local parsing (no dotenv dependency at the root)
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const REPLICATE_API = 'https://api.replicate.com/v1';
const SAM2_VERSION =
  process.env.REPLICATE_SAM2_VERSION ||
  'fe97b453a6455861e3bac769b441ca1f1086110da7466dbb65cf1eecfd60dc83';

const TOKEN = process.env.REPLICATE_API_TOKEN;
if (!TOKEN) {
  console.error('ERROR: REPLICATE_API_TOKEN not set in .env.local');
  process.exit(1);
}

const VEHICLES_DIR = path.join(ROOT, 'frontend', 'assets', 'vehicles');
const MASKS_DIR = path.join(ROOT, 'frontend', 'assets', 'masks');

// Vehicle IDs must match the filenames in frontend/assets/vehicles/
const VEHICLES = [
  'land_cruiser_v8',
  'range_rover_vogue',
  'lexus_lx600',
  'prado',
  'mercedes_gle',
  'bmw_7_series',
  'subaru_outback',
];

/** Sleeps for the given number of milliseconds. */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Sends an image to Replicate SAM-2 and returns the prediction output. */
async function segment(base64DataUri) {
  const payload = {
    version: SAM2_VERSION,
    input: {
      image: base64DataUri,
      use_m2m: true,
      points_per_side: 32,
      pred_iou_thresh: 0.88,
      stability_score_thresh: 0.95,
    },
  };

  console.log('  → Sending to Replicate SAM-2...');
  const createRes = await fetch(`${REPLICATE_API}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify(payload),
  });

  let prediction = await createRes.json();

  // If synchronous result is ready
  if (prediction.status === 'succeeded' && prediction.output) {
    return prediction.output;
  }

  // Async fallback — poll
  const pollUrl = prediction.urls?.get;
  if (!pollUrl) throw new Error('No polling URL returned');

  console.log('  → Polling for result...');
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await sleep(2000);
    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    prediction = await pollRes.json();
    if (prediction.status === 'succeeded') return prediction.output;
    if (prediction.status === 'failed')
      throw new Error(prediction.error || 'SAM-2 failed');
    process.stdout.write('.');
  }
  throw new Error('Timeout waiting for SAM-2');
}

/** Downloads an image from a URL and returns a Buffer. */
async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Counts the number of white (bright) pixels in a mask image buffer.
 * SAM-2 individual masks are binary: white = segment, black = not.
 */
async function countWhitePixels(imgBuffer) {
  const img = await loadImage(imgBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;

  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    // White pixel: R > 200 && G > 200 && B > 200
    if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) {
      count++;
    }
  }
  return count;
}

/** Processes a single vehicle — segment, pick largest mask, save. */
async function processVehicle(vehicleId) {
  const imgPath = path.join(VEHICLES_DIR, `${vehicleId}.jpg`);
  if (!fs.existsSync(imgPath)) {
    console.warn(`  ⚠ Image not found: ${imgPath} — skipping`);
    return false;
  }

  // Read image as base64 data URI
  const buffer = fs.readFileSync(imgPath);
  const base64 = buffer.toString('base64');
  const dataUri = `data:image/jpeg;base64,${base64}`;

  // Call SAM-2
  const output = await segment(dataUri);

  const individualMasks = output.individual_masks || [];
  if (individualMasks.length === 0) {
    console.warn('  ⚠ No individual masks returned — skipping');
    return false;
  }

  console.log(`  → Got ${individualMasks.length} individual masks`);

  // Download all masks and find the largest one
  let largestBuffer = null;
  let largestPixels = 0;
  let largestIndex = -1;

  for (let i = 0; i < individualMasks.length; i++) {
    const maskUrl = individualMasks[i];
    console.log(`  → Downloading mask ${i + 1}/${individualMasks.length}...`);
    const maskBuffer = await downloadImage(maskUrl);
    const whitePixels = await countWhitePixels(maskBuffer);
    console.log(`    Mask ${i + 1}: ${whitePixels} white pixels`);

    if (whitePixels > largestPixels) {
      largestPixels = whitePixels;
      largestBuffer = maskBuffer;
      largestIndex = i;
    }
  }

  if (!largestBuffer) {
    console.warn('  ⚠ No valid mask found — skipping');
    return false;
  }

  // Save the largest mask as PNG
  const outPath = path.join(MASKS_DIR, `${vehicleId}.png`);
  fs.writeFileSync(outPath, largestBuffer);
  console.log(
    `  ✓ Saved mask ${largestIndex + 1} (${largestPixels} px) → ${outPath}`,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('WrapVisualizer — Pre-generating template vehicle masks\n');

  // Ensure output directory exists
  fs.mkdirSync(MASKS_DIR, { recursive: true });

  let success = 0;
  let failed = 0;

  for (const vehicleId of VEHICLES) {
    console.log(`\n[${vehicleId}]`);
    try {
      const ok = await processVehicle(vehicleId);
      if (ok) success++;
      else failed++;
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Done. ${success} masks generated, ${failed} failed.`);
  console.log(`Masks saved to: ${MASKS_DIR}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
