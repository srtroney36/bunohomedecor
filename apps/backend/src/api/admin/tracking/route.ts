import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework"
import { TRACKING_SETTINGS_MODULE } from "../../../modules/trackingSettings"
import { encryptSecret, decryptSecret, maskSecret } from "../../../lib/crypto"
import type { EncryptedPayload } from "../../../lib/crypto"

type TrackingService = {
  listAndCountTrackingSettings: (filters?: object, options?: object) => Promise<[any[], number]>
  createTrackingSettings: (data: object) => Promise<any>
  updateTrackingSettings: (id: string, data: object) => Promise<any>
}

async function getOrCreate(svc: TrackingService) {
  const [rows] = await svc.listAndCountTrackingSettings({}, { take: 1 })
  if (rows.length > 0) return rows[0]
  return svc.createTrackingSettings({})
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const svc = req.scope.resolve<TrackingService>(TRACKING_SETTINGS_MODULE)
  const row = await getOrCreate(svc)

  let capiTokenHint: string | null = null
  if (row.capi_configured && row.capi_token_encrypted) {
    try {
      const plaintext = decryptSecret(row.capi_token_encrypted as EncryptedPayload)
      capiTokenHint = maskSecret(plaintext)
    } catch {
      capiTokenHint = "••••(decrypt error)"
    }
  }

  res.json({
    meta_pixel_id: row.meta_pixel_id ?? null,
    ga4_measurement_id: row.ga4_measurement_id ?? null,
    capi_enabled: row.capi_enabled ?? false,
    capi_configured: row.capi_configured ?? false,
    capi_test_event_code: row.capi_test_event_code ?? null,
    purchase_event_enabled: row.purchase_event_enabled ?? true,
    capi_token_hint: capiTokenHint,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const svc = req.scope.resolve<TrackingService>(TRACKING_SETTINGS_MODULE)
  const row = await getOrCreate(svc)

  const {
    meta_pixel_id,
    ga4_measurement_id,
    capi_enabled,
    capi_token,
    capi_test_event_code,
    purchase_event_enabled,
  } = req.body as Record<string, any>

  const update: Record<string, unknown> = {}

  if (meta_pixel_id !== undefined) update.meta_pixel_id = meta_pixel_id || null
  if (ga4_measurement_id !== undefined) update.ga4_measurement_id = ga4_measurement_id || null
  if (capi_enabled !== undefined) update.capi_enabled = Boolean(capi_enabled)
  if (purchase_event_enabled !== undefined) update.purchase_event_enabled = Boolean(purchase_event_enabled)
  if (capi_test_event_code !== undefined) update.capi_test_event_code = capi_test_event_code || null

  // Only encrypt + save token if a non-blank value was submitted
  if (capi_token && typeof capi_token === "string" && capi_token.trim()) {
    try {
      update.capi_token_encrypted = encryptSecret(capi_token.trim())
      update.capi_configured = true
    } catch (err: any) {
      return res.status(500).json({ error: `Encryption failed: ${err.message}` })
    }
  }
  // Blank/omitted capi_token → leave existing capi_token_encrypted unchanged

  await svc.updateTrackingSettings(row.id, update)

  res.json({ success: true })
}
