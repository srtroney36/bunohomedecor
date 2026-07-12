import { Plus, Spinner, Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  DatePicker,
  FocusModal,
  Input,
  Label,
  Select,
  Table,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { Kpi, money } from "../../../lib/kpi"
import { api, type LedgerEntry } from "../lib/api"
import {
  CATEGORY_META,
  KLASS_BADGE,
  MANUAL_CATEGORIES,
  PARTNER_REQUIRED,
} from "../lib/categories"

export function CashBookSection() {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["accounting", "ledger"],
    queryFn: () => api.ledger({ limit: 100 }),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounting"] })

  const del = useMutation({
    mutationFn: (id: string) => api.deleteLedger(id),
    onSuccess: () => {
      toast.success("Entry deleted")
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onDelete = async (e: LedgerEntry) => {
    if (e.source_type !== "manual") {
      toast.error("This row belongs to a Fixed Asset or Marketing record. Delete that instead.")
      return
    }
    const ok = await prompt({
      title: "Delete entry?",
      description: `${e.category_label} — ${money(e.amount, "bdt")}`,
    })
    if (ok) del.mutate(e.id)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16 text-ui-fg-subtle">
        <Spinner className="animate-spin" />
      </div>
    )
  }

  const entries = data?.ledger_entries ?? []
  const cur = "bdt"

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Text weight="plus">Cash Book</Text>
          <Text size="small" className="text-ui-fg-subtle">
            The full record of every money movement. Restocks, packaging, fixed assets,
            marketing and expenses are added from their own tabs and appear here tagged
            <b> auto</b>. Use "Record movement" only for partner capital in and out.
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
          <Plus /> Record movement
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Kpi label="Cash in" value={money(data.summary.cash_in, cur)} accent="green" />
          <Kpi label="Cash out" value={money(data.summary.cash_out, cur)} accent="red" />
          <Kpi label="Net cash movement" value={money(data.summary.cash_delta, cur)} />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-ui-border-base">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell>Category</Table.HeaderCell>
              <Table.HeaderCell>Class</Table.HeaderCell>
              <Table.HeaderCell>Description</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Amount</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {entries.map((e) => {
              const badge = KLASS_BADGE[e.klass]
              return (
                <Table.Row key={e.id}>
                  <Table.Cell className="whitespace-nowrap">
                    {new Date(e.entry_date).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </Table.Cell>
                  <Table.Cell>{e.category_label}</Table.Cell>
                  <Table.Cell>
                    <Badge size="2xsmall" color={badge.color}>
                      {badge.label}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell className="max-w-[220px] truncate">
                    {e.description || <span className="text-ui-fg-muted">—</span>}
                    {e.source_type !== "manual" && (
                      <Badge size="2xsmall" color="purple" className="ml-2">
                        auto
                      </Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell
                    className={`text-right font-medium ${
                      e.direction === "in" ? "text-ui-tag-green-text" : "text-ui-tag-red-text"
                    }`}
                  >
                    {e.direction === "in" ? "+" : "−"}
                    {money(e.amount, cur)}
                  </Table.Cell>
                  <Table.Cell>
                    {e.source_type === "manual" && (
                      <button
                        className="text-ui-fg-muted hover:text-ui-fg-error"
                        onClick={() => onDelete(e)}
                        aria-label="Delete entry"
                      >
                        <Trash />
                      </button>
                    )}
                  </Table.Cell>
                </Table.Row>
              )
            })}
            {entries.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={6}>
                  <Text size="small" className="py-4 text-ui-fg-muted">
                    No movements yet.
                  </Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </div>

      {open && <RecordModal onClose={() => setOpen(false)} onSaved={invalidate} />}
    </div>
  )
}

function RecordModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<string>("capital_contribution")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState<Date>(new Date())
  const [description, setDescription] = useState("")
  const [reference, setReference] = useState("")
  const [partnerId, setPartnerId] = useState("")

  const { data: partnersData } = useQuery({
    queryKey: ["accounting", "partners"],
    queryFn: () => api.partners(),
  })

  const meta = CATEGORY_META[category]
  const needsPartner = PARTNER_REQUIRED.includes(category)
  const amountNum = Number(amount)
  const valid = amountNum > 0 && (!needsPartner || !!partnerId)

  const create = useMutation({
    mutationFn: () =>
      api.createLedger({
        entry_date: date.toISOString(),
        category,
        amount: amountNum,
        description: description || null,
        reference: reference || null,
        partner_id: needsPartner ? partnerId : null,
      }),
    onSuccess: () => {
      toast.success("Movement recorded")
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
              <Label size="small">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {MANUAL_CATEGORIES.map((c) => (
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

            {needsPartner && (
              <div className="flex flex-col gap-y-1">
                <Label size="small">Partner</Label>
                <Select value={partnerId} onValueChange={setPartnerId}>
                  <Select.Trigger>
                    <Select.Value placeholder="Choose a partner" />
                  </Select.Trigger>
                  <Select.Content>
                    {(partnersData?.partners ?? []).map((p) => (
                      <Select.Item key={p.id} value={p.id}>
                        {p.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
            )}

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
                placeholder="What was this for?"
              />
            </div>
            <div className="flex flex-col gap-y-1">
              <Label size="small">Reference (optional)</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Invoice no., supplier…"
              />
            </div>
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}
