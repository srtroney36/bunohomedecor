import { z } from "zod"

import {
  FIXED_ASSET_CATEGORIES,
  LEDGER_CATEGORIES,
  MARKETING_PLATFORMS,
} from "../../../modules/accounting/categories"

/** Money is as-is (800 = 800 BDT), never cents. Always a positive magnitude. */
const Money = z.coerce.number().finite().positive()
const D = z.coerce.date() // accepts "2026-07-01" and full ISO

/* -------------------------------------- ledger ------------------------------------- */

/**
 * Note there is no `direction` here, deliberately. Direction is a fixed property of the
 * category (see CATEGORY_META) and is derived in the workflow. Accepting it from the
 * client would allow a "capital contribution" that pays money out.
 */
export const CreateLedgerEntrySchema = z
  .object({
    entry_date: D,
    category: z.enum(LEDGER_CATEGORIES),
    amount: Money,
    currency_code: z.string().min(2).max(3).default("bdt"),
    description: z.string().max(500).nullish(),
    reference: z.string().max(200).nullish(),
    partner_id: z.string().nullish(),
  })
  .strict()
export type CreateLedgerEntrySchema = z.infer<typeof CreateLedgerEntrySchema>

export const GetLedgerSchema = z.object({
  from: D.optional(),
  to: D.optional(),
  category: z.enum(LEDGER_CATEGORIES).optional(),
  direction: z.enum(["in", "out"]).optional(),
  partner_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type GetLedgerSchema = z.infer<typeof GetLedgerSchema>

/* ------------------------------------- partners ------------------------------------ */

export const CreatePartnerSchema = z
  .object({
    name: z.string().min(1).max(200),
    email: z.string().email().nullish(),
    phone: z.string().max(50).nullish(),
    joined_at: D.nullish(),
    notes: z.string().max(1000).nullish(),
  })
  .strict()
export type CreatePartnerSchema = z.infer<typeof CreatePartnerSchema>

export const UpdatePartnerSchema = CreatePartnerSchema.partial()
  .extend({ is_active: z.boolean().optional() })
  .strict()
export type UpdatePartnerSchema = z.infer<typeof UpdatePartnerSchema>

/* ----------------------------------- fixed assets ---------------------------------- */

export const CreateFixedAssetSchema = z
  .object({
    name: z.string().min(1).max(200),
    category: z.enum(FIXED_ASSET_CATEGORIES).default("equipment"),
    purchase_date: D,
    // The TOTAL paid for the line, not a unit price.
    cost: Money,
    currency_code: z.string().min(2).max(3).default("bdt"),
    quantity: z.coerce.number().int().min(1).default(1),
    supplier: z.string().max(200).nullish(),
    notes: z.string().max(1000).nullish(),
  })
  .strict()
export type CreateFixedAssetSchema = z.infer<typeof CreateFixedAssetSchema>

export const UpdateFixedAssetSchema = CreateFixedAssetSchema.partial()
  .extend({
    is_disposed: z.boolean().optional(),
    disposed_at: D.nullish(),
  })
  .strict()
export type UpdateFixedAssetSchema = z.infer<typeof UpdateFixedAssetSchema>

export const GetFixedAssetsSchema = z.object({
  include_disposed: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})
export type GetFixedAssetsSchema = z.infer<typeof GetFixedAssetsSchema>

/* --------------------------------- marketing spend --------------------------------- */

export const CreateMarketingSpendSchema = z
  .object({
    spend_date: D,
    platform: z.enum(MARKETING_PLATFORMS),
    campaign: z.string().max(200).nullish(),
    amount: Money,
    currency_code: z.string().min(2).max(3).default("bdt"),
    notes: z.string().max(1000).nullish(),
  })
  .strict()
export type CreateMarketingSpendSchema = z.infer<typeof CreateMarketingSpendSchema>

export const UpdateMarketingSpendSchema = CreateMarketingSpendSchema.partial().strict()
export type UpdateMarketingSpendSchema = z.infer<typeof UpdateMarketingSpendSchema>

export const GetMarketingListSchema = z.object({
  from: D.optional(),
  to: D.optional(),
  platform: z.enum(MARKETING_PLATFORMS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type GetMarketingListSchema = z.infer<typeof GetMarketingListSchema>

export const GetMarketingSummarySchema = z.object({
  from: D.optional(),
  to: D.optional(),
  group_by: z.enum(["month", "platform", "campaign"]).default("month"),
})
export type GetMarketingSummarySchema = z.infer<typeof GetMarketingSummarySchema>

/* ------------------------------------ dashboard ------------------------------------ */

/**
 * `from`/`to` slice the PROFIT figures only. Balance-sheet figures (cash, inventory, net
 * worth) are always all-time — a net worth "for June" is a meaningless quantity.
 */
export const GetDashboardSchema = z.object({
  from: D.optional(),
  to: D.optional(),
})
export type GetDashboardSchema = z.infer<typeof GetDashboardSchema>
