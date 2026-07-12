import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createRoleWorkflow } from "../../../../workflows/rbac/create-role"
import { CreateRoleSchema } from "../validators"

function slugify(str: string) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
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
      "created_at",
      "users.id",
    ],
  })

  const roles = (data ?? [])
    .map((r: any) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      is_system: r.is_system,
      permissions: r.permissions ?? [],
      user_count: (r.users ?? []).length,
    }))
    .sort(
      (a: any, b: any) =>
        Number(b.is_system) - Number(a.is_system) || a.name.localeCompare(b.name)
    )

  res.json({ roles })
}

export async function POST(
  req: AuthenticatedMedusaRequest<CreateRoleSchema>,
  res: MedusaResponse
) {
  const { name, description, permissions } = req.validatedBody
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Ensure a unique slug.
  const base = slugify(name) || "role"
  let slug = base
  let i = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: existing } = await query.graph({
      entity: "role",
      fields: ["id"],
      filters: { slug },
    })
    if (!existing || existing.length === 0) break
    slug = `${base}-${i++}`
  }

  const { result } = await createRoleWorkflow(req.scope).run({
    input: {
      name,
      slug,
      description: description ?? null,
      permissions: permissions ?? [],
    },
  })

  res.json({ role: result })
}
