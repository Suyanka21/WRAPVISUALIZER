/**
 * Cost Estimator Route
 * 
 * POST /api/estimate
 * 
 * Accepts vehicle type, wrap finish, vinyl brand, and optional add-ons.
 * Returns an itemized price breakdown in KES based on real Nairobi
 * market rates for high-end vehicle wrapping.
 */

import { Router } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Load pricing data at startup
const pricingPath = path.join(__dirname, '..', 'data', 'pricing.json');
const pricing = JSON.parse(readFileSync(pricingPath, 'utf-8'));

// Brand multipliers: 3M is the baseline, Avery Dennison is 10% cheaper
const BRAND_MULTIPLIERS = {
  '3m': 1.0,
  'avery_dennison': 0.9,
};

/**
 * Calculates an itemized wrap cost estimate.
 * All amounts are integers in KES (no decimals).
 */
router.post('/', (req, res) => {
  try {
    const { vehicle_id, finish_id, vinyl_brand = '3m', addons = [] } = req.body;

    // Validate required fields
    if (!vehicle_id || !finish_id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid selection. Please choose a valid vehicle and finish.',
      });
    }

    // Look up vehicle
    const vehicle = pricing.vehicles[vehicle_id];
    if (!vehicle) {
      return res.status(400).json({
        success: false,
        message: 'Invalid selection. Please choose a valid vehicle and finish.',
      });
    }

    // Look up finish
    const finish = pricing.finishes[finish_id];
    if (!finish) {
      return res.status(400).json({
        success: false,
        message: 'Invalid selection. Please choose a valid vehicle and finish.',
      });
    }

    // Resolve brand multiplier (default to 3M if unknown)
    const brandKey = (vinyl_brand || '3m').toLowerCase().replace(/\s+/g, '_');
    const brandMultiplier = BRAND_MULTIPLIERS[brandKey] || 1.0;
    const brandLabel = brandKey === 'avery_dennison' ? 'Avery Dennison' : '3M';

    // Calculate vinyl material cost
    const vinylCost = Math.round(
      vehicle.vinyl_sqm * finish.price_per_sqm * brandMultiplier
    );

    // Labour cost based on vehicle size category
    const labourCost = pricing.labour[vehicle.size];

    // Calculate add-ons total
    const resolvedAddons = [];
    let addonsCost = 0;

    for (const addonId of addons) {
      const addon = pricing.addons[addonId];
      if (addon) {
        resolvedAddons.push({ label: addon.label, amount: addon.price });
        addonsCost += addon.price;
      }
    }

    // Compute subtotal
    const subtotal = vinylCost + labourCost + addonsCost;

    // Safety check: no quote should be below KES 50,000
    if (subtotal < 50000) {
      return res.status(500).json({
        success: false,
        message: 'Pricing error detected. Please contact support.',
      });
    }

    // Deposit: round up to nearest KES 1,000
    const depositAmount =
      Math.ceil((subtotal * pricing.deposit_percentage) / 1000) * 1000;

    res.json({
      success: true,
      breakdown: {
        vinyl_material: {
          label: `${brandLabel} 2080 Series — ${finish.label}`,
          amount: vinylCost,
        },
        labour: {
          label: `Professional Installation (${vehicle.size} Vehicle)`,
          amount: labourCost,
        },
        addons: resolvedAddons,
      },
      subtotal,
      deposit_amount: depositAmount,
      currency: 'KES',
      disclaimer: 'This is an approximate estimate. Final pricing confirmed directly by the shop.',
    });
  } catch (error) {
    console.error('[Estimate Error]', error.message);
    res.status(500).json({
      success: false,
      message: 'Could not calculate estimate. Please try again.',
    });
  }
});

export default router;
