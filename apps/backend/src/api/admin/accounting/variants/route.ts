import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { PRODUCT_COST_MODULE } from "../../../../modules/productCost"

/**
 * GET /admin/accounting/variants?q=search
 *
 * A slim variant picker for the Restock form. Lives under /accounting so it is gated by the
 * accounting permission — a Finance user can search products to restock without needing the
 * separate `products` grant.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const productSvc: any = req.scope.resolve(Modules.PRODUCT)
  const costSvc: any = req.scope.resolve(PRODUCT_COST_MODULE)

  const q = (req.query.q as string | undefined)?.trim()

  const products = await productSvc.listProducts(q ? { q } : {}, {
    take: 20,
    select: ["id", "title"],
    relations: ["variants"],
  })

  const rows: { variant_id: string; label: string; sku: string | null }[] = []
  for (const p of products) {
    for (const v of p.variants ?? []) {
      rows.push({
        variant_id: v.id,
        label: `${p.title} — ${v.title}`,
        sku: v.sku ?? null,
      })
    }
  }

  // Attach current cost so the form can prefill unit cost.
  const ids = rows.map((r) => r.variant_id)
  const costs = ids.length ? await costSvc.listVariantCosts({ variant_id: ids }) : []
  const costMap = new Map(costs.map((c: any) => [c.variant_id, Number(c.cost) || 0]))

  res.json({
    variants: rows.map((r) => ({ ...r, cost: costMap.get(r.variant_id) ?? 0 })),
  })
}
