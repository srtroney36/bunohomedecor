import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { RBAC_MODULE } from "../modules/rbac"
import { SYSTEM_ROLES, OWNER_SLUG } from "../modules/rbac/permissions"

/**
 * Bootstraps RBAC. Runs once during `db:migrate` (which the container executes on
 * startup — see Dockerfile). Two jobs, each isolated so one failure can't block boot:
 *   1. Idempotently seed the system roles (by slug).
 *   2. First-time only: backfill the Owner role to all existing admin users so an
 *      RBAC rollout never locks out current staff.
 *
 * If this is ever incomplete, the /admin guard fails OPEN until at least one role
 * assignment exists, so a missed backfill cannot lock anyone out.
 */
export default async function seed_rbac({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const rbac: any = container.resolve(RBAC_MODULE)

  let ownerRoleId: string | undefined

  // 1) Seed / repair system roles.
  try {
    const existing = await rbac.listRoles({ is_system: true })
    const bySlug = new Map<string, any>(existing.map((r: any) => [r.slug, r]))

    for (const def of SYSTEM_ROLES) {
      const current = bySlug.get(def.slug)
      if (!current) {
        const [created] = await rbac.createRoles([
          {
            name: def.name,
            slug: def.slug,
            description: def.description,
            permissions: def.permissions,
            is_system: true,
          },
        ])
        if (def.slug === OWNER_SLUG) ownerRoleId = created.id
      } else if (
        def.slug === OWNER_SLUG &&
        JSON.stringify(current.permissions) !== JSON.stringify(["*"])
      ) {
        // Never let Owner drift away from full access.
        await rbac.updateRoles([{ id: current.id, permissions: ["*"] }])
        ownerRoleId = current.id
      } else if (def.slug === OWNER_SLUG) {
        ownerRoleId = current.id
      }
    }
    logger.info("[rbac] System roles seeded.")
  } catch (e: any) {
    logger.warn(`[rbac] Role seeding failed (guard stays fail-open): ${e?.message ?? e}`)
    return
  }

  // 2) One-time Owner backfill for existing admins.
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const link = container.resolve(ContainerRegistrationKeys.LINK)

    if (!ownerRoleId) {
      const [owner] = await rbac.listRoles({ slug: OWNER_SLUG })
      ownerRoleId = owner?.id
    }
    if (!ownerRoleId) {
      logger.warn("[rbac] Owner role not found — skipping backfill.")
      return
    }

    const { data: users } = await query.graph({
      entity: "user",
      fields: ["id", "roles.id"],
    })

    const anyAssigned = users.some((u: any) => (u.roles ?? []).length > 0)
    if (anyAssigned) {
      logger.info("[rbac] Role assignments already exist — skipping Owner backfill.")
      return
    }

    for (const user of users) {
      await link.create({
        [Modules.USER]: { user_id: user.id },
        [RBAC_MODULE]: { role_id: ownerRoleId },
      })
    }
    logger.info(`[rbac] Backfilled Owner role to ${users.length} existing admin user(s).`)
  } catch (e: any) {
    logger.warn(
      `[rbac] Owner backfill failed (guard stays fail-open until roles are assigned): ${e?.message ?? e}`
    )
  }
}
