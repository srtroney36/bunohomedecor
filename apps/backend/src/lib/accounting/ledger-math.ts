import {
  CATEGORY_META,
  LEDGER_CATEGORIES,
  PNL_EXPENSE_CATEGORIES,
  type LedgerCategory,
} from "../../modules/accounting/categories"

/**
 * Pure aggregation over ledger rows. No I/O, no container — so it can be reasoned about
 * and unit-tested on its own.
 *
 * The whole point of this file is the classifier. Sum `direction = 'out'` without it and a
 * 50,000 restock reads as a 50,000 loss, which is the single most destructive way these
 * books could be wrong: it looks plausible, and it is catastrophically not.
 */

export type LedgerRow = {
  entry_date: Date | string
  direction: "in" | "out"
  category: LedgerCategory
  amount: number | string
  partner_id?: string | null
}

/** Postgres `numeric` can arrive as a string; '100' + '50' would be '10050'. Always coerce. */
const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

const emptyByCategory = (): Record<LedgerCategory, number> =>
  Object.fromEntries(LEDGER_CATEGORIES.map((c) => [c, 0])) as Record<LedgerCategory, number>

export type LedgerSummary = {
  cash_in: number
  cash_out: number
  /** in − out, across every category. The ledger's contribution to cash on hand. */
  cash_delta: number
  /** Gross magnitude per category (unsigned). */
  by_category: Record<LedgerCategory, number>

  capital_contributed: number
  partner_drawings: number
  /** What the partners have net put in and left in. */
  total_invested: number

  inventory_purchases: number
  packaging_purchases: number
  fixed_asset_purchases: number
}

export function summariseLedger(rows: LedgerRow[]): LedgerSummary {
  const byCategory = emptyByCategory()
  let cashIn = 0
  let cashOut = 0

  for (const r of rows) {
    const amount = num(r.amount)
    byCategory[r.category] = (byCategory[r.category] ?? 0) + amount
    if (r.direction === "in") cashIn += amount
    else cashOut += amount
  }

  const capital = byCategory.capital_contribution
  const drawings = byCategory.partner_drawing

  return {
    cash_in: cashIn,
    cash_out: cashOut,
    cash_delta: cashIn - cashOut,
    by_category: byCategory,
    capital_contributed: capital,
    partner_drawings: drawings,
    total_invested: capital - drawings,
    inventory_purchases: byCategory.inventory_purchase,
    packaging_purchases: byCategory.packaging_purchase,
    fixed_asset_purchases: byCategory.fixed_asset,
  }
}

/** Money in that isn't a sale (courier compensation, scrap). Lifts net profit. */
export function pnlIncome(rows: LedgerRow[]): number {
  let total = 0
  for (const r of rows) {
    if (CATEGORY_META[r.category]?.klass !== "income") continue
    total += num(r.amount)
  }
  return total
}

export type PnlExpenses = Record<(typeof PNL_EXPENSE_CATEGORIES)[number], number> & {
  total: number
}

/**
 * The ONLY money that reduces net profit.
 *
 * Restocks and fixed assets are deliberately absent: that cash bought something the
 * business still owns. It reaches the P&L later as COGS, when the goods actually sell.
 */
export function pnlExpenses(rows: LedgerRow[]): PnlExpenses {
  const out = Object.fromEntries(PNL_EXPENSE_CATEGORIES.map((c) => [c, 0])) as PnlExpenses
  let total = 0

  for (const r of rows) {
    if (CATEGORY_META[r.category]?.klass !== "expense") continue
    const amount = num(r.amount)
    out[r.category] += amount
    total += amount
  }

  out.total = total
  return out
}

/** Per-partner capital position. Derived; never stored on the partner row. */
export type PartnerPosition = {
  partner_id: string
  invested: number
  drawn: number
  net: number
}

export function summarisePartners(rows: LedgerRow[]): Map<string, PartnerPosition> {
  const byPartner = new Map<string, PartnerPosition>()

  for (const r of rows) {
    if (!r.partner_id) continue
    if (r.category !== "capital_contribution" && r.category !== "partner_drawing") continue

    const pos =
      byPartner.get(r.partner_id) ??
      { partner_id: r.partner_id, invested: 0, drawn: 0, net: 0 }

    if (r.category === "capital_contribution") pos.invested += num(r.amount)
    else pos.drawn += num(r.amount)

    pos.net = pos.invested - pos.drawn
    byPartner.set(r.partner_id, pos)
  }

  return byPartner
}
