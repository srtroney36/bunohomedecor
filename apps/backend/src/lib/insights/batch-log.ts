import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { PRODUCT_COST_MODULE } from "../../modules/productCost"
import { computeFifoCosting } from "./fifo-costing"

/**
 * Batches for a UI, enriched with their DERIVED FIFO state (how far each has sold down) and a
 * human label. Shared by the Accounting "all stock" table and the per-product stock panel, so
 * both read one implementation and can never show different remaining/sold numbers.
 */

export type EnrichedBatch = {
  id: string
  variant_id: string
  label: string
  sku: string | null
  received_date: Date
  source: string
  supplier: string | null
  note: string | null
  qty_received: number
  unit_cost: number
  freight_total: number
  landed_unit_cost: number
  /** landed_unit_cost × qty_received — the value that entered stock. */
  total_value: number
  /** What left the bank for this batch. Restock only; `found` batches moved no cash. */
  cash_paid: number
  sold: number
  remaining: number
  depleted_at: Date | null
  currency_code: string
  ledger_entry_id: string | null
}

async function variantLabels(
  query: any,
  variantIds: string[]
): Promise<Map<string, { label: string; sku: string | null }>> {
  const map = new Map<string, { label: string; sku: string | null }>()
  if (!variantIds.length) return map

  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "title", "sku", "product.title"],
    filters: { id: variantIds },
  })
  for (const v of data as any[]) {
    map.set(v.id, {
      label: v.product?.title ? `${v.product.title} — ${v.title}` : v.title || v.id,
      sku: v.sku ?? null,
    })
  }
  return map
}

export async function listEnrichedBatches(
  container: MedusaContainer,
  opts?: { variant_id?: string }
): Promise<EnrichedBatch[]> {
  const costSvc: any = container.resolve(PRODUCT_COST_MODULE)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const filter = opts?.variant_id ? { variant_id: opts.variant_id } : {}
  const batches = await costSvc.listStockBatches(filter, {
    take: 200000,
    order: { received_date: "DESC" },
  })

  // Derived remaining/sold/depleted comes from the whole-store FIFO replay (a batch's state
  // depends on every sale of its variant, not just this batch).
  const fifo = await computeFifoCosting(container)
  const stateById = new Map(fifo.per_batch.map((b) => [b.batch_id, b]))

  const variantIds = [...new Set(batches.map((b: any) => b.variant_id))] as string[]
  const labels = await variantLabels(query, variantIds)

  return batches.map((b: any): EnrichedBatch => {
    const st = stateById.get(b.id)
    const qty = Number(b.qty_received)
    const landed = Number(b.landed_unit_cost)
    const totalValue = landed * qty
    const lbl = labels.get(b.variant_id)
    return {
      id: b.id,
      variant_id: b.variant_id,
      label: lbl?.label ?? b.variant_id,
      sku: lbl?.sku ?? null,
      received_date: b.received_date,
      source: b.source,
      supplier: b.supplier ?? null,
      note: b.note ?? null,
      qty_received: qty,
      unit_cost: Number(b.unit_cost),
      freight_total: Number(b.freight_total),
      landed_unit_cost: landed,
      total_value: totalValue,
      cash_paid: b.source === "restock" ? totalValue : 0,
      sold: st?.sold ?? 0,
      remaining: st?.remaining ?? qty,
      depleted_at: st?.depleted_at ?? null,
      currency_code: b.currency_code ?? "bdt",
      ledger_entry_id: b.ledger_entry_id ?? null,
    }
  })
}
