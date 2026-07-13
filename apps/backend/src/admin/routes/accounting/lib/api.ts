import { rbacFetch } from "../../../lib/permissions"

/**
 * All accounting calls go through rbacFetch, which surfaces the server's error message
 * rather than a bare status code. That matters here: the workflows throw meaningful text
 * ("this partner has capital and cannot be deleted", "fixed assets are added from their
 * own tab"), and the user needs to read it.
 */

export type LedgerClass = "equity" | "asset" | "expense"

export type LedgerEntry = {
  id: string
  entry_date: string
  direction: "in" | "out"
  category: string
  category_label: string
  klass: LedgerClass
  amount: number
  description: string | null
  reference: string | null
  partner_id: string | null
  source_type: "manual" | "fixed_asset" | "marketing_spend" | "restock"
  /** Server-decided: a row owned by a register (or by a stock batch) can't be touched here. */
  can_edit: boolean
  can_delete: boolean
  /** Why it's locked, and where to change it instead. Null when free to edit. */
  locked_reason: string | null
}

export type LedgerResponse = {
  ledger_entries: LedgerEntry[]
  count: number
  limit: number
  offset: number
  summary: {
    cash_in: number
    cash_out: number
    cash_delta: number
  }
}

export type Partner = {
  id: string
  name: string
  email: string | null
  phone: string | null
  is_active: boolean
  invested: number
  drawn: number
  net: number
}

export type PartnersResponse = {
  partners: Partner[]
  count: number
  totals: {
    capital_contributed: number
    partner_drawings: number
    total_invested: number
  }
}

export type FixedAsset = {
  id: string
  name: string
  category: string
  purchase_date: string
  cost: number
  quantity: number
  supplier: string | null
  notes: string | null
  is_disposed: boolean
}

export type FixedAssetsResponse = {
  fixed_assets: FixedAsset[]
  count: number
  total_value: number
}

export type MarketingSpend = {
  id: string
  spend_date: string
  platform: string
  campaign: string | null
  amount: number
  notes: string | null
}

export type MarketingResponse = {
  marketing_spends: MarketingSpend[]
  count: number
  total: number
}

export type MarketingSummary = {
  group_by: string
  groups: { key: string; label: string; amount: number; count: number }[]
  total: number
  count: number
}

export type Batch = {
  id: string
  variant_id: string
  label: string
  sku: string | null
  received_date: string
  source: "restock" | "found" | "opening"
  supplier: string | null
  note: string | null
  qty_received: number
  unit_cost: number
  freight_total: number
  landed_unit_cost: number
  total_value: number
  cash_paid: number
  sold: number
  remaining: number
  depleted_at: string | null
  currency_code: string
  ledger_entry_id: string | null
}

export type BatchesResponse = { batches: Batch[] }

export type Dashboard = {
  currency_code: string
  variants_missing_cost: number
  units_missing_cost: number
  /** Part-shipped orders: revenue counted in full, COGS only on what shipped → margin is high. */
  partially_fulfilled_orders: number
  headline: { net_worth: number; working_capital: number; total_invested: number }
  assets: {
    inventory_at_cost: number
    units_in_stock: number
    fixed_assets_value: number
    cash_on_hand: number
    cod_receivables: number
    packaging_pool: number
  }
  packaging: { bought: number; used: number; pool: number }
  equity: {
    capital_contributed: number
    partner_drawings: number
    total_invested: number
    retained_earnings: number
  }
  cash_flow: {
    cash_in_from_partners: number
    cash_in_from_sales: number
    spent_on_inventory: number
    spent_on_fixed_assets: number
    spent_on_expenses: number
    cash_delta_ledger: number
  }
  profit: {
    range: { from: string; to: string }
    revenue: number
    cogs: number
    gross_profit: number
    marketing: number
    courier_fee: number
    other_expense: number
    refund: number
    packaging_used: number
    inventory_adjustments: number
    operating_expenses: number
    net_profit: number
    net_margin_pct: number
  }
}

export const api = {
  dashboard: (from?: string, to?: string) => {
    const q = new URLSearchParams()
    if (from) q.set("from", from)
    if (to) q.set("to", to)
    const qs = q.toString()
    return rbacFetch<Dashboard>(`/accounting/dashboard${qs ? `?${qs}` : ""}`)
  },

  ledger: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") q.set(k, String(v))
    }
    const qs = q.toString()
    return rbacFetch<LedgerResponse>(`/accounting/ledger${qs ? `?${qs}` : ""}`)
  },
  createLedger: (body: unknown) =>
    rbacFetch(`/accounting/ledger`, { method: "POST", body: JSON.stringify(body) }),
  updateLedger: (id: string, body: unknown) =>
    rbacFetch(`/accounting/ledger/${id}`, { method: "POST", body: JSON.stringify(body) }),
  deleteLedger: (id: string) =>
    rbacFetch(`/accounting/ledger/${id}`, { method: "DELETE" }),

  partners: () => rbacFetch<PartnersResponse>(`/accounting/partners`),
  createPartner: (body: unknown) =>
    rbacFetch(`/accounting/partners`, { method: "POST", body: JSON.stringify(body) }),
  updatePartner: (id: string, body: unknown) =>
    rbacFetch(`/accounting/partners/${id}`, { method: "POST", body: JSON.stringify(body) }),
  deletePartner: (id: string) =>
    rbacFetch(`/accounting/partners/${id}`, { method: "DELETE" }),

  fixedAssets: (includeDisposed = false) =>
    rbacFetch<FixedAssetsResponse>(
      `/accounting/fixed-assets?include_disposed=${includeDisposed}`
    ),
  createFixedAsset: (body: unknown) =>
    rbacFetch(`/accounting/fixed-assets`, { method: "POST", body: JSON.stringify(body) }),
  updateFixedAsset: (id: string, body: unknown) =>
    rbacFetch(`/accounting/fixed-assets/${id}`, { method: "POST", body: JSON.stringify(body) }),
  deleteFixedAsset: (id: string) =>
    rbacFetch(`/accounting/fixed-assets/${id}`, { method: "DELETE" }),

  variants: (q: string) =>
    rbacFetch<{ variants: { variant_id: string; label: string; sku: string | null; cost: number }[] }>(
      `/accounting/variants${q ? `?q=${encodeURIComponent(q)}` : ""}`
    ),
  restock: (body: unknown) =>
    rbacFetch(`/accounting/restock`, { method: "POST", body: JSON.stringify(body) }),

  batches: (variantId?: string) =>
    rbacFetch<BatchesResponse>(
      `/accounting/batches${variantId ? `?variant_id=${encodeURIComponent(variantId)}` : ""}`
    ),
  adjustStock: (body: unknown) =>
    rbacFetch(`/accounting/adjust`, { method: "POST", body: JSON.stringify(body) }),
  editBatch: (id: string, body: unknown) =>
    rbacFetch(`/accounting/batches/${id}`, { method: "POST", body: JSON.stringify(body) }),
  deleteBatch: (id: string) =>
    rbacFetch(`/accounting/batches/${id}`, { method: "DELETE" }),

  marketing: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") q.set(k, String(v))
    }
    const qs = q.toString()
    return rbacFetch<MarketingResponse>(`/accounting/marketing${qs ? `?${qs}` : ""}`)
  },
  marketingSummary: (groupBy: string, from?: string, to?: string) => {
    const q = new URLSearchParams({ group_by: groupBy })
    if (from) q.set("from", from)
    if (to) q.set("to", to)
    return rbacFetch<MarketingSummary>(`/accounting/marketing/summary?${q.toString()}`)
  },
  createMarketing: (body: unknown) =>
    rbacFetch(`/accounting/marketing`, { method: "POST", body: JSON.stringify(body) }),
  updateMarketing: (id: string, body: unknown) =>
    rbacFetch(`/accounting/marketing/${id}`, { method: "POST", body: JSON.stringify(body) }),
  deleteMarketing: (id: string) =>
    rbacFetch(`/accounting/marketing/${id}`, { method: "DELETE" }),
}
