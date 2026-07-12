/**
 * Tiny in-memory cache of a user's effective permission set, keyed by user id.
 * Avoids a DB hit on every /admin/* request. A short TTL bounds staleness for
 * multi-instance deployments; the assign-roles workflow also invalidates
 * explicitly for the affected user.
 */

type Entry = { perms: string[]; exp: number }

const store = new Map<string, Entry>()
const TTL_MS = 15_000

export function getCachedPermissions(userId: string): string[] | undefined {
  const entry = store.get(userId)
  if (!entry) return undefined
  if (Date.now() > entry.exp) {
    store.delete(userId)
    return undefined
  }
  return entry.perms
}

export function setCachedPermissions(userId: string, perms: string[]): void {
  store.set(userId, { perms, exp: Date.now() + TTL_MS })
}

export function invalidateUserPermissions(userId?: string): void {
  if (userId) {
    store.delete(userId)
  } else {
    store.clear()
  }
}
