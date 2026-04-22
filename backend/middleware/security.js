/**
 * Security middleware — Helmet + Content Security Policy.
 *
 * The frontend is served from the same origin as the API, uses inline
 * `<style>` and `<script>` blocks (plus `style="..."` attributes), and
 * pulls in Google Fonts (fonts.googleapis.com / fonts.gstatic.com) for
 * the typefaces and Material Symbols icon set.
 *
 * Rationale for each directive:
 *   default-src 'self'           — lock everything to same-origin by default
 *   img-src 'self' data: https:  — `data:` for FileReader previews and
 *                                   base64 uploads; `https:` so Replicate-
 *                                   hosted segmented-mask URLs render
 *   script-src 'self' 'unsafe-inline' — inline <script> blocks in all four
 *                                   HTML screens; no external CDNs remain
 *   style-src  'self' 'unsafe-inline' https://fonts.googleapis.com
 *                                   — inline <style> + style="" attrs, and
 *                                   Google Fonts' CSS file
 *   font-src   'self' https://fonts.gstatic.com
 *                                   — actual woff2 font files
 *   connect-src 'self'           — only talk to our own /api/* endpoints
 *   object-src 'none'            — defense-in-depth: block <embed>/<object>
 *   frame-ancestors 'none'       — no framing (clickjacking)
 *
 * Tradeoff: `'unsafe-inline'` for scripts and styles is required because
 * the HTML screens ship with inline code; switching to external files or
 * nonces is a separate stage. The remaining directives still prevent
 * loading attacker-controlled scripts from arbitrary origins.
 */

import helmet from 'helmet';

export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
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
