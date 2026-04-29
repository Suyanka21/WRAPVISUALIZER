/**
 * Hero morph asset validator (boot-time fail-fast).
 *
 * The landing page plays a 240-frame scroll-driven JPEG morph
 * (`lc30-morph/ezgif-frame-001.jpg` … `ezgif-frame-240.jpg`). A
 * partial copy or a missing middle frame causes the animation to
 * freeze on the first paint of the marketing page, which is the
 * worst possible regression — silently broken, off-funnel.
 *
 * Audit W6 + CodeRabbit (PR #24): we previously checked sentinel
 * frames (first/last) and the total file count, but a count-only
 * check passes if frame N is missing while a stray (e.g. orphan)
 * frame matching the same regex fills the slot. Enumerate every
 * expected filename and verify each exists.
 *
 * Pure-ish: only `fs` calls; no Express, no global state.
 */

import fs from 'node:fs';
import path from 'node:path';

const EXPECTED_MORPH_FRAMES = 240;
const FRAME_RE = /^ezgif-frame-\d{3}\.jpg$/;

/**
 * Verify the morph directory exists and contains exactly the
 * expected `ezgif-frame-001.jpg` … `ezgif-frame-240.jpg` set.
 *
 * On any deviation: log a `[Boot] FATAL ...` line that names the
 * specific missing files (capped to 5 in the message so the line
 * stays grep-able in platform logs) and call `exitFn(1)`.
 *
 * `exitFn` defaults to `process.exit` and is overridable for unit
 * tests that need to assert the exit-with-code behavior without
 * actually killing the test runner.
 *
 * @param {string} morphPath - absolute path to the lc30-morph dir
 * @param {(code: number) => void} [exitFn=process.exit]
 */
export function validateMorphOrExit(morphPath, exitFn = process.exit) {
  if (!fs.existsSync(morphPath)) {
    console.error(`[Boot] FATAL: lc30-morph/ directory missing at ${morphPath}.`);
    return exitFn(1);
  }

  const present = new Set(
    fs.readdirSync(morphPath).filter((name) => FRAME_RE.test(name)),
  );

  const missing = [];
  for (let i = 1; i <= EXPECTED_MORPH_FRAMES; i += 1) {
    const expected = `ezgif-frame-${String(i).padStart(3, '0')}.jpg`;
    if (!present.has(expected)) missing.push(expected);
  }

  // Two failure modes we want to surface separately:
  //   1. Genuinely missing frames (most common — partial copy).
  //   2. Right count, but the set is wrong (e.g. someone added an
  //      orphan frame-241 and removed frame-100). The size check
  //      catches case 2 even when `missing` is empty.
  if (missing.length || present.size !== EXPECTED_MORPH_FRAMES) {
    const detail = missing.length
      ? ` Missing: ${missing.slice(0, 5).join(', ')}` +
        (missing.length > 5 ? ` (+${missing.length - 5} more)` : '')
      : ` Found ${present.size} matching files; expected exactly ${EXPECTED_MORPH_FRAMES}.`;
    console.error(
      `[Boot] FATAL: lc30-morph/ at ${morphPath} is incomplete or has unexpected files. ` +
        `Expected ezgif-frame-001.jpg through ezgif-frame-${String(EXPECTED_MORPH_FRAMES).padStart(3, '0')}.jpg.` +
        detail +
        ' Re-deploy the artifact with the full frame set.',
    );
    return exitFn(1);
  }
}

/**
 * Verify every required frontend asset exists. Same exit semantics
 * as validateMorphOrExit. Kept in the same module so that "what
 * does the boot check?" is in one place.
 *
 * @param {string} frontendPath
 * @param {string[]} requiredRelPaths
 * @param {(code: number) => void} [exitFn=process.exit]
 */
export function validateFrontendAssetsOrExit(
  frontendPath,
  requiredRelPaths,
  exitFn = process.exit,
) {
  for (const rel of requiredRelPaths) {
    const abs = path.join(frontendPath, rel);
    if (!fs.existsSync(abs)) {
      console.error(
        `[Boot] FATAL: required frontend asset missing at ${abs}. ` +
          'Make sure the deploy artifact includes the frontend/ directory.',
      );
      return exitFn(1);
    }
  }
}
