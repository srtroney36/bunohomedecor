import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { AUTH_SETTINGS_MODULE } from "../../../modules/authSettings"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const svc = req.scope.resolve(AUTH_SETTINGS_MODULE) as any
  const [rows] = await svc.listAndCountAuthSettings({}, { take: 1 })
  const row = rows?.[0]

  // NEVER expose client_secret or any OTP internal fields
  res.json({
    google: {
      enabled: Boolean(row?.google_enabled && row?.google_configured),
      client_id: (row?.google_enabled && row?.google_configured) ? (row?.google_client_id ?? null) : null,
      redirect_uri: (row?.google_enabled && row?.google_configured) ? (row?.google_redirect_uri ?? null) : null,
    },
    phone_otp: {
      enabled: Boolean(row?.phone_otp_enabled),
      otp_length: row?.otp_length ?? 6,
    },
  })
}
