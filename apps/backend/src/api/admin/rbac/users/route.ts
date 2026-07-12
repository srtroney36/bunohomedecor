import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// List admin users with their assigned roles (for the Team Members view).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "user",
    fields: [
      "id",
      "email",
      "first_name",
      "last_name",
      "roles.id",
      "roles.name",
      "roles.slug",
    ],
  })

  const users = (data ?? []).map((u: any) => ({
    id: u.id,
    email: u.email,
    first_name: u.first_name,
    last_name: u.last_name,
    roles: (u.roles ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
    })),
  }))

  res.json({ users })
}
