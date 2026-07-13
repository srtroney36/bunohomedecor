import { Spinner } from "@medusajs/icons"
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

import { StockHealthBanner } from "../../../widgets/stock-health-banner"
import { BatchActions } from "./batch-actions"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"

import { money } from "../../../lib/kpi"
import { api } from "../lib/api"

type Picked = { variant_id: string; label: string; sku: string | null; cost: number }

export function RestockSection() {
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<Picked | null>(null)

  // form state
  type Mode = "restock" | "found" | "shrinkage"
  const [mode, setMode] = useState<Mode>("restock")
  const [quantity, setQuantity] = useState("")
  const [unitCost, setUnitCost] = useState("")
  const [freight, setFreight] = useState("0")
  const [date, setDate] = useState<Date>(new Date())
  const [supplier, setSupplier] = useState("")
  const [reason, setReason] = useState<"shrinkage" | "damage" | "correction">("shrinkage")
  const [note, setNote] = useState("")

  const { data: results, isFetching } = useQuery({
    queryKey: ["accounting", "variants", search],
    queryFn: () => api.variants(search),
    enabled: !picked, // stop searching once a variant is chosen
  })

  // Every FIFO cost layer, newest first — with how far each has sold down.
  const { data: batchData } = useQuery({
    queryKey: ["accounting", "batches"],
    queryFn: () => api.batches(),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounting"] })

  const qtyNum = Number(quantity)
  const unitNum = Number(unitCost)
  const freightNum = Number(freight) || 0
  const cashOut = qtyNum > 0 && unitNum > 0 ? qtyNum * unitNum + freightNum : 0
  const landed = qtyNum > 0 ? cashOut / qtyNum : 0
  const valid =
    !!picked &&
    qtyNum > 0 &&
    (mode === "shrinkage" ? true : mode === "found" ? unitNum >= 0 : unitNum > 0)

  const reset = () => {
    setPicked(null)
    setSearch("")
    setMode("restock")
    setQuantity("")
    setUnitCost("")
    setFreight("0")
    setSupplier("")
    setReason("shrinkage")
    setNote("")
    setDate(new Date())
  }

  const submit = useMutation({
    mutationFn: () => {
      if (mode === "restock") {
        return api.restock({
          variant_id: picked!.variant_id,
          quantity: qtyNum,
          unit_cost: unitNum,
          freight: freightNum,
          purchase_date: date.toISOString(),
          supplier: supplier || null,
        })
      }
      if (mode === "found") {
        return api.adjustStock({
          variant_id: picked!.variant_id,
          direction: "found",
          quantity: qtyNum,
          unit_cost: unitNum || 0,
          date: date.toISOString(),
          note: note || null,
        })
      }
      return api.adjustStock({
        variant_id: picked!.variant_id,
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
          ? "Restocked — stock raised, batch recorded, cash booked"
          : mode === "found"
            ? "Found stock added — new cost layer, no cash moved"
            : "Written off — stock lowered, booked as a non-cash loss"
      )
      invalidate()
      reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const choose = (v: Picked) => {
    setPicked(v)
    if (v.cost > 0) setUnitCost(String(v.cost))
  }

  const cur = "bdt"
  const batches = useMemo(() => batchData?.batches ?? [], [batchData])

  return (
    <div className="flex flex-col gap-y-4">
      {/* Restock is blocked while the setup is broken — this is how you unblock it. */}
      <StockHealthBanner />

      <div>
        <Text weight="plus">Restock inventory</Text>
        <Text size="small" className="text-ui-fg-subtle">
          Records a purchase in one step: it raises the product's stock in the store AND books
          the cash you paid in the Cash Book. Net worth stays put — cash becomes goods.
        </Text>
      </div>

      {!picked ? (
        <div className="flex flex-col gap-y-2">
          <Label size="small">Find a product to restock</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name…"
          />
          <div className="rounded-lg border border-ui-border-base divide-y divide-ui-border-base">
            {isFetching && (
              <div className="flex items-center gap-x-2 p-3 text-ui-fg-subtle">
                <Spinner className="animate-spin" /> <Text size="small">Searching…</Text>
              </div>
            )}
            {!isFetching &&
              (results?.variants ?? []).map((v) => (
                <button
                  key={v.variant_id}
                  className="flex w-full items-center justify-between p-3 text-left hover:bg-ui-bg-base-hover"
                  onClick={() => choose(v)}
                >
                  <div className="min-w-0">
                    <Text size="small" className="truncate">
                      {v.label}
                    </Text>
                    {v.sku && (
                      <Text size="xsmall" className="text-ui-fg-muted truncate">
                        {v.sku}
                      </Text>
                    )}
                  </div>
                  <Text size="xsmall" className="text-ui-fg-muted whitespace-nowrap">
                    cost {money(v.cost, cur)}
                  </Text>
                </button>
              ))}
            {!isFetching && (results?.variants ?? []).length === 0 && (
              <Text size="small" className="p-3 text-ui-fg-muted">
                {search ? "No products match." : "Type to search your products."}
              </Text>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-y-4 rounded-lg border border-ui-border-base p-4">
          <div className="flex items-center justify-between">
            <div>
              <Text size="small" weight="plus">
                {picked.label}
              </Text>
              {picked.sku && (
                <Text size="xsmall" className="text-ui-fg-muted">
                  {picked.sku}
                </Text>
              )}
            </div>
            <Button size="small" variant="transparent" onClick={reset}>
              Change
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["restock", "found", "shrinkage"] as Mode[]).map((m) => (
              <Button
                key={m}
                size="small"
                variant={mode === m ? "primary" : "secondary"}
                onClick={() => setMode(m)}
              >
                {m === "restock" ? "Restock" : m === "found" ? "Found stock" : "Write off"}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
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
                <Label size="small">Cost per unit (BDT)</Label>
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
                <Label size="small">Freight / extra (BDT)</Label>
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

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ui-bg-subtle p-3">
            <Text size="small" className="text-ui-fg-subtle">
              {mode === "restock" && (
                <>
                  Cash out: <b>{money(cashOut, cur)}</b> · Stock: <b>+{qtyNum || 0}</b> · Landed:{" "}
                  <b>{money(landed, cur)}</b>/unit
                </>
              )}
              {mode === "found" && (
                <>
                  Stock: <b>+{qtyNum || 0}</b> · New layer @ <b>{money(unitNum || 0, cur)}</b>/unit ·
                  no cash
                </>
              )}
              {mode === "shrinkage" && (
                <>
                  Stock: <b>−{qtyNum || 0}</b> · booked as a non-cash loss at FIFO cost
                </>
              )}
            </Text>
            <Button
              size="small"
              disabled={!valid || submit.isPending}
              isLoading={submit.isPending}
              onClick={() => submit.mutate()}
            >
              {mode === "restock" ? "Restock" : mode === "found" ? "Add found stock" : "Write off"}
            </Button>
          </div>
        </div>
      )}

      <Text size="small" weight="plus" className="mt-2 text-ui-fg-subtle">
        Stock batches (FIFO cost layers)
      </Text>
      <div className="overflow-x-auto rounded-lg border border-ui-border-base">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell>Product</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Received</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Landed / unit</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Cash paid</Table.HeaderCell>
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
                    year: "numeric",
                  })}
                </Table.Cell>
                <Table.Cell className="max-w-[260px]">
                  <div className="truncate">{b.label}</div>
                  {b.source !== "restock" && (
                    <Badge size="2xsmall" color="orange" className="mt-1">
                      {b.source}
                    </Badge>
                  )}
                </Table.Cell>
                <Table.Cell className="text-right">{b.qty_received}</Table.Cell>
                <Table.Cell className="text-right">{money(b.landed_unit_cost, cur)}</Table.Cell>
                <Table.Cell className="text-right font-medium">
                  {b.cash_paid ? money(b.cash_paid, cur) : "—"}
                </Table.Cell>
                <Table.Cell className="whitespace-nowrap">
                  {b.remaining <= 0 ? (
                    <Badge size="2xsmall" color="grey">
                      Sold out ({b.sold}/{b.qty_received})
                    </Badge>
                  ) : (
                    <Badge size="2xsmall" color="green">
                      {b.remaining} left ({b.sold}/{b.qty_received} sold)
                    </Badge>
                  )}
                </Table.Cell>
                <Table.Cell className="text-right">
                  <BatchActions
                    batch={b}
                    onChanged={invalidate}
                    onEdit={api.editBatch}
                    onDelete={api.deleteBatch}
                  />
                </Table.Cell>
              </Table.Row>
            ))}
            {batches.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={7}>
                  <Text size="small" className="py-4 text-ui-fg-muted">
                    No stock batches recorded yet.
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
