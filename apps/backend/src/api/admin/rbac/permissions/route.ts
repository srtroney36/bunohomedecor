import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  RESOURCES,
  RESOURCE_GROUP_LABELS,
  RESOURCE_GROUP_ORDER,
} from "../../../../modules/rbac/permissions"

// The permission catalog that powers the admin role-editor matrix.
export async function GET(_req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const groups = RESOURCE_GROUP_ORDER.map((g) => ({
    key: g,
    label: RESOURCE_GROUP_LABELS[g],
    resources: RESOURCES.filter((r) => r.group === g).map((r) => ({
      key: r.key,
      label: r.label,
      actions: r.actions,
    })),
  }))

  res.json({ groups })
}
