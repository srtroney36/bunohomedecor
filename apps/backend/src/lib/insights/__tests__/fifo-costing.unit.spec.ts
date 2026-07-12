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
