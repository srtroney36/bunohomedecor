import {
  capturePaymentWorkflow,
  createOrderPaymentCollectionWorkflow,
} from "@medusajs/core-flows"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { ACCOUNTING_MODULE } from "../../../modules/accounting"
import { ORDER_PROCESSING_MODULE } from "../../../modules/orderProcessing"

/**
 * The money that Medusa's own order flow doesn't handle for a manual order: an up-front advance,
 * a made-to-order production cost, and an editable delivery charge.
 *
 * All three are editable at ANY time. Nothing here stores a computed total — production cost and
 * delivery charge live on the order_workflow row and everything downstream is derived, so an
 * edit simply changes the inputs and the P&L recomputes itself.
 */

async function ensureWorkflow(container: MedusaContainer, orderId: string) {
  const svc: any = container.resolve(ORDER_PROCESSING_MODULE)
  const [existing] = await svc.listOrderWorkflows({ order_id: orderId })
  if (existing) return existing
  const [created] = await svc.createOrderWorkflows([{ order_id: orderId }])
  return created
}

/* ------------------------------------- advance ------------------------------------- */

export type CaptureAdvanceInput = { order_id: string; amount: number }

/**
 * Take an up-front payment on a COD order.
 *
 * A manual order has no payment collection (createOrderWorkflow makes none), so we create one,
 * add a manual payment for the advance and capture it. The rest stays outstanding and is
 * collected at Delivered. Skipped when the advance is zero.
 */
export const captureAdvanceStep = createStep(
  "capture-advance",
  async (input: CaptureAdvanceInput, { container }: { container: MedusaContainer }) => {
    const amount = Math.max(0, Number(input.amount) || 0)
    if (amount <= 0) return new StepResponse({ captured: 0 }, null)

    const { result: collection } = await createOrderPaymentCollectionWorkflow(container).run({
      input: { order_id: input.order_id, amount },
    })

    const paymentModule: any = container.resolve(Modules.PAYMENT)

    // A manual payment session we can authorize + capture immediately (the cash is in hand).
    const session = await paymentModule.createPaymentSession((collection as any).id, {
      provider_id: "pp_system_default",
      amount,
      currency_code: "bdt",
      data: {},
    })
    const payment = await paymentModule.authorizePaymentSession(session.id, {})
    await paymentModule.capturePayment({ payment_id: payment.id, amount })

    return new StepResponse({ captured: amount, payment_id: payment.id }, null)
  }
  // No compensation: an advance is real cash received. Reversing it is a refund, done explicitly.
)

/* --------------------------------- production cost --------------------------------- */

export type SetProductionCostInput = {
  order_id: string
  cost: number
  actor_id?: string | null
}

type ProdComp = {
  wf_id: string
  prevCost: number
  ledgerId?: string
  prevLedger?: any
}

/**
 * Record what a pre-order/custom order cost to make. Two effects, both re-runnable:
 *   1. stored on the order (its cost of goods);
 *   2. mirrored to the Cash Book as a `production_cost` expense, keyed to the order so editing
 *      updates the one row instead of stacking a second.
 */
export const setProductionCostStep = createStep(
  "set-production-cost",
  async (input: SetProductionCostInput, { container }: { container: MedusaContainer }) => {
    const svc: any = container.resolve(ORDER_PROCESSING_MODULE)
    const acct: any = container.resolve(ACCOUNTING_MODULE)

    const wf = await ensureWorkflow(container, input.order_id)
    const cost = Math.max(0, Number(input.cost) || 0)

    const comp: ProdComp = { wf_id: wf.id, prevCost: Number(wf.production_cost) || 0 }
    await svc.updateOrderWorkflows([{ id: wf.id, production_cost: cost }])

    const [existing] = await acct.listLedgerEntries({
      source_type: "production",
      source_id: input.order_id,
    })

    if (cost > 0) {
      if (existing) {
        comp.prevLedger = { id: existing.id, amount: Number(existing.amount) }
        await acct.updateLedgerEntries([{ id: existing.id, amount: cost }])
      } else {
        const [created] = await acct.createLedgerEntries([
          {
            entry_date: new Date(),
            direction: "out",
            category: "production_cost",
            amount: cost,
            currency_code: "bdt",
            description: `Production cost — order ${input.order_id}`,
            reference: null,
            partner_id: null,
            source_type: "production",
            source_id: input.order_id,
          },
        ])
        comp.ledgerId = created.id
      }
    } else if (existing) {
      comp.prevLedger = { id: existing.id, amount: Number(existing.amount) }
      await acct.deleteLedgerEntries([existing.id])
    }

    return new StepResponse({ order_id: input.order_id, cost }, comp)
  },
  async (comp: ProdComp | undefined, { container }) => {
    if (!comp) return
    const svc: any = container.resolve(ORDER_PROCESSING_MODULE)
    const acct: any = container.resolve(ACCOUNTING_MODULE)
    await svc.updateOrderWorkflows([{ id: comp.wf_id, production_cost: comp.prevCost }])
    if (comp.ledgerId) await acct.deleteLedgerEntries([comp.ledgerId])
    else if (comp.prevLedger) {
      await acct
        .updateLedgerEntries([comp.prevLedger])
        .catch(() => acct.restoreLedgerEntries([comp.prevLedger.id]))
    }
  }
)

/* --------------------------------- delivery charged -------------------------------- */

export type SetDeliveryChargedInput = { order_id: string; amount: number | null }

/**
 * The delivery amount actually charged to the customer (revenue). Null falls back to Medusa's
 * shipping_total. Purely a stored input — revenue and delivery margin derive from it, so an
 * edit needs no other bookkeeping.
 */
export const setDeliveryChargedStep = createStep(
  "set-delivery-charged",
  async (input: SetDeliveryChargedInput, { container }: { container: MedusaContainer }) => {
    const svc: any = container.resolve(ORDER_PROCESSING_MODULE)
    const wf = await ensureWorkflow(container, input.order_id)
    const prev = wf.delivery_charged == null ? null : Number(wf.delivery_charged)

    const amount =
      input.amount == null ? null : Math.max(0, Number(input.amount) || 0)

    await svc.updateOrderWorkflows([{ id: wf.id, delivery_charged: amount }])
    return new StepResponse({ order_id: input.order_id, amount }, { wf_id: wf.id, prev })
  },
  async (comp: { wf_id: string; prev: number | null } | undefined, { container }) => {
    if (!comp) return
    const svc: any = container.resolve(ORDER_PROCESSING_MODULE)
    await svc.updateOrderWorkflows([{ id: comp.wf_id, delivery_charged: comp.prev }])
  }
)
