import { model } from "@medusajs/framework/utils"

const Role = model.define("role", {
  id: model.id().primaryKey(),
  name: model.text(),
  slug: model.text().unique(),
  description: model.text().nullable(),
  // System roles are seeded and protected (cannot be deleted; Owner cannot be edited).
  is_system: model.boolean().default(false),
  // Array of permission keys ("<resource>:<action>"); see modules/rbac/permissions.ts.
  permissions: model.json(),
  metadata: model.json().nullable(),
})

export default Role
