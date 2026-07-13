import { model } from "@medusajs/framework/utils"

/**
 * What each courier zone costs US. Auto-fills the per-order courier fee at booking time so the
 * team isn't typing a number into every single order, while still allowing a correction when a
 * parcel is oversized or the courier surcharges.
 *
 * `cod_fee_pct` is the cut couriers take for collecting cash (typically ~1% of the COD amount in
 * Bangladesh) — real money, and invisible unless it's modelled.
 *
 * Money as-is (60 = 60 BDT), never cents.
 */
const CourierRate = model
  .define("courier_rate", {
    id: model.id({ prefix: "crate" }).primaryKey(),

    name: model.text(), // "Inside Dhaka"
    fee: model.bigNumber().default(0),
    /** Percent of the COD collected that the courier keeps. 1 = 1%. */
    cod_fee_pct: model.bigNumber().default(0),

    is_default: model.boolean().default(false),
    is_active: model.boolean().default(true),
  })
  .indexes([{ on: ["is_default"] }])

export default CourierRate
