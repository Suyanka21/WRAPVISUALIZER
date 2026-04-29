// @ts-check
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

/**
 * Audit V2 regression: magic-byte content sniff on /api/segment.
 *
 * Boots a real backend on a test port, then POSTs three multipart
 * uploads:
 *   1. A real JPEG buffer with the right magic bytes — must be
 *      rejected only because Replicate auth fails (we don't care
 *      about the inference outcome, only that the sniff allowed it
 *      through).
 *   2. A spoofed upload with mimetype=image/jpeg but text content —
 *      must be rejected with code=invalid_image_content BEFORE
 *      Replicate is called.
 *   3. A truncated buffer (3 bytes) — also rejected as
 *      invalid_image_content.
 */

const SERVER_PATH = path.resolve(process.cwd(), 'backend', 'server.js');
const TEST_PORT = 3461;

async function waitForBoot(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await new Promise((resolve, reject) => {
        const req = http.get(
          { host: '127.0.0.1', port, path: '/api/health', timeout: 2000 },
          (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
          },
        );
        req.on('error', reject);
      });
      if (r === 200) return;
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start in 5s');
}

/** POST a single-part multipart/form-data upload directly via http. */
function postUpload(port, fileBuf, mimeType) {
  const boundary = '----wvboundary' + Math.random().toString(36).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="x.jpg"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([head, fileBuf, tail]);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: 'POST',
        host: '127.0.0.1',
        port,
        path: '/api/segment',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=' + boundary,
          'Content-Length': body.length,
          Origin: `http://127.0.0.1:${port}`,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            /* non-JSON */
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

test('magic-byte sniff rejects spoofed mimetype (audit V2)', async () => {
  test.setTimeout(15000);
  const child = spawn('node', [SERVER_PATH], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      REPLICATE_REVALIDATE_MS: '0',
      REPLICATE_API_TOKEN: 'r8_test_token_not_real',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForBoot(TEST_PORT);

    // 1. Spoofed mimetype + plain text body → reject before Replicate.
    const textBuf = Buffer.from('this is plainly not a jpeg file', 'utf8');
    const r1 = await postUpload(TEST_PORT, textBuf, 'image/jpeg');
    expect(r1.status).toBe(400);
    expect(r1.body && r1.body.code).toBe('invalid_image_content');

    // 2. Truncated buffer (under 12 bytes).
    const tinyBuf = Buffer.from([0xff, 0xd8, 0xff]);
    const r2 = await postUpload(TEST_PORT, tinyBuf, 'image/jpeg');
    expect(r2.status).toBe(400);
    expect(r2.body && r2.body.code).toBe('invalid_image_content');

    // 3. Spoofed PNG mimetype with JPEG magic bytes — sniff says
    //    'image/jpeg' but multer was told 'image/png'. The mismatch
    //    must reject (we don't trust either side independently).
    const jpegMagic = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(20, 0),
    ]);
    const r3 = await postUpload(TEST_PORT, jpegMagic, 'image/png');
    expect(r3.status).toBe(400);
    expect(r3.body && r3.body.code).toBe('invalid_image_content');

    // 4. Real JPEG magic bytes + matching mimetype: passes the sniff,
    //    fails downstream at Replicate auth (401 → upstream_auth, 503).
    //    The point is the response code is NOT invalid_image_content.
    const r4 = await postUpload(TEST_PORT, jpegMagic, 'image/jpeg');
    // Either 503 (auth/upstream) or 422 (no_vehicle_detected) is fine
    // — what we're asserting is that the sniff ALLOWED this through.
    expect(r4.body && r4.body.code).not.toBe('invalid_image_content');
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
    if (!child.killed) child.kill('SIGKILL');
  }
});
