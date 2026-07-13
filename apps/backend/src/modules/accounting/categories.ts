/**
 * Cash categories, classified. This file is the spec — the backend math, the validators
 * and the admin UI all derive from it. Read this before changing anything in accounting.
 *
 * ---------------------------------------------------------------------------------
 * RULE 1: The ledger records only what Medusa cannot see.
 * ---------------------------------------------------------------------------------
 *
 * Medusa already knows revenue, COGS, the cash customers handed over, refunds it
 * processed, and how much stock is on the shelf. None of that is journaled here.
 * Writing a customer payment into this ledger would count the same taka twice: once
 * when Medusa recorded the order, once when someone typed it in.
 *
 * This ledger owns the money movements Medusa has no idea about: partner capital,
 * drawings, restock payments to suppliers, fixed assets, ad spend, courier fees.
 *
 * ---------------------------------------------------------------------------------
 * RULE 2: Most cash movements are NOT expenses.
 * ---------------------------------------------------------------------------------
 *
 * Restocking 50,000 of inventory is a cash -> asset swap. The money became vases; it
 * did not evaporate. It only hits profit later, as COGS, when a vase actually sells.
 * Same for fixed assets (capitalised) and partner capital (equity).
 *
 * Sum `direction = 'out'` naively and the dashboard reports a catastrophic loss every
 * single time you restock. Hence this classifier, which every aggregate query uses.
 */

export const LEDGER_CATEGORIES = [
  // Equity: partner money in and out. Never profit, never loss.
  "capital_contribution",
  "partner_drawing",

  // Assets: cash converted into something you still own. Not an expense.
  "inventory_purchase",
  "packaging_purchase",
  "fixed_asset",

  // Real P&L expenses: money that is simply gone.
  "marketing",
  "courier_fee",
  "other_expense",
  "refund",
  // What a pre-order/custom order cost to produce. Unlike a restock (an asset that becomes COGS
  // when it sells), made-to-order goods ship immediately, so their cost is an expense straight
  // away — and it is that order's cost of goods.
  "production_cost",

  // Real P&L income that Medusa knows nothing about: a courier paying you back for a parcel
  // they destroyed, scrap sales, supplier credits. Without this there is literally nowhere to
  // put money that comes in but isn't a sale and isn't partner capital.
  "other_income",
] as const

export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number]

/**
 * equity  = owner money, never profit.
 * asset   = cash became a thing you own.
 * expense = money gone — reduces profit.
 * income  = money earned outside of a sale — increases profit.
 */
export type LedgerClass = "equity" | "asset" | "expense" | "income"

export type CategoryMeta = {
  label: string
  klass: LedgerClass
  /** The ONLY direction this category may move. A capital contribution is always money in. */
  direction: "in" | "out"
  /** Rendered as helper text in the admin. This is where the rules above get taught. */
  help: string
}

export const CATEGORY_META: Record<LedgerCategory, CategoryMeta> = {
  capital_contribution: {
    label: "Capital contribution",
    klass: "equity",
    direction: "in",
    help: "A partner put money into the business. Equity — not income, and not profit.",
  },
  partner_drawing: {
    label: "Partner drawing",
    klass: "equity",
    direction: "out",
    help: "A partner took money out. Equity — not an expense, and it does not reduce profit.",
  },
  inventory_purchase: {
    label: "Inventory purchase (restock)",
    klass: "asset",
    direction: "out",
    help: "Cash became goods. NOT an expense — it becomes COGS only when the item actually sells.",
  },
  packaging_purchase: {
    label: "Packaging purchase (tops up the pool)",
    klass: "asset",
    direction: "out",
    help:
      "Cash became boxes, tape and bubble wrap. NOT an expense — it becomes a cost only as " +
      "orders draw their packaging preset out of the pool.",
  },
  fixed_asset: {
    label: "Fixed asset purchase",
    klass: "asset",
    direction: "out",
    help: "Capitalised — you still own it. NOT an expense. Add these from the Fixed Assets tab.",
  },
  marketing: {
    label: "Marketing / ads",
    klass: "expense",
    direction: "out",
    help: "A real expense: the money is gone. Add these from the Marketing tab.",
  },
  courier_fee: {
    label: "Courier fee",
    klass: "expense",
    direction: "out",
    help: "Paid to Pathao/Steadfast/RedX. A real expense — Medusa does not record what delivery costs you.",
  },
  other_expense: {
    label: "Other expense",
    klass: "expense",
    direction: "out",
    help: "Rent, utilities, salaries, packaging. A real expense.",
  },
  refund: {
    label: "Refund (outside Medusa only)",
    klass: "expense",
    direction: "out",
    help:
      "ONLY for cash you refunded outside Medusa. A return recorded in Medusa has already been " +
      "netted out of revenue and cash — journaling it here as well subtracts it twice.",
  },
  production_cost: {
    label: "Production cost (pre-order / custom)",
    klass: "expense",
    direction: "out",
    help:
      "What a made-to-order item cost to produce. Booked from the order itself, not here — it " +
      "is that order's cost of goods and reduces its profit directly.",
  },
  other_income: {
    label: "Other income",
    klass: "income",
    direction: "in",
    help:
      "Money in that isn't a sale and isn't partner capital: a courier compensating you for a " +
      "parcel they destroyed, scrap sales, a supplier credit. Real income — it lifts profit.",
  },
}

export const EQUITY_CATEGORIES = LEDGER_CATEGORIES.filter(
  (c) => CATEGORY_META[c].klass === "equity"
)

export const ASSET_CATEGORIES = LEDGER_CATEGORIES.filter(
  (c) => CATEGORY_META[c].klass === "asset"
)

/** The only categories that reduce net profit. */
export const PNL_EXPENSE_CATEGORIES = LEDGER_CATEGORIES.filter(
  (c) => CATEGORY_META[c].klass === "expense"
)

/** The only categories that increase net profit without being a sale. */
export const PNL_INCOME_CATEGORIES = LEDGER_CATEGORIES.filter(
  (c) => CATEGORY_META[c].klass === "income"
)

/** Categories that require a partner to be named. */
export const PARTNER_REQUIRED_CATEGORIES = EQUITY_CATEGORIES

/**
 * Categories that must NOT be hand-entered in the Cash Book, because a dedicated flow owns
 * them and writes the cash row itself. Typing one straight into the Cash Book would drift
 * the ledger away from what actually happened, so the create step rejects it.
 *
 *   fixed_asset        -> Fixed Assets tab
 *   marketing          -> Marketing tab
 *   inventory_purchase -> Restock tab (which also raises the stock)
 */
export const REGISTER_OWNED_CATEGORIES: LedgerCategory[] = [
  "fixed_asset",
  "marketing",
  "inventory_purchase",
  // Always tied to a specific pre-order/custom order — set on the order, never in the Cash Book.
  "production_cost",
]

/** Where each restricted category is actually created — used in the rejection message. */
export const CATEGORY_ENTRY_POINT: Partial<Record<LedgerCategory, string>> = {
  fixed_asset: "the Fixed Assets tab",
  marketing: "the Marketing tab",
  inventory_purchase: "the Restock tab",
  production_cost: "the order's production cost field",
}

export const LEDGER_SOURCE_TYPES = [
  "manual",
  "fixed_asset",
  "marketing_spend",
  // A restock: cash paired with a real stock increase. Protected from casual deletion so
  // the cash and the stock can't drift apart.
  "restock",
  // The courier fee for one order, mirrored from Order Processing. Keyed to the order, so
  // correcting the fee updates its row instead of adding a second one.
  "order",
  // The production cost of one pre-order/custom order. A SEPARATE source type from "order" so a
  // single order can carry both its courier fee and its production cost (the unique index is on
  // source_type + source_id, so they'd collide under the same type).
  "production",
] as const
export type LedgerSourceType = (typeof LEDGER_SOURCE_TYPES)[number]

export const MARKETING_PLATFORMS = [
  "facebook",
  "instagram",
  "google",
  "tiktok",
  "influencer",
  "other",
] as const
export type MarketingPlatform = (typeof MARKETING_PLATFORMS)[number]

export const MARKETING_PLATFORM_LABELS: Record<MarketingPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  google: "Google",
  tiktok: "TikTok",
  influencer: "Influencer",
  other: "Other",
}

export const FIXED_ASSET_CATEGORIES = [
  "equipment",
  "furniture",
  "electronics",
  "tools",
  "other",
] as const
export type FixedAssetCategory = (typeof FIXED_ASSET_CATEGORIES)[number]
