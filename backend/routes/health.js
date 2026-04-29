/**
 * GET /api/health — server status + Replicate readiness snapshot.
 *
 * Extracted from backend/server.js per CodeRabbit (PR #24, round 3).
 *
 * `replicate_configured` keeps its original semantic (env var
 * present) for backward compatibility with any external monitor
 * already polling it. New fields are additive:
 *   - `replicate_reachable` reflects whether the token actually
 *     authenticated against the Replicate API on the most recent
 *     check. `null` while the boot-time check is still in flight.
 *   - `replicate_check_age_ms` is how long ago the most recent
 *     check ran. The token is re-validated every
 *     REPLICATE_REVALIDATE_MS (default 60_000 ms), so this value
 *     should normally stay below ~1 minute. If it grows past
 *     several minutes, the re-validation loop has stalled — alert
 *     on it.
 *
 * Intentionally does NOT call any external API per request so the
 * endpoint stays fast, cheap, and never costs a Replicate billing
 * event. Healthcheck pollers can run as aggressively as they like.
 */

/**
 * Register the /api/health endpoint on the supplied Express app.
 *
 * @param {import('express').Express} app
 * @param {{ reachable: boolean | null, checkedAt: number | null, reason: string | null }} replicateState
 */
export function registerHealthRoute(app, replicateState) {
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      replicate_configured: Boolean(process.env.REPLICATE_API_TOKEN),
      replicate_reachable: replicateState.reachable,
      replicate_check_age_ms:
        replicateState.checkedAt === null
          ? null
          : Date.now() - replicateState.checkedAt,
    });
  });
}
