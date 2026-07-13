import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { DEFAULT_COURIER_RATES } from "../../../../modules/orderProcessing/constants"
import { ORDER_PROCESSING_MODULE } from "../../../../modules/orderProcessing"

/**
 * GET /admin/order-processing/rates — the courier zones and what each costs us.
 * Seeds sensible Bangladesh defaults on first read so the team isn't staring at an empty table.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc: any = req.scope.resolve(ORDER_PROCESSING_MODULE)

  let rates = await svc.listCourierRates({}, { take: 100 })
  if (!rates.length) {
    rates = await svc.createCourierRates(DEFAULT_COURIER_RATES.map((r) => ({ ...r })))
  }

  res.json({ courier_rates: rates })
}

/** POST /admin/order-processing/rates — create or update a zone's fee. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc: any = req.scope.resolve(ORDER_PROCESSING_MODULE)
  const body = (req.body ?? {}) as {
    id?: string
    name?: string
    fee?: number
    cod_fee_pct?: number
    is_default?: boolean
    is_active?: boolean
  }

  if (body.id) {
    const [updated] = await svc.updateCourierRates([
      {
        id: body.id,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.fee !== undefined ? { fee: Math.max(0, Number(body.fee) || 0) } : {}),
        ...(body.cod_fee_pct !== undefined
          ? { cod_fee_pct: Math.max(0, Number(body.cod_fee_pct) || 0) }
          : {}),
        ...(body.is_default !== undefined ? { is_default: body.is_default } : {}),
        ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      },
    ])
    return res.json({ courier_rate: updated })
  }

  const [created] = await svc.createCourierRates([
    {
      name: body.name ?? "New zone",
      fee: Math.max(0, Number(body.fee) || 0),
      cod_fee_pct: Math.max(0, Number(body.cod_fee_pct) || 0),
      is_default: !!body.is_default,
    },
  ])
  res.status(201).json({ courier_rate: created })
}

/** DELETE /admin/order-processing/rates?id= */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc: any = req.scope.resolve(ORDER_PROCESSING_MODULE)
  const id = req.query.id as string
  if (id) await svc.deleteCourierRates([id])
  res.json({ deleted: true, id })
}
