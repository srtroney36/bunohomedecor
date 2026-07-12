import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Current admin user's effective roles + permissions. Always accessible
// (allowlisted in the guard) so the admin UI can gate itself.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const userId = req.auth_context.actor_id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "user",
    fields: ["id", "roles.id", "roles.name", "roles.slug", "roles.permissions"],
    filters: { id: userId },
  })

  const roles = (data?.[0]?.roles ?? []) as any[]
  const permsSet = new Set<string>()
  for (const r of roles) {
    for (const p of (r.permissions ?? []) as string[]) permsSet.add(p)
  }

  res.json({
    user_id: userId,
    roles: roles.map((r: any) => ({ id: r.id, name: r.name, slug: r.slug })),
    permissions: [...permsSet],
    is_super_admin: permsSet.has("*"),
  })
}
