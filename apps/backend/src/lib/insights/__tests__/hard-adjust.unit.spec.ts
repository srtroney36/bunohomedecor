import { planHardAdjust } from "../hard-adjust"

/**
 * The delta is measured against BATCH-BACKED stock, not the shelf — that's what lets a hard
 * adjust heal drift instead of deepening it.
 */
describe("planHardAdjust", () => {
  it("adds a costed layer when the count is ABOVE what batches back", () => {
    const p = planHardAdjust(20, 12, 80)
    expect(p.target).toBe(20)
    expect(p.delta).toBe(8) // 8 units become a new `found` layer @ 80
    expect(p.error).toBeUndefined()
  })

  it("REFUSES an increase with no cost — an uncosted layer would understate COGS", () => {
    expect(planHardAdjust(20, 12, undefined).error).toMatch(/needs a cost per unit/i)
    expect(planHardAdjust(20, 12, 0).error).toMatch(/needs a cost per unit/i)
  })

  it("writes stock off when the count is BELOW what batches back — no cost needed", () => {
    const p = planHardAdjust(8, 12)
    expect(p.delta).toBe(-4) // 4 units written off at FIFO cost
    expect(p.error).toBeUndefined()
  })

  it("is a pure drift-heal when the books already match the target", () => {
    const p = planHardAdjust(12, 12)
    expect(p.delta).toBe(0)
    expect(p.error).toBeUndefined() // no cost required: nothing is being added
  })

  it("measures the delta against batch-backed stock, so drift is healed not compounded", () => {
    // Shelf wrongly says 30 (someone hand-edited before the guard existed); books back 12.
    // The true count is 12 → nothing should be written off, only the shelf gets corrected.
    const p = planHardAdjust(12, 12, undefined)
    expect(p.delta).toBe(0)
    expect(p.error).toBeUndefined()
  })

  it("clamps a negative target to zero", () => {
    expect(planHardAdjust(-5, 10).target).toBe(0)
    expect(planHardAdjust(-5, 10).delta).toBe(-10)
  })
})
