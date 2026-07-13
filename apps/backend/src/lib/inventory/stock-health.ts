import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { computeFifoCosting } from "../insights/fifo-costing"
import { getCanonicalLocation } from "./stock-location"

/**
 * STOCK SETUP HEALTH — diagnostics, and nothing else.
 *
 * This deliberately does NOT repair anything. A setup problem that a tool quietly patches over
 * is a problem you never learn about and never really fix; the next one lands somewhere the tool
 * doesn't reach. So: say precisely what is wrong, and precisely where to correct it in Medusa's
 * own settings. Once it's mapped properly, stock, reservation and fulfilment all work with no
 * further intervention — no buttons, no adjustments.
 *
 * Every problem here is one that otherwise fails silently or produces wrong numbers.
 */

export type HealthIssue = {
  code:
    | "channel_not_linked"
    | "no_location"
    | "ambiguous_locations"
    | "phantom_stock"
    | "uncosted_stock"
    | "negative_stock"
    | "unreserved_orders"
  /** What is broken, in plain terms. */
  message: string
  /** Exactly where to go to fix it. */
  fix_where: string
  /** Deep link into the admin, when there is one. */
  fix_link?: string
  /** True when it actively breaks selling (vs. merely being untidy). */
  blocking: boolean
}

export type StockHealth = {
  healthy: boolean
  location: { id: string; name: string } | null
  issues: HealthIssue[]
}

export async function inspectStockHealth(container: MedusaContainer): Promise<StockHealth> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { location, problem } = await getCanonicalLocation(container)

  const issues: HealthIssue[] = []

  /* 1) The blocker: a sales channel with no warehouse can't reserve or ship anything. */
  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name", "stock_locations.id"],
  })
  const orphanChannels = (channels ?? []).filter((c: any) => !(c.stock_locations ?? []).length)

  if (problem && (problem.code === "no_location" || problem.code === "ambiguous_locations")) {
    issues.push({
      code: problem.code,
      message: problem.message,
      fix_where: "Settings → Locations",
      fix_link: "/app/settings/locations",
      blocking: true,
    })
  }

  if (orphanChannels.length && location) {
    const names = orphanChannels.map((c: any) => c.name).join(", ")
    issues.push({
      code: "channel_not_linked",
      message:
        `${names} ${orphanChannels.length > 1 ? "are" : "is"} not linked to any warehouse, so ` +
        `Medusa has nowhere to allocate stock from — orders can't be reserved or fulfilled.`,
      fix_where: `Settings → Locations → "${location.name}" → Sales Channels → add ${names}`,
      fix_link: `/app/settings/locations/${location.id}`,
      blocking: true,
    })
  }

  /* 2) Stock stranded outside the working warehouse. Inert (we ignore it, and Medusa can't sell
        it either) but worth knowing about, because Medusa's own Inventory page still shows it. */
  const { data: allLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })
  const liveIds = new Set((allLocations ?? []).map((l: any) => l.id))

  const inventory: any = container.resolve("inventory")
  const levels = await inventory.listInventoryLevels({}, { take: 100000 })

  let strandedUnits = 0
  const strandedLocs = new Set<string>()
  for (const lvl of levels ?? []) {
    if (location && lvl.location_id === location.id) continue
    const units = Number(lvl.stocked_quantity) || 0
    if (units <= 0) continue
    strandedUnits += units
    strandedLocs.add(lvl.location_id)
  }

  if (strandedUnits > 0) {
    const deletedCount = [...strandedLocs].filter((id) => !liveIds.has(id)).length
    issues.push({
      code: "phantom_stock",
      message:
        `${strandedUnits.toLocaleString()} unit(s) sit in ${strandedLocs.size} other warehouse(s)` +
        `${deletedCount ? ` (${deletedCount} of them deleted)` : ""}. They're ignored here and ` +
        `Medusa can't sell them either, so they're harmless — but its Inventory page still shows ` +
        `them, which is confusing.`,
      fix_where:
        "Store Settings → Danger Zone → 'Reset inventory quantity' clears them, or move the " +
        "stock onto your working warehouse in Settings → Locations.",
      fix_link: "/app/settings/locations",
      blocking: false,
    })
  }

  /**
   * 3) NEGATIVE STOCK — impossible in the real world, so it always means something shipped that
   *    was never reserved and never checked. This is the alarm that should have gone off before
   *    a quantity ever reached −49.
   */
  const negatives = (levels ?? []).filter((l: any) => Number(l.stocked_quantity) < 0)
  if (negatives.length) {
    const worst = Math.min(...negatives.map((l: any) => Number(l.stocked_quantity)))
    issues.push({
      code: "negative_stock",
      message:
        `${negatives.length} item(s) have NEGATIVE stock (as low as ${worst}). That's not ` +
        `possible physically — it means goods shipped that were never reserved, so nothing ` +
        `checked they existed. Inventory value and COGS are wrong until it's corrected.`,
      fix_where:
        "Count the shelf and use Hard adjust on those variants to set the true quantity. " +
        "New orders can no longer do this — manual orders now reserve stock like storefront ones.",
      blocking: true,
    })
  }

  /**
   * 4) Orders holding stock they never reserved. An order created in the admin before this was
   *    fixed has no reservation, so its goods aren't held for it — and fulfilling it is what
   *    drives the quantity negative.
   */
  const { data: openOrders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "canceled_at",
      "items.id",
      "items.detail.quantity",
      "items.detail.fulfilled_quantity",
    ],
  })

  const unreserved: number[] = []
  for (const o of (openOrders ?? []) as any[]) {
    if (o.canceled_at) continue
    const outstanding = (o.items ?? []).reduce(
      (s: number, it: any) =>
        s +
        (Number(it.detail?.quantity ?? 0) - Number(it.detail?.fulfilled_quantity ?? 0)),
      0
    )
    if (outstanding <= 0) continue

    const lineIds = (o.items ?? []).map((it: any) => it.id)
    if (!lineIds.length) continue
    const held = await inventory.listReservationItems({ line_item_id: lineIds })
    if (!(held ?? []).length) unreserved.push(o.display_id)
  }

  if (unreserved.length) {
    issues.push({
      code: "unreserved_orders",
      message:
        `${unreserved.length} unshipped order(s) hold NO stock reservation (#${unreserved
          .slice(0, 5)
          .join(", #")}${unreserved.length > 5 ? "…" : ""}). Their goods aren't allocated, and ` +
        `fulfilling them can push stock below zero.`,
      fix_where:
        "Open each order and allocate it, or re-create it. Orders created from now on reserve " +
        "stock automatically.",
      blocking: false,
    })
  }

  /* 5) Units sold with no cost layer → COGS and inventory value understated. */
  const fifo = await computeFifoCosting(container)
  if (fifo.uncosted_units > 0) {
    issues.push({
      code: "uncosted_stock",
      message:
        `${fifo.uncosted_units} unit(s) across ${fifo.variants_uncosted} variant(s) shipped with ` +
        `no cost batch behind them, so cost of goods is understated.`,
      fix_where:
        "Restock those products (which records what they cost), or use Hard adjust to set the " +
        "true count with a cost.",
      blocking: false,
    })
  }

  return {
    healthy: issues.length === 0,
    location: location ? { id: location.id, name: location.name } : null,
    issues,
  }
}
