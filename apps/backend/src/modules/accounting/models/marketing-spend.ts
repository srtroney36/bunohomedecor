import { model } from "@medusajs/framework/utils"

import { MARKETING_PLATFORMS } from "../categories"

/**
 * Ad spend, per platform and campaign.
 *
 * A REGISTER, like fixed assets — it answers "what did we spend on Facebook in June".
 * The cash lives in `ledger_entry` as a mirrored `marketing` row written by the same
 * workflow, so the dashboard must never sum this table into cash as well.
 *
 * Unlike a restock, this money is genuinely gone: `marketing` is classified as a P&L
 * expense, so it reduces net profit on both the Accounting dashboard and Sales Insights.
 */
const MarketingSpend = model
  .define("marketing_spend", {
    id: model.id({ prefix: "mkt" }).primaryKey(),
    spend_date: model.dateTime(),
    platform: model.enum([...MARKETING_PLATFORMS]).default("facebook"),
    campaign: model.text().nullable(),
    amount: model.bigNumber(),
    currency_code: model.text().default("bdt"),
    notes: model.text().nullable(),
  })
  .indexes([{ on: ["spend_date"] }, { on: ["platform"] }])

export default MarketingSpend
