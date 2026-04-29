/**
 * Differentiated error responses for /api/segment.
 *
 * Extracted from backend/routes/segment.js per CodeRabbit (PR #24,
 * round 3) to keep the route file under the project's 150-line cap
 * and to make the failure-mode mapping unit-testable in isolation.
 *
 * End-user wording is intentionally consistent across upstream
 * failure modes ("AI service is temporarily unavailable" /
 * "AI service is busy") so we don't leak Replicate as the
 * dependency, billing state, or credential-misconfiguration cues
 * to the client. The `code` field is the stable contract that
 * clients and tests use to discriminate between failure modes.
 */

/**
 * Map a thrown error from segmentImage() (or the surrounding
 * await chain) to a consistent JSON response on `res`. Mutates
 * `res` and returns it.
 *
 * Branches (in order):
 *   - `error.message === 'TIMEOUT'`            → 504 upstream_timeout
 *   - upstream status 429                       → 503 upstream_rate_limited
 *                                                 + Retry-After header
 *   - upstream status 402                       → 503 upstream_billing
 *   - upstream status 401                       → 503 upstream_auth
 *   - upstream status 5xx                       → 503 upstream_unavailable
 *   - default                                   → 500 unexpected_error
 *
 * @param {any} error
 * @param {import('express').Response} res
 */
export function handleSegmentError(error, res) {
  const detail = error?.response?.data?.detail || error?.response?.data?.message;
  const status = error?.response?.status;
  console.error(
    `[Segment Error] ${error?.message}` +
      (status ? ` status=${status}` : '') +
      (detail ? ` detail=${detail}` : ''),
  );

  if (error?.message === 'TIMEOUT') {
    return res.status(504).json({
      success: false,
      code: 'upstream_timeout',
      message:
        'AI processing timed out. Please try again with a smaller or clearer photo.',
    });
  }

  if (status === 429) {
    // Rate-limited by Replicate. Tell the client to back off; the
    // 503 + Retry-After pair is the standard signal to the browser /
    // fetch layer to wait before retrying. Forward Replicate's
    // Retry-After if it sent one, else default to 30s.
    const retryAfter = Number(error.response.headers?.['retry-after']) || 30;
    res.set('Retry-After', String(retryAfter));
    return res.status(503).json({
      success: false,
      code: 'upstream_rate_limited',
      retry_after_seconds: retryAfter,
      message: 'Our AI service is busy right now. Please try again in a moment.',
    });
  }

  if (status === 402) {
    // Real cause is logged above ("status=402"); surface a generic
    // message so end-users don't see our provider name or billing
    // state. Ops should watch for 402s in logs and top up credits.
    return res.status(503).json({
      success: false,
      code: 'upstream_billing',
      message:
        'Our AI service is temporarily unavailable. Please try again in a moment.',
    });
  }

  if (status === 401) {
    // Same rationale — auth misconfiguration is an ops problem, not
    // something to leak to end-users. 503 matches the 402 branch so
    // any client banner keyed off status code treats them uniformly
    // as "service temporarily unavailable".
    return res.status(503).json({
      success: false,
      code: 'upstream_auth',
      message:
        'Our AI service is temporarily unavailable. Please try again in a moment.',
    });
  }

  if (typeof status === 'number' && status >= 500 && status < 600) {
    // Replicate (or its CDN) returned 5xx. This is a provider outage
    // from our perspective, not a malformed-request issue, so 503 is
    // more accurate than 500 (which clients may interpret as our
    // backend being broken). Distinct `code` lets ops dashboards
    // count provider-down minutes separately.
    return res.status(503).json({
      success: false,
      code: 'upstream_unavailable',
      message:
        'Our AI service is temporarily unavailable. Please try again in a moment.',
    });
  }

  return res.status(500).json({
    success: false,
    code: 'unexpected_error',
    message: 'Image processing failed. Please try again with a different photo.',
  });
}
