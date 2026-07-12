import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { RBAC_MODULE } from "../modules/rbac"
import { OWNER_SLUG, SYSTEM_ROLES } from "../modules/rbac/permissions"

/**
 * Re-syncs the SYSTEM roles from code.
 *
 * Why this file exists at all: `run-migration-scripts` records executed scripts by
 * FILENAME and skips them forever, and `seed-rbac.ts` only ever *creates* roles that are
 * missing — it never updates one that already exists. So on any database that has already
 * booted once, editing SYSTEM_ROLES in permissions.ts has exactly zero effect.
 *
 * Without this, adding the `accounting` and `marketing_spend` resources would have shipped
 * a Finance role that still cannot open the Accounting section, and an Analyst role that
 * still holds read access to the investment pool. Both failures are silent.
 *
 * Trade-off, stated plainly: for `is_system` roles this treats CODE as the source of
 * truth, so any hand-edit made to a system role in the admin UI is overwritten. Custom
 * (non-system) roles are never touched. To make a future RESOURCES change apply itself,
 * copy this script under a new filename.
 */
export default async function sync_system_role_permissions({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const rbac: any = container.resolve(RBAC_MODULE)

  try {
    const existing = await rbac.listRoles({ is_system: true })
    const bySlug = new Map<string, any>(existing.map((r: any) => [r.slug, r]))

    const updates: Record<string, unknown>[] = []

    for (const def of SYSTEM_ROLES) {
      const current = bySlug.get(def.slug)

      // Missing roles are seed-rbac's job, not ours.
      if (!current) continue

      // Owner is always ["*"] and is repaired by seed-rbac. Leave it alone.
      if (def.slug === OWNER_SLUG) continue

      const samePerms =
        JSON.stringify(current.permissions ?? []) === JSON.stringify(def.permissions)
      const sameMeta =
        current.name === def.name && current.description === def.description

      if (samePerms && sameMeta) continue

      updates.push({
        id: current.id,
        name: def.name,
        description: def.description,
        permissions: def.permissions,
      })
    }

    if (updates.length) {
      await rbac.updateRoles(updates)
      logger.info(
        `[rbac] Re-synced ${updates.length} system role(s) from code: ` +
          updates.map((u: any) => u.name).join(", ")
      )
    } else {
      logger.info("[rbac] System roles already match code — nothing to sync.")
    }
  } catch (e: any) {
    logger.warn(
      `[rbac] System role re-sync failed (guard stays fail-open): ${e?.message ?? e}`
    )
  }
}
