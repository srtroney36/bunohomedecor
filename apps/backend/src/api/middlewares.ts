import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import multer from "multer"
import { accountingMiddlewares } from "./admin/accounting/middlewares"
import { variantStockMiddlewares } from "./admin/variant-stock/middlewares"
import { inventoryStockGuard } from "./inventory-stock-guard"
import { rbacGuard } from "./rbac-guard"
import {
  CreateRoleSchema,
  UpdateRoleSchema,
  AssignRolesSchema,
} from "./admin/rbac/validators"

const upload = multer({ storage: multer.memoryStorage() })

export default defineMiddlewares([
  // RBAC authorization for every admin route. Admin authentication itself is
  // applied automatically by the framework; this guard enforces per-role access.
  {
    matcher: "/admin/*",
    middlewares: [rbacGuard],
  },
  /**
   * Stock quantity is owned by the FIFO batch system — these block the native editors from
   * writing `stocked_quantity` straight through Medusa's core API. Attaching/detaching a
   * location still works; only the quantity is refused. See inventory-stock-guard.ts.
   */
  {
    method: ["POST"],
    matcher: "/admin/inventory-items/location-levels/batch",
    middlewares: [inventoryStockGuard],
  },
  {
    method: ["POST"],
    matcher: "/admin/inventory-items/:id/location-levels",
    middlewares: [inventoryStockGuard],
  },
  {
    method: ["POST"],
    matcher: "/admin/inventory-items/:id/location-levels/batch",
    middlewares: [inventoryStockGuard],
  },
  {
    method: ["POST"],
    matcher: "/admin/inventory-items/:id/location-levels/:location_id",
    middlewares: [inventoryStockGuard],
  },
  // Multer parses multipart/form-data for the image upload endpoints.
  {
    method: ["POST"],
    matcher: "/admin/homepage/upload",
    middlewares: [upload.single("file")],
  },
  {
    method: ["POST"],
    matcher: "/admin/brands/upload",
    middlewares: [upload.single("file")],
  },
  // RBAC write-route validation.
  {
    method: ["POST"],
    matcher: "/admin/rbac/roles",
    middlewares: [validateAndTransformBody(CreateRoleSchema)],
  },
  {
    method: ["POST"],
    matcher: "/admin/rbac/roles/:id",
    middlewares: [validateAndTransformBody(UpdateRoleSchema)],
  },
  {
    method: ["POST"],
    matcher: "/admin/rbac/users/:id/roles",
    middlewares: [validateAndTransformBody(AssignRolesSchema)],
  },
  // Accounting & marketing validation. The rbacGuard above still gates every one of these.
  ...accountingMiddlewares,
  // Product-page stock endpoints (restock/adjust/edit from the product widget).
  ...variantStockMiddlewares,
])
