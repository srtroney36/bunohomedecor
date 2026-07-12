import { Batch } from "../routes/accounting/lib/api"

/**
 * Product-page stock calls. These hit the /admin/variant-stock/* routes, which the RBAC
 * policy gates on `product_cost` (the same permission that already lets the cost widget edit
 * costs) rather than the broader `accounting` grant.
 *
 * Lives in admin/lib (not under widgets/) so the admin build's widget scanner doesn't try to
 * parse this plain .ts helper as a widget.
 */

async function adminFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
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

  if (!res.ok) {
    // Surface the server's message (workflows throw meaningful text the user needs to read).
    let message = `Request failed: ${res.status}`
    try {
      const body = await res.json()
      if (body?.message) message = body.message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export type VariantMovement = {
  id: string
  date: string
  quantity: number
  reason: string
  note: string | null
}

export type VariantStock = {
  current_qty: number
  latest_cost: number
  packaging_cost: number
  batches: Batch[]
  movements: VariantMovement[]
}

export const stockApi = {
  get: (variantId: string) =>
    adminFetch<VariantStock>(`/variant-stock?variant_id=${encodeURIComponent(variantId)}`),
  restock: (body: unknown) =>
    adminFetch(`/variant-stock/restock`, { method: "POST", body: JSON.stringify(body) }),
  adjust: (body: unknown) =>
    adminFetch(`/variant-stock/adjust`, { method: "POST", body: JSON.stringify(body) }),
  hardAdjust: (body: unknown) =>
    adminFetch(`/variant-stock/hard-adjust`, { method: "POST", body: JSON.stringify(body) }),
  byInventoryItem: (inventoryItemId: string) =>
    adminFetch<{
      variant_id: string
      label: string
      sku: string | null
      product_id: string | null
      product_title: string | null
    }>(`/variant-stock/by-inventory-item?inventory_item_id=${encodeURIComponent(inventoryItemId)}`),
  editBatch: (id: string, body: unknown) =>
    adminFetch(`/variant-stock/batches/${id}`, { method: "POST", body: JSON.stringify(body) }),
  deleteBatch: (id: string) =>
    adminFetch(`/variant-stock/batches/${id}`, { method: "DELETE" }),

  listCosts: (productId: string) =>
    adminFetch<{
      variant_costs: {
        variant_id: string
        title: string
        sku: string | null
        cost: number
        packaging_cost: number
      }[]
    }>(`/variant-costs?product_id=${productId}`),
  saveCosts: (body: unknown) =>
    adminFetch(`/variant-costs`, { method: "POST", body: JSON.stringify(body) }),
}
