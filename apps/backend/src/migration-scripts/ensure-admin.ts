import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { RBAC_MODULE } from "../modules/rbac"
import { SYSTEM_ROLES, OWNER_SLUG } from "../modules/rbac/permissions"

/**
 * Bootstraps a super-admin from environment variables so a fresh deploy needs no
 * manual `medusa user` step. Runs once during `db:migrate` (the container runs it
 * on startup — see Dockerfile), the same mechanism as seed-rbac.
 *
 * Set these on the backend's environment:
 *   ADMIN_EMAIL       (required)  e.g. owner@yourstore.com
 *   ADMIN_PASSWORD    (required)
 *   ADMIN_FIRST_NAME  (optional)
 *
 * On first migrate this:
 *   1. creates the admin user (if missing),
 *   2. sets its email/password credentials (if missing),
 *   3. grants it the Owner role (full access).
 *
 * Step 3 is the important one: `npx medusa user` creates a user with WORKING
 * credentials but NO role, because this project uses a custom RBAC module (not
 * Medusa's built-in one). A role-less admin can log in but sees "no access" on the
 * custom sections (Store Settings, Accounting, …). This grants Owner so that never
 * happens.
 *
 * Idempotent and fail-soft: each step is guarded so a half-existing account or a
 * transient error can't block boot. With the vars unset, it does nothing.
 *
 * NOTE: like every migration script this runs ONCE (tracked in the DB). Changing
 * ADMIN_PASSWORD later will NOT rotate the password — use `npx medusa user` or the
 * admin UI for that.
 */
export default async function ensure_admin({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  const firstName = process.env.ADMIN_FIRST_NAME?.trim()

  if (!email || !password) {
    logger.info(
      "[admin] ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping env-based admin bootstrap."
    )
    return
  }

  const userModule: any = container.resolve(Modules.USER)
  const authModule: any = container.resolve(Modules.AUTH)

  // 1) Ensure the user record exists.
  let user: any
  try {
    const existing = await userModule.listUsers({ email })
    if (existing.length) {
      user = existing[0]
      logger.info(`[admin] User ${email} already exists.`)
    } else {
      const [created] = await userModule.createUsers([
        { email, ...(firstName ? { first_name: firstName } : {}) },
      ])
      user = created
      logger.info(`[admin] Created admin user ${email}.`)
    }
  } catch (e: any) {
    logger.warn(`[admin] Could not create/find user (skipping): ${e?.message ?? e}`)
    return
  }

  // 2) Ensure email/password credentials exist and are linked to the user.
  //    `register` hashes the password and creates the provider + auth identity.
  //    If the identity already exists it returns an error instead of throwing —
  //    that's the expected "already set up" path, not a failure.
  try {
    const { authIdentity, error } = await authModule.register("emailpass", {
      body: { email, password },
    })
    if (authIdentity) {
      await authModule.updateAuthIdentities({
        id: authIdentity.id,
        app_metadata: { user_id: user.id },
      })
      logger.info(`[admin] Credentials set for ${email}.`)
    } else {
      logger.info(
        `[admin] Credentials already present for ${email} (${error ?? "exists"}).`
      )
    }
  } catch (e: any) {
    logger.warn(`[admin] Credential setup failed (skipping): ${e?.message ?? e}`)
  }

  // 3) Grant the Owner role (full access). Seeds the Owner role first if RBAC
  //    hasn't been bootstrapped yet, so this doesn't depend on script order.
  try {
    const rbac: any = container.resolve(RBAC_MODULE)
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    let [owner] = await rbac.listRoles({ slug: OWNER_SLUG })
    if (!owner) {
      const def = SYSTEM_ROLES.find((r) => r.slug === OWNER_SLUG)!
      ;[owner] = await rbac.createRoles([
        {
          name: def.name,
          slug: def.slug,
          description: def.description,
          permissions: def.permissions,
          is_system: true,
        },
      ])
    }

    const { data } = await query.graph({
      entity: "user",
      fields: ["id", "roles.id"],
      filters: { id: user.id },
    })
    const already = (data?.[0]?.roles ?? []).some((r: any) => r.id === owner.id)
    if (already) {
      logger.info(`[admin] ${email} already has the Owner role.`)
    } else {
      await link.create({
        [Modules.USER]: { user_id: user.id },
        [RBAC_MODULE]: { role_id: owner.id },
      })
      logger.info(`[admin] Granted Owner role to ${email}.`)
    }
  } catch (e: any) {
    logger.warn(`[admin] Owner role assignment failed: ${e?.message ?? e}`)
  }
}
