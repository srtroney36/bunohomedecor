import { LockClosedSolid, PencilSquare, Plus, Spinner, Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  DatePicker,
  Drawer,
  FocusModal,
  IconButton,
  Input,
  Label,
  Prompt,
  Select,
  Table,
  Text,
  Textarea,
  Tooltip,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { Kpi, money } from "../../../lib/kpi"
import { usePermissions } from "../../../lib/permissions"
import { api, type LedgerEntry } from "../lib/api"
import {
  CATEGORY_META,
  KLASS_BADGE,
  MANUAL_CATEGORIES,
  PARTNER_REQUIRED,
} from "../lib/categories"

export function CashBookSection() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["accounting", "ledger"],
    queryFn: () => api.ledger({ limit: 100 }),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounting"] })

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
                  <Table.Cell className="text-right">
                    <EntryActions e={e} onChanged={invalidate} />
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

/**
 * Edit / delete one cash movement.
 *
 * Two gates, both required. The SERVER decides whether the row may be touched at all
 * (`can_edit` / `can_delete` — a fixed asset's mirrored row, or a restock still tied to its
 * stock batch, is locked and says where to change it instead). RBAC decides whether YOU may:
 * editing needs accounting:write, deleting needs accounting:delete.
 *
 * Both actions end in an explicit confirmation that spells out the consequence, because every
 * figure on the dashboard is a sum over this table — a wrong edit silently moves net worth.
 */
function EntryActions({ e, onChanged }: { e: LedgerEntry; onChanged: () => void }) {
  const { can } = usePermissions()
  const mayWrite = can("accounting", "write")
  const mayDelete = can("accounting", "delete")

  const [editOpen, setEditOpen] = useState(false)
  const [confirmEdit, setConfirmEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [category, setCategory] = useState(e.category)
  const [amount, setAmount] = useState(String(e.amount))
  const [date, setDate] = useState<Date>(new Date(e.entry_date))
  const [description, setDescription] = useState(e.description ?? "")
  const [reference, setReference] = useState(e.reference ?? "")
  const [partnerId, setPartnerId] = useState(e.partner_id ?? "")

  const { data: partnersData } = useQuery({
    queryKey: ["accounting", "partners"],
    queryFn: () => api.partners(),
    enabled: editOpen,
  })

  // Only a hand-entered row may be re-categorised; a restock orphan stays an inventory purchase.
  const isManual = e.source_type === "manual"
  const needsPartner = PARTNER_REQUIRED.includes(category)
  const amountNum = Number(amount)
  const valid = amountNum > 0 && (!needsPartner || !!partnerId)

  const reset = () => {
    setCategory(e.category)
    setAmount(String(e.amount))
    setDate(new Date(e.entry_date))
    setDescription(e.description ?? "")
    setReference(e.reference ?? "")
    setPartnerId(e.partner_id ?? "")
  }

  const save = useMutation({
    mutationFn: () =>
      api.updateLedger(e.id, {
        entry_date: date.toISOString(),
        ...(isManual ? { category } : {}),
        amount: amountNum,
        description: description || null,
        reference: reference || null,
        partner_id: needsPartner ? partnerId : null,
      }),
    onSuccess: () => {
      toast.success("Entry updated — cash, net worth and the P&L follow automatically")
      setConfirmEdit(false)
      setEditOpen(false)
      onChanged()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const del = useMutation({
    mutationFn: () => api.deleteLedger(e.id),
    onSuccess: () => {
      toast.success("Entry deleted")
      setConfirmDelete(false)
      onChanged()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Locked by the server (owned by a register or by a live stock batch) — say why.
  if (!e.can_edit && !e.can_delete) {
    return (
      <Tooltip content={e.locked_reason ?? "Managed from its own tab."}>
        <span className="inline-flex text-ui-fg-muted">
          <LockClosedSolid />
        </span>
      </Tooltip>
    )
  }

  const showEdit = e.can_edit && mayWrite
  const showDelete = e.can_delete && mayDelete

  if (!showEdit && !showDelete) {
    return (
      <Tooltip content="You don't have permission to change cash entries.">
        <span className="inline-flex text-ui-fg-muted">
          <LockClosedSolid />
        </span>
      </Tooltip>
    )
  }

  const amountChanged = amountNum !== e.amount

  return (
    <div className="flex items-center justify-end gap-x-1">
      {showEdit && (
        <IconButton
          size="small"
          variant="transparent"
          aria-label="Edit entry"
          onClick={() => {
            reset()
            setEditOpen(true)
          }}
        >
          <PencilSquare />
        </IconButton>
      )}
      {showDelete && (
        <IconButton
          size="small"
          variant="transparent"
          aria-label="Delete entry"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash />
        </IconButton>
      )}

      {/* Edit */}
      <Drawer open={editOpen} onOpenChange={setEditOpen}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Edit cash movement</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-y-4">
            {!isManual && (
              <Text size="xsmall" className="text-ui-fg-muted">
                This is a leftover restock row with no stock batch behind it. You can correct or
                remove it, but its category stays <b>{e.category_label}</b>.
              </Text>
            )}

            {isManual && (
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
                {CATEGORY_META[category] && (
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {CATEGORY_META[category].help}
                  </Text>
                )}
              </div>
            )}

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
                  onChange={(ev) => setAmount(ev.target.value)}
                />
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="small">Date</Label>
                <DatePicker value={date} onChange={(d) => d && setDate(d)} />
              </div>
            </div>

            <div className="flex flex-col gap-y-1">
              <Label size="small">Description</Label>
              <Input value={description} onChange={(ev) => setDescription(ev.target.value)} />
            </div>
            <div className="flex flex-col gap-y-1">
              <Label size="small">Reference (optional)</Label>
              <Input value={reference} onChange={(ev) => setReference(ev.target.value)} />
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button variant="secondary">Cancel</Button>
            </Drawer.Close>
            <Button
              disabled={!valid}
              onClick={() => {
                setEditOpen(false)
                setConfirmEdit(true)
              }}
            >
              Review
            </Button>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>

      <Prompt open={confirmEdit} onOpenChange={setConfirmEdit}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Save this change?</Prompt.Title>
            <Prompt.Description>
              {amountChanged
                ? `Amount ${money(e.amount, "bdt")} → ${money(amountNum, "bdt")}. `
                : ""}
              This updates cash on hand, net worth and the P&amp;L everywhere they appear.
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={() => save.mutate()}>Save</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>

      {/* Delete */}
      <Prompt open={confirmDelete} onOpenChange={setConfirmDelete} variant="danger">
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Delete this entry?</Prompt.Title>
            <Prompt.Description>
              {e.category_label} — {money(e.amount, "bdt")} on{" "}
              {new Date(e.entry_date).toLocaleDateString("en-US", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {e.description ? ` · ${e.description}` : ""}. This removes the money from the books:
              cash on hand, net worth and the P&amp;L all change. It cannot be undone.
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={() => del.mutate()}>Delete</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
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
