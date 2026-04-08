/**
 * M-Pesa Deposit Routes
 * 
 * POST /api/mpesa/initiate  — Triggers STK Push to client's phone
 * POST /api/mpesa/callback  — Receives Safaricom payment callback
 * 
 * Uses the Safaricom Daraja API sandbox.
 * Never goes live until explicitly instructed.
 */

import { Router } from 'express';
import axios from 'axios';
import { getAccessToken } from '../services/mpesa-auth.js';

const router = Router();

/**
 * Normalizes a Kenyan phone number to the 2547XXXXXXXX format.
 * Handles: 07XX, +2547XX, 2547XX input formats.
 */
function normalizePhone(phone) {
  let cleaned = String(phone).replace(/\s+/g, '').replace(/-/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.slice(1);
  }
  if (!cleaned.startsWith('254')) {
    cleaned = '254' + cleaned;
  }

  return cleaned;
}

/**
 * Generates a Daraja-compatible timestamp in YYYYMMDDHHmmss format.
 */
function generateTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

/**
 * POST /api/mpesa/initiate
 * Triggers an STK Push (Lipa Na M-Pesa Online) to the client's phone.
 */
router.post('/initiate', async (req, res) => {
  try {
    const { phone, amount, ref, vehicle } = req.body;

    // Validate required fields
    if (!phone || !amount || !ref) {
      return res.status(400).json({
        success: false,
        message: 'Phone number, amount, and booking reference are required.',
      });
    }

    // Amount must be a positive integer
    const intAmount = Math.round(Number(amount));
    if (isNaN(intAmount) || intAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid deposit amount.',
      });
    }

    const normalizedPhone = normalizePhone(phone);
    const shortcode = process.env.MPESA_SHORTCODE || '174379';
    const passkey = process.env.MPESA_PASSKEY;
    const backendUrl = process.env.BACKEND_URL;

    if (!passkey || !backendUrl) {
      console.error('[M-Pesa] Missing MPESA_PASSKEY or BACKEND_URL');
      return res.status(500).json({
        success: false,
        message: 'Payment service is not configured. Please contact support.',
      });
    }

    // Get OAuth token
    const accessToken = await getAccessToken();

    // Generate timestamp and password
    const timestamp = generateTimestamp();
    const password = Buffer.from(
      `${shortcode}${passkey}${timestamp}`
    ).toString('base64');

    // Send STK Push request
    const stkResponse = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: intAmount,
        PartyA: normalizedPhone,
        PartyB: shortcode,
        PhoneNumber: normalizedPhone,
        CallBackURL: `${backendUrl}/api/mpesa/callback`,
        AccountReference: ref,
        TransactionDesc: 'WrapVisualizer Booking Deposit',
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const { ResponseCode, CheckoutRequestID } = stkResponse.data;

    if (ResponseCode === '0') {
      res.json({
        success: true,
        message: 'Check your phone for the M-Pesa prompt',
        checkoutRequestId: CheckoutRequestID,
        ref,
      });
    } else {
      res.status(502).json({
        success: false,
        message: 'Could not initiate payment. Please try again.',
      });
    }
  } catch (error) {
    console.error('[M-Pesa Initiate Error]', error.message);
    res.status(500).json({
      success: false,
      message: 'Payment initiation failed. Please try again.',
    });
  }
});

/**
 * POST /api/mpesa/callback
 * Receives the Safaricom callback after STK Push completion.
 * Must always respond HTTP 200 — failure to do so causes retries.
 */
router.post('/callback', (req, res) => {
  try {
    const { Body } = req.body;
    const callback = Body?.stkCallback;

    if (!callback) {
      console.warn('[M-Pesa Callback] Malformed payload received');
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const { ResultCode, ResultDesc, CheckoutRequestID, CallbackMetadata } = callback;

    if (ResultCode === 0) {
      // Payment successful — extract metadata
      const items = CallbackMetadata?.Item || [];
      const meta = {};

      for (const item of items) {
        meta[item.Name] = item.Value;
      }

      console.log('[M-Pesa Payment Success]', {
        checkoutRequestId: CheckoutRequestID,
        receipt: meta.MpesaReceiptNumber,
        amount: meta.Amount,
        phone: meta.PhoneNumber,
      });
    } else {
      // Payment failed or cancelled by user
      console.log('[M-Pesa Payment Failed]', {
        checkoutRequestId: CheckoutRequestID,
        resultCode: ResultCode,
        reason: ResultDesc,
      });
    }

    // Always respond 200 to Safaricom
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('[M-Pesa Callback Error]', error.message);
    // Always respond 200 to Safaricom even on error
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
});

export default router;
