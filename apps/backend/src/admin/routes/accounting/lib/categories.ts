/**
 * Client-side mirror of modules/accounting/categories.ts.
 *
 * The admin bundle is built separately and (by this repo's convention — see
 * lib/permissions.ts) does not import backend module code. The backend remains the source
 * of truth and validates every write; this copy only drives the Cash Book labels, badges
 * and helper text. Keep the two in sync when categories change.
 */

export type LedgerClass = "equity" | "asset" | "expense"

export type CategoryMeta = {
  label: string
  klass: LedgerClass
  direction: "in" | "out"
  help: string
}

// Categories a human hand-enters in the Cash Book. Only partner equity remains here —
// everything else has a dedicated tab that writes the cash row:
//   inventory_purchase -> Restock, packaging_purchase -> Packaging,
//   fixed_asset -> Fixed Assets, marketing -> Marketing,
//   other_expense / courier_fee / refund -> Operational Expenses.
export const MANUAL_CATEGORIES = ["capital_contribution", "partner_drawing"] as const

// The manual P&L expenses, recorded from the Operational Expenses tab.
// (courier_fee is manual for now; a delivery-partner auto-pull is a planned follow-up.)
export const OPERATIONAL_CATEGORIES = ["other_expense", "courier_fee", "refund"] as const

export const CATEGORY_META: Record<string, CategoryMeta> = {
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
      "Cash became boxes and wrap. NOT an expense — it becomes a cost as orders draw their " +
      "packaging preset out of the pool.",
  },
  fixed_asset: {
    label: "Fixed asset purchase",
    klass: "asset",
    direction: "out",
    help: "Capitalised — you still own it. Added from the Fixed Assets tab.",
  },
  marketing: {
    label: "Marketing / ads",
    klass: "expense",
    direction: "out",
    help: "A real expense: the money is gone. Added from the Marketing tab.",
  },
  courier_fee: {
    label: "Courier fee",
    klass: "expense",
    direction: "out",
    help: "Paid to the courier. A real expense — Medusa does not record what delivery costs you.",
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
      "ONLY for cash you refunded outside Medusa. A return recorded in Medusa is already " +
      "netted out of revenue and cash — journaling it here as well subtracts it twice.",
  },
}

export const KLASS_BADGE: Record<LedgerClass, { label: string; color: "green" | "blue" | "grey" | "red" | "orange" }> = {
  equity: { label: "Equity", color: "grey" },
  asset: { label: "Asset — not an expense", color: "blue" },
  expense: { label: "Expense", color: "red" },
}

export const PARTNER_REQUIRED = ["capital_contribution", "partner_drawing"]

export const MARKETING_PLATFORMS = [
  "facebook",
  "instagram",
  "google",
  "tiktok",
  "influencer",
  "other",
] as const

export const MARKETING_PLATFORM_LABELS: Record<string, string> = {
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
