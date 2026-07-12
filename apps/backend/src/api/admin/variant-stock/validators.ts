import { z } from "zod"

// The restock/adjust/edit/hard-adjust bodies are identical to the accounting ones — reuse them
// so the two entry points (Accounting tab, product page) can never validate differently.
export {
  AdjustStockSchema,
  EditBatchSchema,
  HardAdjustSchema,
  RestockSchema,
} from "../accounting/validators"

export const GetVariantStockSchema = z.object({
  variant_id: z.string().min(1),
})
export type GetVariantStockSchema = z.infer<typeof GetVariantStockSchema>

export const GetByInventoryItemSchema = z.object({
  inventory_item_id: z.string().min(1),
})
export type GetByInventoryItemSchema = z.infer<typeof GetByInventoryItemSchema>
