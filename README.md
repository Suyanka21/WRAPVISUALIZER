<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# WrapVisualizer

Mobile-first vehicle wrap visualization and booking tool for high-end wrap shops in Nairobi, Kenya. Built as a WhatsApp-based lead generation funnel with AI-powered vehicle segmentation.

## Stack

- **Frontend:** HTML + TailwindCSS (Stitch-generated)
- **Backend:** Node.js (Express) — API relay layer
- **AI:** Replicate API (`meta/sam-2` Segment Anything Model)
- **Payments:** Safaricom Daraja API (M-Pesa STK Push)
- **Messaging:** WhatsApp deep links (`wa.me`)

## Run Locally

**Prerequisites:** Node.js ≥20

```bash
# 1. Install root dependencies (Playwright, TailwindCSS CLI)
npm install

# 2. Install backend dependencies
cd backend && npm install && cd ..

# 3. Copy env template and set your Replicate API token
cp .env.example .env.local
# Edit .env.local → set REPLICATE_API_TOKEN=r8_your_token_here

# 4. Start the server (serves frontend + API on port 3000)
npm start
```

Open [http://localhost:3000](http://localhost:3000) in a 375px mobile viewport.

## Run Tests

```bash
# Install Playwright browsers (first time only)
npx playwright install chromium

# Run the viewport + integration suite
npx playwright test
```

## Deploy to Railway

Railway runs a **single-service monolith** — the Express backend serves both the API and the static frontend.

### Railway Settings

| Setting | Value |
|---------|-------|
| **Build Command** | `npm install && cd backend && npm install` |
| **Start Command** | `npm start` |
| **Node Version** | `20` (reads from `.nvmrc`) |

### Required Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REPLICATE_API_TOKEN` | ✅ Yes | — | Replicate API token for SAM-2 segmentation |
| `PORT` | No | `3000` | Server listen port (Railway sets this automatically) |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | Comma-separated CORS origins |
| `SENTRY_DSN` | No | — | Sentry error reporting DSN |
| `REPLICATE_REVALIDATE_MS` | No | `60000` | Token re-validation interval (ms). Set to `0` to disable. |

### Procfile

The included `Procfile` defines:
```
web: npm start
```

`npm start` runs `cd backend && node server.js`, which:
1. Validates all 240 hero morph frames exist (fail-fast)
2. Validates required frontend assets exist
3. Starts the Replicate readiness scheduler
4. Serves the frontend as static files
5. Listens on `PORT`

### Deploy Checklist

- [ ] Set `REPLICATE_API_TOKEN` in Railway environment variables
- [ ] Set `ALLOWED_ORIGINS` to your production domain (e.g. `https://wrapvisualizer.up.railway.app`)
- [ ] Verify `/api/health` returns `{ "status": "ok", "replicate_reachable": true }`
- [ ] Test the full upload → customize → WhatsApp flow on a 375px mobile viewport

## Project Structure

```
├── backend/
│   ├── server.js              # Express entry point
│   ├── instrument.js          # Sentry init (must be first import)
│   ├── boot/                  # Boot-time validators
│   ├── middleware/             # CORS, CSP, rate limiting, errors
│   ├── routes/                # /api/segment, /api/events, /api/health
│   ├── services/              # Replicate API client
│   └── utils/                 # Image validation, error mapping
├── frontend/
│   ├── screen1-upload.html    # Landing + upload/template selection
│   ├── screen2-studio.html    # Finish + color customization
│   ├── screen3-quote.html     # Quote review + WhatsApp CTA
│   ├── screen4-confirmation.html  # Post-handoff confirmation
│   └── assets/
│       ├── js/                # Per-screen logic + shared modules
│       └── css/               # TailwindCSS build output
├── lc30-morph/                # 240 hero animation frames
├── Procfile                   # Railway/Heroku process definition
├── playwright.config.js       # Mobile viewport test config
└── tests/                     # Playwright test suite
```
