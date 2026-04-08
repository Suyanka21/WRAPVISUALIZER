/**
 * M-Pesa Auth Service
 * 
 * Handles OAuth token generation and caching for the
 * Safaricom Daraja API (sandbox environment).
 * Tokens are cached and only refreshed when expired.
 */

import axios from 'axios';

// Cached token state
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Generates a new OAuth access token from the Daraja sandbox.
 * Uses Base64-encoded CONSUMER_KEY:CONSUMER_SECRET credentials.
 * Caches the token for its expiry duration (typically 3599 seconds).
 */
async function getAccessToken() {
  const now = Date.now();

  // Return cached token if still valid (with 60s safety buffer)
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error('M-Pesa credentials not configured.');
  }

  // Base64 encode credentials
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  const response = await axios.get(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    }
  );

  cachedToken = response.data.access_token;
  // Cache for the token's lifetime (default 3599 seconds)
  const expiresIn = parseInt(response.data.expires_in, 10) || 3599;
  tokenExpiresAt = now + expiresIn * 1000;

  return cachedToken;
}

export { getAccessToken };
