import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { assignUserRolesWorkflow } from "../../../../../../workflows/rbac/assign-user-roles"
import { AssignRolesSchema } from "../../../validators"

// Replace the set of roles assigned to a user.
export async function POST(
  req: AuthenticatedMedusaRequest<AssignRolesSchema>,
  res: MedusaResponse
) {
  const { id } = req.params
  const { role_ids } = req.validatedBody

  await assignUserRolesWorkflow(req.scope).run({
    input: { user_id: id, role_ids },
  })

  res.json({ user_id: id, role_ids })
}
