import {
  MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"

import {
  AdjustStockSchema,
  EditBatchSchema,
  GetByInventoryItemSchema,
  GetVariantStockSchema,
  HardAdjustSchema,
  RestockSchema,
} from "./validators"

/**
 * Product-page stock endpoints. Same workflows as the Accounting tab, but under a segment
 * (`variant-stock`) the RBAC policy maps to `product_cost` — so whoever edits product costs
 * can restock from the product page without being handed the whole Accounting area.
 *
 * Spread into the top-level defineMiddlewares array in src/api/middlewares.ts.
 */
export const variantStockMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/variant-stock",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(GetVariantStockSchema, {})],
  },
  {
    matcher: "/admin/variant-stock/restock",
    method: ["POST"],
    middlewares: [validateAndTransformBody(RestockSchema)],
  },
  {
    matcher: "/admin/variant-stock/adjust",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdjustStockSchema)],
  },
  {
    matcher: "/admin/variant-stock/batches/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(EditBatchSchema)],
  },
  {
    matcher: "/admin/variant-stock/hard-adjust",
    method: ["POST"],
    middlewares: [validateAndTransformBody(HardAdjustSchema)],
  },
  {
    matcher: "/admin/variant-stock/by-inventory-item",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(GetByInventoryItemSchema, {})],
  },
]
