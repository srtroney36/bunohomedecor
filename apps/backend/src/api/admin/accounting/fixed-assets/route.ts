import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ACCOUNTING_MODULE } from "../../../../modules/accounting"
import { createFixedAssetWorkflow } from "../../../../workflows/accounting"
import type { CreateFixedAssetSchema, GetFixedAssetsSchema } from "../validators"

// GET /admin/accounting/fixed-assets
export async function GET(
  req: AuthenticatedMedusaRequest<unknown, GetFixedAssetsSchema>,
  res: MedusaResponse
) {
  const svc: any = req.scope.resolve(ACCOUNTING_MODULE)
  const { include_disposed, limit, offset } = req.validatedQuery

  const filters: Record<string, unknown> = include_disposed ? {} : { is_disposed: false }

  const [assets, count] = await svc.listAndCountFixedAssets(filters, {
    take: limit,
    skip: offset,
    order: { purchase_date: "DESC" },
  })

  // Disposed assets are excluded from value: the business no longer owns them. Their
  // original cash row stays in the ledger, because that money really was spent.
  const owned = await svc.listFixedAssets({ is_disposed: false }, { take: 100000 })
  const total_value = owned.reduce((s: number, a: any) => s + Number(a.cost), 0)

  res.json({
    fixed_assets: assets.map((a: any) => ({ ...a, cost: Number(a.cost) })),
    count,
    limit,
    offset,
    total_value,
  })
}

// POST /admin/accounting/fixed-assets — also writes the mirrored cash row.
export async function POST(
  req: AuthenticatedMedusaRequest<CreateFixedAssetSchema>,
  res: MedusaResponse
) {
  const { result } = await createFixedAssetWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json({ fixed_asset: result })
}
