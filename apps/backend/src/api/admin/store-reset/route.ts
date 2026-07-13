import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { ACCOUNTING_MODULE } from "../../../modules/accounting"
import { PRODUCT_COST_MODULE } from "../../../modules/productCost"

// Typing the confirmation phrase is required to run this destructive reset. Wiping EVERYTHING
// (products included) is a bigger decision, so it demands a phrase of its own.
const CONFIRM_PHRASE = "store reset"
const NUKE_PHRASE = "reset everything"
const PAGE = 500

type ResetBody = {
  confirm?: string
  inventory?: { enabled?: boolean; value?: 0 | 1 }
  orders?: boolean
  customers?: { enabled?: boolean; identities?: boolean }
  /** Wipes the books AND the stock they account for — the two must go together. */
  accounting?: boolean
  /** The lot: accounting + inventory + orders + customers + products. */
  everything?: boolean
}

// Collect every id from a paginated list method: listFn(skip, take) -> rows[]
async function collectIds(
  listFn: (skip: number, take: number) => Promise<any[]>
): Promise<string[]> {
  const ids: string[] = []
  let skip = 0
  for (;;) {
    const rows = await listFn(skip, PAGE)
    if (!rows?.length) break
    ids.push(...rows.map((r) => r.id))
    if (rows.length < PAGE) break
    skip += rows.length
  }
  return ids
}

/** Force every stock level to a fixed quantity. */
async function setAllStockLevels(scope: any, value: number): Promise<number> {
  const inventory = scope.resolve(Modules.INVENTORY) as any
  let skip = 0
  let updated = 0
  for (;;) {
    const levels = await inventory.listInventoryLevels(
      {},
      { take: PAGE, skip, select: ["id", "inventory_item_id", "location_id"] }
    )
    if (!levels?.length) break
    await inventory.updateInventoryLevels(
      levels.map((l: any) => ({
        inventory_item_id: l.inventory_item_id,
        location_id: l.location_id,
        stocked_quantity: value,
      }))
    )
    updated += levels.length
    if (levels.length < PAGE) break
    skip += levels.length
  }
  return updated
}

/**
 * Drop every FIFO cost layer and write-off, and zero the cached "latest cost".
 *
 * This ALWAYS runs alongside a forced stock quantity. Physical stock and cost batches are two
 * views of the same units — force one without the other and the books instantly disagree with
 * the shelf (the drift warning would light up on every product). Packaging presets survive:
 * they're product configuration, not an accounting record.
 */
async function purgeStockLayers(scope: any): Promise<{ batches: number; movements: number }> {
  const costSvc = scope.resolve(PRODUCT_COST_MODULE) as any

  const batches = await costSvc.listStockBatches({}, { take: 200000, select: ["id"] })
  if (batches.length) await costSvc.deleteStockBatches(batches.map((b: any) => b.id))

  const movements = await costSvc.listStockMovements({}, { take: 200000, select: ["id"] })
  if (movements.length) await costSvc.deleteStockMovements(movements.map((m: any) => m.id))

  const costs = await costSvc.listVariantCosts({}, { take: 200000 })
  if (costs.length) {
    await costSvc.updateVariantCosts(costs.map((c: any) => ({ id: c.id, cost: 0 })))
  }

  return { batches: batches.length, movements: movements.length }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as ResetBody
  const logger = req.scope.resolve("logger") as any

  const wantEverything = Boolean(body.everything)

  // The nuclear option gets its own phrase — "store reset" is too easy to type by habit.
  const required = wantEverything ? NUKE_PHRASE : CONFIRM_PHRASE
  if (body.confirm !== required) {
    return res.status(400).json({ error: `Type "${required}" exactly to confirm.` })
  }

  const wantAccounting = wantEverything || Boolean(body.accounting)
  // Accounting and "everything" both force stock to zero — the books and the shelf move together.
  const wantInventory = wantEverything || wantAccounting || Boolean(body.inventory?.enabled)
  const wantOrders = wantEverything || Boolean(body.orders)
  const wantCustomers = wantEverything || Boolean(body.customers?.enabled)
  const wantProducts = wantEverything

  if (!wantInventory && !wantOrders && !wantCustomers && !wantAccounting) {
    return res.status(400).json({ error: "Select at least one thing to reset." })
  }

  const summary: Record<string, unknown> = {}
  const errors: Record<string, string> = {}

  // ── Inventory: force every stock level, and drop the cost layers behind it ───
  if (wantInventory) {
    /**
     * ALWAYS zero. There used to be a "set everything to 1" option, and it manufactured the
     * exact problem this system exists to prevent: a unit on the shelf that no cost batch backs.
     * Uncosted stock understates COGS and inventory value, and the drift warning then fires
     * forever with no way to reconcile.
     *
     * Stock enters through a restock, because that is what records what it cost. Reset to zero,
     * then restock.
     */
    const value = 0
    try {
      const updated = await setAllStockLevels(req.scope, value)
      const purged = await purgeStockLayers(req.scope)
      summary.inventory = {
        levels_updated: updated,
        set_to: value,
        batches_deleted: purged.batches,
        movements_deleted: purged.movements,
      }
    } catch (e: any) {
      errors.inventory = e.message
      logger?.error(`[store-reset] inventory failed: ${e.message}`)
    }
  }

  // ── Accounting: the books themselves ────────────────────────────────────────
  if (wantAccounting) {
    try {
      const acct = req.scope.resolve(ACCOUNTING_MODULE) as any

      const ledger = await acct.listLedgerEntries({}, { take: 200000, select: ["id"] })
      if (ledger.length) await acct.deleteLedgerEntries(ledger.map((r: any) => r.id))

      const assets = await acct.listFixedAssets({}, { take: 200000, select: ["id"] })
      if (assets.length) await acct.deleteFixedAssets(assets.map((r: any) => r.id))

      const marketing = await acct.listMarketingSpends({}, { take: 200000, select: ["id"] })
      if (marketing.length) await acct.deleteMarketingSpends(marketing.map((r: any) => r.id))

      const partners = await acct.listPartners({}, { take: 200000, select: ["id"] })
      if (partners.length) await acct.deletePartners(partners.map((r: any) => r.id))

      summary.accounting = {
        ledger_entries: ledger.length,
        fixed_assets: assets.length,
        marketing_spends: marketing.length,
        partners: partners.length,
      }
    } catch (e: any) {
      errors.accounting = e.message
      logger?.error(`[store-reset] accounting failed: ${e.message}`)
    }
  }

  // ── Orders & sales: soft-delete orders (+drafts), returns, exchanges, carts ──
  if (wantOrders) {
    try {
      const order = req.scope.resolve(Modules.ORDER) as any

      const returnIds = await collectIds((skip, take) =>
        order.listReturns({}, { take, skip, select: ["id"] })
      )
      if (returnIds.length) await order.softDeleteReturns(returnIds)

      const exchangeIds = await collectIds((skip, take) =>
        order.listOrderExchanges({}, { take, skip, select: ["id"] })
      )
      if (exchangeIds.length) await order.softDeleteOrderExchanges(exchangeIds)

      // listOrders returns both regular and draft orders
      const orderIds = await collectIds((skip, take) =>
        order.listOrders({}, { take, skip, select: ["id"] })
      )
      if (orderIds.length) await order.softDeleteOrders(orderIds)

      let cartCount = 0
      try {
        const cart = req.scope.resolve(Modules.CART) as any
        const cartIds = await collectIds((skip, take) =>
          cart.listCarts({}, { take, skip, select: ["id"] })
        )
        if (cartIds.length) await cart.softDeleteCarts(cartIds)
        cartCount = cartIds.length
      } catch (e: any) {
        errors.carts = e.message
      }

      summary.orders = {
        orders: orderIds.length,
        returns: returnIds.length,
        exchanges: exchangeIds.length,
        carts: cartCount,
      }
    } catch (e: any) {
      errors.orders = e.message
      logger?.error(`[store-reset] orders failed: ${e.message}`)
    }
  }

  // ── Customers: soft-delete customers (+ optional auth/login identities) ──────
  if (wantCustomers) {
    try {
      const customerSvc = req.scope.resolve(Modules.CUSTOMER) as any

      // Gather customer ids (need ids for auth-identity cleanup)
      const customerIds: string[] = []
      let skip = 0
      for (;;) {
        const rows = await customerSvc.listCustomers({}, { take: PAGE, skip, select: ["id"] })
        if (!rows?.length) break
        customerIds.push(...rows.map((c: any) => c.id))
        if (rows.length < PAGE) break
        skip += rows.length
      }

      let identitiesDeleted = 0
      if (body.customers?.identities && customerIds.length) {
        try {
          const auth = req.scope.resolve(Modules.AUTH) as any
          const customerIdSet = new Set(customerIds)
          // Only delete auth identities that belong to a CUSTOMER we're removing.
          // Admin/user identities carry app_metadata.user_id and are never touched.
          const toDelete: string[] = []
          let aSkip = 0
          for (;;) {
            const idents = await auth.listAuthIdentities(
              {},
              { take: PAGE, skip: aSkip, select: ["id", "app_metadata"] }
            )
            if (!idents?.length) break
            for (const ai of idents) {
              const cid = ai.app_metadata?.customer_id
              if (cid && customerIdSet.has(cid)) toDelete.push(ai.id)
            }
            if (idents.length < PAGE) break
            aSkip += idents.length
          }
          if (toDelete.length) await auth.deleteAuthIdentities(toDelete)
          identitiesDeleted = toDelete.length
        } catch (e: any) {
          errors.customer_identities = e.message
        }
      }

      if (customerIds.length) await customerSvc.softDeleteCustomers(customerIds)

      summary.customers = {
        customers: customerIds.length,
        login_identities_deleted: identitiesDeleted,
      }
    } catch (e: any) {
      errors.customers = e.message
      logger?.error(`[store-reset] customers failed: ${e.message}`)
    }
  }

  // ── Products: last, because orders reference the variants ───────────────────
  // Categories, collections, brands, settings, users and roles are deliberately kept — this
  // clears the catalogue, not the shop's configuration.
  if (wantProducts) {
    try {
      const productSvc = req.scope.resolve(Modules.PRODUCT) as any
      const productIds = await collectIds((skip, take) =>
        productSvc.listProducts({}, { take, skip, select: ["id"] })
      )
      if (productIds.length) await productSvc.softDeleteProducts(productIds)

      // The inventory items those variants pointed at are orphans now.
      let itemCount = 0
      try {
        const inventory = req.scope.resolve(Modules.INVENTORY) as any
        const itemIds = await collectIds((skip, take) =>
          inventory.listInventoryItems({}, { take, skip, select: ["id"] })
        )
        if (itemIds.length) await inventory.softDeleteInventoryItems(itemIds)
        itemCount = itemIds.length
      } catch (e: any) {
        errors.inventory_items = e.message
      }

      summary.products = { products: productIds.length, inventory_items: itemCount }
    } catch (e: any) {
      errors.products = e.message
      logger?.error(`[store-reset] products failed: ${e.message}`)
    }
  }

  logger?.warn(`[store-reset] executed: ${JSON.stringify(summary)}`)

  const ok = Object.keys(errors).length === 0
  return res.status(ok ? 200 : 207).json({ success: ok, summary, errors })
}
