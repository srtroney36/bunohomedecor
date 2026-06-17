import { model } from "@medusajs/framework/utils"

const CourierConfig = model.define("courier_config", {
  id: model.id().primaryKey(),
  courier_id: model.text(),                      // "steadfast" | "redx" | "pathao"
  enabled: model.boolean().default(false),
  is_active: model.boolean().default(false),
  configured: model.boolean().default(false),
  credentials_encrypted: model.json().nullable(), // EncryptedPayload | null
  settings: model.json().nullable(),              // non-secret prefs: { sandbox: bool, ... }
})

export default CourierConfig
