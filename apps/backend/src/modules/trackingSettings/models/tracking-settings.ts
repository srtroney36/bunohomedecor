import { model } from "@medusajs/framework/utils"

const TrackingSettings = model.define("tracking_settings", {
  id: model.id().primaryKey(),
  meta_pixel_id: model.text().nullable(),
  ga4_measurement_id: model.text().nullable(),
  capi_enabled: model.boolean().default(false),
  capi_token_encrypted: model.json().nullable(),
  capi_configured: model.boolean().default(false),
  capi_test_event_code: model.text().nullable(),
  purchase_event_enabled: model.boolean().default(true),
})

export default TrackingSettings
