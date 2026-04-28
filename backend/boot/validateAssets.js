/**
 * Boot-time asset validation.
 *
 * Fail-fast on deploy misconfiguration so the operator finds out from
 * platform logs (where it gets paged) instead of a real customer
 * loading a blank page. Every check here is cheap and synchronous.
 */

import fs from 'node:fs';
import path from 'path';

const REQUIRED_FRONTEND_FILES = [
  'screen1-upload.html',
  'screen2-studio.html',
  'screen3-quote.html',
  'screen4-confirmation.html',
  'assets/js/partners.js',
];

const MORPH_SENTINEL_FRAMES = ['ezgif-frame-001.jpg', 'ezgif-frame-240.jpg'];

/**
 * Validates that all required frontend assets and morph frames exist.
 * Calls process.exit(1) if any are missing.
 *
 * @param {string} frontendPath - Absolute path to the frontend/ directory.
 * @param {string} morphPath    - Absolute path to the lc30-morph/ directory.
 */
export function runBootChecks(frontendPath, morphPath) {
  for (const rel of REQUIRED_FRONTEND_FILES) {
    const abs = path.join(frontendPath, rel);
    if (!fs.existsSync(abs)) {
      console.error(
        `[Boot] FATAL: required frontend asset missing at ${abs}. ` +
          'Make sure the deploy artifact includes the frontend/ directory.',
      );
      process.exit(1);
    }
  }

  if (!fs.existsSync(morphPath)) {
    console.error(
      `[Boot] FATAL: lc30-morph/ directory missing at ${morphPath}.`,
    );
    process.exit(1);
  }

  for (const frame of MORPH_SENTINEL_FRAMES) {
    if (!fs.existsSync(path.join(morphPath, frame))) {
      console.error(
        `[Boot] FATAL: hero morph frame ${frame} missing in ${morphPath}.`,
      );
      process.exit(1);
    }
  }
}
