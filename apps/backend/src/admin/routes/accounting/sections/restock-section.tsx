import { Spinner } from "@medusajs/icons"
import {
  Button,
  DatePicker,
  Input,
  Label,
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
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
  const [quantity, setQuantity] = useState("")
  const [unitCost, setUnitCost] = useState("")
  const [freight, setFreight] = useState("0")
  const [updateCost, setUpdateCost] = useState(true)
  const [date, setDate] = useState<Date>(new Date())
  const [supplier, setSupplier] = useState("")

  const { data: results, isFetching } = useQuery({
    queryKey: ["accounting", "variants", search],
    queryFn: () => api.variants(search),
    enabled: !picked, // stop searching once a variant is chosen
  })

  // Recent restocks are just the inventory_purchase ledger rows.
  const { data: recent } = useQuery({
    queryKey: ["accounting", "ledger", "inventory_purchase"],
    queryFn: () => api.ledger({ category: "inventory_purchase", limit: 20 }),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounting"] })

  const qtyNum = Number(quantity)
  const unitNum = Number(unitCost)
  const freightNum = Number(freight) || 0
  const cashOut = qtyNum > 0 && unitNum > 0 ? qtyNum * unitNum + freightNum : 0
  const landed = qtyNum > 0 ? cashOut / qtyNum : 0
  const valid = !!picked && qtyNum > 0 && unitNum > 0

  const reset = () => {
    setPicked(null)
    setSearch("")
    setQuantity("")
    setUnitCost("")
    setFreight("0")
    setUpdateCost(true)
    setSupplier("")
    setDate(new Date())
  }

  const submit = useMutation({
    mutationFn: () =>
      api.restock({
        variant_id: picked!.variant_id,
        quantity: qtyNum,
        unit_cost: unitNum,
        freight: freightNum,
        update_cost: updateCost,
        purchase_date: date.toISOString(),
        supplier: supplier || null,
      }),
    onSuccess: () => {
      toast.success("Restocked — stock raised and cash recorded")
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
  const rows = useMemo(() => recent?.ledger_entries ?? [], [recent])

  return (
    <div className="flex flex-col gap-y-4">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-y-1">
              <Label size="small">Quantity received</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
              />
            </div>
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
            <div className="flex flex-col gap-y-1">
              <Label size="small">Purchase date</Label>
              <DatePicker value={date} onChange={(d) => d && setDate(d)} />
            </div>
          </div>

          <div className="flex flex-col gap-y-1">
            <Label size="small">Supplier (optional)</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>

          <div className="flex items-center gap-x-2">
            <Switch checked={updateCost} onCheckedChange={setUpdateCost} id="upd-cost" />
            <Label size="small" htmlFor="upd-cost">
              Update this product's cost price to {money(landed, cur)} / unit (landed)
            </Label>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-ui-bg-subtle p-3">
            <Text size="small" className="text-ui-fg-subtle">
              Cash out: <b>{money(cashOut, cur)}</b> · Stock: <b>+{qtyNum || 0}</b>
            </Text>
            <Button
              size="small"
              disabled={!valid || submit.isPending}
              isLoading={submit.isPending}
              onClick={() => submit.mutate()}
            >
              Restock
            </Button>
          </div>
        </div>
      )}

      <Text size="small" weight="plus" className="mt-2 text-ui-fg-subtle">
        Recent restocks
      </Text>
      <div className="overflow-x-auto rounded-lg border border-ui-border-base">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell>What</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Cash paid</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((e) => (
              <Table.Row key={e.id}>
                <Table.Cell className="whitespace-nowrap">
                  {new Date(e.entry_date).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Table.Cell>
                <Table.Cell className="max-w-[320px] truncate">
                  {e.description || "Restock"}
                </Table.Cell>
                <Table.Cell className="text-right font-medium">{money(e.amount, cur)}</Table.Cell>
              </Table.Row>
            ))}
            {rows.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={3}>
                  <Text size="small" className="py-4 text-ui-fg-muted">
                    No restocks recorded yet.
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
