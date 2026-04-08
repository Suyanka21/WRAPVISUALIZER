# WrapVisualizer — Project Status Report
> Last updated: 8 April 2026

---

## 1. Project Identity

**WrapVisualizer** is a mobile-first vehicle wrap visualization and **lead generation tool** targeting high-end wrap shops in Nairobi, Kenya. Users select a vehicle, choose a wrap finish/color, see a ballpark estimate, and connect with the shop directly via **WhatsApp** for final pricing and booking.

> **Business Model:** This is NOT a booking/payment platform. It's a visualization + inquiry funnel. The wrap shop closes the deal, not the website.

---

## 2. Architecture Overview

```
WRAP VISUALIZER/
├── frontend/                    # Static HTML screens (Stitch-exported)
│   ├── screen1-upload.html      # Vehicle upload + template selection
│   ├── screen2-studio.html      # Finish, color, vision configurator
│   ├── screen3-quote.html       # Estimate breakdown + dual WhatsApp CTA
│   ├── screen4-confirmation.html # "Message Sent" confirmation
│   └── a11y.js                  # Shared accessibility enhancements
├── backend/                     # Express.js API relay (port 3001)
│   ├── server.js                # Main server, static serving, CORS
│   ├── routes/
│   │   ├── estimate.js          # POST /api/estimate — cost calculator
│   │   ├── segment.js           # POST /api/segment — AI segmentation
│   │   └── whatsapp.js          # GET  /api/whatsapp — inquiry link
│   ├── services/
│   │   └── replicate.js         # Replicate API (SAM-2) integration
│   └── data/
│       └── pricing.json         # Vehicle/finish pricing data
├── docs/                        # Project documentation
├── .env.local                   # Environment secrets (gitignored)
├── package.json                 # Root project config
└── GEMINI.md                    # Project rules
```

**Stack:**
- Frontend: HTML + Tailwind CSS (CDN) — exported from Google Stitch
- Backend: Node.js + Express (serves static files + Estimate/WhatsApp APIs)
- AI: Replicate API (Meta SAM-2 for vehicle segmentation)
- Communication: WhatsApp wa.me deep links — **dual partner numbers**
- State: Browser sessionStorage with `wv_` prefix

---

## 3. Partner Contact Numbers

| Partner | WhatsApp Number | Status |
|---------|----------------|--------|
| Line 1  | +254 705 040 033 | ✅ Wired into frontend |
| Line 2  | +254 700 419 444 | ✅ Wired into frontend |

Both numbers appear as separate WhatsApp CTA buttons on:
- **Screen 1**: "Need expert advice?" teaser section
- **Screen 3**: Primary "Get Quote" dual buttons
- Pre-filled messages include vehicle details, finish, and estimated cost

---

## 4. What Has Been Built

### ✅ Backend

| Endpoint | Method | Description | Status |
|---|---|---|---|
| `/` | GET | Root → serves Screen 1 directly | ✅ Working |
| `/api/health` | GET | Server health check | ✅ Working |
| `/api/estimate` | POST | Calculates estimated wrap cost | ✅ Working |
| `/api/segment` | POST | Replicate SAM-2 segmentation | ✅ Built (needs credits) |
| `/api/whatsapp` | GET | Generates pre-filled WhatsApp link | ✅ Working |

### ✅ Frontend (4 Screens)

| Screen | Purpose | Key Features |
|---|---|---|
| **Screen 1 — Home** | Vehicle selection | 7 premium templates, file upload, dual WhatsApp teaser |
| **Screen 2 — Studio** | Customization | 8 finishes, 5 colors, vision prompt, soft estimate |
| **Screen 3 — Estimate** | Inquiry funnel | ~Approximate pricing, PPF toggle, **2× WhatsApp CTAs** |
| **Screen 4 — Sent** | Confirmation | "Message Sent" + "Open WhatsApp" + "Back to Home" |

---

## 5. Roadmap Progress

### 🔴 Priority 1 — Launch Essentials

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Single URL (`localhost:3001`) | ✅ Done | Root serves Screen 1 directly |
| 2 | WhatsApp dual partners | ✅ Done | Both numbers wired on Screen 1 + Screen 3 |
| 3 | Client-side WhatsApp links | ✅ Done | No backend call needed for WhatsApp |
| 4 | M-Pesa removal | ✅ Done | Removed from all screens and scripts |
| 5 | Soft pricing language | ✅ Done | "Starting from", "~KES", "estimate only" |
| 6 | Deployment | ⬜ Pending | Needs Railway + custom domain |

### 🟡 Priority 2 — Quality & Polish

| # | Item | Status | Notes |
|---|------|--------|-------|
| 7 | SEO meta tags | ✅ Done | Title, description, OG tags on all 4 screens |
| 8 | Accessibility (a11y) | ✅ Done | ARIA labels, keyboard nav, focus-visible, skip-to-content |
| 9 | Font preconnect hints | ✅ Done | Added on Screen 2 + Screen 3 |
| 10 | Lazy loading images | ✅ Done | All template images have `loading="lazy"` |
| 11 | CORS fix | ✅ Done | Added localhost:3001 to allowed origins |
| 12 | Vehicle segmentation test | ⬜ Pending | Needs Replicate credits |
| 13 | Gallery / Portfolio | ⬜ Pending | "View Gallery" button present, needs content |

### 🟢 Priority 3 — Growth Features

| # | Item | Status | Notes |
|---|------|--------|-------|
| 14 | Multi-shop support | ⬜ Future | SaaS model for multiple wrap shops |
| 15 | Analytics | ⬜ Future | GA4 / Plausible integration |
| 16 | Real wrap visualization | ⬜ Future | Overlay colors on segmented vehicle photo |

---

## 6. Current Rating

### Backend: 8.5 / 10

| Aspect | Score | Notes |
|---|---|---|
| API Design | 9/10 | Clean REST, proper error handling |
| Simplicity | 9/10 | Only 2 active APIs — lean and focused |
| Security | 8/10 | CORS configured, env vars for secrets |
| Error Handling | 8/10 | All endpoints have try/catch |
| Deployment Readiness | 7/10 | Single `npm run dev` start, needs Docker for prod |

### Frontend: 8.5 / 10

| Aspect | Score | Notes |
|---|---|---|
| Visual Design | 9/10 | Premium dark theme, glass effects, brand-consistent |
| Mobile Responsiveness | 7/10 | Works but needs real device testing |
| Navigation | 9/10 | Bottom nav, hamburger menu, back buttons |
| Interactivity | 9/10 | Template cards, finish/color, PPF toggle, loading states |
| Conversion Flow | 9/10 | Dual WhatsApp CTAs — clear and prominent |
| Accessibility | 7/10 | ARIA labels, keyboard nav, focus-visible, skip-to-content |
| SEO | 7/10 | Title, meta, OG on all screens. Missing structured data |
| Performance | 6/10 | Lazy images ✅, but Tailwind CDN is heavy |

### Overall: 8.5 / 10

---

## 7. What's Left for 10/10

| Item | Effort | Impact |
|---|---|---|
| **Deploy to production** (Railway/Vercel + custom domain) | Medium | Must-have for launch |
| **Tailwind self-hosted build** (swap CDN for compiled CSS) | Medium | Saves ~200KB per page |
| **Real device testing** (Android Chrome, iPhone Safari) | Low | Touch target & overflow fixes |
| **Vehicle segmentation** (Replicate credits + loading animation) | Medium | Wow-factor for visualization |
| **Gallery content** (real photos from the partners) | Low | Showcases completed work |
| **Open Graph images** (screenshot per screen for social sharing) | Low | Better link previews |
| **Structured data** (JSON-LD for local business) | Low | Google search visibility |

---

## 8. Quick Start

```bash
# 1. Install dependencies
cd backend && npm install && cd ..

# 2. Configure environment
cp .env.example .env.local
# Set SHOP_WHATSAPP_NUMBER (partner numbers are hardcoded in frontend)

# 3. Start the server
npm run dev

# 4. Open in browser
# http://localhost:3001
```

---

## 9. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 8 Apr 2026 | Removed M-Pesa integration | Shop handles payments directly |
| 8 Apr 2026 | Softened pricing to estimates | Ranges invite inquiry; exact prices deter |
| 8 Apr 2026 | WhatsApp as sole conversion | Shops close deals via WhatsApp |
| 8 Apr 2026 | Dual partner numbers | Two business partners share the shop |
| 8 Apr 2026 | Client-side WhatsApp links | No backend call needed; works offline |
| 8 Apr 2026 | Added a11y.js shared script | ARIA, keyboard nav, focus-visible across all screens |
| 8 Apr 2026 | SEO meta tags on all pages | OG tags, description, proper titles |

---

*This document should be updated as features are completed.*
