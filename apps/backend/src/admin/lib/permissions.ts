import { useQuery } from "@tanstack/react-query"

export type Me = {
  user_id: string
  roles: { id: string; name: string; slug: string }[]
  permissions: string[]
  is_super_admin: boolean
}

const HIGH_RISK = new Set(["refund", "store-reset"])

/**
 * Client-side mirror of the backend `hasPermission` (modules/rbac/permissions.ts).
 * The backend guard is the real security boundary; this only drives UI gating.
 */
export function hasPermission(
  perms: string[] | undefined,
  resource: string,
  action: string
): boolean {
  if (!perms || perms.length === 0) return false
  if (perms.includes("*")) return true
  if (perms.includes(`${resource}:*`)) return true
  if (perms.includes(`${resource}:${action}`)) return true
  if (!HIGH_RISK.has(action) && perms.includes(`${resource}:manage`)) return true
  if (
    action === "read" &&
    (perms.includes(`${resource}:write`) ||
      perms.includes(`${resource}:delete`) ||
      perms.includes(`${resource}:manage`))
  ) {
    return true
  }
  return false
}

/** Like adminFetch but surfaces the server's error message (e.g. 403 reasons). */
export async function rbacFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token =
    localStorage.getItem("_medusa_auth_token") ||
    localStorage.getItem("medusa_auth_token") ||
    ""
  const res = await fetch(`/admin${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  const text = await res.text()
  let json: any = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = {}
  }
  if (!res.ok) {
    throw new Error(json?.message || `Request failed: ${res.status}`)
  }
  return json as T
}

export function usePermissions() {
  const { data, isLoading } = useQuery<Me>({
    queryKey: ["rbac-me"],
    queryFn: () => rbacFetch<Me>("/rbac/me"),
    staleTime: 60_000,
  })

  const permissions = data?.permissions ?? []

  return {
    permissions,
    roles: data?.roles ?? [],
    isSuperAdmin: data?.is_super_admin ?? false,
    isLoading,
    can: (resource: string, action: string) =>
      hasPermission(permissions, resource, action),
  }
}
