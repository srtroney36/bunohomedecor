import {
  Badge,
  Button,
  DatePicker,
  Input,
  Label,
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

  return (
    <div className="flex flex-col gap-y-3 rounded-lg border border-ui-border-base p-3">
      <div className="flex items-center justify-between">
        <Text size="small" weight="plus">
          Stock
        </Text>
        <Badge size="2xsmall" color={stock && stock.current_qty > 0 ? "green" : "grey"}>
          {isLoading ? "…" : `${stock?.current_qty ?? 0} on shelf`}
        </Badge>
      </div>

      {/* mode toggle */}
      <div className="flex gap-2">
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
