import { EllipsisHorizontal } from "@medusajs/icons"
import {
  Button,
  DatePicker,
  DropdownMenu,
  Drawer,
  IconButton,
  Input,
  Label,
  Prompt,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"

import { type Batch } from "../lib/api"

/**
 * Row actions for a stock batch: Edit (a drawer) and Delete (a confirm). Both go through a
 * workflow, so a change here reverses/adjusts stock, cash and COGS everywhere.
 *
 * The actual edit/delete calls are injected so the SAME component works from the
 * accounting-gated tables and from the product-page panel (which is gated on product_cost),
 * each hitting the route its permission allows.
 */
export function BatchActions({
  batch,
  onChanged,
  onEdit,
  onDelete,
}: {
  batch: Batch
  onChanged: () => void
  onEdit: (id: string, body: Record<string, unknown>) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [unitCost, setUnitCost] = useState(String(batch.unit_cost))
  const [freight, setFreight] = useState(String(batch.freight_total))
  const [qty, setQty] = useState(String(batch.qty_received))
  const [date, setDate] = useState<Date>(new Date(batch.received_date))
  const [supplier, setSupplier] = useState(batch.supplier ?? "")
  const [note, setNote] = useState(batch.note ?? "")

  const isRestock = batch.source === "restock"

  const save = useMutation({
    mutationFn: () =>
      onEdit(batch.id, {
        unit_cost: Number(unitCost) || 0,
        freight_total: Number(freight) || 0,
        qty_received: Number(qty) || batch.qty_received,
        received_date: date.toISOString(),
        supplier: supplier || null,
        note: note || null,
      }),
    onSuccess: () => {
      toast.success("Batch updated")
      setEditOpen(false)
      onChanged()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: () => onDelete(batch.id),
    onSuccess: () => {
      toast.success("Batch deleted — stock and cash reversed")
      setDeleteOpen(false)
      onChanged()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <IconButton size="small" variant="transparent">
            <EllipsisHorizontal />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item onClick={() => setEditOpen(true)}>Edit</DropdownMenu.Item>
          <DropdownMenu.Item onClick={() => setDeleteOpen(true)}>Delete</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>

      <Drawer open={editOpen} onOpenChange={setEditOpen}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Edit batch — {batch.label}</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-y-1">
                <Label size="small">Cost per unit</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                />
              </div>
              {isRestock && (
                <div className="flex flex-col gap-y-1">
                  <Label size="small">Freight / extra</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={freight}
                    onChange={(e) => setFreight(e.target.value)}
                  />
                </div>
              )}
              <div className="flex flex-col gap-y-1">
                <Label size="small">Quantity received</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
                <span className="text-ui-fg-muted text-xs">
                  Already sold: {batch.sold}. Can't go below that.
                </span>
              </div>
              <div className="flex flex-col gap-y-1">
                <Label size="small">Received date</Label>
                <DatePicker value={date} onChange={(d) => d && setDate(d)} />
              </div>
            </div>
            {isRestock && (
              <div className="flex flex-col gap-y-1">
                <Label size="small">Supplier</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </div>
            )}
            <div className="flex flex-col gap-y-1">
              <Label size="small">Note</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button variant="secondary">Cancel</Button>
            </Drawer.Close>
            <Button onClick={() => save.mutate()} isLoading={save.isPending}>
              Save
            </Button>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>

      <Prompt open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Delete this batch?</Prompt.Title>
            <Prompt.Description>
              This removes the cost layer, lowers the stock it added and reverses its cash row.
              A batch that has already started selling can't be deleted — edit it instead.
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={() => remove.mutate()}>Delete</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </>
  )
}
