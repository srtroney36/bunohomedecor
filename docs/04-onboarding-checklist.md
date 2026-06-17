# Part 5 — Store Onboarding Checklist

Use this checklist when handing a finished store to a client. It covers everything
from your deploy work to what the client sets up themselves in the admin.

---

## Section A — You do (before handing over)

### Branding & code
```
[ ] brand.config.ts updated — storeName, tagline, description, colors, fonts, contact, social
[ ] Logo placed at apps/storefront/public/images/logo.svg (or matching logoPath)
[ ] Favicon placed at apps/storefront/public/favicon.ico (or matching faviconPath)
[ ] Footer links reviewed (apps/storefront/src/modules/layout/templates/footer/index.tsx)
[ ] Changes committed and pushed to the store's Git repository
```

### Coolify deploy
```
[ ] PostgreSQL resource created and running in Coolify
[ ] MinIO resource created in Coolify:
    [ ] Bucket created (e.g. medusa-store)
    [ ] Bucket anonymous access set to public (via MinIO Console)
    [ ] Endpoint, Access Key, Secret Key noted
[ ] Backend app created — build: npm run build, start: npm run start, port: 9000
[ ] Backend REQUIRED env vars set in Coolify:
    [ ] DATABASE_URL (from Coolify PostgreSQL resource)
    [ ] JWT_SECRET (openssl rand -hex 32)
    [ ] COOKIE_SECRET (openssl rand -hex 32)
    [ ] STORE_CORS = https://shop.acmeshop.com
    [ ] ADMIN_CORS = https://api.acmeshop.com
    [ ] AUTH_CORS = https://api.acmeshop.com,https://shop.acmeshop.com
    [ ] APP_SECRETS_ENCRYPTION_KEY (openssl rand -hex 32 — BACKED UP in password manager)
    [ ] MEDUSA_ADMIN_ONBOARDING_TYPE = nextjs
[ ] MinIO env vars set on backend:
    [ ] S3_ENDPOINT = https://minio-xxxx.coolify.io
    [ ] S3_BUCKET = medusa-store
    [ ] S3_ACCESS_KEY_ID = (from Coolify MinIO resource)
    [ ] S3_SECRET_ACCESS_KEY = (from Coolify MinIO resource)
    [ ] S3_REGION = us-east-1
    [ ] S3_FILE_URL = https://minio-xxxx.coolify.io/medusa-store
[ ] Backend deployed and healthy (curl https://api.acmeshop.com/health → {"status":"ok"})
```

### Database & first-run
```
[ ] npx medusa db:migrate  — ran in Coolify terminal
[ ] npx medusa db:sync-links  — ran in Coolify terminal
[ ] Admin user created: npx medusa user -e admin@... -p ...
[ ] Admin login verified at https://api.acmeshop.com/app
```

### Storefront
```
[ ] Admin → Settings → API Keys → publishable key created → key starts with pk_...
[ ] Storefront app created in Coolify — build: npm run build, start: npm run start, port: 8000
[ ] Storefront REQUIRED env vars set:
    [ ] NEXT_PUBLIC_MEDUSA_BACKEND_URL = https://api.acmeshop.com
    [ ] NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = pk_...
    [ ] NEXT_PUBLIC_DEFAULT_REGION = (e.g. us or bd)
    [ ] NEXT_PUBLIC_BASE_URL = https://shop.acmeshop.com
[ ] Storefront deployed and loading
[ ] Admin → Settings → Regions → region created matching NEXT_PUBLIC_DEFAULT_REGION
[ ] Admin → Settings → Regions → currency set correctly
[ ] Storefront shows store name, logo, and correct branding
[ ] COD (Pay on Delivery) available at checkout — no config needed
```

### Encryption key backup
```
[ ] APP_SECRETS_ENCRYPTION_KEY value stored in password manager / secrets vault
    Note: if this key is lost, ALL admin-encrypted credentials (email, SMS, couriers,
    CAPI, Google OAuth) become permanently unreadable and must be re-entered.
```

---

## Section B — Accounts the client must create

Provide this list to the client. They need to create these accounts and supply you (or
enter themselves) the credentials.

| Account | Purpose | URL | What to obtain |
|---------|---------|-----|---------------|
| Resend | Transactional email | resend.com | API key + verified sending domain |
| SMS gateway | Transactional SMS | twilio.com (or local provider) | Account SID + Auth Token + From number |
| Stripe | Card / Apple Pay / Google Pay | stripe.com | API key (secret + publishable) + webhook secret |
| SSLCommerz | BD payment aggregator (cards, bKash, Nagad, Rocket) | sslcommerz.com | Store ID + Store Password |
| bKash (if direct) | bKash tokenized checkout | bKash merchant portal | App Key + Secret + Username + Password |
| Steadfast / RedX / Pathao | Courier integrations | respective portals | Per-courier API credentials |
| Google Cloud | Google OAuth login | console.cloud.google.com | OAuth Client ID + Client Secret |
| Meta Business | Meta Pixel + CAPI | business.facebook.com | Pixel ID + CAPI access token |
| Google Analytics | GA4 tracking | analytics.google.com | Measurement ID (G-XXXXXXXX) |

---

## Section C — What you set at deploy vs what the client sets in admin

| Configuration | Set by | Where |
|--------------|--------|-------|
| Store name, colors, fonts, logo | **You** | brand.config.ts + public/ assets (before deploy) |
| Footer static links | **You** | footer/index.tsx (before deploy) |
| Encryption key | **You** | Coolify env var (at deploy) |
| Database, CORS, JWT/cookie secrets | **You** | Coolify env vars (at deploy) |
| Payment env vars (Stripe/SSLCommerz/bKash) | **You** (client provides credentials) | Coolify env vars (any time, requires redeploy) |
| Email credentials (Resend) | **Client** (or you on their behalf) | Admin → Notifications → Credentials |
| SMS credentials | **Client** (or you on their behalf) | Admin → Notifications → Credentials |
| Courier credentials + activation | **Client** (or you on their behalf) | Admin → Couriers |
| Meta Pixel ID, GA4 Measurement ID | **Client** (or you) | Admin → Tracking & Analytics |
| CAPI token | **Client** (or you) | Admin → Tracking & Analytics |
| Google OAuth client secret | **Client** (or you) | Admin → Authentication |
| Phone OTP settings | **Client** (or you) | Admin → Authentication |
| WhatsApp number, order phone | **Client** | Admin → Store Settings |
| Homepage sections (hero, banners, etc.) | **Client** | Admin → Homepage |
| Product catalog (products, categories, collections) | **Client** | Admin → Products / Categories |
| Brands | **Client** | Admin → Brands |
| Product card style | **Client** | Admin → Product Cards |
| Admin users (additional staff) | **Client** | Admin → Settings → Users |
| Regions / currencies / shipping | **Client** | Admin → Settings → Regions / Shipping |

---

## Section D — Final verification before handover

```
[ ] Storefront loads at https://shop.acmeshop.com — correct name, logo, colors
[ ] Can browse products (add some test products in admin first)
[ ] Cart works — add to cart, view cart
[ ] Checkout works — complete a COD test order
[ ] Order appears in Admin → Orders
[ ] Admin login works with the client's credentials (or reset password)

OPTIONAL — test each configured feature:
[ ] Email — Admin → Notifications → "Send test email" arrives
[ ] SMS — Admin → Notifications → "Send test SMS" arrives
[ ] Stripe — place a test order with Stripe test card 4242 4242 4242 4242
[ ] SSLCommerz — place test order in sandbox mode
[ ] Courier — Admin → Couriers → Test Connection returns success
[ ] Meta Pixel + CAPI dedup — place a test order with the Test Event Code set; Meta
    Events Manager must show ONE deduplicated Purchase event (browser + server merged),
    NOT two separate events — double-counting is the make-or-break tracking check;
    remove Test Event Code before going live
[ ] GA4 — Realtime report shows a session when you open the storefront
[ ] Google OAuth — click "Sign in with Google" on storefront → login completes
[ ] Phone OTP — enter phone number → SMS received → code accepted
```

---

## Section E — Features active at handover

Fill this in for each store before handing over:

```
Store name:  ___________________________
Live URL:    ___________________________
Admin URL:   ___________________________
Admin login: ___________________________ (send securely)

ACTIVE FEATURES:
[ ] COD (always on)
[ ] Email notifications (Resend)
[ ] SMS notifications
[ ] Stripe payments
[ ] SSLCommerz payments
[ ] bKash direct payments
[ ] Couriers — active: [ ] Steadfast  [ ] RedX  [ ] Pathao
[ ] Meta Pixel
[ ] Meta CAPI
[ ] GA4
[ ] GTM
[ ] TikTok Pixel
[ ] Google Ads
[ ] Google OAuth login
[ ] Phone OTP login

ENCRYPTION KEY backed up: [ ] Yes  (location: ___________________)
```
