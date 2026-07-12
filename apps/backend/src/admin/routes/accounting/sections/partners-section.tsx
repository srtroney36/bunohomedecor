import { Plus, Spinner, Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  FocusModal,
  Input,
  Label,
  Table,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { money } from "../../../lib/kpi"
import { api, type Partner } from "../lib/api"

export function PartnersSection() {
  const qc = useQueryClient()
  const prompt = usePrompt()
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["accounting", "partners"],
    queryFn: () => api.partners(),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounting"] })

  const del = useMutation({
    mutationFn: (id: string) => api.deletePartner(id),
    onSuccess: () => {
      toast.success("Partner removed")
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onDelete = async (p: Partner) => {
    const ok = await prompt({
      title: `Remove ${p.name}?`,
      description:
        "Only possible if they have no capital in the pool. Otherwise mark them inactive.",
    })
    if (ok) del.mutate(p.id)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16 text-ui-fg-subtle">
        <Spinner className="animate-spin" />
      </div>
    )
  }

  const partners = data?.partners ?? []
  const cur = "bdt"

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Text weight="plus">The investment pool</Text>
          <Text size="small" className="text-ui-fg-subtle">
            Each partner's position is derived from the Cash Book — record contributions and
            drawings there against a partner.
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
          <Plus /> Add partner
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Summary label="Capital contributed" value={money(data.totals.capital_contributed, cur)} />
          <Summary label="Partner drawings" value={money(data.totals.partner_drawings, cur)} />
          <Summary label="Total invested (net)" value={money(data.totals.total_invested, cur)} />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-ui-border-base">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Partner</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Invested</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Drawn</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Net</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {partners.map((p) => (
              <Table.Row key={p.id}>
                <Table.Cell>
                  <div className="flex items-center gap-x-2">
                    <span>{p.name}</span>
                    {!p.is_active && <Badge size="2xsmall" color="grey">Inactive</Badge>}
                  </div>
                  {p.phone && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {p.phone}
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell className="text-right">{money(p.invested, cur)}</Table.Cell>
                <Table.Cell className="text-right">{money(p.drawn, cur)}</Table.Cell>
                <Table.Cell className="text-right font-medium">{money(p.net, cur)}</Table.Cell>
                <Table.Cell>
                  <button
                    className="text-ui-fg-muted hover:text-ui-fg-error"
                    onClick={() => onDelete(p)}
                    aria-label="Remove partner"
                  >
                    <Trash />
                  </button>
                </Table.Cell>
              </Table.Row>
            ))}
            {partners.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <Text size="small" className="py-4 text-ui-fg-muted">
                    No partners yet. Add the people who put capital into the business.
                  </Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </div>

      {open && <AddPartnerModal onClose={() => setOpen(false)} onSaved={invalidate} />}
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ui-border-base p-3">
      <Text size="xsmall" className="text-ui-fg-muted">
        {label}
      </Text>
      <Text className="text-lg font-semibold">{value}</Text>
    </div>
  )
}

function AddPartnerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" })

  const create = useMutation({
    mutationFn: () =>
      api.createPartner({
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      toast.success("Partner added")
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
            disabled={!form.name.trim() || create.isPending}
            isLoading={create.isPending}
            onClick={() => create.mutate()}
          >
            Add partner
          </Button>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col items-center py-8">
          <div className="flex w-full max-w-lg flex-col gap-y-4">
            <div className="flex flex-col gap-y-1">
              <Label size="small">Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Partner name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-y-1">
                <Label size="small">Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="small">Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
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
