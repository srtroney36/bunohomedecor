import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import type { GetByInventoryItemSchema } from "../validators"

/**
 * GET /admin/variant-stock/by-inventory-item?inventory_item_id=
 *
 * Which variant (and product) does this inventory item belong to? The Inventory page widget
 * needs it to deep-link you to the product's stock panel.
 *
 * Pages over variants and matches in JS rather than filtering on the link field, because
 * query.graph can't filter by a linked module's fields — the same approach inventory-value.ts
 * already takes.
 */
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetByInventoryItemSchema>,
  res: MedusaResponse
) {
  const { inventory_item_id } = req.validatedQuery
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const PAGE = 200
  let skip = 0

  for (;;) {
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "title",
        "sku",
        "product.id",
        "product.title",
        "inventory_items.inventory_item_id",
      ],
      pagination: { skip, take: PAGE },
    })

    if (!variants?.length) break

    for (const v of variants as any[]) {
      const hit = (v.inventory_items ?? []).some(
        (l: any) => l.inventory_item_id === inventory_item_id
      )
      if (!hit) continue

      return res.json({
        variant_id: v.id,
        label: v.product?.title ? `${v.product.title} — ${v.title}` : v.title,
        sku: v.sku ?? null,
        product_id: v.product?.id ?? null,
        product_title: v.product?.title ?? null,
      })
    }

    if (variants.length < PAGE) break
    skip += variants.length
  }

  res.status(404).json({
    type: "not_found",
    message: "No product variant is linked to this inventory item.",
  })
}
