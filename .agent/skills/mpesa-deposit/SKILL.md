---
name: mpesa-deposit
description: Use this skill when building or modifying the M-Pesa 
deposit integration — the STK Push flow that prompts a client's 
phone with a Safaricom payment request for a booking deposit amount. 
Uses the Safaricom Daraja API sandbox. Also use when handling the 
M-Pesa callback, checking transaction status, or updating the 
booking record after successful payment.
---

# M-Pesa Deposit Skill

## Goal
Build a POST /api/mpesa/initiate endpoint that triggers a Daraja 
STK Push (Lipa Na M-Pesa Online) to the client's phone number for 
the deposit amount. Build a POST /api/mpesa/callback endpoint that 
Safaricom calls after payment success or failure.

## File Location
backend/routes/mpesa.js
backend/services/mpesa-auth.js

## Daraja API Setup

### Auth Service (mpesa-auth.js):
1. Endpoint: POST to Daraja sandbox OAuth URL
   https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials
2. Credentials: Base64 encode CONSUMER_KEY:CONSUMER_SECRET
3. Cache the token for its expiry duration (typically 3599 seconds)
4. Export a function getAccessToken() that returns a valid token, 
   refreshing only when expired

### STK Push Endpoint (POST /api/mpesa/initiate):

Input:
{
  "phone": "0712345678",
  "amount": 26000,
  "ref": "WV-K29X1",
  "vehicle": "Land Cruiser LC300"
}

Instructions:
1. Call getAccessToken() from mpesa-auth.js
2. Normalize phone number to 2547XXXXXXXX format:
   - Strip leading 0, prepend 254
   - Strip leading +254, prepend 254
3. Generate timestamp: format as YYYYMMDDHHmmss
4. Generate password: Base64(BUSINESS_SHORTCODE + PASSKEY + timestamp)
5. POST to STK Push URL:
   https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest
6. Payload:
   - BusinessShortCode: MPESA_SHORTCODE from env
   - Password: generated password
   - Timestamp: generated timestamp  
   - TransactionType: "CustomerPayBillOnline"
   - Amount: amount (integer, no decimals)
   - PartyA: normalized phone
   - PartyB: MPESA_SHORTCODE
   - PhoneNumber: normalized phone
   - CallBackURL: BACKEND_URL + "/api/mpesa/callback"
   - AccountReference: booking ref (e.g. WV-K29X1)
   - TransactionDesc: "WrapVisualizer Booking Deposit"

Response to frontend:
{
  "success": true,
  "message": "Check your phone for the M-Pesa prompt",
  "checkoutRequestId": "ws_CO_...",
  "ref": "WV-K29X1"
}

### Callback Endpoint (POST /api/mpesa/callback):
1. Receive Safaricom's callback JSON
2. Extract ResultCode from Body.stkCallback.ResultCode
3. If ResultCode === 0: payment successful
   - Extract Amount, MpesaReceiptNumber, PhoneNumber 
     from CallbackMetadata
   - Log success: { ref, receipt, amount, phone }
   - Respond 200 OK (required by Safaricom)
4. If ResultCode !== 0: payment failed or cancelled
   - Log the failure with ResultDesc
   - Respond 200 OK (always respond 200 to Safaricom)

## Environment Variables Required:
- MPESA_CONSUMER_KEY
- MPESA_CONSUMER_SECRET
- MPESA_SHORTCODE (sandbox: 174379)
- MPESA_PASSKEY (from Daraja portal)
- BACKEND_URL (your Railway or ngrok URL for callbacks)

## Constraints
- Always use sandbox credentials until explicitly told to go live
- Amount must always be an integer — never send decimals to Daraja
- Phone normalization must handle: 07XX, +2547XX, 2547XX formats
- Never log the full STK Push password to console
- Callback endpoint must always return HTTP 200 to Safaricom 
  regardless of payment outcome — failure to do so causes retries
- Deposit amount must match the amount returned by /api/estimate
