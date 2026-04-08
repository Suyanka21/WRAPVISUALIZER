/**
 * WhatsApp Bridge Route
 * 
 * GET /api/whatsapp
 * 
 * Generates a pre-filled WhatsApp deep link (wa.me URL) with the
 * client's booking details formatted as a professional message.
 * The shop owner's number is kept server-side — never exposed to frontend.
 */

import { Router } from 'express';

const router = Router();

/**
 * Generates a random booking reference in the format WV-XXXXX
 * (5 uppercase alphanumeric characters).
 */
function generateRef() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'WV-';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Formats a KES amount with thousands separators.
 * Example: 185000 → "185,000"
 */
function formatKES(amount) {
  return Number(amount).toLocaleString('en-KE');
}

/**
 * GET /api/whatsapp
 * Accepts booking details as query parameters and returns a
 * formatted wa.me deep link URL.
 */
router.get('/', (req, res) => {
  try {
    const {
      vehicle,
      finish,
      color,
      total,
      deposit,
      ref,
      design_prompt,
    } = req.query;

    // Validate: total must exist and be non-zero
    if (!total || Number(total) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot generate booking without a quote.',
      });
    }

    const shopNumber = process.env.SHOP_WHATSAPP_NUMBER;
    if (!shopNumber) {
      console.error('[WhatsApp] SHOP_WHATSAPP_NUMBER not configured');
      return res.status(500).json({
        success: false,
        message: 'Booking service is not configured. Please contact support.',
      });
    }

    // Use provided ref or generate one
    const bookingRef = ref || generateRef();

    // Build the message
    const lines = [
      '🚗 *WrapVisualizer Booking Inquiry*',
      '━━━━━━━━━━━━━━━━━━',
      `Ref: ${bookingRef}`,
      `Vehicle: ${vehicle || 'Not specified'}`,
      `Finish: ${finish || 'Not specified'}`,
    ];

    // Optional color line
    if (color) {
      lines.push(`Color: ${color}`);
    }

    // Optional design prompt line
    if (design_prompt) {
      lines.push(`Custom Design: ${design_prompt}`);
    }

    lines.push('━━━━━━━━━━━━━━━━━━');
    lines.push(`Estimated Total: KES ${formatKES(total)}`);

    if (deposit) {
      lines.push(`Deposit Required: KES ${formatKES(deposit)}`);
    }

    lines.push('━━━━━━━━━━━━━━━━━━');
    lines.push('Please confirm my appointment slot.');

    const message = lines.join('\n');

    // Safety check: WhatsApp pre-fill limit is ~1000 characters
    if (message.length > 1000) {
      console.warn('[WhatsApp] Message exceeds 1000 chars, truncating design prompt');
    }

    // Construct wa.me URL
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${shopNumber}?text=${encodedMessage}`;

    res.json({
      success: true,
      url,
      ref: bookingRef,
    });
  } catch (error) {
    console.error('[WhatsApp Error]', error.message);
    res.status(500).json({
      success: false,
      message: 'Could not generate booking link. Please try again.',
    });
  }
});

export default router;
