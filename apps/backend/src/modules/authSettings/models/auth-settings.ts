import { model } from "@medusajs/framework/utils"

const AuthSettings = model.define("auth_settings", {
  id: model.id().primaryKey(),
  google_enabled: model.boolean().default(false),
  google_client_id: model.text().nullable(),
  google_client_secret_encrypted: model.json().nullable(),
  google_redirect_uri: model.text().nullable(),
  google_configured: model.boolean().default(false),
  phone_otp_enabled: model.boolean().default(false),
  otp_length: model.number().default(6),
  otp_expiry_seconds: model.number().default(300),
  otp_max_attempts: model.number().default(5),
  otp_resend_cooldown_seconds: model.number().default(60),
})

export default AuthSettings
