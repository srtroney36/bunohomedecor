import {
  canTransition,
  derivePaymentStatus,
  issueRestocksGoods,
  issueWritesOffGoods,
  resolveOrderStatus,
  type OrderFacts,
} from "../status"

/**
 * These two functions ARE the sync guarantee. If they're right, a status can never contradict
 * what actually happened to the money or the goods.
 */

describe("derivePaymentStatus", () => {
  const cod = { total: 2500, captured: 0, refunded: 0, is_cod: true }

  it("a COD order with nothing captured is Cash on Delivery, not Unpaid", () => {
    expect(derivePaymentStatus(cod)).toBe("cod")
  })

  it("a prepaid order with nothing captured is Unpaid", () => {
    expect(derivePaymentStatus({ ...cod, is_cod: false })).toBe("unpaid")
  })

  it("a deposit on a COD order is Advance Paid", () => {
    expect(derivePaymentStatus({ ...cod, captured: 500 })).toBe("advance_paid")
  })

  it("a part payment on a prepaid order is Partially Paid", () => {
    expect(derivePaymentStatus({ ...cod, captured: 500, is_cod: false })).toBe("partially_paid")
  })

  it("captured in full is Paid — including the COD collected on delivery", () => {
    expect(derivePaymentStatus({ ...cod, captured: 2500 })).toBe("paid")
  })

  it("over-capture (rounding) is still Paid, never a broken state", () => {
    expect(derivePaymentStatus({ ...cod, captured: 2500.01 })).toBe("paid")
  })

  it("any refund flags the order as Refunded", () => {
    expect(derivePaymentStatus({ ...cod, captured: 2500, refunded: 2500 })).toBe("refunded")
    expect(derivePaymentStatus({ ...cod, captured: 2500, refunded: 500 })).toBe("refunded")
  })
})

describe("resolveOrderStatus — Medusa's truth always beats our stored stage", () => {
  const clean: OrderFacts = {
    canceled: false,
    fulfilled_qty: 0,
    delivered: false,
    returned_qty: 0,
    refunded_amount: 0,
  }

  it("uses the stored stage while nothing has physically happened", () => {
    expect(resolveOrderStatus("in_production", clean)).toBe("in_production")
    expect(resolveOrderStatus("new_order", clean)).toBe("new_order")
    expect(resolveOrderStatus("on_hold", clean)).toBe("on_hold")
  })

  it("someone fulfils NATIVELY in Medusa → Dispatched, whatever the stage says", () => {
    // This is the case that would silently rot if we stored the status.
    expect(resolveOrderStatus("in_production", { ...clean, fulfilled_qty: 3 })).toBe("dispatched")
  })

  it("the courier reports delivery → Delivered, beating a stale 'courier booked'", () => {
    expect(
      resolveOrderStatus("courier_booked", { ...clean, fulfilled_qty: 3, delivered: true })
    ).toBe("delivered")
  })

  it("goods physically came back → Returned, beating Delivered", () => {
    expect(
      resolveOrderStatus("courier_booked", {
        ...clean,
        fulfilled_qty: 3,
        delivered: true,
        returned_qty: 3,
      })
    ).toBe("returned")
  })

  it("cancelled in Medusa → Cancelled, however far along the stage was", () => {
    expect(resolveOrderStatus("ready_to_dispatch", { ...clean, canceled: true })).toBe("cancelled")
  })

  it("money went back → Refunded outranks everything", () => {
    expect(
      resolveOrderStatus("new_order", {
        canceled: true,
        fulfilled_qty: 3,
        delivered: true,
        returned_qty: 3,
        refunded_amount: 2500,
      })
    ).toBe("refunded")
  })
})

describe("canTransition (pre-order / custom — full pipeline)", () => {
  it("blocks delivering an order that never shipped", () => {
    const r = canTransition("pre_order", "confirmed", "delivered")
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/can't go straight to/i)
  })

  it("allows the full production path", () => {
    expect(canTransition("pre_order", "new_order", "confirmed").ok).toBe(true)
    expect(canTransition("pre_order", "confirmed", "in_production").ok).toBe(true)
    expect(canTransition("custom", "ready_to_dispatch", "courier_booked").ok).toBe(true)
    expect(canTransition("pre_order", "dispatched", "delivered").ok).toBe(true)
  })

  it("allows an RTO — cancelling after dispatch", () => {
    expect(canTransition("pre_order", "dispatched", "cancelled").ok).toBe(true)
  })

  it("treats cancelled and refunded as final", () => {
    expect(canTransition("pre_order", "cancelled", "confirmed").ok).toBe(false)
    expect(canTransition("custom", "refunded", "delivered").ok).toBe(false)
  })
})

describe("canTransition (ready_stock — no production stages)", () => {
  it("has NO production stage: confirmed goes straight to dispatched", () => {
    expect(canTransition("ready_stock", "confirmed", "dispatched").ok).toBe(true)
  })

  it("REFUSES production stages that don't apply to ready-stock", () => {
    expect(canTransition("ready_stock", "confirmed", "in_production").ok).toBe(false)
    expect(canTransition("ready_stock", "confirmed", "ready_to_dispatch").ok).toBe(false)
  })

  it("still runs the normal shipping path", () => {
    expect(canTransition("ready_stock", "new_order", "confirmed").ok).toBe(true)
    expect(canTransition("ready_stock", "dispatched", "delivered").ok).toBe(true)
    expect(canTransition("ready_stock", "dispatched", "cancelled").ok).toBe(true)
  })
})

describe("issue → what happens to the goods", () => {
  it("DAMAGED goods are written off, never restocked — the loss must stay visible", () => {
    expect(issueWritesOffGoods("damaged")).toBe(true)
    expect(issueRestocksGoods("damaged")).toBe(false)
  })

  it("returns, wrong products and exchanges all come back to the shelf", () => {
    for (const i of ["returned", "wrong_product", "exchange_requested"] as const) {
      expect(issueRestocksGoods(i)).toBe(true)
      expect(issueWritesOffGoods(i)).toBe(false)
    }
  })
})
