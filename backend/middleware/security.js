/**
 * Security middleware — Helmet + Content Security Policy.
 *
 * The frontend is served from the same origin as the API. All screen-
 * specific JavaScript lives in `frontend/assets/js/*.js` and is linked
 * via `<script src="...">` tags, so `'unsafe-inline'` is NOT needed on
 * script-src. Google Fonts (fonts.googleapis.com / fonts.gstatic.com)
 * are still pulled in for typefaces and the Material Symbols icon set.
 *
 * Rationale for each directive:
 *   default-src 'self'           — lock everything to same-origin by default
 *   img-src 'self' data:         — `data:` for FileReader previews and
 *                                   base64 uploads served to screen2
 *       https://replicate.delivery https://*.replicate.com
 *                                   — Replicate-hosted segmented-mask URLs
 *   script-src 'self'            — external files only; no inline <script>
 *   style-src  'self' 'unsafe-inline' https://fonts.googleapis.com
 *                                   — inline <style> + style="" attrs, and
 *                                   Google Fonts' CSS file. `'unsafe-inline'`
 *                                   is a known remaining gap for styles;
 *                                   tightening it is deferred to a later
 *                                   stage because many screens still rely
 *                                   on style="" attributes.
 *   font-src   'self' https://fonts.gstatic.com
 *                                   — actual woff2 font files
 *   connect-src 'self'           — only talk to our own /api/* endpoints
 *   object-src 'none'            — defense-in-depth: block <embed>/<object>
 *   frame-ancestors 'none'       — no framing (clickjacking)
 */

import helmet from 'helmet';

export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: [
        "'self'",
        'data:',
        'https://replicate.delivery',
        'https://*.replicate.com',
      ],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  // Keep COEP disabled — Google Fonts would otherwise be blocked on
  // some browsers because the font files don't set the required CORP
  // headers.
  crossOriginEmbedderPolicy: false,
  // Google Fonts responses also need to be readable cross-origin.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});
