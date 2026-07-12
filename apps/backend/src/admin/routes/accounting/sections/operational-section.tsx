import { Plus, Spinner, Trash } from "@medusajs/icons"
import {
  Button,
  DatePicker,
  FocusModal,
  Input,
  Label,
  Select,
  Table,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"

import { Kpi, money } from "../../../lib/kpi"
import { api, type LedgerEntry } from "../lib/api"
import { CATEGORY_META, OPERATIONAL_CATEGORIES } from "../lib/categories"

export function OperationalSection() {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const [open, setOpen] = useState(false)

  // One query per category, merged — the ledger list endpoint filters by a single category.
  const results = useQueries({
    queries: OPERATIONAL_CATEGORIES.map((c) => ({
      queryKey: ["accounting", "ledger", c],
      queryFn: () => api.ledger({ category: c, limit: 100 }),
    })),
  })

  const loading = results.some((r) => r.isLoading)
  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounting"] })

  const entries = useMemo(() => {
    const all: LedgerEntry[] = results.flatMap((r) => r.data?.ledger_entries ?? [])
    return all.sort((a, b) => +new Date(b.entry_date) - +new Date(a.entry_date))
  }, [results])

  const total = entries.reduce((s, e) => s + e.amount, 0)

  const del = useMutation({
    mutationFn: (id: string) => api.deleteLedger(id),
    onSuccess: () => {
      toast.success("Expense removed")
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onDelete = async (e: LedgerEntry) => {
    const ok = await prompt({
      title: "Delete this expense?",
      description: `${e.category_label} — ${money(e.amount, "bdt")}`,
    })
    if (ok) del.mutate(e.id)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-ui-fg-subtle">
        <Spinner className="animate-spin" />
      </div>
    )
  }

  const cur = "bdt"

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Text weight="plus">Operational expenses</Text>
          <Text size="small" className="text-ui-fg-subtle">
            Real running costs — rent, utilities, salaries, courier fees, refunds. Each one
            reduces net profit. (Courier fees are manual for now; automatic pull from your
            delivery partner is planned.)
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
          <Plus /> Add expense
        </Button>
      </div>

      <Kpi label="Total operational expenses" value={money(total, cur)} accent="red" />

      <div className="overflow-x-auto rounded-lg border border-ui-border-base">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell>Type</Table.HeaderCell>
              <Table.HeaderCell>Description</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Amount</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {entries.map((e) => (
              <Table.Row key={e.id}>
                <Table.Cell className="whitespace-nowrap">
                  {new Date(e.entry_date).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Table.Cell>
                <Table.Cell>{e.category_label}</Table.Cell>
                <Table.Cell className="max-w-[280px] truncate">
                  {e.description || <span className="text-ui-fg-muted">—</span>}
                </Table.Cell>
                <Table.Cell className="text-right font-medium text-ui-tag-red-text">
                  {money(e.amount, cur)}
                </Table.Cell>
                <Table.Cell>
                  {e.source_type === "manual" && (
                    <button
                      className="text-ui-fg-muted hover:text-ui-fg-error"
                      onClick={() => onDelete(e)}
                      aria-label="Delete expense"
                    >
                      <Trash />
                    </button>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
            {entries.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <Text size="small" className="py-4 text-ui-fg-muted">
                    No operational expenses recorded yet.
                  </Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </div>

      {open && <AddExpenseModal onClose={() => setOpen(false)} onSaved={invalidate} />}
    </div>
  )
}

function AddExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<string>("other_expense")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState<Date>(new Date())
  const [description, setDescription] = useState("")

  const amountNum = Number(amount)
  const valid = amountNum > 0
  const meta = CATEGORY_META[category]

  const create = useMutation({
    mutationFn: () =>
      api.createLedger({
        entry_date: date.toISOString(),
        category,
        amount: amountNum,
        description: description || null,
      }),
    onSuccess: () => {
      toast.success("Expense recorded")
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
            <div className="flex flex-col gap-y-1">
              <Label size="small">Type</Label>
              <Select value={category} onValueChange={setCategory}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {OPERATIONAL_CATEGORIES.map((c) => (
                    <Select.Item key={c} value={c}>
                      {CATEGORY_META[c].label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
              {meta && (
                <Text size="xsmall" className="text-ui-fg-muted">
                  {meta.help}
                </Text>
              )}
            </div>

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
                placeholder="e.g. October rent, electricity bill"
              />
            </div>
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}
