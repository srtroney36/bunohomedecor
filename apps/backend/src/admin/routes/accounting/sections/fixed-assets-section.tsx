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
import { api, type FixedAsset } from "../lib/api"
import { FIXED_ASSET_CATEGORIES } from "../lib/categories"

export function FixedAssetsSection() {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["accounting", "fixed-assets"],
    queryFn: () => api.fixedAssets(),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounting"] })

  const del = useMutation({
    mutationFn: (id: string) => api.deleteFixedAsset(id),
    onSuccess: () => {
      toast.success("Fixed asset removed")
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onDelete = async (a: FixedAsset) => {
    const ok = await prompt({
      title: `Remove ${a.name}?`,
      description: "This also removes the matching cash entry from the Cash Book.",
    })
    if (ok) del.mutate(a.id)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16 text-ui-fg-subtle">
        <Spinner className="animate-spin" />
      </div>
    )
  }

  const assets = data?.fixed_assets ?? []
  const cur = "bdt"

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Text weight="plus">Fixed assets</Text>
          <Text size="small" className="text-ui-fg-subtle">
            One-time things the business owns. Recorded at cost, no depreciation. Each one
            writes a matching cash entry for you.
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
          <Plus /> Add asset
        </Button>
      </div>

      {data && (
        <Kpi label="Total fixed asset value" value={money(data.total_value, cur)} />
      )}

      <div className="overflow-x-auto rounded-lg border border-ui-border-base">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Asset</Table.HeaderCell>
              <Table.HeaderCell>Category</Table.HeaderCell>
              <Table.HeaderCell>Purchased</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Cost</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {assets.map((a) => (
              <Table.Row key={a.id}>
                <Table.Cell>
                  {a.name}
                  {a.supplier && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {a.supplier}
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell className="capitalize">{a.category}</Table.Cell>
                <Table.Cell className="whitespace-nowrap">
                  {new Date(a.purchase_date).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Table.Cell>
                <Table.Cell className="text-right font-medium">{money(a.cost, cur)}</Table.Cell>
                <Table.Cell>
                  <button
                    className="text-ui-fg-muted hover:text-ui-fg-error"
                    onClick={() => onDelete(a)}
                    aria-label="Remove asset"
                  >
                    <Trash />
                  </button>
                </Table.Cell>
              </Table.Row>
            ))}
            {assets.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <Text size="small" className="py-4 text-ui-fg-muted">
                    No fixed assets recorded.
                  </Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </div>

      {open && <AddAssetModal onClose={() => setOpen(false)} onSaved={invalidate} />}
    </div>
  )
}

function AddAssetModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "",
    category: "equipment",
    cost: "",
    supplier: "",
    notes: "",
  })
  const [date, setDate] = useState<Date>(new Date())

  const costNum = Number(form.cost)
  const valid = form.name.trim() && costNum > 0

  const create = useMutation({
    mutationFn: () =>
      api.createFixedAsset({
        name: form.name,
        category: form.category,
        purchase_date: date.toISOString(),
        cost: costNum,
        supplier: form.supplier || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      toast.success("Fixed asset added")
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
            Add asset
          </Button>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col items-center py-8">
          <div className="flex w-full max-w-lg flex-col gap-y-4">
            <div className="flex flex-col gap-y-1">
              <Label size="small">Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Packing table, DSLR camera"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-y-1">
                <Label size="small">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {FIXED_ASSET_CATEGORIES.map((c) => (
                      <Select.Item key={c} value={c} className="capitalize">
                        {c}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="small">Purchase date</Label>
                <DatePicker value={date} onChange={(d) => d && setDate(d)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-y-1">
                <Label size="small">Cost (BDT, total)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="small">Supplier (optional)</Label>
                <Input
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
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
