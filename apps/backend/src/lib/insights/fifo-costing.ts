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
 * Orders that count toward REVENUE. Kept only for sales-metrics, which imports it.
 *
 * Deliberately NOT used for stock consumption any more — see below.
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
  /**
   * Orders that are part-shipped. Revenue counts them in full but COGS only counts what left,
   * so their margin reads high until the rest ships. Surfaced, never silent.
   */
  partially_fulfilled_orders: number
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
  /**
   * When the units physically left the shelf. Drives FIFO ORDERING — which batches were
   * available at that moment. For a sale this is the fulfilment date, so a batch received
   * before shipping is always available to it (a backorder can't come out "uncosted").
   */
  date: Date | string
  /**
   * Which period the cost is REPORTED in. Defaults to `date`. For a sale this is the order
   * date, so COGS lands in the same period as the revenue it belongs to.
   */
  report_date?: Date | string
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
    // Two different dates on purpose: `t` decides WHICH batch is drawn (physical availability),
    // `report_date` decides WHICH PERIOD the cost is reported in (matching the revenue).
    const t = new Date(c.date).getTime()
    const reportT = new Date(c.report_date ?? c.date).getTime()
    evFor(c.variant_id).push({
      t,
      seq: 1,
      kind: c.kind,
      qty: num(c.qty),
      dateInRange: inRange(reportT, range),
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
    // Set by computeFifoCosting, which is the only caller that sees orders.
    partially_fulfilled_orders: 0,
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

  /**
   * Sales OUT — driven by the numbers Medusa ACTUALLY moves stock by.
   *
   * `stocked_quantity` is adjusted in exactly three core workflows: create-fulfillment,
   * cancel-order-fulfillment, and confirm-receive-return-request. All three are reflected in
   * the order item's own counters:
   *
   *     units off the shelf = detail.fulfilled_quantity − detail.return_received_quantity
   *
   * Reading those instead of the ORDERED quantity is what makes drift impossible:
   *   - partially fulfilled  → we consume the 3 shipped, not the 5 ordered
   *   - return requested     → nothing credited back until it is actually RECEIVED
   *   - fulfilment cancelled → Medusa reverts fulfilled_quantity, so we un-consume too
   *   - claims / exchanges   → their items are order items, so they're counted for free
   *
   * No order-status filter: these counters ARE the physical truth, whatever the status says.
   */
  let partiallyFulfilledOrders = 0
  let offset = 0
  for (;;) {
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id", "created_at",
        "items.id", "items.variant_id",
        "items.detail.quantity",
        "items.detail.fulfilled_quantity",
        "items.detail.return_received_quantity",
        "fulfillments.created_at", "fulfillments.canceled_at",
      ],
      pagination: { skip: offset, take: 200 },
    })

    for (const o of data as any[]) {
      // When the goods left: the first fulfilment that wasn't cancelled. Falls back to the
      // order date (nothing shipped yet, so nothing is consumed anyway).
      const shipDates = (o.fulfillments ?? [])
        .filter((f: any) => !f.canceled_at)
        .map((f: any) => new Date(f.created_at).getTime())
        .filter((t: number) => Number.isFinite(t))
      const shippedAt = shipDates.length ? new Date(Math.min(...shipDates)) : new Date(o.created_at)

      let anyUnshipped = false
      let anyShipped = false

      for (const it of o.items ?? []) {
        const vid = it.variant_id
        if (!vid) continue

        const ordered = num(it.detail?.quantity)
        const fulfilled = num(it.detail?.fulfilled_quantity)
        const returned = num(it.detail?.return_received_quantity)
        const consumed = fulfilled - returned

        if (fulfilled > 0) anyShipped = true
        if (fulfilled < ordered) anyUnshipped = true

        if (consumed <= 0) continue
        consumptions.push({
          variant_id: vid,
          date: shippedAt, // FIFO ordering: what was on the shelf when it left
          report_date: o.created_at, // period: matches where the revenue is booked
          qty: consumed,
          kind: "sale",
        })
      }

      // Revenue counts a part-shipped order in full, so its margin is provisional. Counted here
      // (we already have the data) so the dashboard can say so instead of quietly misleading.
      if (anyShipped && anyUnshipped) partiallyFulfilledOrders++
    }

    if (data.length < 200) break
    offset += data.length
  }

  const result = replayFifo(batches ?? [], consumptions, range)
  result.partially_fulfilled_orders = partiallyFulfilledOrders
  return result
}
