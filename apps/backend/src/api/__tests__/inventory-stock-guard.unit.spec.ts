import { inventoryStockGuard } from "../inventory-stock-guard"

/**
 * The guard blocks hand-typed stock. These tests exist mostly to prove what it must NOT block:
 * attaching/detaching a stock location, and anything that isn't a quantity. Getting that wrong
 * would break product setup and multi-location management.
 */

const run = (path: string, body: any) => {
  const req: any = { originalUrl: path, method: "POST", body }
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  const next = jest.fn()

  inventoryStockGuard(req, res, next)

  return {
    blocked: res.status.mock.calls.length > 0,
    status: res.status.mock.calls[0]?.[0],
    passed: next.mock.calls.length > 0,
  }
}

const ITEM = "/admin/inventory-items/iitem_1"
const UPDATE = `${ITEM}/location-levels/sloc_1`
const CREATE = `${ITEM}/location-levels`
const BATCH_ITEM = `${ITEM}/location-levels/batch`
const BATCH_ALL = "/admin/inventory-items/location-levels/batch"

describe("inventoryStockGuard", () => {
  afterEach(() => {
    delete process.env.INVENTORY_GUARD
  })

  describe("blocks hand-typed quantity", () => {
    it("rejects editing an existing level's quantity (the 'In Stock' box)", () => {
      const r = run(UPDATE, { stocked_quantity: 25 })
      expect(r.blocked).toBe(true)
      expect(r.status).toBe(403)
      expect(r.passed).toBe(false)
    })

    it("rejects even a zero quantity on an update (still a hand-edit)", () => {
      expect(run(UPDATE, { stocked_quantity: 0 }).blocked).toBe(true)
    })

    it("rejects creating a level pre-loaded with stock", () => {
      expect(run(CREATE, { location_id: "sloc_1", stocked_quantity: 10 }).blocked).toBe(true)
    })

    it("rejects the product Stock grid's batch update", () => {
      const r = run(BATCH_ALL, {
        update: [{ inventory_item_id: "iitem_1", location_id: "sloc_1", stocked_quantity: 7 }],
      })
      expect(r.blocked).toBe(true)
      expect(r.status).toBe(403)
    })

    it("rejects a batch create carrying stock", () => {
      const r = run(BATCH_ITEM, {
        create: [{ location_id: "sloc_1", stocked_quantity: 5 }],
      })
      expect(r.blocked).toBe(true)
    })
  })

  describe("does NOT block legitimate location management", () => {
    it("allows attaching a location at quantity 0", () => {
      const r = run(CREATE, { location_id: "sloc_2", stocked_quantity: 0 })
      expect(r.passed).toBe(true)
      expect(r.blocked).toBe(false)
    })

    it("allows attaching a location with no quantity at all", () => {
      expect(run(CREATE, { location_id: "sloc_2" }).passed).toBe(true)
    })

    it("allows a batch that only attaches (qty 0) and detaches", () => {
      const r = run(BATCH_ITEM, {
        create: [{ location_id: "sloc_2", stocked_quantity: 0 }],
        delete: ["sloc_3"],
      })
      expect(r.passed).toBe(true)
      expect(r.blocked).toBe(false)
    })

    it("allows a batch that only detaches", () => {
      expect(run(BATCH_ALL, { delete: ["sloc_3"] }).passed).toBe(true)
    })

    it("allows updating a level field that is not the quantity", () => {
      expect(run(UPDATE, { incoming_quantity: 12 }).passed).toBe(true)
    })

    it("allows an empty body", () => {
      expect(run(UPDATE, {}).passed).toBe(true)
    })
  })

  it("honours the INVENTORY_GUARD=false kill-switch", () => {
    process.env.INVENTORY_GUARD = "false"
    const r = run(UPDATE, { stocked_quantity: 999 })
    expect(r.passed).toBe(true)
    expect(r.blocked).toBe(false)
  })
})
