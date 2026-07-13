import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"

import { stockApi } from "../lib/stock-api"
import { VariantStockPanel } from "./variant-stock-panel"

/**
 * Sits ABOVE the native "Manage location quantity" box on the Inventory item page — the exact
 * spot where someone would otherwise edit stock by hand (the server now refuses that). It
 * explains why, and gives the real controls: restock, write-off, and Hard adjust.
 */
const InventoryStockWidget = ({ data: item }: { data: { id: string } }) => {
  const { data: variant, isLoading } = useQuery({
    queryKey: ["variant-by-inventory-item", item.id],
    queryFn: () => stockApi.byInventoryItem(item.id),
    retry: false,
  })

  return (
    <Container className="flex flex-col gap-y-4 px-6 py-6">
      <div>
        <Heading level="h2">Stock is batch-managed</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          The <b>In Stock</b> quantity below is locked: every unit is backed by a FIFO cost
          batch, so a hand-typed number would create stock with no cost — quietly understating
          COGS and net worth. Restock to bring in costed stock, or <b>Hard adjust</b> to correct
          a count.
        </Text>
      </div>

      {isLoading ? (
        <Text size="small" className="text-ui-fg-muted">
          Loading…
        </Text>
      ) : !variant ? (
        <Text size="small" className="text-ui-fg-muted">
          No product variant is linked to this inventory item, so there is nothing to restock.
        </Text>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text size="small" weight="plus" className="truncate min-w-0">
              {variant.label}
            </Text>
            {variant.product_id && (
              <Button
                size="small"
                variant="secondary"
                onClick={() => {
                  window.location.href = `/app/products/${variant.product_id}`
                }}
              >
                Open product →
              </Button>
            )}
          </div>

          <VariantStockPanel variantId={variant.variant_id} />
        </>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "inventory_item.details.before",
})

export default InventoryStockWidget
