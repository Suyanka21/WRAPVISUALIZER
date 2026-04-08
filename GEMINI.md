# WrapVisualizer — Project Rules

## Identity
This project is WrapVisualizer — a mobile-first vehicle wrap visualization 
and booking tool for high-end wrap shops in Nairobi, Kenya.

## Stack
- Frontend: HTML + TailwindCSS (exported from Google Stitch). Never 
  rewrite the design system. Only extend it.
- Backend: Node.js (Express) for the API relay layer
- AI Segmentation: Replicate API (SAM — Segment Anything Model)
- Payments: Safaricom Daraja API (M-Pesa STK Push)
- Messaging: WhatsApp URL scheme (wa.me deep links)
- Hosting target: Vercel (frontend) + Railway (backend)

## Non-Negotiable Rules
1. Never hardcode API keys. Always use environment variables from .env
2. Never rewrite or restructure the Stitch-generated HTML design system 
   — only add functional logic on top
3. All monetary values must be in KES (Kenyan Shillings). Never use USD.
4. All phone number logic must handle Kenyan formats: 07XXXXXXXX, 
   +2547XXXXXXXX, 2547XXXXXXXX
5. WhatsApp links must use the wa.me/2547XXXXXXXX format
6. The M-Pesa integration uses the Safaricom Daraja sandbox first — 
   never go live until explicitly instructed
7. All API responses must include proper error handling with 
   user-friendly messages (not raw error codes)
8. Mobile-first: every function must work on a 375px viewport 
   Android Chrome browser

## Code Style
- Use async/await, never raw .then() chains
- Add a comment above every function explaining what it does
- Keep each backend file under 150 lines — split into modules if larger
