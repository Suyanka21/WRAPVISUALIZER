/**
 * Image content validation helpers.
 *
 * Pure functions — no Express, no I/O, no side effects. Extracted from
 * backend/routes/segment.js per CodeRabbit (PR #24) to keep route files
 * under the project's 150-line cap and to make the magic-byte sniff
 * trivially unit-testable in isolation.
 */

/**
 * Sniff the first 12 bytes of an upload buffer and return the matched
 * MIME type, or null if the magic bytes don't match a supported format.
 *
 * Audit V2 rationale: file.mimetype as reported by multer is the
 * browser's Content-Type header — fully spoofable by a manual
 * multipart POST. A malicious upload can carry mimetype=image/jpeg
 * but contain a .exe payload, an SVG (which Replicate rejects), or
 * random bytes that waste a paid SAM-2 inference and return a
 * meaningless mask. Sniffing gives us a real input-validation
 * boundary that doesn't trust the client header.
 *
 * Supported formats and their magic-byte signatures:
 *   - JPEG: FF D8 FF
 *   - PNG:  89 50 4E 47 0D 0A 1A 0A
 *   - WebP: 'RIFF' (52 49 46 46) at 0..3 + 'WEBP' (57 45 42 50) at 8..11
 *
 * @param {Buffer | undefined | null} buf
 * @returns {'image/jpeg' | 'image/png' | 'image/webp' | null}
 */
export function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: 'RIFF' .... 'WEBP'
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}
