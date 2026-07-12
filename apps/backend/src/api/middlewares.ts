import { defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http"
import multer from "multer"
import { accountingMiddlewares } from "./admin/accounting/middlewares"
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
])
