/**
 * Replicate API readiness state and boot-time token validation.
 *
 * Health is reported as additive fields on /api/health (existing
 * `replicate_configured` retains its original env-var-presence
 * semantic; new fields are opt-in).
 */

import { validateToken } from '../services/replicate.js';

/**
 * Shared readiness state — consumed by the /api/health handler.
 */
export const replicateState = {
  /** True if /v1/account returned 2xx with a username at boot. */
  reachable: null,
  /** Wall clock of the last check (ms since epoch). */
  checkedAt: null,
  /**
   * 'missing_token' | 'invalid_token' | 'timeout' | 'network_error' |
   * 'unexpected_status' | null when reachable.
   */
  reason: null,
};

/**
 * Runs an async token validation against the Replicate API and
 * updates `replicateState` with the result.
 *
 * Does NOT block server startup — call this after listen().
 *
 * @param {string|undefined} token - The REPLICATE_API_TOKEN value.
 */
export async function initReplicateReadiness(token) {
  const result = await validateToken(token);
  replicateState.reachable = result.valid;
  replicateState.checkedAt = Date.now();
  replicateState.reason = result.valid ? null : result.reason;

  if (result.valid) {
    console.info(
      `[Replicate] Token validated for account=${result.account}`,
    );
  } else {
    console.error(
      `[Replicate] Token validation FAILED reason=${result.reason}` +
        (result.status ? ` status=${result.status}` : '') +
        ' — /api/segment will fail until the token is fixed.',
    );
  }
}
