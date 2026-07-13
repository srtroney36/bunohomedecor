import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

/**
 * THE CANONICAL STOCK LOCATION — the one warehouse this business operates on.
 *
 * Why this exists: stock used to be written with `listInventoryLevels(item, { take: 1 })` — the
 * FIRST level, in undefined order — while it was READ by summing every level across every
 * location. Write one, read all. The moment a second level existed (even one on a soft-deleted
 * warehouse) the books and the shelf disagreed permanently, and restocked stock could land in a
 * warehouse no sales channel could see, so it could never be sold.
 *
 * So: one location, resolved the same way by every read and every write. Physical stock means
 * "stocked at THIS location" — nothing else counts.
 *
 * Multi-warehouse later is additive: batches already carry `location_id`, and this resolver is
 * the single place that would learn to pick per-channel.
 */

export type CanonicalLocation = {
  id: string
  name: string
  /** Channels that can actually sell from here. EMPTY means nothing sold can be allocated. */
  linked_sales_channels: { id: string; name: string }[]
}

export type SetupProblem = {
  code:
    | "no_location"
    | "ambiguous_locations"
    | "channel_not_linked"
    | "phantom_stock"
    | "uncosted_stock"
    | "not_stock_managed"
  message: string
  detail?: unknown
}

/** Every sales channel with the locations it can sell from. */
async function loadChannels(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name", "stock_locations.id", "stock_locations.name"],
  })
  return (data ?? []) as any[]
}

/** Active stock locations. query.graph excludes soft-deleted ones, which is the point. */
async function loadLocations(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })
  return (data ?? []) as any[]
}

/**
 * Resolve the canonical location, or return null with the reason. NEVER throws — reads and the
 * health check both need to survive a broken setup rather than 500.
 */
export async function getCanonicalLocation(
  container: MedusaContainer
): Promise<{ location: CanonicalLocation | null; problem: SetupProblem | null }> {
  const [channels, locations] = await Promise.all([
    loadChannels(container),
    loadLocations(container),
  ])

  if (!locations.length) {
    return {
      location: null,
      problem: {
        code: "no_location",
        message:
          "No stock location exists. Create one in Settings → Locations, then link it to your " +
          "sales channel — otherwise nothing can be stocked, reserved or shipped.",
      },
    }
  }

  // Which active locations does any channel actually sell from?
  const linkedIds = new Set<string>()
  for (const ch of channels) {
    for (const loc of ch.stock_locations ?? []) linkedIds.add(loc.id)
  }
  const active = locations.filter((l) => linkedIds.has(l.id))

  const channelsFor = (locId: string) =>
    channels
      .filter((ch) => (ch.stock_locations ?? []).some((l: any) => l.id === locId))
      .map((ch) => ({ id: ch.id, name: ch.name }))

  // The happy path: exactly one location that a channel can sell from.
  if (active.length === 1) {
    const l = active[0]
    return {
      location: { id: l.id, name: l.name, linked_sales_channels: channelsFor(l.id) },
      problem: null,
    }
  }

  if (active.length > 1) {
    return {
      location: null,
      problem: {
        code: "ambiguous_locations",
        message:
          `${active.length} stock locations are linked to sales channels. This store is set up ` +
          `for a single warehouse, so we can't tell which one to stock. Keep one linked, or ask ` +
          `for multi-warehouse support.`,
        detail: active.map((l) => ({ id: l.id, name: l.name })),
      },
    }
  }

  // Nothing linked. If there's exactly one location we still know WHERE stock lives — we just
  // can't sell it. Return it so reads work and the health check can offer the one-click link.
  if (locations.length === 1) {
    const l = locations[0]
    return {
      location: { id: l.id, name: l.name, linked_sales_channels: [] },
      problem: {
        code: "channel_not_linked",
        message:
          `"${l.name}" isn't linked to any sales channel, so Medusa has nowhere to allocate ` +
          `stock from — orders can't be reserved or fulfilled. Link it to fix this.`,
        detail: { location_id: l.id, channels: channels.map((c) => ({ id: c.id, name: c.name })) },
      },
    }
  }

  return {
    location: null,
    problem: {
      code: "ambiguous_locations",
      message:
        `There are ${locations.length} stock locations and none is linked to a sales channel, ` +
        `so we can't tell which one to stock. Link exactly one to fix this.`,
      detail: locations.map((l) => ({ id: l.id, name: l.name })),
    },
  }
}

/**
 * A variant's stock AT THE CANONICAL LOCATION — the single target every read and write shares.
 *
 * Note it reads the level for (item, canonical location) explicitly. The old code took
 * `listInventoryLevels(item, { take: 1 })`, which returns an arbitrary level and in this store
 * kept picking a soft-deleted warehouse's level.
 */
export type VariantStockTarget = {
  itemId: string
  label: string
  locationId: string
  /** stocked_quantity at the canonical location. Physical truth. */
  onShelf: number
  /** reserved_quantity — held for unfulfilled orders. Does NOT reduce onShelf. */
  reserved: number
  levelExists: boolean
}

export async function loadVariantStockAt(
  container: MedusaContainer,
  variantId: string,
  location: CanonicalLocation
): Promise<VariantStockTarget> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const inventory: any = container.resolve("inventory")

  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "title", "sku", "product.title", "inventory_items.inventory_item_id"],
    filters: { id: variantId },
  })

  const v: any = data?.[0]
  if (!v) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Variant "${variantId}" not found.`)
  }

  const itemId = v.inventory_items?.[0]?.inventory_item_id
  if (!itemId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `"${v.title ?? variantId}" is not stock-managed, so it has no stock to change. ` +
        `Turn on "Manage inventory" for this variant first.`
    )
  }

  const label = v.product?.title
    ? `${v.product.title} — ${v.title}`
    : v.title || v.sku || variantId

  const levels = await inventory.listInventoryLevels({
    inventory_item_id: itemId,
    location_id: location.id,
  })
  const level = levels?.[0]

  return {
    itemId,
    label,
    locationId: location.id,
    onShelf: Number(level?.stocked_quantity) || 0,
    reserved: Number(level?.reserved_quantity) || 0,
    levelExists: !!level,
  }
}

/** Make sure the (item, canonical location) level exists so it can be written to. */
export async function ensureLevel(
  container: MedusaContainer,
  target: VariantStockTarget
): Promise<void> {
  if (target.levelExists) return
  const inventory: any = container.resolve("inventory")
  await inventory.createInventoryLevels([
    {
      inventory_item_id: target.itemId,
      location_id: target.locationId,
      stocked_quantity: 0,
    },
  ])
}

/** For WRITES: resolve the location or fail loudly with the fix. */
export async function requireCanonicalLocation(
  container: MedusaContainer
): Promise<CanonicalLocation> {
  const { location, problem } = await getCanonicalLocation(container)
  if (!location) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, problem!.message)
  }
  return location
}

/**
 * For STOCK-CHANGING writes: the location must be SELLABLE — a warehouse no sales channel can
 * reach holds inventory that can never leave.
 *
 * We do NOT quietly repair this. Rewriting someone's store configuration behind their back is
 * how a setup problem becomes invisible instead of fixed. We refuse, say exactly what is wrong
 * and exactly where to correct it, and then get out of the way — once it's mapped properly in
 * Medusa's own settings, everything works with no further help from us.
 */
export async function requireSellableLocation(
  container: MedusaContainer
): Promise<CanonicalLocation> {
  const location = await requireCanonicalLocation(container)
  if (location.linked_sales_channels.length) return location

  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    `"${location.name}" isn't linked to any sales channel, so stock added here could never be ` +
      `reserved, sold or shipped. Fix it once in Settings → Locations → "${location.name}" → ` +
      `Sales Channels, then restock as normal.`
  )
}
