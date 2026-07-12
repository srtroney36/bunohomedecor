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
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { Kpi, money } from "../../../lib/kpi"
import { api, type MarketingSpend } from "../lib/api"
import { MARKETING_PLATFORMS, MARKETING_PLATFORM_LABELS } from "../lib/categories"

export function MarketingSection() {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["accounting", "marketing"],
    queryFn: () => api.marketing({ limit: 100 }),
  })
  const { data: byMonth } = useQuery({
    queryKey: ["accounting", "marketing", "summary", "month"],
    queryFn: () => api.marketingSummary("month"),
  })
  const { data: byPlatform } = useQuery({
    queryKey: ["accounting", "marketing", "summary", "platform"],
    queryFn: () => api.marketingSummary("platform"),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounting"] })

  const del = useMutation({
    mutationFn: (id: string) => api.deleteMarketing(id),
    onSuccess: () => {
      toast.success("Spend removed")
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onDelete = async (m: MarketingSpend) => {
    const ok = await prompt({
      title: "Delete this spend?",
      description: "This also removes the matching cash entry from the Cash Book.",
    })
    if (ok) del.mutate(m.id)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16 text-ui-fg-subtle">
        <Spinner className="animate-spin" />
      </div>
    )
  }

  const spends = data?.marketing_spends ?? []
  const cur = "bdt"

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Text weight="plus">Marketing</Text>
          <Text size="small" className="text-ui-fg-subtle">
            Ad spend by platform and campaign. A real expense — it reduces net profit here
            and on Sales Insights.
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
          <Plus /> Log spend
        </Button>
      </div>

      {/* Per-platform breakdown */}
      {byPlatform && byPlatform.groups.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {byPlatform.groups.map((g) => (
            <Kpi key={g.key} label={g.label} value={money(g.amount, cur)} />
          ))}
        </div>
      )}

      {/* Per-month */}
      {byMonth && byMonth.groups.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-ui-border-base">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Month</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Spend</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Entries</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {byMonth.groups.map((g) => (
                <Table.Row key={g.key}>
                  <Table.Cell>{g.label}</Table.Cell>
                  <Table.Cell className="text-right font-medium">
                    {money(g.amount, cur)}
                  </Table.Cell>
                  <Table.Cell className="text-right text-ui-fg-muted">{g.count}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}

      {/* Raw spend list */}
      <Text size="small" weight="plus" className="mt-2 text-ui-fg-subtle">
        All spend
      </Text>
      <div className="overflow-x-auto rounded-lg border border-ui-border-base">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell>Platform</Table.HeaderCell>
              <Table.HeaderCell>Campaign</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Amount</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {spends.map((m) => (
              <Table.Row key={m.id}>
                <Table.Cell className="whitespace-nowrap">
                  {new Date(m.spend_date).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Table.Cell>
                <Table.Cell>
                  {MARKETING_PLATFORM_LABELS[m.platform] ?? m.platform}
                </Table.Cell>
                <Table.Cell>
                  {m.campaign || <span className="text-ui-fg-muted">—</span>}
                </Table.Cell>
                <Table.Cell className="text-right font-medium">{money(m.amount, cur)}</Table.Cell>
                <Table.Cell>
                  <button
                    className="text-ui-fg-muted hover:text-ui-fg-error"
                    onClick={() => onDelete(m)}
                    aria-label="Remove spend"
                  >
                    <Trash />
                  </button>
                </Table.Cell>
              </Table.Row>
            ))}
            {spends.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <Text size="small" className="py-4 text-ui-fg-muted">
                    No marketing spend logged yet.
                  </Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </div>

      {open && <LogSpendModal onClose={() => setOpen(false)} onSaved={invalidate} />}
    </div>
  )
}

function LogSpendModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ platform: "facebook", campaign: "", amount: "", notes: "" })
  const [date, setDate] = useState<Date>(new Date())

  const amountNum = Number(form.amount)
  const valid = amountNum > 0

  const create = useMutation({
    mutationFn: () =>
      api.createMarketing({
        spend_date: date.toISOString(),
        platform: form.platform,
        campaign: form.campaign || null,
        amount: amountNum,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      toast.success("Spend logged")
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
            Log spend
          </Button>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col items-center py-8">
          <div className="flex w-full max-w-lg flex-col gap-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-y-1">
                <Label size="small">Platform</Label>
                <Select
                  value={form.platform}
                  onValueChange={(v) => setForm({ ...form, platform: v })}
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {MARKETING_PLATFORMS.map((p) => (
                      <Select.Item key={p} value={p}>
                        {MARKETING_PLATFORM_LABELS[p]}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="small">Date</Label>
                <DatePicker value={date} onChange={(d) => d && setDate(d)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-y-1">
                <Label size="small">Amount (BDT)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="small">Campaign (optional)</Label>
                <Input
                  value={form.campaign}
                  onChange={(e) => setForm({ ...form, campaign: e.target.value })}
                  placeholder="e.g. Eid sale"
                />
              </div>
            </div>
            <div className="flex flex-col gap-y-1">
              <Label size="small">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}
