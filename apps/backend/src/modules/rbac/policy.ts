/**
 * Request policy: maps an incoming /admin/* request (path + method) to the
 * { resource, action } permission it requires. Because it derives the resource
 * from the URL, it gates BOTH core Medusa admin endpoints and our custom ones
 * without touching core code.
 *
 * Method -> action:  GET = read, POST = write, DELETE = delete.
 * Special overrides:  order/payment refunds -> orders:refund,
 *                     /admin/store-reset      -> settings:store-reset,
 *                     /admin/rbac/*           -> rbac:read (GET) / rbac:manage.
 */

// First /admin/<segment> path segment -> canonical resource key.
const SEGMENT_ALIASES: Record<string, string> = {
  // Catalog
  products: "products",
  "product-variants": "products",
  variants: "products",
  categories: "categories",
  "product-categories": "categories",
  collections: "collections",
  "product-collections": "collections",
  "product-types": "product_types",
  "product-tags": "product_tags",
  inventory: "inventory",
  "inventory-items": "inventory",
  reservations: "inventory",
  // Stock setup health + its one-click repair: same grant as inventory.
  "stock-health": "inventory",
  "price-lists": "price_lists",
  pricing: "price_lists",
  brands: "brands",
  "variant-costs": "product_cost",
  "variant-stock": "product_cost",
  // Orders & fulfillment
  orders: "orders",
  "quick-orders": "orders",
  // The order-processing pipeline is order work: same grant.
  "order-processing": "orders",
  payments: "orders",
  "payment-collections": "orders",
  "draft-orders": "draft_orders",
  returns: "returns",
  exchanges: "returns",
  claims: "returns",
  "return-reasons": "returns",
  "order-edits": "orders",
  fulfillments: "fulfillments",
  "fulfillment-sets": "shipping",
  // Customers
  customers: "customers",
  "customer-groups": "customer_groups",
  // Marketing
  promotions: "promotions",
  campaigns: "promotions",
  "gift-cards": "gift_cards",
  // Settings & configuration
  regions: "regions",
  "shipping-options": "shipping",
  "shipping-profiles": "shipping",
  "fulfillment-providers": "shipping",
  "stock-locations": "stock_locations",
  "sales-channels": "sales_channels",
  "tax-rates": "tax",
  "tax-regions": "tax",
  taxes: "tax",
  "api-keys": "api_keys",
  store: "settings",
  currencies: "settings",
  "store-reset": "settings",
  uploads: "settings",
  notifications: "settings",
  "notification-providers": "settings",
  "payment-providers": "settings",
  workflows: "settings",
  "workflows-executions": "settings",
  integrations: "settings",
  media: "settings",
  // Custom modules
  "store-settings": "store_settings",
  couriers: "couriers",
  tracking: "tracking",
  "auth-settings": "auth_settings",
  homepage: "homepage",
  "sales-insights": "sales_insights",
  "client-errors": "error_log",
  // Split further in resolvePermission(): /accounting/marketing -> marketing_spend.
  accounting: "accounting",
  // Access control
  users: "users",
  invites: "users",
  rbac: "rbac",
}

// GET requests to these low-sensitivity config primitives are always allowed so
// the admin SPA shell can boot even for tightly-restricted users. No orders,
// products, customers or financial data is included here.
const BOOT_GET_SEGMENTS = new Set<string>([
  "store",
  "regions",
  "currencies",
  "sales-channels",
  "stock-locations",
  "tax-rates",
  "tax-regions",
  "shipping-options",
  "shipping-profiles",
  "fulfillment-providers",
  "payment-providers",
  "notification-providers",
])

function segments(path: string): string[] {
  return path.split("/").filter(Boolean) // ["admin", "<segment>", ...]
}

/** Routes that bypass RBAC entirely (self-service + app bootstrap). */
export function isAllowlisted(path: string, method: string): boolean {
  if (path === "/admin/users/me") return true // own profile (GET/POST)
  if (path.startsWith("/admin/rbac/me")) return true // "what can I do" endpoint
  if (path.startsWith("/admin/invites/accept")) return true
  if (path.startsWith("/admin/custom")) return true // sample public route
  if (method === "GET") {
    const seg = segments(path)[1] ?? ""
    if (BOOT_GET_SEGMENTS.has(seg)) return true
  }
  return false
}

function actionForMethod(method: string): string {
  const m = method.toUpperCase()
  if (m === "DELETE") return "delete"
  if (m === "POST" || m === "PUT" || m === "PATCH") return "write"
  return "read"
}

export function resolvePermission(
  path: string,
  method: string
): { resource: string; action: string } | null {
  const parts = segments(path)
  const segment = parts[1] ?? ""

  // Destructive store reset.
  if (segment === "store-reset") {
    return { resource: "settings", action: "store-reset" }
  }

  // RBAC management endpoints.
  if (segment === "rbac") {
    return { resource: "rbac", action: actionForMethod(method) === "read" ? "read" : "manage" }
  }

  /**
   * Accounting splits into TWO resources, because the generic table above keys off the
   * first segment alone and would otherwise collapse them into one.
   *
   * Ad spend lives under /admin/accounting/marketing but is gated on `marketing_spend`, so
   * a Marketing Manager can log what they spent on Facebook without also being handed the
   * investment pool, partner drawings and the company's net worth.
   */
  if (segment === "accounting") {
    const sub = parts[2] ?? ""
    if (sub === "marketing") {
      return { resource: "marketing_spend", action: actionForMethod(method) }
    }
    return { resource: "accounting", action: actionForMethod(method) }
  }

  const resource = SEGMENT_ALIASES[segment] ?? segment.replace(/-/g, "_")

  // Refunds are high-risk on orders/payments.
  if (
    (resource === "orders" || segment === "payments" || segment === "payment-collections") &&
    /\/refunds?(\/|$)/i.test(path) &&
    actionForMethod(method) !== "read"
  ) {
    return { resource: "orders", action: "refund" }
  }

  return { resource, action: actionForMethod(method) }
}
