import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text } from "@medusajs/ui"

import { VariantStockPanel } from "./variant-stock-panel"

/**
 * The variant page is where people go looking for "Manage location quantity", so the
 * sanctioned flow lives right here: restock (costed batch), found, write-off, and Hard adjust.
 * The native quantity box below is now refused by the server — this is the way through.
 */
const VariantStockWidget = ({ data: variant }: { data: { id: string } }) => (
  <Container className="flex flex-col gap-y-4 px-6 py-6">
    <div>
      <Heading level="h2">Stock (batch-managed)</Heading>
      <Text size="small" className="text-ui-fg-subtle mt-1">
        Stock can't be typed in directly — every unit is backed by a FIFO cost batch, which is
        what keeps COGS and net worth honest. <b>Restock</b> to bring in costed stock, or{" "}
        <b>Hard adjust</b> to correct a count.
      </Text>
    </div>

    <VariantStockPanel variantId={variant.id} />
  </Container>
)

export const config = defineWidgetConfig({
  zone: "product_variant.details.after",
})

export default VariantStockWidget
