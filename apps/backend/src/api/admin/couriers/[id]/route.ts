import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { COURIER_CONFIG_MODULE } from "../../../../modules/courierConfig"
import { encryptSecret } from "../../../../lib/crypto"

// Credential field names per courier (used to validate / selectively re-encrypt)
const CREDENTIAL_FIELDS: Record<string, string[]> = {
  steadfast: ["api_key", "secret_key"],
  redx: ["api_token"],
  pathao: ["client_id", "client_secret", "username", "password"],
}

// POST /admin/couriers/:id — save credentials + settings
// Blank or omitted credential field = keep existing value unchanged
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const courierId = req.params.id
  const body = req.body as Record<string, unknown>
  const svc = req.scope.resolve(COURIER_CONFIG_MODULE) as any

  const [existing] = await svc.listCourierConfigs({ courier_id: courierId })
  if (!existing) {
    return res.status(404).json({ error: `Courier "${courierId}" not found` })
  }

  // Body shape: { credentials?: { field: value }, settings?: { sandbox, pickup_address } }
  // Also accept flat credential fields for backwards compatibility
  const rawCreds: Record<string, string> =
    (body.credentials as Record<string, string> | undefined) ?? {}
  const rawSettings: Record<string, unknown> =
    (body.settings as Record<string, unknown> | undefined) ?? {}

  const fields = CREDENTIAL_FIELDS[courierId] ?? []
  const incomingCreds: Record<string, unknown> = {}
  let hasNewSecret = false

  for (const field of fields) {
    // Check nested credentials object first, then flat body field
    const val = (rawCreds[field] ?? (body[field] as string | undefined) ?? "").trim()
    if (val) {
      incomingCreds[field] = encryptSecret(val)
      hasNewSecret = true
    }
  }

  // Merge with existing encrypted creds (keep fields not being updated)
  let credentialsEncrypted = existing.credentials_encrypted ?? {}
  if (hasNewSecret) {
    credentialsEncrypted = { ...credentialsEncrypted, ...incomingCreds }
  }

  // Settings (non-secret) — accept nested settings object or flat body fields
  const settings: Record<string, unknown> = { ...(existing.settings ?? {}) }
  const sandboxVal = "sandbox" in rawSettings ? rawSettings.sandbox : body.sandbox
  if (sandboxVal !== undefined) settings.sandbox = Boolean(sandboxVal)
  const pickupVal = "pickup_address" in rawSettings ? rawSettings.pickup_address : body.pickup_address
  if (pickupVal !== undefined) settings.pickup_address = pickupVal

  const configured = Object.keys(credentialsEncrypted).length >= (fields.length > 0 ? 1 : 1)

  await svc.updateCourierConfigs([
    {
      id: existing.id,
      credentials_encrypted: credentialsEncrypted,
      settings,
      configured,
    },
  ])

  res.json({ success: true })
}
