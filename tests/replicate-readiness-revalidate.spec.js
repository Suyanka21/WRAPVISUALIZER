// @ts-check
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const SERVER_PATH = path.resolve(process.cwd(), 'backend', 'server.js');
const TEST_PORT = 3457;

/**
 * Gracefully terminate a child process and only escalate to SIGKILL if
 * the SIGTERM is ignored.
 *
 * CodeRabbit (PR #24): the previous implementation read child.killed
 * after sending SIGTERM, but ChildProcess.killed is set true as soon as
 * the SIGNAL is delivered — not when the process actually exits. The
 * SIGKILL escalation was therefore unreachable, leaking a hung server
 * (and its bound port) into the next test. Use Promise.race against
 * the 'exit' event so we only escalate when the timeout actually wins.
 */
async function shutdown(child, sigtermTimeoutMs = 200) {
  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), sigtermTimeoutMs)),
  ]);
  if (!exited) {
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', () => resolve(undefined)));
  }
}

function getJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: urlPath, timeout: 5000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
            });
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('http timeout')));
  });
}

async function waitForBoot(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await getJson(port, '/api/health');
      if (r.status === 200) return r;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start in 5s');
}

/**
 * The readiness check is fire-and-forget at boot, so /api/health
 * returns 200 with `replicate_check_age_ms === null` until the first
 * validateToken() resolves. Tests need to wait for the first check to
 * actually complete before asserting on the age field.
 */
async function waitForFirstReadinessCheck(port) {
  for (let i = 0; i < 50; i++) {
    const r = await getJson(port, '/api/health');
    if (r.status === 200 && typeof r.body.replicate_check_age_ms === 'number') {
      return r;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('first readiness check did not complete in 5s');
}

test('replicate readiness re-validates periodically (audit CRITICAL-2)', async () => {
  test.setTimeout(15000);
  const child = spawn('node', [SERVER_PATH], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      REPLICATE_REVALIDATE_MS: '500',
      REPLICATE_API_TOKEN: 'r8_test_token_not_real',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForBoot(TEST_PORT);
    const a = await waitForFirstReadinessCheck(TEST_PORT);
    expect(a.status).toBe(200);
    expect(a.body).toHaveProperty('replicate_check_age_ms');
    expect(typeof a.body.replicate_check_age_ms).toBe('number');

    await new Promise((r) => setTimeout(r, 1500));
    const b = await getJson(TEST_PORT, '/api/health');
    expect(b.status).toBe(200);
    expect(
      b.body.replicate_check_age_ms,
      'replicate_check_age_ms should reset after each re-validation tick',
    ).toBeLessThan(1500);

    await new Promise((r) => setTimeout(r, 1500));
    const c = await getJson(TEST_PORT, '/api/health');
    expect(c.status).toBe(200);
    expect(c.body.replicate_check_age_ms).toBeLessThan(1500);
  } finally {
    await shutdown(child);
  }
});

test('replicate readiness re-validation can be disabled with =0', async () => {
  test.setTimeout(10000);
  const child = spawn('node', [SERVER_PATH], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT + 1),
      REPLICATE_REVALIDATE_MS: '0',
      REPLICATE_API_TOKEN: 'r8_test_token_not_real',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForBoot(TEST_PORT + 1);
    const a = await waitForFirstReadinessCheck(TEST_PORT + 1);
    await new Promise((r) => setTimeout(r, 1200));
    const b = await getJson(TEST_PORT + 1, '/api/health');

    expect(b.body.replicate_check_age_ms).toBeGreaterThan(
      a.body.replicate_check_age_ms + 800,
    );
  } finally {
    await shutdown(child);
  }
});
