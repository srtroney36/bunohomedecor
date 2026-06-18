# Part 3 — Feature Configuration Guide

Every feature in this template is **optional and off by default**. A store with only
the required env vars is a working cash-on-delivery storefront. Enable features one at
a time as the client is ready.

---

## How secrets are stored

Two kinds of configuration:

| Kind | Where stored | Who can see the plaintext | Rotation |
|------|-------------|--------------------------|---------|
| **Admin-encrypted** | Database (AES-256-GCM ciphertext) | Backend at send/use time only; admin shows masked hint | Re-enter in admin form |
| **Env var** | Your hosting platform's environment variables | Whoever has platform access | Change the env var → redeploy |

**Admin-encrypted features** (credentials entered in the admin dashboard, never in `.env`):
- Email (Resend) — API key, from-email, from-name
- SMS — API key / Account SID, auth token, sender ID, gateway URL
- Couriers (Steadfast, RedX, Pathao) — all courier API credentials
- Tracking → Conversions API token
- Authentication → Google OAuth client secret

**Env-var features** (set in your platform's environment variables, require redeploy to change):
- Payment providers (Stripe, SSLCommerz, bKash)
- `APP_SECRETS_ENCRYPTION_KEY` (master key for all admin-encrypted secrets)
- Analytics pixels on storefront (GTM, TikTok, Google Ads)

---

## Cash-on-Delivery (COD) — built-in, no setup

Medusa includes a manual payment provider ("Pay on Delivery") enabled automatically.
No env vars or admin configuration required. Customers can place orders and pay on
delivery from day one.

Draft orders are also available out of the box — Admin → Orders → Create Draft Order.

---

## Store Settings (Admin → Store Settings)

Runtime values that override brand.config.ts defaults:

| Setting | Effect |
|---------|--------|
| WhatsApp number | WhatsApp chat button on product pages (overrides `contact.whatsapp` in brand.config) |
| Order phone | Displayed in order confirmation emails and order tracking |

---

## Homepage Builder (Admin → Homepage)

The homepage consists of configurable sections managed entirely in the admin:
- Hero banner with title, subtitle, CTA button, and background image
- Featured categories grid
- Promotional banners
- Featured product collections

No env vars or code changes needed. Sections appear on the storefront immediately on
save (next page load; revalidation is set to 60 seconds).

---

## Product Cards (Admin → Product Cards)

Controls how product cards render across the storefront:

| Setting | Options |
|---------|---------|
| Card style | minimal, classic, detailed, overlay, compact |
| Visible fields | Name, price, Add to Cart button, Buy Now button, badges |
| Button layout | side by side / stacked |
| Action mode | navigate to PDP / add to cart directly |
| Badge settings | Sale label, New Arrival (days threshold), custom badge |
| Text alignment | left / center |
| Grid columns | mobile / tablet / desktop column count |

No env vars. Changes apply on next storefront page load.

---

## Brands (Admin → Brands)

Create brand records and assign products to them. Brands appear as:
- A "Shop by Brand" filter in the store filter drawer (only shown when at least one
  brand has products assigned)
- A `/brands` listing page and individual `/brands/[handle]` pages

**Steps:**
1. Admin → Brands → Create Brand (name, handle, logo URL, description, website, position)
2. Go to any product → Brand widget (top of product detail page) → Assign Brand
3. The brand filter appears automatically in the storefront once a brand has products

---

## Email — Transactional (Admin → Notifications → Credentials)

**What it does:** Sends order confirmation, shipping update, cancellation, and
password-reset emails via [Resend](https://resend.com).

**Triggers automatically:** order placed, order shipped, order canceled, password reset

**External account needed:** Resend (free tier available — check resend.com for current limits)

**Setup steps:**

1. Create a Resend account at [resend.com](https://resend.com)
2. Resend → Domains → **Add Domain** → enter your sending domain (e.g. `mail.acmeshop.com`)
3. Add the SPF and DKIM DNS records Resend shows you — wait for verification (minutes to hours)
4. Resend → API Keys → **Create API Key** → Sending access → copy the key
5. Admin → Notifications → Credentials → Email section:
   - **Resend API Key**: paste the key
   - **From Email**: e.g. `orders@acmeshop.com` (must be on your verified domain)
   - **From Name**: e.g. `Acme Shop`
   - Click **Save Email Credentials**
6. Backend env var: set `STORE_URL=https://shop.acmeshop.com` — used inside
   email templates for logo images and account links
7. Use the **Send test email** button in Admin → Notifications to verify delivery

**What is admin-encrypted:** API key (ciphertext in DB, never returned to browser).
The admin shows a masked hint (e.g. `re_••••abcd`).

**Toggle individual email types:** Admin → Notifications → Email Toggles section
(order placed, order shipped, order canceled, password reset can each be turned on/off).

**Without this configured:** The system silently skips email sends. No crashes.

---

## SMS — Transactional (Admin → Notifications → Credentials)

**What it does:** Sends order confirmation, shipping update, and cancellation SMS
messages to customers.

**Supported providers:**
- **Twilio** — global; most common choice
- **Generic HTTP** — any SMS gateway with a simple HTTP API (Bangladeshi providers etc.)

**External account needed:** Twilio or any HTTP SMS gateway account

**Setup steps (Twilio):**

1. Create a Twilio account at [twilio.com](https://twilio.com)
2. Get or buy a Twilio phone number (From number)
3. Twilio Console → Account Info: copy **Account SID** and **Auth Token**
4. Admin → Notifications → Credentials → SMS section:
   - **Provider**: `twilio`
   - **API Key (Account SID)**: paste Account SID
   - **Auth Token**: paste Auth Token
   - **Sender ID / From Number**: your Twilio number in E.164 format (e.g. `+15005550006`)
   - Click **Save SMS Credentials**

**Setup steps (Generic HTTP):**

1. Admin → Notifications → Credentials → SMS section:
   - **Provider**: `generic_http`
   - **API Key**: your gateway's API key
   - **Sender ID**: your sender ID or number
   - **Gateway URL**: the gateway's endpoint URL
   - Click **Save SMS Credentials**

**Toggle individual SMS types:** Admin → Notifications → SMS Toggles
(order placed, order shipped, order canceled).

**What is admin-encrypted:** API key, auth token.

**Without this configured:** SMS sends are silently skipped.

> **Note:** Phone OTP authentication (see Authentication below) also requires SMS to
> be configured.

---

## Payments — Stripe (Environment variables)

**What it enables:** International card payments, Apple Pay, Google Pay via Stripe.

**External account needed:** [Stripe](https://stripe.com) account

**Env vars (backend — both required together):**

```
STRIPE_API_KEY=sk_live_...          # or sk_test_... for testing
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Storefront env var:**

```
NEXT_PUBLIC_STRIPE_KEY=pk_live_...  # or pk_test_...
```

**Stripe webhook setup:**
1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**
2. URL: `https://api.acmeshop.com/hooks/payment/stripe_stripe`
3. Events to listen for: `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Copy the webhook signing secret → set as `STRIPE_WEBHOOK_SECRET`

**Without this:** Stripe option simply doesn't appear at checkout. COD still works.

---

## Payments — SSLCommerz (Environment variables)

**What it enables:** Bangladesh payment aggregator supporting cards, bKash, Nagad,
Rocket, EMI, and internet banking — all through one integration.

**External account needed:** [SSLCommerz](https://sslcommerz.com) merchant account

**Env vars (backend — both required together):**

```
SSLCOMMERZ_STORE_ID=your_store_id
SSLCOMMERZ_STORE_PASSWORD=your_store_password
SSLCOMMERZ_SANDBOX=true             # set to false for live
BACKEND_URL=https://api.acmeshop.com
```

**Note:** `BACKEND_URL` is required for SSLCommerz because it builds the callback
URLs for `success_url`, `fail_url`, and `cancel_url`.

**Sandbox vs live:** SSLCommerz sandbox credentials are different from live — obtain
both from your SSLCommerz merchant portal.

**Without this:** SSLCommerz doesn't appear in checkout.

---

## Payments — bKash Direct (Environment variables)

**What it enables:** Direct bKash tokenized checkout (PGW) — useful when you need
bKash-only without the full SSLCommerz aggregator.

> Most merchants use SSLCommerz instead, which already includes bKash. Use this only
> if you specifically need the direct bKash tokenized flow.

**External account needed:** bKash merchant account with API access

**Env vars (all four required together):**

```
BKASH_APP_KEY=your_app_key
BKASH_APP_SECRET=your_app_secret
BKASH_USERNAME=your_username
BKASH_PASSWORD=your_password
BKASH_SANDBOX=true                  # set to false for live
BACKEND_URL=https://api.acmeshop.com
```

**Without this:** bKash option doesn't appear in checkout.

---

## Couriers (Admin → Couriers)

**What it does:** Manages delivery partner configuration. The active courier is used
by the backend fulfillment provider to book shipments for orders. Only one courier can
be active at a time.

**Supported couriers:** Steadfast, RedX, Pathao

**Required env var (backend):**

```
APP_SECRETS_ENCRYPTION_KEY=<64-hex-char key>
```

This is the same key used for all other admin-encrypted features. If you set it for
email/SMS, it is already set.

**Setup steps (same pattern for all three couriers):**

1. Obtain API credentials from the courier's merchant portal (see below)
2. Admin → Couriers → expand the courier card → enter credentials → **Save**
3. Click **Test Connection** to verify the credentials work
4. Click **Set as Active** to make it the active fulfillment provider

**Credentials per courier:**

| Courier | Credentials needed | Has sandbox |
|---------|--------------------|-------------|
| Steadfast | API Key, Secret Key | No (one live environment) |
| RedX | API Token | Yes — toggle Sandbox in the form |
| Pathao | Client ID, Client Secret, Username (email), Password | Yes — toggle Sandbox in the form |

**Where to get credentials:**
- **Steadfast:** portal.packzy.com → Account → API Settings
- **RedX:** Contact RedX account manager for API access; token in merchant portal
- **Pathao:** Apply for Courier API at pathao.com; credentials provided by Pathao

> **Area mapping note:** RedX and Pathao use zone/area codes for shipment creation.
> Configure your default pickup address in the courier settings panel inside each
> courier card.

**What is admin-encrypted:** All credential fields (ciphertext in DB). Admin shows
masked hints.

**Without this configured:** Fulfillment provider is inactive; orders can still be
manually fulfilled. No crashes.

---

## Tracking & Analytics (Admin → Tracking & Analytics)

### Meta Pixel (runtime, no redeploy needed)

**What it does:** Fires the standard `PageView`, `ViewContent`, `AddToCart`, and
`Purchase` events on the storefront.

**Setup:**
1. Meta Business Suite → Events Manager → select or create a Pixel
2. Copy the **Pixel ID** (15–16 digit number)
3. Admin → Tracking & Analytics → Meta Pixel ID → **Save**

The Pixel loads on the storefront without a redeploy (settings are fetched at runtime).

> There is also a `NEXT_PUBLIC_META_PIXEL_ID` storefront env var that serves as a
> fallback if the admin value is not set. The admin value takes precedence.

### GA4 (runtime, no redeploy needed)

**What it does:** Loads Google Analytics 4 on the storefront.

**Setup:**
1. analytics.google.com → create a GA4 property → Data Streams → Web
2. Copy the **Measurement ID** (format: `G-XXXXXXXX`)
3. Admin → Tracking & Analytics → GA4 Measurement ID → **Save**

Loads without a redeploy.

### Meta Conversions API / CAPI (server-side events)

**What it does:** Sends `Purchase` events to Meta server-side via CAPI for improved
attribution (supplements the browser Pixel, survives ad blockers).

**Required env var:** `APP_SECRETS_ENCRYPTION_KEY` (already set if using couriers
or email — same key).

#### Deduplication — critical

When CAPI is enabled, every completed purchase fires **two** Purchase events: one from
the browser Pixel (client-side) and one from the server (CAPI). Meta must deduplicate
them into a single event, or **every sale will be double-counted** in your attribution.

Deduplication works by sharing the same `event_id` across both sends. This template
handles this automatically:
- The storefront order-confirmation page fires the browser Pixel `Purchase` event with
  `eventID = order.id`
- The backend `order.placed` subscriber sends the CAPI `Purchase` event with
  `event_id = order.id`

Both use the same order ID — Meta matches them and counts them as one event.

**Verify deduplication before going live** using the Test Event Code (see step 4 below).
You should see one event in Meta Events Manager with a dedup indicator, not two separate
entries. Remove the Test Event Code before going live.

**Setup:**
1. Meta Business Suite → Events Manager → your Pixel → **Settings → Conversions API**
2. Generate an access token → copy it
3. Admin → Tracking & Analytics:
   - Toggle **Enable Conversions API** on
   - Paste the **CAPI Access Token** → **Save**
4. For deduplication testing: paste a **Test Event Code** from Meta Events Manager
   (e.g. `TEST12345`). Place a test order and confirm Events Manager shows the browser
   Purchase and server Purchase as **ONE deduplicated event** (not two). Once confirmed,
   clear this field and save.

**What is admin-encrypted:** CAPI access token.

**Without this:** Only browser-side Pixel fires. No server-side events.

### Google Tag Manager (storefront env var)

```
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX
```

Set in the storefront's environment variables. Fires a `PageView` dataLayer push on every
navigation. Use GTM to manage all other tags from the GTM dashboard without redeploying.

### TikTok Pixel / Google Ads (storefront env vars)

```
NEXT_PUBLIC_TIKTOK_PIXEL_ID=ABCDEFGHIJ
NEXT_PUBLIC_GADS_ID=AW-123456789
```

Both require a storefront redeploy to activate.

---

## Authentication (Admin → Authentication)

### Google OAuth

**What it does:** Lets customers sign in with their Google account on the storefront.
Shows a "Sign in with Google" button on the account/login page.

**Required:** SMS must NOT be required — Google OAuth works independently.  
**Required env var:** `APP_SECRETS_ENCRYPTION_KEY` (for encrypting the client secret).

**External account needed:** Google Cloud Console project with OAuth 2.0 credentials

**Setup steps:**

1. [console.cloud.google.com](https://console.cloud.google.com) → select or create a project
2. APIs & Services → Credentials → **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Authorized redirect URIs: add one entry **per country code** your storefront uses, e.g.:
   - `https://shop.acmeshop.com/en/account/google-callback` (English / US)
   - `https://shop.acmeshop.com/bd/account/google-callback` (Bangladesh)
   - `https://shop.acmeshop.com/gb/account/google-callback` (UK)
   
   Each country code the storefront can serve needs its own URI registered in Google Console.
5. Copy **Client ID** and **Client Secret**
6. Admin → Authentication → Google OAuth section:
   - **Google Enabled**: on
   - **Client ID**: paste Client ID
   - **Client Secret**: paste Client Secret (stored encrypted — admin shows masked hint)
   - **Redirect URI**: paste the exact callback URL you registered in step 4
   - **Save**

**What is admin-encrypted:** Client Secret.

> **Common error — `redirect_uri_mismatch`:** The Redirect URI in the admin form must
> exactly match what is registered in Google Cloud Console — including the country
> code prefix.

**Without this configured:** Google login button is hidden. Standard email/password
login still works.

### Phone OTP

> **Hard prerequisite:** SMS notifications must be configured and working before enabling
> Phone OTP. If SMS is not configured, the "Send code" step returns an error and
> customers cannot log in. Configure SMS first (Admin → Notifications → Credentials),
> then return here.

**What it does:** Lets customers sign in with their phone number. The system sends a
one-time code via SMS; the customer enters it to authenticate.

**Setup steps:**

1. Configure SMS (Admin → Notifications → Credentials) — verify a test SMS arrives
2. Admin → Authentication → Phone OTP section:
   - **Phone OTP Enabled**: on
   - **OTP Length**: default 6
   - **OTP Expiry**: default 300 seconds (5 minutes)
   - **Max Attempts**: default 5
   - **Resend Cooldown**: default 60 seconds
   - **Save**

**Without SMS configured:** The send-OTP endpoint returns HTTP 503 with a clear error
message — the customer sees an error rather than waiting for a code that never arrives.
The admin Authentication page shows a warning next to the Phone OTP toggle when SMS is
not configured.

---

## What each admin setup-guide tells you

Every feature in the admin that requires external credentials has a built-in
collapsible **Setup Guide** panel with step-by-step instructions, links, and which env
vars (if any) still need to be set on your hosting platform. The guides are the canonical
reference; this document is the overview.

---

## Summary — what is configured where

| Feature | Configure in | Admin-encrypted? | Env var required |
|---------|-------------|-----------------|-----------------|
| COD / draft orders | Nothing | — | — |
| Store settings (WhatsApp, phone) | Admin | No | — |
| Homepage sections | Admin | No | — |
| Product cards | Admin | No | — |
| Brands | Admin | No | — |
| Email (Resend) | Admin → Notifications | Yes (API key) | `STORE_URL`, `APP_SECRETS_ENCRYPTION_KEY` |
| SMS | Admin → Notifications | Yes (API key, auth token) | `APP_SECRETS_ENCRYPTION_KEY` |
| Stripe | Backend env vars | No | `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_KEY` |
| SSLCommerz | Backend env vars | No | `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, `BACKEND_URL` |
| bKash direct | Backend env vars | No | `BKASH_*` × 4, `BACKEND_URL` |
| Couriers | Admin → Couriers | Yes (all creds) | `APP_SECRETS_ENCRYPTION_KEY` |
| Meta Pixel | Admin → Tracking | No | — |
| GA4 | Admin → Tracking | No | — |
| CAPI | Admin → Tracking | Yes (token) | `APP_SECRETS_ENCRYPTION_KEY` |
| GTM | Storefront env var | No | `NEXT_PUBLIC_GTM_ID` |
| TikTok Pixel | Storefront env var | No | `NEXT_PUBLIC_TIKTOK_PIXEL_ID` |
| Google Ads | Storefront env var | No | `NEXT_PUBLIC_GADS_ID` |
| Google OAuth | Admin → Authentication | Yes (client secret) | `APP_SECRETS_ENCRYPTION_KEY` |
| Phone OTP | Admin → Authentication | No | Requires SMS |
