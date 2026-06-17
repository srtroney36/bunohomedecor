import { decryptSecret } from "./crypto"
import type { EncryptedPayload } from "./crypto"
import { STORE_SETTINGS_MODULE } from "../modules/storeSettings"

export type EmailCreds = {
  apiKey: string
  fromEmail: string
  fromName: string
}

export type SmsCreds = {
  apiKey: string
  senderId: string
  provider: string
  twilioAuthToken?: string
  apiUrl?: string
}

// Module-level cache — populated by loadCredsFromSettings() on admin save and lazy DB load
let _emailCreds: EmailCreds | null = null
let _smsCreds: SmsCreds | null = null
// "empty" = not yet loaded from DB; "loaded" = DB was read (creds may still be null = not configured)
let _emailCacheState: "empty" | "loaded" = "empty"
let _smsCacheState: "empty" | "loaded" = "empty"

export function invalidateCredsCache() {
  _emailCreds = null
  _smsCreds = null
  _emailCacheState = "empty"
  _smsCacheState = "empty"
}

/** Call after admin saves settings — decrypts the row and updates the cache immediately. */
export function loadCredsFromSettings(settings: any) {
  if (!settings) {
    _emailCreds = null
    _smsCreds = null
    _emailCacheState = "loaded"
    _smsCacheState = "loaded"
    return
  }

  // Email
  if (settings.email_configured && settings.resend_api_key_encrypted) {
    try {
      _emailCreds = {
        apiKey: decryptSecret(settings.resend_api_key_encrypted as EncryptedPayload),
        fromEmail: settings.resend_from_email ?? "noreply@resend.dev",
        fromName: settings.resend_from_name ?? "My Store",
      }
    } catch {
      _emailCreds = null
    }
  } else {
    _emailCreds = null
  }
  _emailCacheState = "loaded"

  // SMS
  if (settings.sms_configured && settings.sms_api_key_encrypted) {
    try {
      const twilioAuthToken = settings.twilio_auth_token_encrypted
        ? decryptSecret(settings.twilio_auth_token_encrypted as EncryptedPayload)
        : undefined
      _smsCreds = {
        apiKey: decryptSecret(settings.sms_api_key_encrypted as EncryptedPayload),
        senderId: settings.sms_sender_id ?? "",
        provider: (settings.sms_provider ?? "twilio").toLowerCase(),
        twilioAuthToken,
        apiUrl: settings.sms_api_url ?? undefined,
      }
    } catch {
      _smsCreds = null
    }
  } else {
    _smsCreds = null
  }
  _smsCacheState = "loaded"
}

/**
 * Returns admin-configured email credentials, or null if not configured.
 * On first call after startup, does a lazy DB read via the provider's container.
 * No env fallback — admin form is the single source of truth.
 */
export async function resolveEmailCreds(container?: any): Promise<EmailCreds | null> {
  if (_emailCacheState === "loaded") return _emailCreds

  if (container) {
    try {
      const svc = container.resolve?.(STORE_SETTINGS_MODULE)
      if (svc) {
        const [settings] = await svc.listStoreSettings({}, { take: 1 })
        loadCredsFromSettings(settings ?? null)
        return _emailCreds
      }
    } catch {
      // Container can't resolve storeSettings — mark loaded with null so we don't retry
      _emailCacheState = "loaded"
    }
  }

  return null
}

/**
 * Returns admin-configured SMS credentials, or null if not configured.
 * On first call after startup, does a lazy DB read via the provider's container.
 * No env fallback — admin form is the single source of truth.
 */
export async function resolveSmsCreds(container?: any): Promise<SmsCreds | null> {
  if (_smsCacheState === "loaded") return _smsCreds

  if (container) {
    try {
      const svc = container.resolve?.(STORE_SETTINGS_MODULE)
      if (svc) {
        const [settings] = await svc.listStoreSettings({}, { take: 1 })
        loadCredsFromSettings(settings ?? null)
        return _smsCreds
      }
    } catch {
      _smsCacheState = "loaded"
    }
  }

  return null
}
