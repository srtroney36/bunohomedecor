import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { money } from "../lib/kpi"
import { stockApi } from "../lib/stock-api"
import { StockHealthBanner } from "./stock-health-banner"
import { VariantStockPanel } from "./variant-stock-panel"

/**
 * Product-page stock, cost & packaging.
 *
 * Cost is no longer typed here — it is the landed cost of the variant's LATEST batch, shown
 * read-only. You set cost by restocking (each batch carries its own cost); this just reflects
 * the most recent one. Packaging stays an editable per-variant preset. Below each variant is
 * the full restock / found / write-off panel with its FIFO batch log.
 */
const cur = "bdt"

const ProductCostWidget = ({ data: product }: { data: { id: string } }) => {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["variant-costs", product.id],
    queryFn: () => stockApi.listCosts(product.id),
  })

  // Editable packaging preset per variant (variant_id -> string).
  const [packaging, setPackaging] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!data) return
    const init: Record<string, string> = {}
    for (const v of data.variant_costs) init[v.variant_id] = String(v.packaging_cost ?? 0)
    setPackaging(init)
  }, [data])

  const rows = data?.variant_costs ?? []

  const save = useMutation({
    mutationFn: () =>
      stockApi.saveCosts({
        costs: rows.map((v) => ({
          variant_id: v.variant_id,
          packaging_cost: Number(packaging[v.variant_id]) || 0,
        })),
      }),
    onSuccess: () => {
      toast.success("Packaging saved")
      qc.invalidateQueries({ queryKey: ["variant-costs"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Container className="flex flex-col gap-y-5 px-6 py-6">
      <div>
        <Heading level="h2">Stock, cost &amp; packaging</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          <b>Cost</b> is set per batch when you restock — the figure shown is your latest
          batch's landed cost. <b>Packaging</b> is the per-unit preset drawn from the packaging
          pool on each shipment. Sales draw down the oldest batch first (FIFO).
        </Text>
      </div>

      <StockHealthBanner />

      {isLoading ? (
        <Text size="small" className="text-ui-fg-muted">
          Loading…
        </Text>
      ) : rows.length === 0 ? (
        <Text size="small" className="text-ui-fg-muted">
          No variants on this product.
        </Text>
      ) : (
        <div className="flex flex-col gap-y-6">
          {rows.map((v) => (
            <div
              key={v.variant_id}
              className="flex flex-col gap-y-3 border-t border-ui-border-base pt-5 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <Text size="small" weight="plus" className="truncate">
                    {v.title}
                  </Text>
                  {v.sku && (
                    <Text size="xsmall" className="text-ui-fg-muted truncate">
                      {v.sku}
                    </Text>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex flex-col gap-y-1">
                    <Label size="small" className="text-ui-fg-muted">
                      Cost / unit (last batch)
                    </Label>
                    <Text size="small" className="text-right font-medium tabular-nums">
                      {money(v.cost, cur)}
                    </Text>
                  </div>
                  <div className="flex flex-col gap-y-1">
                    <Label size="small">Packaging / unit</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-28"
                      value={packaging[v.variant_id] ?? ""}
                      onChange={(e) =>
                        setPackaging((p) => ({ ...p, [v.variant_id]: e.target.value }))
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <VariantStockPanel variantId={v.variant_id} cur={cur} />
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="small" onClick={() => save.mutate()} isLoading={save.isPending} disabled={isLoading}>
          Save
        </Button>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductCostWidget
