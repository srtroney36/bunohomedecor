import { Plus, Spinner, Trash } from "@medusajs/icons"
import {
  Button,
  DatePicker,
  FocusModal,
  Input,
  Label,
  Table,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { Kpi, money } from "../../../lib/kpi"
import { api, type LedgerEntry } from "../lib/api"

export function PackagingSection() {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const [open, setOpen] = useState(false)

  // Pool figures (bought / used / remaining) come from the dashboard, which derives
  // "used" from orders. The purchases list comes from the ledger.
  const { data: dash, isLoading: dashLoading } = useQuery({
    queryKey: ["accounting", "dashboard"],
    queryFn: () => api.dashboard(),
  })
  const { data: purchases, isLoading: listLoading } = useQuery({
    queryKey: ["accounting", "ledger", "packaging"],
    queryFn: () => api.ledger({ category: "packaging_purchase", limit: 100 }),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounting"] })

  const del = useMutation({
    mutationFn: (id: string) => api.deleteLedger(id),
    onSuccess: () => {
      toast.success("Packaging purchase removed")
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onDelete = async (e: LedgerEntry) => {
    const ok = await prompt({
      title: "Delete this packaging purchase?",
      description: `${money(e.amount, "bdt")} — removes it from the pool.`,
    })
    if (ok) del.mutate(e.id)
  }

  if (dashLoading || listLoading) {
    return (
      <div className="flex justify-center py-16 text-ui-fg-subtle">
        <Spinner className="animate-spin" />
      </div>
    )
  }

  const cur = "bdt"
  const pool = dash?.packaging?.pool ?? 0
  const rows = purchases?.ledger_entries ?? []

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Text weight="plus">Packaging pool</Text>
          <Text size="small" className="text-ui-fg-subtle">
            Buy packaging to top up the pool. Each order draws its per-unit presets out as it's
            placed. Set the preset for each product on its product page (Cost &amp; Packaging).
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
          <Plus /> Buy packaging
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Kpi label="Packaging bought" value={money(dash?.packaging?.bought ?? 0, cur)} />
        <Kpi
          label="Packaging used"
          value={money(dash?.packaging?.used ?? 0, cur)}
          hint="Drawn by orders (per unit)"
        />
        <Kpi
          label="Pool remaining"
          value={money(pool, cur)}
          hint={pool < 0 ? "Negative — raise your presets" : "Packaging on hand"}
          accent={pool < 0 ? "red" : "base"}
          emphasis
        />
      </div>

      {pool < 0 && (
        <div className="rounded-lg border border-ui-tag-red-border bg-ui-tag-red-bg p-3">
          <Text size="small" className="text-ui-tag-red-text">
            The pool is negative: orders have drawn more packaging than you've bought. That
            usually means your per-product packaging presets are lower than what packaging
            actually costs you. Raise the presets on your product pages, or record the
            packaging you've bought.
          </Text>
        </div>
      )}

      <Text size="small" weight="plus" className="mt-2 text-ui-fg-subtle">
        Packaging purchases
      </Text>
      <div className="overflow-x-auto rounded-lg border border-ui-border-base">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell>Description</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Amount</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((e) => (
              <Table.Row key={e.id}>
                <Table.Cell className="whitespace-nowrap">
                  {new Date(e.entry_date).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Table.Cell>
                <Table.Cell>
                  {e.description || <span className="text-ui-fg-muted">—</span>}
                </Table.Cell>
                <Table.Cell className="text-right font-medium">{money(e.amount, cur)}</Table.Cell>
                <Table.Cell>
                  <button
                    className="text-ui-fg-muted hover:text-ui-fg-error"
                    onClick={() => onDelete(e)}
                    aria-label="Remove packaging purchase"
                  >
                    <Trash />
                  </button>
                </Table.Cell>
              </Table.Row>
            ))}
            {rows.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={4}>
                  <Text size="small" className="py-4 text-ui-fg-muted">
                    No packaging purchases yet.
                  </Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </div>

      {open && <BuyModal onClose={() => setOpen(false)} onSaved={invalidate} />}
    </div>
  )
}

function BuyModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState<Date>(new Date())
  const [description, setDescription] = useState("")

  const amountNum = Number(amount)
  const valid = amountNum > 0

  const create = useMutation({
    mutationFn: () =>
      api.createLedger({
        entry_date: date.toISOString(),
        category: "packaging_purchase",
        amount: amountNum,
        description: description || null,
      }),
    onSuccess: () => {
      toast.success("Packaging purchase recorded")
      onSaved()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <FocusModal open onOpenChange={(v) => !v && onClose()}>
      <FocusModal.Content>
        <FocusModal.Header>
          <Button
            size="small"
            disabled={!valid || create.isPending}
            isLoading={create.isPending}
            onClick={() => create.mutate()}
          >
            Record
          </Button>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col items-center py-8">
          <div className="flex w-full max-w-lg flex-col gap-y-4">
            <Text size="small" className="text-ui-fg-subtle">
              This tops up the packaging pool. It's an asset, not an expense — the money
              becomes a cost only as orders draw packaging out of the pool.
            </Text>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-y-1">
                <Label size="small">Amount (BDT)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="small">Date</Label>
                <DatePicker value={date} onChange={(d) => d && setDate(d)} />
              </div>
            </div>
            <div className="flex flex-col gap-y-1">
              <Label size="small">Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. 200 boxes + bubble wrap"
              />
            </div>
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}
