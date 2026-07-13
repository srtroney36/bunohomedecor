import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { computeOrderEconomics } from "../../../../lib/orders/order-economics"
import { allowedTransitions } from "../../../../modules/orderProcessing/constants"
import { ORDER_PROCESSING_MODULE } from "../../../../modules/orderProcessing"
import {
  captureAdvanceWorkflow,
  setCourierFeeWorkflow,
  setDeliveryChargedWorkflow,
  setOrderIssueWorkflow,
  setProductionCostWorkflow,
  transitionOrderWorkflow,
} from "../../../../workflows/orderProcessing"

/** GET /admin/order-processing/:id — one order's status, P&L and history. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id
  const svc: any = req.scope.resolve(ORDER_PROCESSING_MODULE)

  const [econ] = await computeOrderEconomics(req.scope, { order_id: orderId })
  if (!econ) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order "${orderId}" not found.`)
  }

  const [events, rates] = await Promise.all([
    svc.listOrderStatusEvents({ order_id: orderId }, { order: { created_at: "DESC" }, take: 50 }),
    svc.listCourierRates({ is_active: true }, { take: 50 }),
  ])

  res.json({
    order: econ,
    // What this order may legally do next — type-aware, so a ready-stock order isn't offered
    // "in production" and a pre-order is.
    allowed_next: allowedTransitions(econ.order_type, econ.order_status),
    events,
    courier_rates: rates,
  })
}

/**
 * POST /admin/order-processing/:id — move the order, flag an issue, or set the courier fee.
 * Each of these performs the real action; see workflows/orderProcessing/steps/transition.ts.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id
  const actorId = req.auth_context?.actor_id ?? null
  const body = (req.body ?? {}) as {
    order_status?: string
    issue_status?: string
    courier_fee?: number
    courier_rate_id?: string | null
    production_cost?: number
    delivery_charged?: number | null
    advance_amount?: number
    note?: string | null
  }

  if (body.courier_fee !== undefined) {
    await setCourierFeeWorkflow(req.scope).run({
      input: {
        order_id: orderId,
        fee: Number(body.courier_fee),
        courier_rate_id: body.courier_rate_id ?? null,
        actor_id: actorId,
      },
    })
  }

  // Editable at any time — every edit re-flows through the P&L because it's all derived.
  if (body.production_cost !== undefined) {
    await setProductionCostWorkflow(req.scope).run({
      input: { order_id: orderId, cost: Number(body.production_cost), actor_id: actorId },
    })
  }

  if (body.delivery_charged !== undefined) {
    await setDeliveryChargedWorkflow(req.scope).run({
      input: {
        order_id: orderId,
        amount: body.delivery_charged == null ? null : Number(body.delivery_charged),
      },
    })
  }

  // A later advance/part-payment (e.g. customer sends a deposit after the order is placed).
  if (body.advance_amount !== undefined && Number(body.advance_amount) > 0) {
    await captureAdvanceWorkflow(req.scope).run({
      input: { order_id: orderId, amount: Number(body.advance_amount) },
    })
  }

  if (body.issue_status) {
    await setOrderIssueWorkflow(req.scope).run({
      input: {
        order_id: orderId,
        issue: body.issue_status as any,
        actor_id: actorId,
        note: body.note ?? null,
      },
    })
  }

  // Last, because it's the one that ships goods or moves cash — if the cheaper updates were
  // going to fail, better they fail before a parcel goes out the door.
  if (body.order_status) {
    await transitionOrderWorkflow(req.scope).run({
      input: {
        order_id: orderId,
        to: body.order_status as any,
        actor_id: actorId,
        note: body.note ?? null,
      },
    })
  }

  const [econ] = await computeOrderEconomics(req.scope, { order_id: orderId })
  res.json({
    order: econ,
    allowed_next: econ ? allowedTransitions(econ.order_type, econ.order_status) : [],
  })
}
