---
name: testing-e2e
description: Use this skill when testing the WrapVisualizer 4-screen flow
  end-to-end — from template selection through estimate display to WhatsApp
  confirmation. Covers server startup, API verification, sessionStorage
  flow, and PPF toggle behavior.
---

# E2E Testing Skill

## Goal
Verify the full 4-screen wrap estimate flow works correctly:
screen1 (upload/template) → screen2 (studio) → screen3 (quote) → screen4 (confirmation)

## Prerequisites

### Start the Server
```bash
cd /home/ubuntu/repos/WRAPVISUALIZER
npm install
npm start
# Server runs on port 3001
```

### Devin Secrets Needed
None — the app runs fully locally with no external auth.

## Testing Steps

### 1. Verify API Contract First (curl)
Before testing the UI, verify the backend returns expected values:
```bash
curl -s -X POST http://localhost:3001/api/estimate \
  -H 'Content-Type: application/json' \
  -d '{"vehicle_id":"land_cruiser_v8","finish_id":"chrome","vinyl_brand":"3m","addons":[]}' | jq .
```

Expected response shape:
```json
{
  "success": true,
  "breakdown": {
    "vinyl_material": { "label": "...", "amount": 165000 },
    "labour": { "label": "...", "amount": 45000 },
    "addons": []
  },
  "subtotal": 210000,
  "deposit_amount": 32000
}
```

### 2. Pre-Calculate Expected UI Values
The frontend transforms the API response. For land_cruiser_v8 + chrome:
- vinylCost = 22 sqm × 7,500 KES/sqm = **165,000**
- labourCost (XL) = **45,000**
- subtotal = **210,000**
- estimate_low = floor(210,000 × 0.85) = **178,500**
- estimate_high = ceil(210,000 × 1.15) = **241,500**
- ppf_cost = **35,000** (from PPF_DEFAULT, matches pricing.json)
- With PPF: low = **213,500**, high = **276,500**

### 3. Screen 1 → Screen 2
- Navigate to `http://localhost:3001/frontend/screen1-upload.html`
- Click a template card (e.g., Toyota Land Cruiser V8/LC300)
- Verify auto-navigation to screen2-studio.html

### 4. Screen 2 → Screen 3
- Verify vehicle name appears in context bar
- Select a finish (e.g., Chrome)
- Click "GET MY QUOTE" button
- Verify navigation to screen3-quote.html

### 5. Screen 3 — Estimate Verification
- Verify estimate range matches pre-calculated values
- Verify vinyl and labor cost breakdown
- Toggle PPF ON → verify KES 35,000 added, range updates
- Toggle PPF OFF → verify range returns to original

### 6. Screen 3 → Screen 4
- Click a WhatsApp button
- Verify WhatsApp opens with pre-filled message
- Verify screen4-confirmation.html loads with vehicle context

### 7. Console Error Check
- Open browser console on each screen
- Only acceptable warnings: Tailwind CDN production warning
- No TypeError or uncaught exceptions should appear

## Common Gotchas

### API Parameter Mapping
The frontend uses display labels (e.g., "Chrome") but the API expects
snake_case keys (e.g., "chrome"). The `FMAP` object in screen2-studio.html
handles this mapping. If estimates look wrong, check that FMAP keys match
`backend/data/pricing.json` finish keys.

### PPF Cost Handling
- `PPF_DEFAULT` in screen2 must match `pricing.json → addons → ppf_coating → price`
- screen3 uses a null check (`est.ppf_cost != null`) not a falsy check (`||`)
  because ppf_cost of 0 is a valid value that `||` would incorrectly override
- Both screen2 and screen3 fallback values must be the same (currently 35000)

### API Response Transformation
The backend returns `breakdown.vinyl_material.amount` but screen3 expects
`vinyl_cost`. Screen2's success handler transforms the response shape.
If screen3 shows fallback values despite API success, check the
transformation in screen2's fetch callback.

### sessionStorage Keys
All keys use the `wv_` prefix:
- `wv_estimate` — JSON with estimate data (set by screen2, read by screen3)
- `wv_selected_vehicle` — vehicle label
- `wv_selected_finish` — finish label
- `wv_selected_color` — color label

## Test Vehicles for Quick Verification

| Vehicle | ID | Size | Sqm | Chrome vinyl cost |
|---------|-----|------|-----|-------------------|
| Land Cruiser V8 | land_cruiser_v8 | XL | 22 | 165,000 |
| Subaru Outback | subaru_outback | M | 15 | 112,500 |
| BMW 7 Series | bmw_7_series | L | 16 | 120,000 |
