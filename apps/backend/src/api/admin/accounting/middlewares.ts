import {
  MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"

import * as V from "./validators"

/** Spread into the top-level defineMiddlewares array in src/api/middlewares.ts. */
export const accountingMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/accounting/dashboard",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(V.GetDashboardSchema, {})],
  },
  {
    matcher: "/admin/accounting/restock",
    method: ["POST"],
    middlewares: [validateAndTransformBody(V.RestockSchema)],
  },
  {
    matcher: "/admin/accounting/batches",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(V.GetBatchesSchema, {})],
  },
  {
    matcher: "/admin/accounting/batches/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(V.EditBatchSchema)],
  },
  {
    matcher: "/admin/accounting/adjust",
    method: ["POST"],
    middlewares: [validateAndTransformBody(V.AdjustStockSchema)],
  },
  {
    matcher: "/admin/accounting/hard-adjust",
    method: ["POST"],
    middlewares: [validateAndTransformBody(V.HardAdjustSchema)],
  },

  // ledger
  {
    matcher: "/admin/accounting/ledger",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(V.GetLedgerSchema, {})],
  },
  {
    matcher: "/admin/accounting/ledger",
    method: ["POST"],
    middlewares: [validateAndTransformBody(V.CreateLedgerEntrySchema)],
  },
  {
    matcher: "/admin/accounting/ledger/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(V.UpdateLedgerEntrySchema)],
  },

  // partners
  {
    matcher: "/admin/accounting/partners",
    method: ["POST"],
    middlewares: [validateAndTransformBody(V.CreatePartnerSchema)],
  },
  {
    matcher: "/admin/accounting/partners/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(V.UpdatePartnerSchema)],
  },

  // fixed assets
  {
    matcher: "/admin/accounting/fixed-assets",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(V.GetFixedAssetsSchema, {})],
  },
  {
    matcher: "/admin/accounting/fixed-assets",
    method: ["POST"],
    middlewares: [validateAndTransformBody(V.CreateFixedAssetSchema)],
  },
  {
    matcher: "/admin/accounting/fixed-assets/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(V.UpdateFixedAssetSchema)],
  },

  // marketing — /summary is a static segment and is matched ahead of /:id
  {
    matcher: "/admin/accounting/marketing/summary",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(V.GetMarketingSummarySchema, {})],
  },
  {
    matcher: "/admin/accounting/marketing",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(V.GetMarketingListSchema, {})],
  },
  {
    matcher: "/admin/accounting/marketing",
    method: ["POST"],
    middlewares: [validateAndTransformBody(V.CreateMarketingSpendSchema)],
  },
  {
    matcher: "/admin/accounting/marketing/:id",
    method: ["POST"],
    middlewares: [validateAndTransformBody(V.UpdateMarketingSpendSchema)],
  },
]
