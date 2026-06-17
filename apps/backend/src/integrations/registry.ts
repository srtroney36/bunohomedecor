import type { MedusaContainer } from "@medusajs/framework"
import { STORE_SETTINGS_MODULE } from "../modules/storeSettings"

export type EnvVarDef = {
  key: string
  required?: boolean
  secret?: boolean  // present-boolean only; display always null
  mask?: "email"    // "he***@domain.com"
}

export type IntegrationDef = {
  id: string
  label: string
  env: EnvVarDef[]
  isConfigured?: (container: MedusaContainer) => Promise<boolean>
  test?: (
    container: MedusaContainer,
    input: Record<string, string>
  ) => Promise<{ success: boolean; message: string }>
}

function maskEmail(value: string): string {
  const atIdx = value.indexOf("@")
  if (atIdx < 0) return value.slice(0, 2) + "***"
  const local = value.slice(0, atIdx)
  const domain = value.slice(atIdx)
  return local.slice(0, 2) + "***" + domain
}

export function buildVarDisplay(def: EnvVarDef): string | null {
  const value = process.env[def.key]
  if (!value) return null
  if (def.secret) return null
  if (def.mask === "email") return maskEmail(value)
  return value
}

async function isEmailConfigured(container: MedusaContainer): Promise<boolean> {
  try {
    const svc = (container as any).resolve(STORE_SETTINGS_MODULE) as any
    const [settings] = await svc.listStoreSettings({}, { take: 1 })
    return !!settings?.email_configured
  } catch {
    return false
  }
}

async function isSmsConfigured(container: MedusaContainer): Promise<boolean> {
  try {
    const svc = (container as any).resolve(STORE_SETTINGS_MODULE) as any
    const [settings] = await svc.listStoreSettings({}, { take: 1 })
    return !!settings?.sms_configured
  } catch {
    return false
  }
}

const REGISTRY: Record<string, IntegrationDef> = {
  stripe: {
    id: "stripe",
    label: "Stripe (Cards, Apple Pay, Google Pay)",
    env: [
      { key: "STRIPE_API_KEY",        required: true, secret: true },
      { key: "STRIPE_WEBHOOK_SECRET", required: true, secret: true },
    ],
    test: async (_container, _input) => {
      if (!process.env.STRIPE_API_KEY)
        return { success: false, message: "STRIPE_API_KEY is not set — add it to .env and restart the server." }
      try {
        const res = await fetch("https://api.stripe.com/v1/balance", {
          headers: { Authorization: `Bearer ${process.env.STRIPE_API_KEY}` },
        })
        if (res.status === 401)
          return { success: false, message: "Stripe API key is invalid or lacks permissions." }
        if (!res.ok)
          return { success: false, message: `Stripe API returned HTTP ${res.status}` }
        return { success: true, message: "Stripe API key is valid and connected." }
      } catch (err: any) {
        return { success: false, message: err.message }
      }
    },
  },
  sslcommerz: {
    id: "sslcommerz",
    label: "SSLCommerz (Cards, bKash, Nagad, Rocket, EMI)",
    env: [
      { key: "SSLCOMMERZ_STORE_ID",       required: true },
      { key: "SSLCOMMERZ_STORE_PASSWORD", required: true, secret: true },
      { key: "SSLCOMMERZ_SANDBOX",        required: false },
      { key: "BACKEND_URL",               required: false },
    ],
    test: async (_container, _input) => {
      const storeId = process.env.SSLCOMMERZ_STORE_ID
      const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD
      if (!storeId || !storePassword)
        return { success: false, message: "SSLCOMMERZ_STORE_ID or SSLCOMMERZ_STORE_PASSWORD not set." }
      const sandbox = process.env.SSLCOMMERZ_SANDBOX !== "false"
      const base = sandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com"
      const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:9000").replace(/\/$/, "")
      try {
        const params = new URLSearchParams({
          store_id: storeId,
          store_passwd: storePassword,
          total_amount: "10.00",
          currency: "BDT",
          tran_id: `test_${Date.now()}`,
          success_url: `${backendUrl}/store/sslcommerz/success`,
          fail_url: `${backendUrl}/store/sslcommerz/fail`,
          cancel_url: `${backendUrl}/store/sslcommerz/cancel`,
          ipn_url: `${backendUrl}/store/sslcommerz/ipn`,
          value_a: "test",
          cus_name: "Test Customer",
          cus_email: "test@store.com",
          cus_phone: "01700000000",
          cus_add1: "Dhaka",
          cus_city: "Dhaka",
          cus_country: "Bangladesh",
          ship_name: "Test Customer",
          ship_add1: "Dhaka",
          ship_city: "Dhaka",
          ship_country: "Bangladesh",
          product_name: "Test Order",
          product_category: "general",
          product_profile: "general",
        })
        const res = await fetch(`${base}/gwprocess/v4/api.php`, { method: "POST", body: params })
        if (!res.ok) return { success: false, message: `SSLCommerz API returned HTTP ${res.status}` }
        const json = (await res.json()) as { status: string; failedreason?: string }
        if (json.status === "SUCCESS")
          return { success: true, message: `SSLCommerz ${sandbox ? "sandbox" : "live"} credentials are valid.` }
        return { success: false, message: `SSLCommerz: ${json.failedreason ?? json.status}` }
      } catch (err: any) {
        return { success: false, message: err.message }
      }
    },
  },
  bkash: {
    id: "bkash",
    label: "bKash (Direct Tokenized Checkout)",
    env: [
      { key: "BKASH_APP_KEY",    required: true,  secret: true },
      { key: "BKASH_APP_SECRET", required: true,  secret: true },
      { key: "BKASH_USERNAME",   required: true },
      { key: "BKASH_PASSWORD",   required: true,  secret: true },
      { key: "BKASH_SANDBOX",    required: false },
    ],
    test: async (_container, _input) => {
      const appKey = process.env.BKASH_APP_KEY
      const appSecret = process.env.BKASH_APP_SECRET
      const username = process.env.BKASH_USERNAME
      const password = process.env.BKASH_PASSWORD
      if (!appKey || !appSecret || !username || !password)
        return { success: false, message: "One or more bKash env vars not set." }
      const sandbox = process.env.BKASH_SANDBOX !== "false"
      const base = sandbox
        ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized"
        : "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized"
      try {
        const credentials = Buffer.from(`${appKey}:${appSecret}`).toString("base64")
        const res = await fetch(`${base}/checkout/token/grant`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${credentials}`,
            username,
            password,
          },
          body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
        })
        if (!res.ok) return { success: false, message: `bKash token grant HTTP ${res.status}` }
        const json = (await res.json()) as { id_token?: string; statusMessage?: string }
        if (json.id_token)
          return { success: true, message: `bKash ${sandbox ? "sandbox" : "live"} token granted — credentials are valid.` }
        return { success: false, message: `bKash token grant failed: ${json.statusMessage}` }
      } catch (err: any) {
        return { success: false, message: err.message }
      }
    },
  },
  sms: {
    id: "sms",
    label: "Transactional SMS",
    env: [],  // All SMS credentials are managed via admin form
    isConfigured: isSmsConfigured,
    test: async (container, input) => {
      const configured = await isSmsConfigured(container)
      if (!configured)
        return { success: false, message: "SMS credentials not configured. Enter them in the Credentials section on this page, or add SMS_API_KEY to .env." }
      const to = (input.to ?? "").replace(/[\s\-().]/g, "")
      if (!/^\+\d{7,15}$/.test(to))
        return { success: false, message: `"${input.to}" is not a valid E.164 phone number. Use format: +8801XXXXXXXXX` }
      try {
        const svc = (container as any).resolve("notification") as any
        await svc.createNotifications({
          to,
          channel: "sms",
          template: "fallback",
          data: { message: "Test SMS from your store — it's working!" },
        })
        return { success: true, message: `Test SMS sent to ${to}` }
      } catch (err: any) {
        return { success: false, message: err.message }
      }
    },
  },
  email: {
    id: "email",
    label: "Transactional Email (Resend)",
    env: [
      // Only non-credential env var still needed for email templates
      { key: "STORE_URL", required: false },
    ],
    isConfigured: isEmailConfigured,
    test: async (container, input) => {
      const configured = await isEmailConfigured(container)
      if (!configured)
        return { success: false, message: "Resend credentials not configured. Enter your API key in the Credentials section on this page, or add RESEND_API_KEY to .env." }
      if (!input.to)
        return { success: false, message: "No recipient email provided." }
      try {
        const svc = (container as any).resolve("notification") as any
        await svc.createNotifications({
          to: input.to,
          channel: "email",
          template: "fallback",
          data: { subject: "Test email from your store", message: "If you received this, your Resend integration is working correctly." },
        })
        return { success: true, message: `Test email sent to ${input.to}` }
      } catch (err: any) {
        return { success: false, message: err.message }
      }
    },
  },
}

export function getIntegration(id: string): IntegrationDef | null {
  return REGISTRY[id] ?? null
}
