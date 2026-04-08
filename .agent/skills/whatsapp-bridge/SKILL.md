---
name: whatsapp-bridge
description: Use this skill when building the WhatsApp booking 
integration — generating a pre-filled WhatsApp message URL that 
bundles the client's vehicle selection, chosen wrap finish, estimated 
quote, and booking reference into a single tap-to-send message 
directed to the shop owner's WhatsApp number.
---

# WhatsApp Bridge Skill

## Goal
Build a GET /api/whatsapp endpoint that accepts booking details as 
query parameters and returns a formatted wa.me deep link URL. 
When the client taps "Book on WhatsApp" the browser opens WhatsApp 
with a professional, pre-written message ready to send — zero typing 
required from the client.

## File Location
backend/routes/whatsapp.js

## Instructions

### Input (query params):
- vehicle: vehicle label string
- finish: finish label string
- color: hex color selected
- total: total KES amount
- deposit: deposit KES amount
- ref: booking reference (e.g. WV-29401)
- design_prompt: optional custom design description

### Message Template:
Construct this exact message format:
WrapVisualizer Booking Inquiry
━━━━━━━━━━━━━━━━━━
Ref: {ref}
Vehicle: {vehicle}
Finish: {finish}
{color_line}
{design_prompt_line}
━━━━━━━━━━━━━━━━━━
Estimated Total: KES {total}
Deposit Required: KES {deposit}
━━━━━━━━━━━━━━━━━━
Please confirm my appointment slot.

- color_line: only include if color was selected: "Color: {hex}"
- design_prompt_line: only include if prompt was entered: 
  "Custom Design: {prompt}"

### URL Construction:
1. Encode the message using encodeURIComponent()
2. Shop owner WhatsApp number from env var: SHOP_WHATSAPP_NUMBER
   Format must be: 2547XXXXXXXX (no +, no spaces)
3. Return: https://wa.me/{SHOP_WHATSAPP_NUMBER}?text={encoded_message}

### Response:
{ "success": true, "url": "https://wa.me/254..." }

The frontend opens this URL in a new tab on button click.

### Booking Reference Generation:
Generate ref as: "WV-" + 5 random uppercase alphanumeric characters
Example: WV-K29X1

## Environment Variables:
- SHOP_WHATSAPP_NUMBER — the wrap shop owner's number in 2547XXXXXXXX format

## Constraints
- Never expose the shop owner's number in frontend code
- The message must be under 1,000 characters (WhatsApp pre-fill limit)
- If total is missing or zero: return 400 — 
  "Cannot generate booking without a quote"
- Always include the booking reference for shop tracking
