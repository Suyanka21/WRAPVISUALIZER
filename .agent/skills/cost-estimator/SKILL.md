---
name: cost-estimator
description: Use this skill when building or modifying the wrap cost 
calculation logic — the endpoint that takes vehicle type, wrap finish, 
vinyl brand, and optional add-ons and returns an itemized price estimate 
in KES. Also use when updating the pricing data or adding new vehicle 
categories.
---

# Cost Estimator Skill

## Goal
Build a POST /api/estimate endpoint that accepts vehicle and finish 
selections and returns an accurate, itemized price breakdown in KES 
based on real Nairobi market rates for high-end vehicle wrapping.

## File Location
backend/routes/estimate.js
backend/data/pricing.json

## Pricing Data
Create backend/data/pricing.json with this structure:
```json
{
  "vehicles": {
    "land_cruiser_v8": { "label": "Toyota Land Cruiser V8/LC300", 
      "size": "XL", "vinyl_sqm": 22 },
    "range_rover_vogue": { "label": "Range Rover Vogue", 
      "size": "XL", "vinyl_sqm": 20 },
    "lexus_lx600": { "label": "Lexus LX600", 
      "size": "XL", "vinyl_sqm": 21 },
    "prado": { "label": "Toyota Land Cruiser Prado", 
      "size": "L", "vinyl_sqm": 18 },
    "mercedes_gle": { "label": "Mercedes-Benz GLE", 
      "size": "L", "vinyl_sqm": 18 },
    "bmw_7_series": { "label": "BMW 7 Series", 
      "size": "L", "vinyl_sqm": 16 },
    "subaru_outback": { "label": "Subaru Outback", 
      "size": "M", "vinyl_sqm": 15 }
  },
  "finishes": {
    "matte": { "label": "Matte", "price_per_sqm": 4200 },
    "satin": { "label": "Satin", "price_per_sqm": 4500 },
    "gloss": { "label": "Gloss", "price_per_sqm": 3800 },
    "chrome": { "label": "Chrome", "price_per_sqm": 7500 },
    "colour_shift": { "label": "Colour Shift", 
      "price_per_sqm": 9000 },
    "carbon_fibre": { "label": "Carbon Fibre", 
      "price_per_sqm": 6500 },
    "brushed_metal": { "label": "Brushed Metal", 
      "price_per_sqm": 5800 },
    "ppf_clear": { "label": "PPF Clear", "price_per_sqm": 8500 }
  },
  "labour": {
    "M": 25000,
    "L": 35000,
    "XL": 45000
  },
  "addons": {
    "ppf_coating": { "label": "Paint Protection Film", 
      "price": 35000 },
    "ceramic_coat": { "label": "Ceramic Top Coat", 
      "price": 20000 },
    "window_tint": { "label": "Window Tinting", 
      "price": 15000 }
  },
  "deposit_percentage": 0.15
}
```

## Endpoint Instructions

### Input (request body):
{
  "vehicle_id": "land_cruiser_v8",
  "finish_id": "matte",
  "vinyl_brand": "3m",
  "addons": ["ppf_coating"]
}

### Calculation Logic:
1. Look up vehicle sqm and size from pricing.json
2. Look up finish price_per_sqm
3. Apply vinyl brand multiplier: 3M = 1.0x, Avery Dennison = 0.9x
4. vinyl_cost = sqm × price_per_sqm × brand_multiplier
5. labour_cost = pricing.labour[vehicle.size]
6. addons_cost = sum of selected addon prices
7. subtotal = vinyl_cost + labour_cost + addons_cost
8. deposit_amount = Math.ceil(subtotal × deposit_percentage / 1000) × 1000
   (round up to nearest KES 1,000)

### Response Format:
{
  "success": true,
  "breakdown": {
    "vinyl_material": { "label": "3M 2080 Series — Matte", 
      "amount": 92400 },
    "labour": { "label": "Professional Installation (XL Vehicle)", 
      "amount": 45000 },
    "addons": [
      { "label": "Paint Protection Film", "amount": 35000 }
    ]
  },
  "subtotal": 172400,
  "deposit_amount": 26000,
  "currency": "KES",
  "disclaimer": "Final quote confirmed by shop before work begins"
}

## Constraints
- All amounts must be integers (no decimals) in KES
- deposit_amount must always be rounded up to nearest KES 1,000
- If vehicle_id or finish_id not found: return 400 with 
  "Invalid selection. Please choose a valid vehicle and finish."
- Never return a price below KES 50,000 total 
  (if calculation produces this, flag it as an error — 
  it means bad input data)
