# Part 2 — Deployment Guide

---

## 0. Local development setup

Before deploying, run the stack locally to verify branding and configuration.

### MinIO (local file storage)

A `docker-compose.yml` at the repo root starts MinIO for local development:

```bash
docker compose up -d
```

| Service | URL | Notes |
|---------|-----|-------|
| MinIO S3 API | http://localhost:9100 | Used by the backend for uploads |
| MinIO Console | http://localhost:9101 | Web UI — login: `minioadmin` / `minioadmin` |

The `medusa-store` bucket is created automatically with public-read access.
The backend `.env.example` already includes the matching `S3_*` vars for local MinIO.

### Required env vars for local development

Copy `.env.example` to `.env` in `apps/backend/` and fill in:

```bash
# Generate unique secrets — run each command once and paste the output
openssl rand -hex 32    # → DATABASE URL password, JWT_SECRET, COOKIE_SECRET
openssl rand -hex 32    # → APP_SECRETS_ENCRYPTION_KEY  (back this up!)
```

The `APP_SECRETS_ENCRYPTION_KEY` encrypts all admin-stored credentials (email, SMS,
couriers, CAPI token, Google OAuth). **If you lose it, every admin-encrypted credential
must be re-entered.** Store it somewhere safe from day one.

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────┐
│  Coolify VPS                                        │
│                                                     │
│  ┌──────────────────┐     ┌──────────────────────┐  │
│  │  Next.js         │────▶│  Medusa Backend      │  │
│  │  Storefront      │     │  (API + Admin /app)  │  │
│  │  :8000 (→ 443)   │     │  :9000 (→ 443)       │  │
│  └──────────────────┘     └──────────┬───────────┘  │
│                                      │              │
│                           ┌──────────▼───────────┐  │
│                           │  PostgreSQL           │  │
│                           │  (Coolify managed)   │  │
│                           └──────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**One store = one deployment:**
- 1 PostgreSQL database resource
- 1 Medusa backend app (serves the API and the admin UI at `/app`)
- 1 Next.js storefront app

Each store is a **separate deployment** of this template on the same or a different
Coolify VPS. Stores do not share databases or backends.

Redis is **optional** — the backend uses an in-memory fallback automatically when
`REDIS_URL` is not set. For most small-to-medium single-instance stores the in-memory
fallback is sufficient. However, in-memory events are not persisted across restarts and
do not support running more than one backend instance — add Redis before scaling
horizontally or if you need event durability across deployments.

---

## 2. Prerequisites

| Requirement | Notes |
|-------------|-------|
| Git host | GitHub, GitLab, or Gitea — Coolify can pull from any of these |
| Coolify VPS | 2 vCPU / 4 GB RAM minimum recommended; Ubuntu 22.04 LTS |
| Domain + DNS | Two subdomains per store: e.g. `api.acmeshop.com` (backend) and `shop.acmeshop.com` (storefront) |
| Node.js ≥ 20 | Only needed if building locally. Backend `package.json` requires `"node": ">=20"`. Coolify uses the Nixpacks builder which picks this up automatically. |

You do **not** need a local Node/Postgres setup to deploy — Coolify builds and runs
everything on the server. A local environment is only needed for the branding step
(Part 1) and any code customization.

---

## 3. Git repository

### First store (from scratch)

```bash
# Clone or copy the template
git clone <template-url> acme-shop
cd acme-shop

# Apply branding (see Part 1) then commit
git add -A
git commit -m "brand: Acme Shop"

# Push to your Git host
git remote set-url origin git@github.com:you/acme-shop.git
git push -u origin main
```

### Subsequent stores

Each store should be its own repository (keeps environments and deployments isolated):

```bash
# Option A — duplicate repo on GitHub/GitLab (cleanest)
# Use the "Use this template" button, or mirror:
git clone --bare <template-url> acme-shop2.git
cd acme-shop2.git && git push --mirror git@github.com:you/acme-shop2.git

# Option B — branch per store in a monorepo (more complex, not recommended)
```

Apply branding (Part 1) on the new repo before the first deploy.

---

## 4. Coolify setup

For each store, create **3 resources** in Coolify in this order:

### 4a. PostgreSQL database

1. Coolify → **New Resource → Database → PostgreSQL**
2. Name it (e.g. `acmeshop-db`), choose a version (PostgreSQL 15+ recommended)
3. Coolify generates a connection string — copy it; you'll use it as `DATABASE_URL`
   Format: `postgres://user:password@host:5432/dbname`
4. Deploy the database resource

### 4b. Medusa backend app

1. Coolify → **New Resource → Application** → connect your Git repo, select branch `main`
2. **Build command:** `npm run build` (runs `medusa build`)
3. **Start command:** `npm run start` (runs `medusa start`)
4. **Port:** `9000`
5. **Domain:** assign e.g. `api.acmeshop.com` — enable SSL
6. Set **all required environment variables** (Section 5 below) before first deploy
7. Deploy

The admin UI is served automatically at `https://api.acmeshop.com/app`.

### 4c. Next.js storefront app

1. Coolify → **New Resource → Application** → same or separate Git repo
2. **Build command:** `npm run build` (runs `next build`)
3. **Start command:** `npm run start` (runs `next start -p 8000`)
4. **Port:** `8000`
5. **Domain:** assign e.g. `shop.acmeshop.com` — enable SSL
6. Set storefront env vars (Section 5 below)
7. Deploy **after** the backend is running (the build fetches regions/config from the backend)

### 4d. MinIO (file storage — strongly recommended for production)

Without MinIO, uploaded product images and other files are written to the container's
local disk. They are **lost on every redeploy**. MinIO provides persistent S3-compatible
object storage that survives redeployments.

1. Coolify → **New Resource → Database → MinIO**
2. Name it (e.g. `acmeshop-minio`) and deploy it
3. From the Coolify resource page, copy:
   - **Endpoint** (e.g. `https://minio-xxxx.coolify.io`)
   - **Access Key**
   - **Secret Key**
4. Open the MinIO Console (Coolify exposes a console URL on the resource page)
   - Log in with the Access Key / Secret Key
   - Create a bucket (e.g. `medusa-store`)
   - Bucket → **Anonymous Access → set to `public`** (so storefront can load images without signed URLs)
5. Set these env vars on the **backend** app in Coolify (Section 5b):

   | Variable | Value |
   |----------|-------|
   | `S3_ENDPOINT` | Coolify MinIO endpoint, e.g. `https://minio-xxxx.coolify.io` |
   | `S3_BUCKET` | Your bucket name, e.g. `medusa-store` |
   | `S3_ACCESS_KEY_ID` | MinIO Access Key from Coolify |
   | `S3_SECRET_ACCESS_KEY` | MinIO Secret Key from Coolify |
   | `S3_REGION` | `us-east-1` (any string — MinIO ignores it) |
   | `S3_FILE_URL` | `{S3_ENDPOINT}/{S3_BUCKET}`, e.g. `https://minio-xxxx.coolify.io/medusa-store` |

6. Redeploy the backend

> **All six vars must be set together.** If any is missing, the backend falls back to
> local disk storage automatically (no errors, but files are lost on redeploy).

### Redis (optional)

If you want Redis, add a **Redis** database resource in Coolify and set `REDIS_URL`
on the backend. If `REDIS_URL` is absent, the backend uses an in-memory event bus
(safe for single-process deployments).

---

## 5. Environment variables

### 5a. Backend — REQUIRED (store will not start without these)

> **Two domains, many vars** — all URL/origin vars below resolve to just two addresses.
> Set them consistently and you won't have CORS or callback errors:
>
> | Var | Value for `api.acmeshop.com` / `shop.acmeshop.com` |
> |-----|---------------------------------------------------|
> | `STORE_CORS` | `https://shop.acmeshop.com` |
> | `ADMIN_CORS` | `https://api.acmeshop.com` |
> | `AUTH_CORS` | `https://api.acmeshop.com,https://shop.acmeshop.com` |
> | `BACKEND_URL` | `https://api.acmeshop.com` (payment callbacks) |
> | `STORE_URL` | `https://shop.acmeshop.com` (email template links) |
> | `NEXT_PUBLIC_MEDUSA_BACKEND_URL` *(storefront)* | `https://api.acmeshop.com` |
> | `NEXT_PUBLIC_BASE_URL` *(storefront)* | `https://shop.acmeshop.com` |

Set these in Coolify → your backend app → Environment Variables.

| Variable | What it is | How to generate / where to get |
|----------|-----------|-------------------------------|
| `DATABASE_URL` | Postgres connection string | Copy from your Coolify PostgreSQL resource |
| `JWT_SECRET` | Signs admin and customer JWTs | `openssl rand -hex 32` |
| `COOKIE_SECRET` | Signs session cookies | `openssl rand -hex 32` |
| `STORE_CORS` | Allowed origins for storefront requests | Your storefront URL, e.g. `https://shop.acmeshop.com` |
| `ADMIN_CORS` | Allowed origins for admin UI requests | Your backend URL, e.g. `https://api.acmeshop.com` |
| `AUTH_CORS` | Allowed origins for auth requests | Both URLs comma-separated: `https://api.acmeshop.com,https://shop.acmeshop.com` |
| `APP_SECRETS_ENCRYPTION_KEY` | AES-256-GCM master key for all admin-encrypted secrets (email, SMS, couriers, CAPI, Google OAuth) | `openssl rand -hex 32` — produces exactly 64 hex chars (32 bytes). **UNIQUE per store. Back it up. Losing it makes all encrypted admin secrets unreadable.** |

> **`APP_SECRETS_ENCRYPTION_KEY` — critical notes**
> - Generate a **fresh key for every store** with `openssl rand -hex 32`
> - Store the key in a password manager or secrets vault immediately
> - If you rotate or lose this key, every credential stored via the admin (email, SMS,
>   couriers, CAPI token, Google OAuth secret) becomes permanently unreadable and must
>   be re-entered
> - The key must be exactly 64 hexadecimal characters
>
> **Backward compatibility:** If you have an existing deployment that uses the old name
> `COURIER_CONFIG_ENCRYPTION_KEY`, you do not need to rename it immediately — the backend
> accepts either name and logs a deprecation warning when only the old name is found. To
> silence the warning, rename the variable in Coolify and restart the backend.

### 5b. Backend — OPTIONAL feature vars

The store runs as a fully functional cash-on-delivery storefront without any of these.
Add them only when you are ready to enable that feature.

| Variable | Enables | Notes |
|----------|---------|-------|
| `STRIPE_API_KEY` | Stripe payments | Both `STRIPE_API_KEY` **and** `STRIPE_WEBHOOK_SECRET` must be set together |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | Register webhook at `{BACKEND_URL}/hooks/payment/stripe_stripe` |
| `SSLCOMMERZ_STORE_ID` | SSLCommerz (cards, bKash, Nagad, Rocket, EMI) | Both ID **and** PASSWORD must be set together |
| `SSLCOMMERZ_STORE_PASSWORD` | SSLCommerz | |
| `SSLCOMMERZ_SANDBOX` | SSLCommerz sandbox mode | Default `true`; set to `false` for live |
| `BKASH_APP_KEY` | bKash direct tokenized checkout | All four bKash vars must be set together |
| `BKASH_APP_SECRET` | bKash | |
| `BKASH_USERNAME` | bKash | |
| `BKASH_PASSWORD` | bKash | |
| `BKASH_SANDBOX` | bKash sandbox mode | Default `true`; set to `false` for live |
| `BACKEND_URL` | Builds payment callback URLs for SSLCommerz/bKash | e.g. `https://api.acmeshop.com` — required when using those providers |
| `STORE_URL` | Used in email templates (logo URL, account links) | e.g. `https://shop.acmeshop.com` — only needed when email is configured |
| `S3_FILE_URL` | MinIO / S3 file storage — public URL prefix for uploads | e.g. `https://minio.acmeshop.com/your-bucket` — all four `S3_*` vars must be set together to activate; local disk used otherwise |
| `S3_BUCKET` | S3 / MinIO bucket name | |
| `S3_ACCESS_KEY_ID` | S3 / MinIO access key | |
| `S3_SECRET_ACCESS_KEY` | S3 / MinIO secret key | |
| `S3_ENDPOINT` | MinIO server URL (omit for AWS S3) | e.g. `https://minio.acmeshop.com` — required for MinIO, omit for AWS S3 |
| `S3_REGION` | AWS region or any string for MinIO | Defaults to `us-east-1` when absent |
| `REDIS_URL` | Redis for event bus / job queue | e.g. `redis://localhost:6379` — in-memory fallback used when absent |
| `MEDUSA_ADMIN_ONBOARDING_TYPE` | Suppresses admin onboarding wizard | Set to `nextjs` (already in `.env.example`) |

### 5c. Storefront — REQUIRED

| Variable | What it is | Notes |
|----------|-----------|-------|
| `NEXT_PUBLIC_MEDUSA_BACKEND_URL` | Backend API URL | e.g. `https://api.acmeshop.com` |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | Publishable API key for store requests | Obtain from Admin → Settings → API Keys after first run (Step 7) |
| `NEXT_PUBLIC_DEFAULT_REGION` | Default country/region code | e.g. `us`, `bd`, `gb` — must match a region created in Medusa admin |
| `NEXT_PUBLIC_BASE_URL` | Storefront's own public URL | e.g. `https://shop.acmeshop.com` |

### 5d. Storefront — OPTIONAL

| Variable | Enables | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_STRIPE_KEY` | Stripe payment UI in checkout | Stripe publishable key (`pk_live_...` or `pk_test_...`) |
| `NEXT_PUBLIC_GTM_ID` | Google Tag Manager | e.g. `GTM-XXXXXXX` — fires all tags incl. PageView |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Pixel (env-based fallback) | Meta Pixel can also be configured in Admin → Tracking & Analytics at runtime without redeploy |
| `NEXT_PUBLIC_TIKTOK_PIXEL_ID` | TikTok Pixel | e.g. `ABCDEFGHIJ` |
| `NEXT_PUBLIC_GADS_ID` | Google Ads conversion tracking | e.g. `AW-123456789` |

---

## 6. Env vars behavior note

> All environment variables are managed in the **Coolify dashboard** — never edit
> `.env` files in the deployed container. After changing any env var in Coolify,
> trigger a **Redeploy** (backend) or **Restart** (storefront) for the change to take
> effect.
>
> Every feature protected by an env var degrades gracefully when the var is absent:
> payment providers don't appear at checkout, notification providers skip sends with a
> log entry, courier credentials remain unconfigured. A store with only the REQUIRED
> vars is a fully functional cash-on-delivery storefront.

---

## 7. First-run sequence

After the backend app is deployed and healthy:

### 7a. Run database migrations

In Coolify → backend app → **Terminal** (or via SSH to the container):

```bash
# Create/update all database tables
npx medusa db:migrate

# Sync module links (cross-module foreign key relationships)
npx medusa db:sync-links
```

Both commands are safe to re-run. Always run them after the first deploy and after
any update that adds new modules or model fields.

### 7b. Create the first admin user

```bash
npx medusa user -e admin@acmeshop.com -p YourSecurePassword123
```

Then log in at `https://api.acmeshop.com/app`.

### 7c. Create a publishable API key

1. Admin → Settings → API Keys → **Create API Key**
2. Type: **Publishable**, Name: e.g. `storefront`
3. Copy the key (starts with `pk_...`)
4. Set it as `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` in the **storefront** app's env vars in Coolify
5. Redeploy the storefront

### 7d. Create a region

Admin → Settings → Regions → **Add Region**
- Select currency and countries
- The region code (e.g. `us`, `bd`) should match `NEXT_PUBLIC_DEFAULT_REGION`

### 7e. Verify

```bash
# Backend health
curl https://api.acmeshop.com/health          # → {"status":"ok"}

# Storefront
open https://shop.acmeshop.com                # should load the store
```

---

## 8. Spinning up a new store — condensed flow

```
1.  BRAND first  (see docs/01-branding.md)
    → Edit brand.config.ts, swap logo/favicon, commit

2.  Coolify: create PostgreSQL resource  → note the DATABASE_URL

3.  Coolify: create MinIO resource  (see Section 4d)
    → Create bucket (e.g. medusa-store)  → set anonymous access to public
    → Note endpoint, access key, secret key

4.  Coolify: create Backend app
    → Build: npm run build   Start: npm run start   Port: 9000
    → Set REQUIRED env vars (table 5a) incl. a FRESH APP_SECRETS_ENCRYPTION_KEY
    → Set CORS vars to the new store's domains
    → Set all six S3_* vars (table 5b) pointing at the MinIO resource
    → Deploy

5.  In Coolify terminal / SSH:
    npx medusa db:migrate
    npx medusa db:sync-links
    npx medusa user -e admin@... -p ...

6.  Admin → Settings → API Keys → create publishable key  → copy pk_...

7.  Coolify: create Storefront app
    → Build: npm run build   Start: npm run start   Port: 8000
    → Set NEXT_PUBLIC_MEDUSA_BACKEND_URL, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
      NEXT_PUBLIC_DEFAULT_REGION, NEXT_PUBLIC_BASE_URL
    → Deploy

8.  Admin → Settings → Regions → add region matching NEXT_PUBLIC_DEFAULT_REGION

9.  Verify: curl /health  →  open storefront

10. Configure features in admin (see docs/03-configuration.md)
```

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Backend crashes on start | `DATABASE_URL` wrong or DB not yet ready | Check connection string; ensure PG resource is deployed before backend |
| `Error: Encryption key must be 64 hex characters` | `APP_SECRETS_ENCRYPTION_KEY` missing or wrong length | Generate with `openssl rand -hex 32`; confirm it is exactly 64 chars |
| Storefront shows `Failed to fetch` or blank page | `NEXT_PUBLIC_MEDUSA_BACKEND_URL` points to wrong host, or CORS blocked | Verify `STORE_CORS` on backend matches storefront URL exactly; check `NEXT_PUBLIC_MEDUSA_BACKEND_URL` on storefront |
| `Publishable key is invalid` | Key not set or key belongs to a different backend | Re-copy from Admin → Settings → API Keys; set on storefront; redeploy storefront |
| Admin UI at /app redirects to login loop | `ADMIN_CORS` missing backend's own URL | Add backend URL to `ADMIN_CORS` |
| Payments don't appear in checkout | Payment env vars not set, or storefront missing `NEXT_PUBLIC_STRIPE_KEY` | Check backend payment env vars; check `NEXT_PUBLIC_STRIPE_KEY` for Stripe |
| Product images lost after redeploy | MinIO not configured — files were on local disk | Set all six `S3_*` vars (Section 4d) and redeploy |
| Image upload succeeds but URL 403/404 | MinIO bucket not set to public | Open MinIO Console → bucket → Anonymous Access → set to `public` |
| `Cannot find module` build error | Node < 20 | Ensure Coolify's Nixpacks uses Node 20+ (set `NIXPACKS_NODE_VERSION=20` in build env if needed) |
| Storefront build fails — `backend unreachable` | Storefront deployed before backend is ready | Deploy backend first, run migrations, then deploy storefront |
