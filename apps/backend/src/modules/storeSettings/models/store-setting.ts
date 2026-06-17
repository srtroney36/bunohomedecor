import { model } from "@medusajs/framework/utils"

const StoreSetting = model.define("store_setting", {
  id: model.id().primaryKey(),
  whatsapp_number: model.text().nullable(),
  order_phone: model.text().nullable(),
  product_card_style: model.text().nullable(),
  product_card_fields: model.json().nullable(),
  card_button_layout: model.text().nullable(),
  card_action_mode: model.text().nullable(),
  card_badge_settings: model.json().nullable(),
  card_text_align: model.text().nullable(),
  card_grid_columns: model.json().nullable(),
  email_enabled: model.boolean().default(true),
  email_order_placed: model.boolean().default(true),
  email_order_shipped: model.boolean().default(true),
  email_order_canceled: model.boolean().default(true),
  email_password_reset: model.boolean().default(true),
  email_sender_name: model.text().nullable(),
  sms_order_placed: model.boolean().default(false),
  sms_order_shipped: model.boolean().default(false),
  sms_order_canceled: model.boolean().default(false),
  // Email credential storage (encrypted at rest)
  resend_api_key_encrypted: model.json().nullable(),
  resend_from_email: model.text().nullable(),
  resend_from_name: model.text().nullable(),
  email_configured: model.boolean().default(false),
  // SMS credential storage (encrypted at rest)
  sms_api_key_encrypted: model.json().nullable(),
  sms_sender_id: model.text().nullable(),
  sms_provider: model.text().nullable(),
  twilio_auth_token_encrypted: model.json().nullable(),
  sms_api_url: model.text().nullable(),
  sms_configured: model.boolean().default(false),
})

export default StoreSetting
