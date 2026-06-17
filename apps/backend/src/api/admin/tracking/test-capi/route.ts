import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework"
import { TRACKING_SETTINGS_MODULE } from "../../../../modules/trackingSettings"
import { decryptSecret } from "../../../../lib/crypto"
import type { EncryptedPayload } from "../../../../lib/crypto"
import { sendCapiPurchase } from "../../../../lib/capi"

// Simple in-memory rate limiter: max 2 requests per 60 seconds
const rateLimitMap = new Map<string, number[]>()
function isRateLimited(key: string): boolean {
  const now = Date.now()
  const timestamps = (rateLimitMap.get(key) ?? []).filter((t) => now - t < 60_000)
  if (timestamps.length >= 2) return true
  timestamps.push(now)
  rateLimitMap.set(key, timestamps)
  return false
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  // Rate limit per admin user
  const userId = (req.auth_context as any)?.actor_id ?? "anon"
  if (isRateLimited(userId)) {
    return res.status(429).json({ success: false, message: "Rate limited — max 2 test events per minute" })
  }

  if (!process.env.APP_SECRETS_ENCRYPTION_KEY && !process.env.COURIER_CONFIG_ENCRYPTION_KEY) {
    return res.status(503).json({
      success: false,
      message: "APP_SECRETS_ENCRYPTION_KEY is not set in .env — cannot decrypt CAPI token",
    })
  }

  const svc = req.scope.resolve(TRACKING_SETTINGS_MODULE) as any
  const [rows] = await svc.listAndCountTrackingSettings({}, { take: 1 })
  const row = rows?.[0]

  if (!row?.capi_configured || !row?.capi_token_encrypted) {
    return res.status(400).json({ success: false, message: "CAPI token is not configured" })
  }

  if (!row?.meta_pixel_id) {
    return res.status(400).json({ success: false, message: "Meta Pixel ID is not configured" })
  }

  let token: string
  try {
    token = decryptSecret(row.capi_token_encrypted as EncryptedPayload)
  } catch (err: any) {
    return res.status(500).json({ success: false, message: `Token decryption failed: ${err.message}` })
  }

  try {
    await sendCapiPurchase({
      pixelId: row.meta_pixel_id,
      token,
      eventId: `test_${Date.now()}`,
      orderId: "test_order",
      value: 9.99,
      currency: "USD",
      contentIds: ["test_product"],
      testEventCode: row.capi_test_event_code ?? undefined,
    })
    res.json({ success: true, message: "Test Purchase event sent to Meta successfully" })
  } catch (err: any) {
    res.json({ success: false, message: err.message || "Failed to send test event" })
  }
}
