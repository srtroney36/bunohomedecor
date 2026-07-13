import { createOrderWorkflow } from "@medusajs/core-flows"
import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { checkAvailability, reserveOrderItems } from "../../../lib/orders/reserve"
import { ORDER_PROCESSING_MODULE } from "../../../modules/orderProcessing"
import { ORDER_TYPES, type OrderType } from "../../../modules/orderProcessing/constants"
import {
  captureAdvanceWorkflow,
  setProductionCostWorkflow,
} from "../../../workflows/orderProcessing"

/**
 * POST /admin/quick-orders — place an order for a customer (social / phone / in-store).
 *
 * Three types, and the type changes what happens to stock:
 *
 *   ready_stock — off the shelf. Refuse it if the stock isn't there, then reserve it (exactly
 *                 what storefront cart-completion does; createOrderWorkflow does NOT reserve, so
 *                 without this manual orders drove stock negative).
 *   pre_order   — sold before it's made. Line items carry NO variant_id, so Medusa never touches
 *                 stock. No availability check, no reservation. Cost is the production cost.
 *   custom      — like pre_order but free-form items.
 *
 * Manual orders are COD by default; an optional advance is captured up front.
 */

type LineInput = {
  variant_id?: string
  product_id?: string
  title: string
  quantity: number | string
  unit_price: number | string
}

type Body = {
  order_type?: OrderType
  customer: {
    name: string
    phone: string
    email?: string
    address_1: string
    city?: string
    postal_code?: string
    country_code?: string
  }
  items: LineInput[]
  region_id: string
  sales_channel_id: string
  shipping?: { name?: string; amount: number | string; shipping_option_id?: string }
  currency_code?: string
  note?: string
  advance_amount?: number | string
  production_cost?: number | string
}

function syntheticEmail(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "")
  return `p${digits || Date.now()}@manual.local`
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const b = (req.body ?? {}) as Body
  const c = b.customer

  const orderType: OrderType = ORDER_TYPES.includes(b.order_type as OrderType)
    ? (b.order_type as OrderType)
    : "ready_stock"
  const isReadyStock = orderType === "ready_stock"

  if (!c?.phone?.trim() || !c?.name?.trim() || !c?.address_1?.trim()) {
    return res.status(400).json({ error: "Customer name, phone and address are required." })
  }
  if (!b.items?.length) {
    return res.status(400).json({ error: "Add at least one item." })
  }
  if (isReadyStock && b.items.some((it) => !it.variant_id)) {
    return res.status(400).json({ error: "Ready-stock items must be picked from your products." })
  }
  if (!b.region_id || !b.sales_channel_id) {
    return res.status(400).json({ error: "region_id and sales_channel_id are required." })
  }

  const [first_name, ...rest] = c.name.trim().split(/\s+/)
  const last_name = rest.join(" ") || undefined
  const email = (c.email && c.email.trim()) || syntheticEmail(c.phone)

  // Resolve or create the customer (by phone, then email)
  const customerSvc: any = req.scope.resolve(Modules.CUSTOMER)
  let customerId: string | undefined
  const byPhone = await customerSvc.listCustomers({ phone: c.phone.trim() }, { take: 1 })
  if (byPhone?.length) {
    customerId = byPhone[0].id
  } else {
    const byEmail = await customerSvc.listCustomers({ email }, { take: 1 })
    if (byEmail?.length) {
      customerId = byEmail[0].id
    } else {
      const [created] = await customerSvc.createCustomers([
        { email, phone: c.phone.trim(), first_name, last_name },
      ])
      customerId = created.id
    }
  }

  const address = {
    first_name,
    last_name,
    phone: c.phone.trim(),
    address_1: c.address_1.trim(),
    city: c.city?.trim() || undefined,
    postal_code: c.postal_code?.trim() || undefined,
    country_code: (c.country_code || "bd").toLowerCase(),
  }

  /**
   * Pre-order/custom items are deliberately created WITHOUT a variant_id. That is the whole
   * mechanism that stops Medusa reserving or deducting stock for goods that don't exist yet.
   * We keep product_id for identity where we have it, but never the variant.
   */
  const items = b.items.map((it) => {
    const base = {
      title: it.title,
      quantity: Math.max(1, Number(it.quantity) || 1),
      unit_price: Math.max(0, Number(it.unit_price) || 0),
    }
    if (isReadyStock) {
      return { ...base, variant_id: it.variant_id, product_id: it.product_id }
    }
    return it.product_id ? { ...base, product_id: it.product_id } : base
  })

  // Availability only matters when we're actually drawing from stock.
  if (isReadyStock) {
    const shortages = await checkAvailability(
      req.scope,
      items.map((i: any) => ({ variant_id: i.variant_id, quantity: i.quantity, title: i.title }))
    )
    if (shortages.length) {
      return res.status(400).json({
        error: "Not enough stock to take this order.",
        shortages,
        message: shortages
          .map((s) => `${s.title}: asked for ${s.requested}, only ${s.available} available`)
          .join("; "),
      })
    }
  }

  const shipping_methods = b.shipping
    ? [
        {
          name: b.shipping.name || "Delivery",
          amount: Math.max(0, Number(b.shipping.amount) || 0),
          shipping_option_id: b.shipping.shipping_option_id,
        },
      ]
    : []

  const { result: order } = await createOrderWorkflow(req.scope).run({
    input: {
      region_id: b.region_id,
      sales_channel_id: b.sales_channel_id,
      customer_id: customerId,
      email,
      currency_code: (b.currency_code || "bdt").toLowerCase(),
      status: "pending",
      no_notification: true,
      shipping_address: address,
      billing_address: address,
      items,
      shipping_methods,
      metadata: b.note ? { manual_note: b.note } : undefined,
    } as any,
  })

  const orderId = (order as any)?.id
  const advance = Math.max(0, Number(b.advance_amount) || 0)
  const production = Math.max(0, Number(b.production_cost) || 0)
  const warnings: string[] = []

  // Record the order's type + COD intent. Upsert, because the order.placed subscriber may have
  // already created the row (it defaults to ready_stock — we correct it here).
  try {
    const opSvc: any = req.scope.resolve(ORDER_PROCESSING_MODULE)
    const [existing] = await opSvc.listOrderWorkflows({ order_id: orderId })
    if (existing) {
      await opSvc.updateOrderWorkflows([
        { id: existing.id, order_type: orderType, is_cod: true, advance_amount: advance },
      ])
    } else {
      await opSvc.createOrderWorkflows([
        { order_id: orderId, order_type: orderType, is_cod: true, advance_amount: advance },
      ])
    }
  } catch (e: any) {
    warnings.push(`Order type not recorded: ${e.message}`)
  }

  // Production cost (pre-order/custom) — stored on the order AND booked to the Cash Book.
  if (!isReadyStock && production > 0) {
    try {
      await setProductionCostWorkflow(req.scope).run({
        input: { order_id: orderId, cost: production },
      })
    } catch (e: any) {
      warnings.push(`Production cost not recorded: ${e.message}`)
    }
  }

  // Reserve stock — ready-stock only. createOrderWorkflow doesn't, so this is what prevents the
  // negative-stock bug for admin orders.
  let reservation: { reserved: number; skipped: number } | null = null
  if (isReadyStock) {
    try {
      reservation = await reserveOrderItems(req.scope, orderId)
    } catch (e: any) {
      const logger: any = req.scope.resolve("logger")
      logger?.error(`[quick-orders] ${orderId} created but NOT reserved: ${e.message}`)
      warnings.push(
        `Stock could NOT be reserved (${e.message}). Allocate it before fulfilling, or the ` +
          `quantity may go negative.`
      )
    }
  }

  // Take the advance up front (COD balance is collected later at Delivered).
  if (advance > 0) {
    try {
      await captureAdvanceWorkflow(req.scope).run({ input: { order_id: orderId, amount: advance } })
    } catch (e: any) {
      warnings.push(`Advance of ${advance} could not be captured: ${e.message}`)
    }
  }

  res.json({
    order_id: orderId,
    order,
    order_type: orderType,
    reservation,
    warning: warnings.length ? warnings.join(" ") : undefined,
  })
}
