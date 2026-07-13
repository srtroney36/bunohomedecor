import { createOrderWorkflow } from "@medusajs/core-flows"
import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { checkAvailability, reserveOrderItems } from "../../../lib/orders/reserve"

/**
 * POST /admin/quick-orders — create an order on behalf of a customer (social/phone/in-store).
 *
 * IMPORTANT: `createOrderWorkflow` does NOT reserve inventory — only the storefront's
 * `completeCartWorkflow` does. Relying on it alone meant manual orders were never allocated,
 * and because nothing had checked the stock was there, fulfilling one drove the quantity
 * straight through zero and negative.
 *
 * So this route now does what cart completion does: refuse the order if the stock isn't there,
 * and reserve it the moment the order exists.
 */

type LineInput = {
  variant_id: string
  product_id?: string
  title: string
  quantity: number | string
  unit_price: number | string
}

type Body = {
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
}

function syntheticEmail(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "")
  return `p${digits || Date.now()}@manual.local`
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const b = (req.body ?? {}) as Body
  const c = b.customer

  if (!c?.phone?.trim() || !c?.name?.trim() || !c?.address_1?.trim()) {
    return res.status(400).json({ error: "Customer name, phone and address are required." })
  }
  if (!b.items?.length) {
    return res.status(400).json({ error: "Add at least one item." })
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

  const items = b.items.map((it) => ({
    title: it.title,
    variant_id: it.variant_id,
    product_id: it.product_id,
    quantity: Math.max(1, Number(it.quantity) || 1),
    unit_price: Math.max(0, Number(it.unit_price) || 0),
  }))

  /**
   * Refuse an order we can't fill — BEFORE it exists.
   *
   * This is the check that was missing. Without it, an order for 50 units of something we hold 1
   * of was accepted happily, and only revealed itself when fulfilment pushed the stock to −49.
   */
  const shortages = await checkAvailability(
    req.scope,
    items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity, title: i.title }))
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

  /**
   * Reserve the stock. `createOrderWorkflow` doesn't, so without this the order shows no
   * allocation and nothing protects the quantity from going negative at fulfilment.
   */
  let reservation: { reserved: number; skipped: number } | null = null
  try {
    reservation = await reserveOrderItems(req.scope, orderId)
  } catch (e: any) {
    // The order is real and the customer is waiting — don't lose it over a reservation. Say so
    // loudly instead: an unallocated order is exactly what caused the negative stock.
    const logger: any = req.scope.resolve("logger")
    logger?.error(`[quick-orders] ${orderId} created but NOT reserved: ${e.message}`)
    return res.json({
      order_id: orderId,
      order,
      warning:
        `The order was created, but its stock could NOT be reserved (${e.message}). ` +
        `Allocate it manually before fulfilling, or fulfilment may drive the stock negative.`,
    })
  }

  res.json({ order_id: orderId, order, reservation })
}
