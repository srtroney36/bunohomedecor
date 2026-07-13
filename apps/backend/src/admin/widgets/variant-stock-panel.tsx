import {
  Badge,
  Button,
  DatePicker,
  Drawer,
  Input,
  Label,
  Prompt,
  Select,
  Table,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { money } from "../lib/kpi"
import { BatchActions } from "../routes/accounting/sections/batch-actions"
import { stockApi } from "../lib/stock-api"

type Mode = "restock" | "found" | "shrinkage"
type Reason = "shrinkage" | "damage" | "correction"

/**
 * HARD ADJUST — "the real count is N". The sanctioned replacement for typing into Medusa's
 * native stock box (which the server now refuses).
 *
 * The delta is measured against BATCH-BACKED stock, not the shelf number, so this also heals
 * drift: afterwards on-shelf == batch-backed == target. Increasing demands a cost, because
 * those units become a cost layer.
 */
function HardAdjust({
  variantId,
  currentQty,
  batchBacked,
  lastCost,
  cur,
  onDone,
}: {
  variantId: string
  currentQty: number
  batchBacked: number
  lastCost: number
  cur: string
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [target, setTarget] = useState(String(currentQty))
  const [cost, setCost] = useState(lastCost > 0 ? String(lastCost) : "")
  const [reason, setReason] = useState<Reason>("correction")
  const [note, setNote] = useState("")

  const targetNum = Math.max(0, Number(target) || 0)
  const costNum = Number(cost) || 0
  const delta = targetNum - batchBacked
  const valid = delta > 0 ? costNum > 0 : true

  const run = useMutation({
    mutationFn: () =>
      stockApi.hardAdjust({
        variant_id: variantId,
        target_qty: targetNum,
        ...(delta > 0 ? { unit_cost: costNum } : {}),
        ...(delta < 0 ? { reason } : {}),
        note: note || null,
      }),
    onSuccess: () => {
      toast.success("Stock reconciled — shelf and books now agree")
      setConfirmOpen(false)
      setNote("")
      onDone()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const summary =
    delta > 0
      ? `${delta} extra unit(s) become a new cost layer at ${money(costNum, cur)}/unit. No cash moves.`
      : delta < 0
        ? `${Math.abs(delta)} unit(s) are written off at FIFO cost (${reason}). This reduces profit. No cash moves.`
        : "The books already say this. Only the on-shelf number is corrected."

  return (
    <>
      <Button
        size="small"
        variant="secondary"
        onClick={() => {
          setTarget(String(currentQty))
          setCost(lastCost > 0 ? String(lastCost) : "")
          setOpen(true)
        }}
      >
        Hard adjust…
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Hard adjust stock</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-y-4">
            <div className="rounded-lg bg-ui-bg-subtle p-3">
              <Text size="small" className="text-ui-fg-subtle">
                On shelf now: <b>{currentQty}</b> · Backed by batches: <b>{batchBacked}</b>
              </Text>
              {currentQty !== batchBacked && (
                <Text size="xsmall" className="text-ui-fg-error mt-1">
                  These disagree. Setting the true count will bring both into line.
                </Text>
              )}
            </div>

            <div className="flex flex-col gap-y-1">
              <Label size="small">True count (set stock to)</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>

            {delta > 0 && (
              <div className="flex flex-col gap-y-1">
                <Label size="small">Cost per unit for the {delta} extra (BDT)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0"
                />
                <Text size="xsmall" className="text-ui-fg-muted">
                  Required — these units become a cost layer. A layer worth zero would
                  understate COGS on every sale that draws from it.
                </Text>
              </div>
            )}

            {delta < 0 && (
              <div className="flex flex-col gap-y-1">
                <Label size="small">Reason for the {Math.abs(delta)} missing</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="correction">Count correction</Select.Item>
                    <Select.Item value="shrinkage">Shrinkage / lost</Select.Item>
                    <Select.Item value="damage">Damaged</Select.Item>
                  </Select.Content>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-y-1">
              <Label size="small">Note (optional)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <Text size="small" className="text-ui-fg-subtle">
              {summary}
            </Text>
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button variant="secondary">Cancel</Button>
            </Drawer.Close>
            <Button
              disabled={!valid}
              onClick={() => {
                setOpen(false)
                setConfirmOpen(true)
              }}
            >
              Review
            </Button>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>

      <Prompt open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Set stock to {targetNum}?</Prompt.Title>
            <Prompt.Description>
              On shelf {currentQty} → {targetNum}. Books {batchBacked} → {targetNum}. {summary}
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={() => run.mutate()}>Confirm</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </>
  )
}

/**
 * The per-variant stock panel shown on the product page: current quantity, a restock / found /
 * write-off form, and the FIFO batch + write-off log with edit/delete. It drives the exact
 * same workflows as the Accounting tab, so the two stay in sync.
 */
export function VariantStockPanel({ variantId, cur = "bdt" }: { variantId: string; cur?: string }) {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["variant-stock", variantId] })
    qc.invalidateQueries({ queryKey: ["variant-costs"] })
  }

  const { data: stock, isLoading } = useQuery({
    queryKey: ["variant-stock", variantId],
    queryFn: () => stockApi.get(variantId),
  })

  const [mode, setMode] = useState<Mode>("restock")
  const [quantity, setQuantity] = useState("")
  const [unitCost, setUnitCost] = useState("")
  const [freight, setFreight] = useState("0")
  const [date, setDate] = useState<Date>(new Date())
  const [supplier, setSupplier] = useState("")
  const [reason, setReason] = useState<"shrinkage" | "damage" | "correction">("shrinkage")
  const [note, setNote] = useState("")

  // Prefill the cost with the variant's latest landed cost once loaded.
  useEffect(() => {
    if (stock && unitCost === "" && stock.latest_cost > 0) setUnitCost(String(stock.latest_cost))
  }, [stock]) // eslint-disable-line react-hooks/exhaustive-deps

  const qtyNum = Number(quantity)
  const unitNum = Number(unitCost)
  const freightNum = Number(freight) || 0
  const landed = qtyNum > 0 && unitNum > 0 ? (qtyNum * unitNum + freightNum) / qtyNum : 0
  const valid =
    qtyNum > 0 && (mode === "shrinkage" ? true : mode === "found" ? unitNum >= 0 : unitNum > 0)

  const resetForm = () => {
    setQuantity("")
    setFreight("0")
    setSupplier("")
    setNote("")
    setReason("shrinkage")
    setDate(new Date())
  }

  const submit = useMutation({
    mutationFn: () => {
      if (mode === "restock") {
        return stockApi.restock({
          variant_id: variantId,
          quantity: qtyNum,
          unit_cost: unitNum,
          freight: freightNum,
          purchase_date: date.toISOString(),
          supplier: supplier || null,
        })
      }
      if (mode === "found") {
        return stockApi.adjust({
          variant_id: variantId,
          direction: "found",
          quantity: qtyNum,
          unit_cost: unitNum || 0,
          date: date.toISOString(),
          note: note || null,
        })
      }
      return stockApi.adjust({
        variant_id: variantId,
        direction: "shrinkage",
        quantity: qtyNum,
        date: date.toISOString(),
        reason,
        note: note || null,
      })
    },
    onSuccess: () => {
      toast.success(
        mode === "restock"
          ? "Restocked"
          : mode === "found"
            ? "Found stock added"
            : "Written off"
      )
      invalidate()
      resetForm()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const batches = stock?.batches ?? []
  const movements = stock?.movements ?? []

  /**
   * On shelf vs reserved vs available. A reservation holds units for an unfulfilled order — it
   * does NOT take them off the shelf, which is why placing an order used to look like an
   * instant deduction when only "on shelf" was shown. Stock physically leaves at fulfilment.
   *
   * Drift is on-shelf vs batch-backed ONLY. Reserved is irrelevant to it.
   */
  const currentQty = stock?.current_qty ?? 0
  const reservedQty = stock?.reserved_qty ?? 0
  const availableQty = stock?.available_qty ?? 0
  const batchBacked = batches.reduce((s, b) => s + b.remaining, 0)
  const drift = currentQty - batchBacked

  return (
    <div className="flex flex-col gap-y-3 rounded-lg border border-ui-border-base p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text size="small" weight="plus">
          Stock
        </Text>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge size="2xsmall" color={currentQty > 0 ? "green" : "grey"}>
            {isLoading ? "…" : `${currentQty} on shelf`}
          </Badge>
          {!isLoading && reservedQty > 0 && (
            <Badge size="2xsmall" color="orange">
              {reservedQty} reserved
            </Badge>
          )}
          {!isLoading && (
            <Badge size="2xsmall" color="blue">
              {availableQty} available
            </Badge>
          )}
          {!isLoading && (
            <HardAdjust
              variantId={variantId}
              currentQty={currentQty}
              batchBacked={batchBacked}
              lastCost={stock?.latest_cost ?? 0}
              cur={cur}
              onDone={invalidate}
            />
          )}
        </div>
      </div>

      {!isLoading && reservedQty > 0 && (
        <Text size="xsmall" className="text-ui-fg-muted">
          {reservedQty} unit(s) are held for orders that haven't shipped yet. They're still on the
          shelf — stock only leaves when you fulfil.
        </Text>
      )}

      {!isLoading && stock?.setup_problem && (
        <div className="rounded-lg border border-ui-border-error bg-ui-bg-subtle p-2">
          <Text size="xsmall" className="text-ui-fg-error">
            <b>Setup problem.</b> {stock.setup_problem.message}
          </Text>
        </div>
      )}

      {!isLoading && drift !== 0 && (
        <div className="rounded-lg border border-ui-border-error bg-ui-bg-subtle p-2">
          <Text size="xsmall" className="text-ui-fg-error">
            <b>Out of sync.</b> The shelf says {currentQty} but only {batchBacked} unit(s) are
            backed by cost batches
            {drift > 0
              ? ` — ${drift} unit(s) have no cost, so inventory value is understated.`
              : ` — ${Math.abs(drift)} costed unit(s) aren't on the shelf.`}{" "}
            Use Hard adjust to reconcile.
          </Text>
        </div>
      )}

      {/* mode toggle */}
      <div className="flex flex-wrap gap-2">
        {(["restock", "found", "shrinkage"] as Mode[]).map((m) => (
          <Button
            key={m}
            size="small"
            variant={mode === m ? "primary" : "secondary"}
            onClick={() => setMode(m)}
          >
            {m === "restock" ? "Restock" : m === "found" ? "Found" : "Write off"}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-y-1">
          <Label size="small">Quantity</Label>
          <Input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
          />
        </div>
        {mode !== "shrinkage" && (
          <div className="flex flex-col gap-y-1">
            <Label size="small">Cost / unit</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="0"
            />
          </div>
        )}
        {mode === "restock" && (
          <div className="flex flex-col gap-y-1">
            <Label size="small">Freight / extra</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={freight}
              onChange={(e) => setFreight(e.target.value)}
              placeholder="0"
            />
          </div>
        )}
        {mode === "shrinkage" && (
          <div className="flex flex-col gap-y-1">
            <Label size="small">Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="shrinkage">Shrinkage / lost</Select.Item>
                <Select.Item value="damage">Damaged</Select.Item>
                <Select.Item value="correction">Count correction</Select.Item>
              </Select.Content>
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-y-1">
          <Label size="small">Date</Label>
          <DatePicker value={date} onChange={(d) => d && setDate(d)} />
        </div>
      </div>

      {mode === "restock" ? (
        <div className="flex flex-col gap-y-1">
          <Label size="small">Supplier (optional)</Label>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </div>
      ) : (
        <div className="flex flex-col gap-y-1">
          <Label size="small">Note (optional)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <Text size="xsmall" className="text-ui-fg-muted">
          {mode === "restock" && `Landed ${money(landed, cur)}/unit`}
          {mode === "found" && "Adds a cost layer · no cash"}
          {mode === "shrinkage" && "Non-cash loss at FIFO cost"}
        </Text>
        <Button
          size="small"
          disabled={!valid || submit.isPending}
          isLoading={submit.isPending}
          onClick={() => submit.mutate()}
        >
          {mode === "restock" ? "Restock" : mode === "found" ? "Add" : "Write off"}
        </Button>
      </div>

      {/* log */}
      <div className="overflow-x-auto">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell className="text-right">In</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Landed</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {batches.map((b) => (
              <Table.Row key={b.id}>
                <Table.Cell className="whitespace-nowrap">
                  {new Date(b.received_date).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                  })}
                  {b.source !== "restock" && (
                    <Badge size="2xsmall" color="orange" className="ml-1">
                      {b.source}
                    </Badge>
                  )}
                </Table.Cell>
                <Table.Cell className="text-right">+{b.qty_received}</Table.Cell>
                <Table.Cell className="text-right">{money(b.landed_unit_cost, cur)}</Table.Cell>
                <Table.Cell className="whitespace-nowrap">
                  {b.remaining <= 0 ? (
                    <Badge size="2xsmall" color="grey">
                      Sold out ({b.sold}/{b.qty_received})
                    </Badge>
                  ) : (
                    <Badge size="2xsmall" color="green">
                      {b.remaining} left
                    </Badge>
                  )}
                </Table.Cell>
                <Table.Cell className="text-right">
                  <BatchActions
                    batch={b}
                    onChanged={invalidate}
                    onEdit={stockApi.editBatch}
                    onDelete={stockApi.deleteBatch}
                  />
                </Table.Cell>
              </Table.Row>
            ))}
            {movements.map((m) => (
              <Table.Row key={m.id}>
                <Table.Cell className="whitespace-nowrap">
                  {new Date(m.date).toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                </Table.Cell>
                <Table.Cell className="text-right text-ui-fg-error">−{m.quantity}</Table.Cell>
                <Table.Cell className="text-right">—</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color="red">
                    {m.reason}
                  </Badge>
                </Table.Cell>
                <Table.Cell />
              </Table.Row>
            ))}
            {batches.length === 0 && movements.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={5}>
                  <Text size="small" className="py-3 text-ui-fg-muted">
                    No stock movements yet.
                  </Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      </div>
    </div>
  )
}
