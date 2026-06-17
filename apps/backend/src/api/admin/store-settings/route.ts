import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { STORE_SETTINGS_MODULE } from "../../../modules/storeSettings"
import { encryptSecret, decryptSecret, maskSecret, EncryptedPayload } from "../../../lib/crypto"
import { loadCredsFromSettings } from "../../../lib/notification-creds"

const DEFAULTS = {
  whatsapp_number: null,
  order_phone: null,
  product_card_style: null,
  product_card_fields: null,
  card_button_layout: null,
  card_action_mode: null,
  card_badge_settings: null,
  card_text_align: null,
  card_grid_columns: null,
  email_enabled: true,
  email_order_placed: true,
  email_order_shipped: true,
  email_order_canceled: true,
  email_password_reset: true,
  email_sender_name: null,
  sms_order_placed: false,
  sms_order_shipped: false,
  sms_order_canceled: false,
  resend_from_email: null,
  resend_from_name: null,
  email_configured: false,
  sms_sender_id: null,
  sms_provider: null,
  sms_api_url: null,
  sms_configured: false,
}

function safeDecryptMask(blob: unknown): string | null {
  if (!blob) return null
  try {
    const plain = decryptSecret(blob as EncryptedPayload)
    return maskSecret(plain)
  } catch {
    return null
  }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(STORE_SETTINGS_MODULE)
  const [setting] = await svc.listStoreSettings({}, { take: 1 })

  if (!setting) {
    return res.json({ setting: DEFAULTS })
  }

  const { resend_api_key_encrypted, sms_api_key_encrypted, twilio_auth_token_encrypted, ...rest } = setting as any

  return res.json({
    setting: {
      ...rest,
      resend_api_key_hint: safeDecryptMask(resend_api_key_encrypted),
      sms_api_key_hint: safeDecryptMask(sms_api_key_encrypted),
      twilio_auth_token_hint: safeDecryptMask(twilio_auth_token_encrypted),
    },
  })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(STORE_SETTINGS_MODULE)
  const body = req.body as any

  const [existing] = await svc.listStoreSettings({}, { take: 1 })

  // Partial-update pattern: only include a field if the caller explicitly sent it.
  // This lets product-card, notification-toggles, and credentials pages each POST only
  // their own fields without clobbering unrelated columns (e.g. non-nullable booleans).
  const payload: Record<string, unknown> = {}

  // ── General / card fields ──────────────────────────────────────────────────
  const simpleKeys = [
    "whatsapp_number", "order_phone",
    "product_card_style", "product_card_fields",
    "card_button_layout", "card_action_mode", "card_badge_settings",
    "card_text_align", "card_grid_columns",
    "email_enabled", "email_order_placed", "email_order_shipped",
    "email_order_canceled", "email_password_reset", "email_sender_name",
    "sms_order_placed", "sms_order_shipped", "sms_order_canceled",
  ] as const
  for (const key of simpleKeys) {
    if (key in body) payload[key] = body[key]
  }

  // ── Credential fields — only process when at least one cred key is present ─
  const credKeys = [
    "resend_api_key", "resend_from_email", "resend_from_name",
    "sms_api_key", "sms_sender_id", "sms_provider", "sms_api_url", "twilio_auth_token",
  ]
  const hasCredFields = credKeys.some((k) => k in body)

  if (hasCredFields) {
    const { resend_api_key, resend_from_email, resend_from_name,
            sms_api_key, sms_sender_id, sms_provider, sms_api_url, twilio_auth_token } = body

    // Blank input = keep existing encrypted blob; non-blank = re-encrypt
    const resend_api_key_encrypted =
      resend_api_key?.trim()
        ? encryptSecret(resend_api_key.trim())
        : (existing as any)?.resend_api_key_encrypted ?? null

    const sms_api_key_encrypted =
      sms_api_key?.trim()
        ? encryptSecret(sms_api_key.trim())
        : (existing as any)?.sms_api_key_encrypted ?? null

    const twilio_auth_token_encrypted =
      twilio_auth_token?.trim()
        ? encryptSecret(twilio_auth_token.trim())
        : (existing as any)?.twilio_auth_token_encrypted ?? null

    const resolvedFromEmail = resend_from_email ?? (existing as any)?.resend_from_email ?? null
    const resolvedSenderId  = sms_sender_id    ?? (existing as any)?.sms_sender_id      ?? null
    const resolvedProvider  = sms_provider      ?? (existing as any)?.sms_provider       ?? null

    const email_configured = !!(resend_api_key_encrypted && resolvedFromEmail)
    const sms_configured   = !!(sms_api_key_encrypted && resolvedSenderId && resolvedProvider)

    Object.assign(payload, {
      resend_api_key_encrypted,
      resend_from_email: resolvedFromEmail,
      resend_from_name: resend_from_name ?? (existing as any)?.resend_from_name ?? null,
      email_configured,
      sms_api_key_encrypted,
      sms_sender_id: resolvedSenderId,
      sms_provider: resolvedProvider,
      twilio_auth_token_encrypted,
      sms_api_url: sms_api_url ?? (existing as any)?.sms_api_url ?? null,
      sms_configured,
    })
  }

  let updated: any
  if (existing) {
    ;[updated] = await svc.updateStoreSettings([{ id: existing.id, ...payload }])
  } else {
    ;[updated] = await svc.createStoreSettings([payload])
  }

  // Update in-memory credential cache only when credentials were part of this save
  if (hasCredFields) {
    loadCredsFromSettings(updated)
  }

  // Return safe view — strip encrypted blobs
  const { resend_api_key_encrypted: _r, sms_api_key_encrypted: _s, twilio_auth_token_encrypted: _t, ...safe } = updated as any
  return res.json({
    setting: {
      ...safe,
      resend_api_key_hint: safeDecryptMask(updated.resend_api_key_encrypted),
      sms_api_key_hint: safeDecryptMask(updated.sms_api_key_encrypted),
      twilio_auth_token_hint: safeDecryptMask(updated.twilio_auth_token_encrypted),
    },
  })
}
