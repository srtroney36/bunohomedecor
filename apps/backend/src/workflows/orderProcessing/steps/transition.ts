import {
  cancelOrderWorkflow,
  capturePaymentWorkflow,
  createOrderFulfillmentWorkflow,
  refundPaymentWorkflow,
} from "@medusajs/core-flows"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { requireSellableLocation } from "../../../lib/inventory/stock-location"
import { computeOrderEconomics } from "../../../lib/orders/order-economics"
import { reserveOrderItems } from "../../../lib/orders/reserve"
import { canTransition, issueWritesOffGoods } from "../../../lib/orders/status"
import { returnAndRestockOrder } from "../../../lib/returns"
import {
  STORED_STAGES,
  type IssueStatus,
  type OrderStatus,
  type StoredStage,
} from "../../../modules/orderProcessing/constants"
import { ORDER_PROCESSING_MODULE } from "../../../modules/orderProcessing"
import { PRODUCT_COST_MODULE } from "../../../modules/productCost"

/**
 * A STATUS CHANGE PERFORMS THE REAL ACTION.
 *
 * "Dispatched" doesn't mean someone typed dispatched — it CREATES the fulfilment, so stock
 * leaves, FIFO books the COGS and the packaging is drawn. "Delivered" CAPTURES the cash.
 * "Returned" RESTOCKS. This is the only way the label can't lie: there's nothing to keep in
 * sync, because setting the status IS the thing happening.
 *
 * The stages before dispatch (Confirmed, In Production…) have no Medusa counterpart, so those
 * are simply recorded.
 */

export type TransitionInput = {
  order_id: string
  to: OrderStatus
  actor_id?: string | null
  note?: string | null
  source?: string
}

const isStoredStage = (s: OrderStatus): s is StoredStage =>
  (STORED_STAGES as readonly string[]).includes(s)

/** Get the order's workflow row, creating it if this order predates the module. */
async function ensureWorkflow(container: MedusaContainer, orderId: string) {
  const svc: any = container.resolve(ORDER_PROCESSING_MODULE)
  const [existing] = await svc.listOrderWorkflows({ order_id: orderId })
  if (existing) return existing
  const [created] = await svc.createOrderWorkflows([{ order_id: orderId }])
  return created
}

export const transitionOrderStep = createStep(
  "transition-order",
  async (input: TransitionInput, { container }: { container: MedusaContainer }) => {
    const svc: any = container.resolve(ORDER_PROCESSING_MODULE)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const wf = await ensureWorkflow(container, input.order_id)

    // The CURRENT status is derived, never read from a column — so the guard is judging what is
    // actually true of this order, not what someone last typed.
    const [econ] = await computeOrderEconomics(container, { order_id: input.order_id })
    if (!econ) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order "${input.order_id}" not found.`)
    }

    const from = econ.order_status
    const check = canTransition(econ.order_type, from, input.to)
    if (!check.ok) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, check.reason!)
    }

    const prevStage: StoredStage = wf.stage

    /* ---------------------------------- the real work ---------------------------------- */

    if (input.to === "dispatched") {
      // Ship everything not yet shipped. This is what takes stock off the shelf.
      const { data } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "items.id",
          "items.detail.quantity",
          "items.detail.fulfilled_quantity",
        ],
        filters: { id: input.order_id },
      })
      const items = ((data?.[0] as any)?.items ?? [])
        .map((it: any) => ({
          id: it.id,
          quantity: Number(it.detail?.quantity ?? 0) - Number(it.detail?.fulfilled_quantity ?? 0),
        }))
        .filter((i: any) => i.quantity > 0)

      if (!items.length) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Every item on this order has already shipped."
        )
      }

      /**
       * Make sure the stock is actually reserved before it ships.
       *
       * An order created in the admin never got a reservation (createOrderWorkflow doesn't make
       * one), so nothing had verified the goods existed. Fulfilling it then drove the quantity
       * straight through zero. Reserving here both allocates it and forces that check.
       */
      await reserveOrderItems(container, input.order_id)

      // Ship from the ONE warehouse we stock. Without this, Medusa may deduct from a different
      // location than the restock credited — which is how stock read −49 while the batches said 1.
      const location = await requireSellableLocation(container)

      await createOrderFulfillmentWorkflow(container).run({
        input: { order_id: input.order_id, items, location_id: location.id } as any,
      })
    }

    if (input.to === "delivered") {
      // Collect the money. For COD this is the cash the courier handed over.
      await captureOutstanding(container, input.order_id)
    }

    if (input.to === "returned") {
      // Reuses the existing return+restock flow: goods go back, COGS reverses.
      const r = await returnAndRestockOrder(container, input.order_id)
      if (!r.created && r.reason) {
        throw new MedusaError(MedusaError.Types.NOT_ALLOWED, r.reason)
      }
    }

    if (input.to === "cancelled") {
      if (econ.units_shipped > 0) {
        /**
         * RTO — the parcel already left, so this is not a simple cancel. The goods come back to
         * the shelf, but the courier still charged us and the box is spent. Those costs stay on
         * the order, which is exactly why an RTO shows up as a loss rather than a wash.
         */
        const r = await returnAndRestockOrder(container, input.order_id)
        if (!r.created && r.reason && !/already has a return/i.test(r.reason)) {
          throw new MedusaError(MedusaError.Types.NOT_ALLOWED, r.reason)
        }
      } else {
        // Nothing shipped: a clean cancel releases the reservation.
        await cancelOrderWorkflow(container).run({ input: { order_id: input.order_id } })
      }
    }

    if (input.to === "refunded") {
      await refundAllCaptured(container, input.order_id)
    }

    /* ------------------------------- record what happened ------------------------------ */

    // Only the pre-dispatch stages are ours to store. Everything else is derived from Medusa,
    // so writing it into `stage` would be creating exactly the stale copy we're avoiding.
    if (isStoredStage(input.to)) {
      await svc.updateOrderWorkflows([{ id: wf.id, stage: input.to }])
    }

    await svc.createOrderStatusEvents([
      {
        order_id: input.order_id,
        field: "order",
        from_value: from,
        to_value: input.to,
        actor_id: input.actor_id ?? null,
        source: input.source ?? "admin",
        note: input.note ?? null,
      },
    ])

    return new StepResponse(
      { order_id: input.order_id, from, to: input.to },
      { wf_id: wf.id, prevStage }
    )
  },
  // Compensation restores our stage. The Medusa actions (fulfilment, capture, return) each
  // compensate themselves inside their own workflow.
  async (comp: { wf_id: string; prevStage: StoredStage } | undefined, { container }) => {
    if (!comp) return
    const svc: any = container.resolve(ORDER_PROCESSING_MODULE)
    await svc.updateOrderWorkflows([{ id: comp.wf_id, stage: comp.prevStage }])
  }
)

/* --------------------------------- payment helpers --------------------------------- */

/** Capture every authorised-but-uncaptured payment — the COD balance landing in the books. */
async function captureOutstanding(container: MedusaContainer, orderId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "payment_collections.payments.id",
      "payment_collections.payments.amount",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.canceled_at",
    ],
    filters: { id: orderId },
  })

  const payments = ((data?.[0] as any)?.payment_collections ?? []).flatMap(
    (pc: any) => pc.payments ?? []
  )
  const uncaptured = payments.filter((p: any) => !p.captured_at && !p.canceled_at)

  // Not an error: a prepaid order is already captured, and the status is still legitimately
  // "Delivered". We just have nothing to collect.
  for (const p of uncaptured) {
    await capturePaymentWorkflow(container).run({ input: { payment_id: p.id } })
  }
}

/** Give back everything we took. */
async function refundAllCaptured(container: MedusaContainer, orderId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "payment_collections.payments.id",
      "payment_collections.payments.amount",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.refunds.amount",
    ],
    filters: { id: orderId },
  })

  const payments = ((data?.[0] as any)?.payment_collections ?? []).flatMap(
    (pc: any) => pc.payments ?? []
  )

  let refundedAny = false
  for (const p of payments) {
    if (!p.captured_at) continue
    const already = (p.refunds ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
    const left = Number(p.amount || 0) - already
    if (left <= 0) continue
    await refundPaymentWorkflow(container).run({
      input: { payment_id: p.id, amount: left },
    })
    refundedAny = true
  }

  if (!refundedAny) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "There is no captured payment to refund on this order."
    )
  }
}

/* ------------------------------------ issue status --------------------------------- */

export type SetIssueInput = {
  order_id: string
  issue: IssueStatus
  actor_id?: string | null
  note?: string | null
}

/**
 * Set the issue — and where the issue changes what happens to the GOODS, make that happen.
 *
 * Damaged is the one that matters: those units are gone. Putting them back on the shelf would
 * invent stock that doesn't exist and hide a real loss, so instead they're written off at their
 * FIFO cost. That write-off is what makes damage show up as the cost it actually is.
 */
export const setOrderIssueStep = createStep(
  "set-order-issue",
  async (input: SetIssueInput, { container }: { container: MedusaContainer }) => {
    const svc: any = container.resolve(ORDER_PROCESSING_MODULE)
    const costSvc: any = container.resolve(PRODUCT_COST_MODULE)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const wf = await ensureWorkflow(container, input.order_id)
    const from: IssueStatus = wf.issue_status

    const movementIds: string[] = []

    if (issueWritesOffGoods(input.issue) && !issueWritesOffGoods(from)) {
      // Write off every unit that shipped and never came back — they were destroyed in transit.
      const { data } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "items.variant_id",
          "items.detail.fulfilled_quantity",
          "items.detail.return_received_quantity",
        ],
        filters: { id: input.order_id },
      })

      for (const it of ((data?.[0] as any)?.items ?? []) as any[]) {
        const lost =
          Number(it.detail?.fulfilled_quantity ?? 0) -
          Number(it.detail?.return_received_quantity ?? 0)
        if (!it.variant_id || lost <= 0) continue

        const [m] = await costSvc.createStockMovements([
          {
            variant_id: it.variant_id,
            date: new Date(),
            quantity: lost,
            reason: "damage",
            note: `Damaged in transit — order ${input.order_id}`,
          },
        ])
        movementIds.push(m.id)
      }
    }

    await svc.updateOrderWorkflows([{ id: wf.id, issue_status: input.issue }])
    await svc.createOrderStatusEvents([
      {
        order_id: input.order_id,
        field: "issue",
        from_value: from,
        to_value: input.issue,
        actor_id: input.actor_id ?? null,
        source: "admin",
        note: input.note ?? null,
      },
    ])

    return new StepResponse(
      { order_id: input.order_id, issue: input.issue, written_off: movementIds.length },
      { wf_id: wf.id, from, movementIds }
    )
  },
  async (
    comp: { wf_id: string; from: IssueStatus; movementIds: string[] } | undefined,
    { container }
  ) => {
    if (!comp) return
    const svc: any = container.resolve(ORDER_PROCESSING_MODULE)
    const costSvc: any = container.resolve(PRODUCT_COST_MODULE)
    await svc.updateOrderWorkflows([{ id: comp.wf_id, issue_status: comp.from }])
    if (comp.movementIds.length) await costSvc.deleteStockMovements(comp.movementIds)
  }
)
