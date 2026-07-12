import {
  MedusaRequest,
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { hasPermission } from "../modules/rbac/permissions"
import { isAllowlisted, resolvePermission } from "../modules/rbac/policy"
import { getCachedPermissions, setCachedPermissions } from "../modules/rbac/cache"

/**
 * Global authorization guard for every /admin/* request. Runs after the
 * framework's admin authentication (so req.auth_context is populated), maps the
 * request to the { resource, action } it requires, and 403s if the caller's
 * roles don't grant it. This gates core Medusa endpoints and custom ones alike.
 *
 * Fail-safes:
 *   - RBAC_ENFORCED=false            -> bypass entirely (emergency kill-switch).
 *   - No role assignments anywhere   -> fail OPEN until RBAC is bootstrapped, so a
 *                                       missed Owner backfill can't lock out staff.
 */

async function loadPermissions(scope: any, userId: string): Promise<string[]> {
  const cached = getCachedPermissions(userId)
  if (cached) return cached

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "user",
    fields: ["id", "roles.permissions"],
    filters: { id: userId },
  })

  const set = new Set<string>()
  for (const role of data?.[0]?.roles ?? []) {
    for (const p of role.permissions ?? []) set.add(p)
  }
  const perms = [...set]
  setCachedPermissions(userId, perms)
  return perms
}

// Global "is RBAC set up yet?" flag. Once any role is assigned it stays true.
let bootstrapped = false
let bootstrapCheckedAt = 0
const BOOTSTRAP_TTL = 30_000

async function isRbacBootstrapped(scope: any): Promise<boolean> {
  if (bootstrapped) return true
  if (Date.now() - bootstrapCheckedAt < BOOTSTRAP_TTL) return false
  bootstrapCheckedAt = Date.now()
  try {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "role",
      fields: ["id", "users.id"],
    })
    if ((data ?? []).some((r: any) => (r.users ?? []).length > 0)) {
      bootstrapped = true
    }
    return bootstrapped
  } catch {
    return false
  }
}

export async function rbacGuard(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    if (process.env.RBAC_ENFORCED === "false") return next()

    // req.path inside this middleware is mount-relative (no "/admin" prefix), so
    // normalize from originalUrl and guarantee the "/admin" prefix the policy expects.
    let path = ((req as any).originalUrl || req.url || req.path).split("?")[0]
    if (!path.startsWith("/admin")) {
      path = "/admin" + (path.startsWith("/") ? path : `/${path}`)
    }

    if (isAllowlisted(path, req.method)) return next()

    const userId = (req as AuthenticatedMedusaRequest).auth_context?.actor_id
    if (!userId) return next() // unauthenticated requests are rejected by core auth

    const perms = await loadPermissions(req.scope, userId)

    if (perms.includes("*")) return next()

    if (perms.length === 0) {
      const ready = await isRbacBootstrapped(req.scope)
      if (!ready) return next()
      return res.status(403).json({
        type: "not_allowed",
        message:
          "Your account does not have permission for this area. Contact an administrator.",
      })
    }

    const required = resolvePermission(path, req.method)
    if (!required) return next()

    if (hasPermission(perms, required.resource, required.action)) return next()

    return res.status(403).json({
      type: "not_allowed",
      message: `You do not have permission to ${required.action.replace(/-/g, " ")} ${required.resource.replace(/_/g, " ")}.`,
    })
  } catch (e) {
    return next(e)
  }
}
