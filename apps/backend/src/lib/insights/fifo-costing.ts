import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { PRODUCT_COST_MODULE } from "../../modules/productCost"

/**
 * THE FIFO COSTING ENGINE. The single place that turns cost layers + real stock movements
 * into money: COGS for a period, the value of stock still on the shelf, and how far each
 * batch has been sold down.
 *
 * It replaces the old flat-cost math in BOTH sales-metrics (COGS) and inventory-value
 * (inventory-at-cost), so those two figures come out of ONE replay and can never disagree —
 * the same invariant the flat cost used to give us, now batch-aware.
 *
 * Sources of truth, all replayed from scratch (no stored running total, same as the ledger):
 *   - stock_batch      goods IN, each with its own landed unit cost + date (FIFO layers)
 *   - stock_movement   non-sale reductions OUT (shrinkage / damage / correction)
 *   - Medusa orders    sales OUT, net of returns — never duplicated into our tables
 *
 * Every consumed unit is allocated to the OLDEST open batch. A sale's allocation is COGS; a
 * shrinkage's allocation is a write-off; whatever is never consumed is the batch's remaining
 * value. Because inventory value = Σ(received) − Σ(consumed) at the same landed costs the
 * COGS came from, assets and P&L reconcile by construction.
 *
 * The pure replay (`replayFifo`) is split from the I/O so it can be reasoned about and
 * unit-tested on its own, the way ledger-math.ts is.
 */

export type CostingRange = { from: Date; to: Date }

/**
 * Orders whose units have actually left the shelf. Mirrors the revenue filter in
 * sales-metrics (which imports these), so "what we booked revenue on" and "what drew down
 * stock" are the exact same set of orders.
 */
export const EXCLUDED_FULFILLMENT = new Set(["not_fulfilled", "canceled"])
export function countsAsShipped(o: any): boolean {
  return o.status !== "canceled" && !EXCLUDED_FULFILLMENT.has(o.fulfillment_status)
}

export type BatchState = {
  batch_id: string
  variant_id: string
  received_date: Date
  source: string
  landed_unit_cost: number
  received: number
  sold: number
  remaining: number
  /** When this batch's last unit was consumed. Null while it still has stock. */
  depleted_at: Date | null
}

export type FifoCosting = {
  /** COGS of sales whose order date falls in `range` (all-time if no range given). */
  cogs_in_range: number
  /** Value of stock still on the shelf: Σ(remaining × landed cost). All-time state. */
  inventory_at_cost: number
  units_in_stock: number
  per_batch: BatchState[]
  /** Write-off value (shrinkage) at FIFO cost, dated in `range`. Feeds the P&L. */
  shrinkage_value_in_range: number
  /** Value of `found` stock added in `range`. Nets against shrinkage in the P&L. */
  found_value_in_range: number
  /** Units sold/removed with no batch to draw from → inventory value is understated. */
  uncosted_units: number
  variants_uncosted: number
}

/** Inputs to the pure replay. */
export type FifoBatchInput = {
  id: string
  variant_id: string
  received_date: Date | string
  source: string
  landed_unit_cost: number | string
  qty_received: number | string
}
export type FifoConsumption = {
  variant_id: string
  date: Date | string
  qty: number | string
  kind: "sale" | "shrink"
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

const inRange = (t: number, r?: CostingRange): boolean =>
  !r || (t >= r.from.getTime() && t <= r.to.getTime())

// One entry on a variant's timeline. `seq` breaks ties so receipts land before consumptions
// on the same instant (stock received today is available to sell today).
type Ev =
  | { t: number; seq: 0; kind: "receipt"; state: BatchState }
  | { t: number; seq: 1; kind: "sale" | "shrink"; qty: number; dateInRange: boolean }

/**
 * Pure FIFO replay. Given the cost layers and every consumption (sales + write-offs), returns
 * period COGS, on-shelf value, per-batch depletion and the derived P&L figures. No I/O.
 */
export function replayFifo(
  batches: FifoBatchInput[],
  consumptions: FifoConsumption[],
  range?: CostingRange
): FifoCosting {
  const byVariant = new Map<string, Ev[]>()
  const perBatch: BatchState[] = []
  let foundValueInRange = 0

  const evFor = (variantId: string): Ev[] => {
    let arr = byVariant.get(variantId)
    if (!arr) byVariant.set(variantId, (arr = []))
    return arr
  }

  for (const b of batches) {
    const received = new Date(b.received_date)
    const state: BatchState = {
      batch_id: b.id,
      variant_id: b.variant_id,
      received_date: received,
      source: b.source,
      landed_unit_cost: num(b.landed_unit_cost),
      received: num(b.qty_received),
      sold: 0,
      remaining: 0,
      depleted_at: null,
    }
    perBatch.push(state)
    evFor(b.variant_id).push({ t: received.getTime(), seq: 0, kind: "receipt", state })

    if (b.source === "found" && inRange(received.getTime(), range)) {
      foundValueInRange += state.received * state.landed_unit_cost
    }
  }

  for (const c of consumptions) {
    const t = new Date(c.date).getTime()
    evFor(c.variant_id).push({
      t,
      seq: 1,
      kind: c.kind,
      qty: num(c.qty),
      dateInRange: inRange(t, range),
    })
  }

  let cogsInRange = 0
  let shrinkageValueInRange = 0
  let uncostedUnits = 0
  const uncostedVariants = new Set<string>()

  for (const [variantId, events] of byVariant) {
    events.sort((a, b) => a.t - b.t || a.seq - b.seq)

    const queue: BatchState[] = []
    let head = 0 // first batch that might still have stock

    for (const ev of events) {
      if (ev.kind === "receipt") {
        ev.state.remaining = ev.state.received
        queue.push(ev.state)
        continue
      }

      let need = ev.qty
      while (need > 0 && head < queue.length) {
        const layer = queue[head]
        if (layer.remaining <= 0) {
          head++
          continue
        }
        const take = Math.min(need, layer.remaining)
        layer.remaining -= take
        layer.sold += take
        need -= take

        const value = take * layer.landed_unit_cost
        if (ev.kind === "sale") {
          if (ev.dateInRange) cogsInRange += value
        } else if (ev.dateInRange) {
          shrinkageValueInRange += value
        }

        if (layer.remaining <= 0) {
          layer.depleted_at = new Date(ev.t)
          head++
        }
      }

      if (need > 0) {
        uncostedUnits += need
        uncostedVariants.add(variantId)
      }
    }
  }

  let inventoryAtCost = 0
  let unitsInStock = 0
  for (const b of perBatch) {
    inventoryAtCost += b.remaining * b.landed_unit_cost
    unitsInStock += b.remaining
  }

  return {
    cogs_in_range: cogsInRange,
    inventory_at_cost: inventoryAtCost,
    units_in_stock: unitsInStock,
    per_batch: perBatch,
    shrinkage_value_in_range: shrinkageValueInRange,
    found_value_in_range: foundValueInRange,
    uncosted_units: uncostedUnits,
    variants_uncosted: uncostedVariants.size,
  }
}

/**
 * Loads the batches, write-offs and orders, then delegates to `replayFifo`. Orders are read
 * in full (FIFO depends on the whole history, not just the reporting window); `range` only
 * decides which sale/shrinkage COGS gets tallied.
 */
export async function computeFifoCosting(
  container: MedusaContainer,
  range?: CostingRange
): Promise<FifoCosting> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const costSvc: any = container.resolve(PRODUCT_COST_MODULE)

  const [batches, movements] = await Promise.all([
    costSvc.listStockBatches({}, { take: 200000 }),
    costSvc.listStockMovements({}, { take: 200000 }),
  ])

  const consumptions: FifoConsumption[] = (movements ?? []).map((m: any) => ({
    variant_id: m.variant_id,
    date: m.date,
    qty: m.quantity,
    kind: "shrink" as const,
  }))

  // Sales OUT, net of returns, from Medusa's orders.
  let offset = 0
  for (;;) {
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id", "status", "fulfillment_status", "created_at",
        "items.id", "items.quantity", "items.variant_id",
        "returns.items.item_id", "returns.items.quantity",
      ],
      pagination: { skip: offset, take: 200 },
    })

    for (const o of data as any[]) {
      if (!countsAsShipped(o)) continue

      const returnedByItem = new Map<string, number>()
      for (const ret of o.returns ?? []) {
        for (const ri of ret.items ?? []) {
          returnedByItem.set(ri.item_id, (returnedByItem.get(ri.item_id) ?? 0) + num(ri.quantity))
        }
      }

      for (const it of o.items ?? []) {
        const vid = it.variant_id
        if (!vid) continue
        const net = num(it.quantity) - (returnedByItem.get(it.id) ?? 0)
        if (net <= 0) continue
        consumptions.push({ variant_id: vid, date: o.created_at, qty: net, kind: "sale" })
      }
    }

    if (data.length < 200) break
    offset += data.length
  }

  return replayFifo(batches ?? [], consumptions, range)
}
