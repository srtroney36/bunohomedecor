import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { ACCOUNTING_MODULE } from "../../../modules/accounting"

export type CreatePartnerInput = {
  name: string
  email?: string | null
  phone?: string | null
  joined_at?: Date | null
  notes?: string | null
}

export type UpdatePartnerInput = Partial<CreatePartnerInput> & {
  id: string
  is_active?: boolean
}

export const createPartnerStep = createStep(
  "create-partner",
  async (input: CreatePartnerInput, { container }) => {
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    const [created] = await svc.createPartners([input])
    return new StepResponse(created, created.id)
  },
  async (id: string | undefined, { container }) => {
    if (!id) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.deletePartners([id])
  }
)

export const updatePartnerStep = createStep(
  "update-partner",
  async (input: UpdatePartnerInput, { container }) => {
    const svc: any = container.resolve(ACCOUNTING_MODULE)

    const [before] = await svc.listPartners({ id: input.id })
    if (!before) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Partner "${input.id}" not found.`)
    }

    const [updated] = await svc.updatePartners([input])
    return new StepResponse(updated, {
      id: before.id,
      name: before.name,
      email: before.email,
      phone: before.phone,
      joined_at: before.joined_at,
      notes: before.notes,
      is_active: before.is_active,
    })
  },
  async (before: Record<string, unknown> | undefined, { container }) => {
    if (!before) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.updatePartners([before])
  }
)

export const deletePartnerStep = createStep(
  "delete-partner",
  async (input: { id: string }, { container }) => {
    const svc: any = container.resolve(ACCOUNTING_MODULE)

    const [existing] = await svc.listPartners({ id: input.id })
    if (!existing) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Partner "${input.id}" not found.`)
    }

    // Deleting a partner who has capital in the pool would orphan their ledger rows: the
    // money would still be counted, with nobody to attribute it to. Deactivate instead.
    const entries = await svc.listLedgerEntries({ partner_id: input.id }, { take: 1 })
    if (entries.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `${existing.name} has capital in the pool and cannot be deleted. ` +
          `Mark them inactive instead — the history has to stay.`
      )
    }

    await svc.deletePartners([input.id])
    return new StepResponse({ id: input.id }, input.id)
  },
  async (id: string | undefined, { container }) => {
    if (!id) return
    const svc: any = container.resolve(ACCOUNTING_MODULE)
    await svc.restorePartners([id])
  }
)
