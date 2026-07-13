/**
 * ORDER PROCESSING — the spec. Models, validators, workflows and the admin UI all derive from
 * this file. Read it before changing anything about order status.
 *
 * ---------------------------------------------------------------------------------
 * RULE 1: Never store a second copy of something Medusa already knows.
 * ---------------------------------------------------------------------------------
 *
 * The instant we save `payment_status = "paid"` into our own column, someone captures a
 * payment natively in Medusa and our column is a lie. Same for fulfilment, cancellation and
 * returns. A status that can disagree with reality is worse than no status.
 *
 * So the three dimensions are sourced very differently:
 *
 *   PAYMENT  — 100% DERIVED, never stored. captured/refunded amounts vs the order total.
 *   ORDER    — HYBRID. Only the stages Medusa has no concept of are stored (see STAGES);
 *              everything from Dispatched onwards is derived from Medusa's own truth.
 *   ISSUE    — STORED. It is a human judgement ("this came back damaged") that no amount of
 *              order data can tell us.
 *
 * ---------------------------------------------------------------------------------
 * RULE 2: A status change performs the real action.
 * ---------------------------------------------------------------------------------
 *
 * Setting "Dispatched" CREATES the fulfilment (stock leaves, COGS books, packaging draws).
 * Setting "Delivered" CAPTURES the COD. Setting "Returned" RESTOCKS. The status is the control
 * surface, not a sticker — which is the only way it can stay honest.
 */

/* ----------------------------------- order status ---------------------------------- */

export const ORDER_STATUSES = [
  "new_order",
  "confirmed",
  "in_production",
  "ready_to_dispatch",
  "courier_booked",
  "dispatched",
  "delivered",
  "cancelled",
  "on_hold",
  "returned",
  "refunded",
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/**
 * The ONLY statuses we store. Each is a step that exists purely inside the business — Medusa
 * has no idea whether a vase is "in production" or "ready to dispatch".
 *
 * Everything else (dispatched, delivered, cancelled, returned, refunded) is DERIVED from
 * Medusa, so it can never contradict what actually happened.
 */
export const STORED_STAGES = [
  "new_order",
  "confirmed",
  "in_production",
  "ready_to_dispatch",
  "courier_booked",
  "on_hold",
] as const
export type StoredStage = (typeof STORED_STAGES)[number]

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; color: "grey" | "blue" | "green" | "orange" | "red" | "purple"; derived: boolean }
> = {
  new_order:         { label: "New Order",         color: "grey",   derived: false },
  confirmed:         { label: "Confirmed",         color: "blue",   derived: false },
  in_production:     { label: "In Production",     color: "purple", derived: false },
  ready_to_dispatch: { label: "Ready to Dispatch", color: "purple", derived: false },
  courier_booked:    { label: "Courier Booked",    color: "blue",   derived: false },
  on_hold:           { label: "On Hold",           color: "orange", derived: false },
  dispatched:        { label: "Dispatched",        color: "blue",   derived: true },
  delivered:         { label: "Delivered",         color: "green",  derived: true },
  cancelled:         { label: "Cancelled",         color: "red",    derived: true },
  returned:          { label: "Returned",          color: "orange", derived: true },
  refunded:          { label: "Refunded",          color: "red",    derived: true },
}

/**
 * What a transition is allowed to follow. Guards exist so the books can't be corrupted by a
 * click: you cannot deliver an order that never shipped, and you cannot dispatch one that
 * nobody confirmed.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new_order:         ["confirmed", "cancelled", "on_hold"],
  confirmed:         ["in_production", "ready_to_dispatch", "cancelled", "on_hold"],
  in_production:     ["ready_to_dispatch", "cancelled", "on_hold"],
  ready_to_dispatch: ["courier_booked", "dispatched", "cancelled", "on_hold"],
  courier_booked:    ["dispatched", "cancelled", "on_hold"],
  // Once goods have physically left, the only ways out are delivery, return, or cancellation
  // (which is an RTO — the goods come back but the courier still charged us).
  dispatched:        ["delivered", "returned", "cancelled", "on_hold"],
  delivered:         ["returned", "refunded"],
  returned:          ["refunded"],
  on_hold:           ["confirmed", "in_production", "ready_to_dispatch", "cancelled"],
  cancelled:         [],
  refunded:          [],
}

/* ---------------------------------- payment status --------------------------------- */

export const PAYMENT_STATUSES = [
  "unpaid",
  "advance_paid",
  "partially_paid",
  "paid",
  "cod",
  "refunded",
] as const
export type OrderPaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const PAYMENT_STATUS_META: Record<
  OrderPaymentStatus,
  { label: string; color: "grey" | "blue" | "green" | "orange" | "red" }
> = {
  unpaid:         { label: "Unpaid",           color: "red" },
  advance_paid:   { label: "Advance Paid",     color: "blue" },
  partially_paid: { label: "Partially Paid",   color: "orange" },
  paid:           { label: "Paid",             color: "green" },
  cod:            { label: "Cash on Delivery", color: "grey" },
  refunded:       { label: "Refunded",         color: "red" },
}

/* ----------------------------------- issue status ---------------------------------- */

export const ISSUE_STATUSES = [
  "none",
  "returned",
  "damaged",
  "wrong_product",
  "exchange_requested",
  "refunded",
] as const
export type IssueStatus = (typeof ISSUE_STATUSES)[number]

export const ISSUE_STATUS_META: Record<
  IssueStatus,
  { label: string; color: "grey" | "blue" | "green" | "orange" | "red"; help: string }
> = {
  none: {
    label: "None",
    color: "grey",
    help: "Nothing wrong with this order.",
  },
  returned: {
    label: "Returned",
    color: "orange",
    help: "The parcel came back. Goods go back on the shelf and their COGS reverses.",
  },
  damaged: {
    label: "Damaged",
    color: "red",
    help:
      "Goods were destroyed in transit. They are NOT restocked — they are written off at cost, " +
      "so the loss is real and visible. Record any courier compensation as Other income.",
  },
  wrong_product: {
    label: "Wrong Product",
    color: "orange",
    help: "We shipped the wrong item. It comes back to stock and the right one goes out.",
  },
  exchange_requested: {
    label: "Exchange Requested",
    color: "blue",
    help: "The customer wants a swap. The old item returns to stock; the replacement ships out.",
  },
  refunded: {
    label: "Refunded",
    color: "red",
    help: "Money was given back to the customer.",
  },
}

/** Issues where the goods come BACK to the shelf (as opposed to being written off). */
export const RESTOCKING_ISSUES: IssueStatus[] = [
  "returned",
  "wrong_product",
  "exchange_requested",
]

/* ---------------------------------- courier zones ---------------------------------- */

/** Seeded defaults for the rate table. Real fees are edited in Store Settings. */
export const DEFAULT_COURIER_RATES = [
  { name: "Inside Dhaka", fee: 60, cod_fee_pct: 1, is_default: true },
  { name: "Sub-Dhaka", fee: 100, cod_fee_pct: 1, is_default: false },
  { name: "Outside Dhaka", fee: 120, cod_fee_pct: 1, is_default: false },
] as const
