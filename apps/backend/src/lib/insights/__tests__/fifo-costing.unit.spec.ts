import {
  replayFifo,
  type FifoBatchInput,
  type FifoConsumption,
} from "../fifo-costing"

/**
 * The FIFO replay is the heart of the new costing. These exercise the behaviours the plan
 * promised: oldest-first allocation across batches with different costs, depletion, range
 * filtering, shrinkage as a separate bucket, found stock, and uncosted oversell.
 */

const d = (s: string) => new Date(s)

describe("replayFifo", () => {
  it("costs a sale against the OLDEST batch first", () => {
    const batches: FifoBatchInput[] = [
      { id: "b1", variant_id: "v1", received_date: d("2026-01-01"), source: "restock", landed_unit_cost: 80, qty_received: 10 },
      { id: "b2", variant_id: "v1", received_date: d("2026-02-01"), source: "restock", landed_unit_cost: 100, qty_received: 10 },
    ]
    // Sell 12: 10 from b1 @80 + 2 from b2 @100.
    const cons: FifoConsumption[] = [
      { variant_id: "v1", date: d("2026-03-01"), qty: 12, kind: "sale" },
    ]

    const r = replayFifo(batches, cons)

    expect(r.cogs_in_range).toBe(10 * 80 + 2 * 100) // 1000
    // Remaining: b1 empty, b2 has 8 @100 = 800.
    expect(r.inventory_at_cost).toBe(800)
    expect(r.units_in_stock).toBe(8)

    const b1 = r.per_batch.find((b) => b.batch_id === "b1")!
    const b2 = r.per_batch.find((b) => b.batch_id === "b2")!
    expect(b1.sold).toBe(10)
    expect(b1.remaining).toBe(0)
    expect(b1.depleted_at).not.toBeNull()
    expect(b2.sold).toBe(2)
    expect(b2.remaining).toBe(8)
    expect(b2.depleted_at).toBeNull()
  })

  it("reconciles: received value == cogs + remaining value", () => {
    const batches: FifoBatchInput[] = [
      { id: "b1", variant_id: "v1", received_date: d("2026-01-01"), source: "restock", landed_unit_cost: 80, qty_received: 10 },
      { id: "b2", variant_id: "v1", received_date: d("2026-02-01"), source: "restock", landed_unit_cost: 100, qty_received: 10 },
    ]
    const cons: FifoConsumption[] = [
      { variant_id: "v1", date: d("2026-03-01"), qty: 7, kind: "sale" },
    ]
    const r = replayFifo(batches, cons)
    const received = 10 * 80 + 10 * 100
    expect(r.cogs_in_range + r.inventory_at_cost).toBe(received)
  })

  it("only tallies COGS for sales inside the range, but allocates over full history", () => {
    const batches: FifoBatchInput[] = [
      { id: "b1", variant_id: "v1", received_date: d("2026-01-01"), source: "restock", landed_unit_cost: 80, qty_received: 10 },
      { id: "b2", variant_id: "v1", received_date: d("2026-02-01"), source: "restock", landed_unit_cost: 100, qty_received: 10 },
    ]
    const cons: FifoConsumption[] = [
      { variant_id: "v1", date: d("2026-01-15"), qty: 10, kind: "sale" }, // drains b1 (before range)
      { variant_id: "v1", date: d("2026-02-15"), qty: 5, kind: "sale" }, // in range, must draw b2 @100
    ]
    // Range covers only February onward.
    const r = replayFifo(batches, cons, { from: d("2026-02-01"), to: d("2026-02-28") })

    // The Feb sale draws b2 because b1 was already emptied by the Jan sale — proving the
    // replay respects the full history even though only the Feb COGS is counted.
    expect(r.cogs_in_range).toBe(5 * 100)
    expect(r.units_in_stock).toBe(5) // 5 of b2 left
    expect(r.inventory_at_cost).toBe(5 * 100)
  })

  it("keeps shrinkage out of COGS but consumes stock and reports its value", () => {
    const batches: FifoBatchInput[] = [
      { id: "b1", variant_id: "v1", received_date: d("2026-01-01"), source: "restock", landed_unit_cost: 50, qty_received: 10 },
    ]
    const cons: FifoConsumption[] = [
      { variant_id: "v1", date: d("2026-01-10"), qty: 3, kind: "shrink" },
      { variant_id: "v1", date: d("2026-01-20"), qty: 2, kind: "sale" },
    ]
    const r = replayFifo(batches, cons)

    expect(r.cogs_in_range).toBe(2 * 50) // only the sale
    expect(r.shrinkage_value_in_range).toBe(3 * 50)
    expect(r.units_in_stock).toBe(5) // 10 − 3 − 2
    expect(r.inventory_at_cost).toBe(5 * 50)
  })

  it("reports found stock value and adds it to the shelf without cash/COGS", () => {
    const batches: FifoBatchInput[] = [
      { id: "f1", variant_id: "v1", received_date: d("2026-01-05"), source: "found", landed_unit_cost: 40, qty_received: 6 },
    ]
    const r = replayFifo(batches, [], { from: d("2026-01-01"), to: d("2026-01-31") })

    expect(r.found_value_in_range).toBe(6 * 40)
    expect(r.inventory_at_cost).toBe(6 * 40)
    expect(r.cogs_in_range).toBe(0)
  })

  it("flags oversell as uncosted units instead of going negative", () => {
    const batches: FifoBatchInput[] = [
      { id: "b1", variant_id: "v1", received_date: d("2026-01-01"), source: "restock", landed_unit_cost: 90, qty_received: 4 },
    ]
    const cons: FifoConsumption[] = [
      { variant_id: "v1", date: d("2026-01-10"), qty: 7, kind: "sale" },
    ]
    const r = replayFifo(batches, cons)

    expect(r.cogs_in_range).toBe(4 * 90) // only what a batch could cover
    expect(r.uncosted_units).toBe(3)
    expect(r.variants_uncosted).toBe(1)
    expect(r.inventory_at_cost).toBe(0)
    expect(r.units_in_stock).toBe(0)
  })

  /**
   * The drift bugs. Medusa moves stocked_quantity ONLY on fulfilment, cancelled fulfilment and
   * RECEIVED returns. Consumption must mirror exactly that, or the shelf and the books diverge.
   * Each case asserts the invariant: batch_remaining == what Medusa left on the shelf.
   */
  describe("stays in sync with what Medusa actually moves", () => {
    const batch = (qty: number, cost: number): FifoBatchInput => ({
      id: "b1",
      variant_id: "v1",
      received_date: d("2026-01-01"),
      source: "restock",
      landed_unit_cost: cost,
      qty_received: qty,
    })

    it("PARTIAL FULFILMENT: consumes only the units that shipped, not the units ordered", () => {
      // Ordered 5, fulfilled 3 → Medusa took 3 off the shelf, leaving 7 of 10.
      const r = replayFifo(
        [batch(10, 50)],
        [{ variant_id: "v1", date: d("2026-02-01"), qty: 3, kind: "sale" }]
      )
      expect(r.cogs_in_range).toBe(3 * 50) // not 5 × 50
      expect(r.units_in_stock).toBe(7) // matches the shelf → NO drift
    })

    it("RETURN REQUESTED but not received: nothing is credited back yet", () => {
      // Fulfilled 4, return requested but not received → stock is still off the shelf.
      const r = replayFifo(
        [batch(10, 50)],
        [{ variant_id: "v1", date: d("2026-02-01"), qty: 4, kind: "sale" }]
      )
      expect(r.units_in_stock).toBe(6) // the requested return must NOT put units back
      expect(r.cogs_in_range).toBe(4 * 50)
    })

    it("RETURN RECEIVED: the units come back and COGS drops", () => {
      // fulfilled 4 − return_received 3 = 1 consumed.
      const r = replayFifo(
        [batch(10, 50)],
        [{ variant_id: "v1", date: d("2026-02-01"), qty: 4 - 3, kind: "sale" }]
      )
      expect(r.units_in_stock).toBe(9)
      expect(r.cogs_in_range).toBe(1 * 50)
    })

    it("CANCELLED FULFILMENT: Medusa reverts fulfilled_quantity, so nothing is consumed", () => {
      // fulfilled_quantity is back to 0 → no consumption event at all.
      const r = replayFifo([batch(10, 50)], [])
      expect(r.units_in_stock).toBe(10)
      expect(r.cogs_in_range).toBe(0)
    })

    it("INVENTORY KITS: a variant that eats 50 units per sale consumes 50, not 1", () => {
      /**
       * The −49 bug. Medusa lets a variant require N inventory units per sale ("Requires 50 per
       * variant"). The shelf is counted in INVENTORY units; an order line is in VARIANT units.
       *
       * Restock 50 → shelf 50. Sell ONE variant → Medusa deducts 50 → shelf 0.
       * If we consume only the line quantity (1), the batch still claims 49 remaining while the
       * shelf says 0 — and the next sale drives it to −50. The caller must pass the already-
       * multiplied quantity, exactly as computeFifoCosting now does.
       */
      const r = replayFifo(
        [batch(50, 20)], // 50 inventory units @ ৳20
        [{ variant_id: "v1", date: d("2026-02-01"), qty: 1 * 50, kind: "sale" }]
      )
      expect(r.units_in_stock).toBe(0) // matches the shelf → NO drift
      expect(r.cogs_in_range).toBe(50 * 20) // one sale really did cost 50 units of stock
      expect(r.uncosted_units).toBe(0)
    })

    it("reports COGS in the ORDER's period while drawing the batch available at SHIPPING", () => {
      // Ordered in Jan (revenue period), shipped in Feb. A batch that arrived in Feb — after the
      // order but before the shipment — must still be drawable, or a backorder reads "uncosted".
      const batches: FifoBatchInput[] = [
        { id: "late", variant_id: "v1", received_date: d("2026-02-10"), source: "restock", landed_unit_cost: 70, qty_received: 5 },
      ]
      const r = replayFifo(
        batches,
        [
          {
            variant_id: "v1",
            date: d("2026-02-20"), // shipped: batch exists by now
            report_date: d("2026-01-15"), // ordered: where the revenue sits
            qty: 2,
            kind: "sale",
          },
        ],
        { from: d("2026-01-01"), to: d("2026-01-31") } // January
      )
      expect(r.uncosted_units).toBe(0) // NOT uncosted: the batch was there when it shipped
      expect(r.cogs_in_range).toBe(2 * 70) // and the cost lands in January, with the revenue
    })
  })

  it("isolates FIFO queues per variant", () => {
    const batches: FifoBatchInput[] = [
      { id: "a1", variant_id: "vA", received_date: d("2026-01-01"), source: "restock", landed_unit_cost: 10, qty_received: 5 },
      { id: "b1", variant_id: "vB", received_date: d("2026-01-01"), source: "restock", landed_unit_cost: 20, qty_received: 5 },
    ]
    const cons: FifoConsumption[] = [
      { variant_id: "vA", date: d("2026-02-01"), qty: 5, kind: "sale" },
    ]
    const r = replayFifo(batches, cons)

    expect(r.cogs_in_range).toBe(5 * 10) // vA only, never touches vB's cheaper/pricier layer
    expect(r.inventory_at_cost).toBe(5 * 20) // vB untouched
  })
})
