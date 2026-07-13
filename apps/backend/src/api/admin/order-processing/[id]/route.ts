import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { computeOrderEconomics } from "../../../../lib/orders/order-economics"
import { ALLOWED_TRANSITIONS } from "../../../../modules/orderProcessing/constants"
import { ORDER_PROCESSING_MODULE } from "../../../../modules/orderProcessing"
import {
  setCourierFeeWorkflow,
  setOrderIssueWorkflow,
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
    // What this order may legally do next — so the UI offers only real options.
    allowed_next: ALLOWED_TRANSITIONS[econ.order_status] ?? [],
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
  res.json({ order: econ, allowed_next: ALLOWED_TRANSITIONS[econ!.order_status] ?? [] })
}
