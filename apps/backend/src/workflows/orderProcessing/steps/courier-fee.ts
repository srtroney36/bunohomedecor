import type { MedusaContainer } from "@medusajs/framework/types"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { ACCOUNTING_MODULE } from "../../../modules/accounting"
import { ORDER_PROCESSING_MODULE } from "../../../modules/orderProcessing"

/**
 * What the courier charges US for this parcel.
 *
 * Two things happen, and both matter:
 *   1. It lands on the order, so we can finally see DELIVERY MARGIN — what the customer paid for
 *      delivery minus what delivery actually cost. Charge ৳100, pay the courier ৳60, and you
 *      made ৳40 carrying it. Charge ৳60 and pay ৳120 and every parcel quietly loses ৳60.
 *   2. It lands in the Cash Book as a real `courier_fee` expense, keyed to this order, so cash
 *      and profit are right without anyone typing a bulk figure at month end.
 *
 * The ledger row is UPSERTED against (source_type "order", source_id) — the same idempotent
 * trick fixed assets use — so correcting a fee updates its row instead of adding a second one.
 */

export type SetCourierFeeInput = {
  order_id: string
  fee: number
  courier_rate_id?: string | null
  actor_id?: string | null
}

type Comp = {
  wf_id: string
  prevFee: number
  prevRateId: string | null
  ledgerId?: string
  prevLedger?: any
}

export const setCourierFeeStep = createStep(
  "set-courier-fee",
  async (input: SetCourierFeeInput, { container }: { container: MedusaContainer }) => {
    const svc: any = container.resolve(ORDER_PROCESSING_MODULE)
    const acct: any = container.resolve(ACCOUNTING_MODULE)

    let [wf] = await svc.listOrderWorkflows({ order_id: input.order_id })
    if (!wf) [wf] = await svc.createOrderWorkflows([{ order_id: input.order_id }])

    const fee = Math.max(0, Number(input.fee) || 0)
    const comp: Comp = {
      wf_id: wf.id,
      prevFee: Number(wf.courier_fee) || 0,
      prevRateId: wf.courier_rate_id ?? null,
    }

    await svc.updateOrderWorkflows([
      { id: wf.id, courier_fee: fee, courier_rate_id: input.courier_rate_id ?? null },
    ])

    // Mirror it into the Cash Book, keyed to this order so it can only ever exist once.
    const [existing] = await acct.listLedgerEntries({
      source_type: "order",
      source_id: input.order_id,
    })

    if (fee > 0) {
      const row = {
        entry_date: new Date(),
        direction: "out" as const,
        category: "courier_fee" as const,
        amount: fee,
        currency_code: "bdt",
        description: `Courier fee — order ${input.order_id}`,
        reference: null,
        partner_id: null,
        source_type: "order" as const,
        source_id: input.order_id,
      }
      if (existing) {
        comp.prevLedger = { id: existing.id, amount: Number(existing.amount) }
        await acct.updateLedgerEntries([{ id: existing.id, amount: fee }])
      } else {
        const [created] = await acct.createLedgerEntries([row])
        comp.ledgerId = created.id
      }
    } else if (existing) {
      // Fee cleared → the expense must go too, or the books keep charging for a parcel we
      // aren't paying for.
      comp.prevLedger = { id: existing.id, amount: Number(existing.amount) }
      await acct.deleteLedgerEntries([existing.id])
    }

    return new StepResponse({ order_id: input.order_id, fee }, comp)
  },
  async (comp: Comp | undefined, { container }) => {
    if (!comp) return
    const svc: any = container.resolve(ORDER_PROCESSING_MODULE)
    const acct: any = container.resolve(ACCOUNTING_MODULE)

    await svc.updateOrderWorkflows([
      { id: comp.wf_id, courier_fee: comp.prevFee, courier_rate_id: comp.prevRateId },
    ])
    if (comp.ledgerId) await acct.deleteLedgerEntries([comp.ledgerId])
    else if (comp.prevLedger) {
      await acct
        .updateLedgerEntries([comp.prevLedger])
        .catch(() => acct.restoreLedgerEntries([comp.prevLedger.id]))
    }
  }
)
