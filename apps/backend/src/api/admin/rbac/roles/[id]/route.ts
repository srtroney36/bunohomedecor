import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { updateRoleWorkflow } from "../../../../../workflows/rbac/update-role"
import { deleteRoleWorkflow } from "../../../../../workflows/rbac/delete-role"
import { UpdateRoleSchema } from "../../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "role",
    fields: [
      "id",
      "name",
      "slug",
      "description",
      "is_system",
      "permissions",
      "users.id",
    ],
    filters: { id },
  })

  if (!data || data.length === 0) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Role not found")
  }

  const r: any = data[0]
  res.json({
    role: {
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      is_system: r.is_system,
      permissions: r.permissions ?? [],
      user_count: (r.users ?? []).length,
    },
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest<UpdateRoleSchema>,
  res: MedusaResponse
) {
  const { id } = req.params
  const body = req.validatedBody

  const input: any = { id }
  if (body.name !== undefined) input.name = body.name
  if (body.description !== undefined) input.description = body.description
  if (body.permissions !== undefined) input.permissions = body.permissions

  const { result } = await updateRoleWorkflow(req.scope).run({ input })
  res.json({ role: result })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  await deleteRoleWorkflow(req.scope).run({ input: { id } })
  res.json({ id, object: "role", deleted: true })
}
