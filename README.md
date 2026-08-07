# Bridge Marketplace

A vetted secondhand goods marketplace with automated carrier shipping and Stripe Connect payouts.

## Stack

| Layer | Technology |
|-------|-----------|
| API | Cloudflare Worker + Hono |
| Database | Cloudflare D1 (SQLite) |
| Images | Cloudflare R2 |
| Frontend | Cloudflare Pages + React + Vite |
| Shipping | Shippo (label generation + tracking) |
| Payments | Stripe Connect (Express accounts) |
| Auth | SMS PIN via Twilio + JWT httpOnly cookie |

## Project layout

```
bridge-marketplace/
├── api/src/           # Cloudflare Worker (Hono routes, libs, middleware)
├── web/src/           # React/Vite frontend (Pages)
├── migrations/        # D1 SQL migrations
├── wrangler.toml      # Worker config (bindings, cron, non-secret vars)
└── .dev.vars.example  # Local dev secrets template → copy to .dev.vars
```

## Local development

```bash
cp .dev.vars.example .dev.vars   # fill in real keys
npm install
npm run dev                       # starts Worker (port 8787) + frontend (port 5173)
```

## Deploy

Deploys run automatically on push to `main` via GitHub Actions:
1. D1 migrations applied
2. Worker deployed via Wrangler
3. Worker secrets synced from GitHub secrets to Cloudflare
4. Frontend built and deployed to Cloudflare Pages

To trigger manually: **Actions → Deploy → Run workflow**.

### Required GitHub secrets

Set these under **Settings → Secrets and variables → Actions** before the first deploy:

```
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
JWT_SECRET
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
SHIPPO_API_KEY
SHIPPO_WEBHOOK_SECRET
STRIPE_SECRET_KEY
STRIPE_CONNECT_CLIENT_ID
STRIPE_WEBHOOK_SECRET
STRIPE_PLATFORM_FEE_PERCENT
VITE_STRIPE_PUBLISHABLE_KEY
PLATFORM_RETURN_ADDRESS_NAME
PLATFORM_RETURN_ADDRESS_STREET1
PLATFORM_RETURN_ADDRESS_CITY
PLATFORM_RETURN_ADDRESS_STATE
PLATFORM_RETURN_ADDRESS_ZIP
PLATFORM_RETURN_ADDRESS_COUNTRY
PLATFORM_RETURN_ADDRESS_PHONE
PLATFORM_RETURN_ADDRESS_EMAIL
```
