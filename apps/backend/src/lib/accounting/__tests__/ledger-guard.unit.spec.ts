import { ledgerRowGuard } from "../ledger-guard"

/**
 * The rule that unsticks the stale row: a restock cash entry with no batch behind it is an
 * orphan, and refusing to delete it just leaves a wrong number in the books forever.
 */
describe("ledgerRowGuard", () => {
  it("lets you edit and delete a hand-entered row", () => {
    const g = ledgerRowGuard("manual", false)
    expect(g.can_edit).toBe(true)
    expect(g.can_delete).toBe(true)
    expect(g.reason).toBeNull()
  })

  it("locks a restock that still has a stock batch behind it", () => {
    const g = ledgerRowGuard("restock", true)
    expect(g.can_edit).toBe(false)
    expect(g.can_delete).toBe(false)
    expect(g.reason).toMatch(/Restock tab/i)
  })

  it("FREES an orphaned restock row — cash with no batch (pre-batch leftover)", () => {
    const g = ledgerRowGuard("restock", false)
    expect(g.can_edit).toBe(true)
    expect(g.can_delete).toBe(true)
    expect(g.reason).toBeNull()
  })

  it("locks a fixed-asset mirror and points at its tab", () => {
    const g = ledgerRowGuard("fixed_asset", false)
    expect(g.can_delete).toBe(false)
    expect(g.reason).toMatch(/Fixed Assets tab/i)
  })

  it("locks a marketing mirror and points at its tab", () => {
    const g = ledgerRowGuard("marketing_spend", false)
    expect(g.can_delete).toBe(false)
    expect(g.reason).toMatch(/Marketing tab/i)
  })

  it("fails closed on an unknown source type", () => {
    const g = ledgerRowGuard("something_new", false)
    expect(g.can_edit).toBe(false)
    expect(g.can_delete).toBe(false)
    expect(g.reason).toBeTruthy()
  })
})
