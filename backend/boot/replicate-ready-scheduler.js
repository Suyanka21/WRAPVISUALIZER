/**
 * Periodic Replicate readiness scheduler.
 *
 * Re-validates the Replicate API token on a self-scheduling cadence
 * so that mid-uptime token rotations or Replicate-side credential
 * revocations are reflected in /api/health within one interval —
 * not silently invisible until the next process restart.
 *
 * Self-scheduling pattern (CodeRabbit, PR #24): the previous
 * `setInterval(check, REVALIDATE_MS)` could fire a second check
 * while the first was still in flight under slow-network or small
 * REPLICATE_REVALIDATE_MS settings, which races `replicateState`
 * and adds avoidable load to Replicate's /v1/account endpoint. We
 * use `setTimeout` and only schedule the next tick once the
 * current check has settled (resolve OR reject).
 *
 * The current pending timer is `.unref()`'d so that graceful
 * shutdown isn't blocked on a queued check.
 */

import { validateToken } from '../services/replicate.js';

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Run a single readiness check against Replicate and update the
 * shared replicateState. Always resolves — any unexpected error is
 * caught and reflected as `reachable=false reason='init_error'`
 * so it can never leak as an unhandled rejection.
 *
 * @param {string | undefined} token
 * @param {{ reachable: boolean | null, checkedAt: number | null, reason: string | null }} replicateState
 */
export async function runReplicateReadinessCheck(token, replicateState) {
  try {
    const result = await validateToken(token);
    replicateState.reachable = result.valid;
    replicateState.checkedAt = Date.now();
    replicateState.reason = result.valid ? null : result.reason;
    if (result.valid) {
      console.info(`[Replicate] Token validated for account=${result.account}`);
    } else {
      console.error(
        `[Replicate] Token validation FAILED reason=${result.reason}` +
          (result.status ? ` status=${result.status}` : '') +
          ' — /api/segment will fail until the token is fixed.',
      );
    }
  } catch (error) {
    console.error(
      '[Replicate] Unexpected error while validating readiness state.',
      error,
    );
    replicateState.reachable = false;
    replicateState.checkedAt = Date.now();
    replicateState.reason = 'init_error';
  }
}

/**
 * Read REPLICATE_REVALIDATE_MS, returning the configured interval in
 * milliseconds. Non-numeric input falls back to 0 (disabled). Negative
 * values clamp to 0. Undefined falls back to the default 60 s.
 *
 * @param {string | undefined} raw
 */
export function parseRevalidateMs(raw) {
  if (raw === undefined) return DEFAULT_INTERVAL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

/**
 * Start the readiness scheduler.
 *
 * Returns a `stop()` function that cancels any pending re-check —
 * useful in tests, but never called in production (process exit
 * is the canonical shutdown).
 *
 * Setting `intervalMs === 0` disables the scheduler entirely (still
 * runs the boot-time check). Useful in test harnesses that want a
 * single deterministic readiness snapshot.
 *
 * @param {object} args
 * @param {string | undefined} args.token
 * @param {{ reachable: boolean | null, checkedAt: number | null, reason: string | null }} args.replicateState
 * @param {number} args.intervalMs
 * @returns {{ stop: () => void }}
 */
export function startReplicateReadinessScheduler({ token, replicateState, intervalMs }) {
  // Boot-time check: fire-and-forget. Resolves into replicateState; any
  // rejection is caught inside runReplicateReadinessCheck so this can
  // never escape as an unhandled rejection.
  let bootCheck = runReplicateReadinessCheck(token, replicateState);

  /** @type {NodeJS.Timeout | null} */
  let timer = null;
  let stopped = false;

  function scheduleNext() {
    if (stopped || intervalMs <= 0) return;
    timer = setTimeout(async () => {
      // Self-scheduling means we re-enter only after the current run
      // resolves — no overlap, no stacking, no race against
      // replicateState mutations from a previous tick.
      try {
        await runReplicateReadinessCheck(token, replicateState);
      } finally {
        scheduleNext();
      }
    }, intervalMs);
    // Don't keep the event loop alive solely for this timer — graceful
    // shutdown should still exit even if a check is queued.
    timer.unref();
  }

  if (intervalMs > 0) {
    // Chain the first scheduled re-check off the boot check so we
    // never have two concurrent /v1/account calls in flight at once,
    // even on a host with REPLICATE_REVALIDATE_MS smaller than the
    // boot check's wall time.
    bootCheck.then(scheduleNext, scheduleNext);
  }

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
