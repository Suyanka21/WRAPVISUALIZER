/**
 * 404 and global error handlers.
 *
 * Catches all unhandled errors and returns a user-friendly message.
 * Raw error codes and stack traces are never sent to the client.
 */

/** 404 handler — mount *after* every route. */
export function notFoundHandler(_req, res) {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found.',
  });
}

/** Express error-handling middleware. Signature must be (err, req, res, next). */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  console.error('[Server Error]', err.message);

  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({
      success: false,
      message: 'Cross-origin request blocked.',
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.userMessage || 'Something went wrong on our end. Please try again.',
  });
}
