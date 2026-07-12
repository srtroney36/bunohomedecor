/**
 * Central RBAC permission catalog + pure permission-check helper.
 *
 * Permissions are code-defined (not stored in the DB). A role stores an array of
 * permission keys of the form "<resource>:<action>". This file is the single
 * source of truth for which resources/actions exist, how a permission set is
 * evaluated (`hasPermission`), and the seeded default roles (`SYSTEM_ROLES`).
 *
 * Wildcards:
 *   "*"                -> super admin (all resources/actions). Owner only.
 *   "<resource>:*"     -> every action on a resource (incl. high-risk).
 *   "<resource>:manage"-> read/write/delete on a resource (NOT high-risk actions).
 */

export type PermissionAction =
  | "read"
  | "write"
  | "delete"
  | "manage"
  | "refund"
  | "store-reset"

export type ResourceGroup =
  | "catalog"
  | "sales"
  | "customers"
  | "marketing"
  | "accounting"
  | "settings"
  | "insights"
  | "access"

export type ResourceDef = {
  key: string
  label: string
  group: ResourceGroup
  actions: PermissionAction[]
}

// Actions NOT implied by ":manage" — they must be granted explicitly.
export const HIGH_RISK_ACTIONS: PermissionAction[] = ["refund", "store-reset"]

const STD: PermissionAction[] = ["read", "write", "delete", "manage"]

export const RESOURCE_GROUP_LABELS: Record<ResourceGroup, string> = {
  catalog: "Catalog",
  sales: "Orders & Fulfillment",
  customers: "Customers",
  marketing: "Marketing",
  accounting: "Accounting & Finance",
  settings: "Settings & Configuration",
  insights: "Insights",
  access: "Access Control",
}

// Order in which groups are rendered in the admin permission matrix.
export const RESOURCE_GROUP_ORDER: ResourceGroup[] = [
  "catalog",
  "sales",
  "customers",
  "marketing",
  "accounting",
  "settings",
  "insights",
  "access",
]

export const RESOURCES: ResourceDef[] = [
  // Catalog
  { key: "products", label: "Products", group: "catalog", actions: STD },
  { key: "categories", label: "Categories", group: "catalog", actions: STD },
  { key: "collections", label: "Collections", group: "catalog", actions: STD },
  { key: "product_types", label: "Product Types", group: "catalog", actions: STD },
  { key: "product_tags", label: "Product Tags", group: "catalog", actions: STD },
  { key: "inventory", label: "Inventory & Reservations", group: "catalog", actions: STD },
  { key: "price_lists", label: "Price Lists", group: "catalog", actions: STD },
  { key: "brands", label: "Brands", group: "catalog", actions: STD },
  { key: "product_cost", label: "Product Costs", group: "catalog", actions: STD },
  // Orders & fulfillment
  {
    key: "orders",
    label: "Orders",
    group: "sales",
    actions: ["read", "write", "delete", "manage", "refund"],
  },
  { key: "draft_orders", label: "Draft Orders", group: "sales", actions: STD },
  { key: "returns", label: "Returns / Exchanges / Claims", group: "sales", actions: STD },
  { key: "fulfillments", label: "Fulfillments", group: "sales", actions: STD },
  // Customers
  { key: "customers", label: "Customers", group: "customers", actions: STD },
  { key: "customer_groups", label: "Customer Groups", group: "customers", actions: STD },
  // Marketing
  { key: "promotions", label: "Promotions & Campaigns", group: "marketing", actions: STD },
  { key: "gift_cards", label: "Gift Cards", group: "marketing", actions: STD },
  // Served by the accounting module, but grouped here so a marketer finds it where they
  // expect — and so it can be granted WITHOUT granting the investment pool.
  { key: "marketing_spend", label: "Marketing Spend & Ad Costs", group: "marketing", actions: STD },
  // Accounting & finance
  {
    key: "accounting",
    label: "Accounting (Investment Pool, Cash Book, Fixed Assets, Net Worth)",
    group: "accounting",
    actions: STD,
  },
  // Settings & configuration
  { key: "regions", label: "Regions", group: "settings", actions: STD },
  { key: "shipping", label: "Shipping & Fulfillment Config", group: "settings", actions: STD },
  { key: "sales_channels", label: "Sales Channels", group: "settings", actions: STD },
  { key: "stock_locations", label: "Stock Locations", group: "settings", actions: STD },
  { key: "tax", label: "Tax", group: "settings", actions: STD },
  { key: "api_keys", label: "API Keys", group: "settings", actions: STD },
  {
    key: "settings",
    label: "Store & General Config",
    group: "settings",
    actions: ["read", "write", "manage", "store-reset"],
  },
  { key: "store_settings", label: "Store Settings (custom)", group: "settings", actions: STD },
  { key: "couriers", label: "Couriers", group: "settings", actions: STD },
  { key: "tracking", label: "Tracking & Pixels", group: "settings", actions: STD },
  { key: "auth_settings", label: "Storefront Auth", group: "settings", actions: STD },
  { key: "homepage", label: "Homepage Builder", group: "settings", actions: STD },
  // Insights
  { key: "sales_insights", label: "Sales Insights", group: "insights", actions: ["read", "manage"] },
  { key: "error_log", label: "Error Log", group: "insights", actions: ["read", "manage"] },
  // Access control
  { key: "users", label: "Team Members", group: "access", actions: STD },
  { key: "rbac", label: "Roles & Permissions", group: "access", actions: ["read", "manage"] },
]

export const RESOURCE_KEYS: string[] = RESOURCES.map((r) => r.key)

const HIGH_RISK_SET = new Set<string>(HIGH_RISK_ACTIONS)

/**
 * Evaluate whether a permission set grants `<resource>:<action>`.
 * Pure & dependency-free so it can also be duplicated on the admin UI side.
 */
export function hasPermission(
  perms: string[] | undefined | null,
  resource: string,
  action: string
): boolean {
  if (!perms || perms.length === 0) return false
  if (perms.includes("*")) return true
  if (perms.includes(`${resource}:*`)) return true
  if (perms.includes(`${resource}:${action}`)) return true
  // "manage" implies read/write/delete, but never the high-risk actions.
  if (!HIGH_RISK_SET.has(action) && perms.includes(`${resource}:manage`)) return true
  // Anyone who can write/delete/manage a resource can also read it.
  if (action === "read") {
    if (
      perms.includes(`${resource}:write`) ||
      perms.includes(`${resource}:delete`) ||
      perms.includes(`${resource}:manage`)
    ) {
      return true
    }
  }
  return false
}

// ---- Seeded default roles -------------------------------------------------

const manage = (...keys: string[]) => keys.map((k) => `${k}:manage`)
const read = (...keys: string[]) => keys.map((k) => `${k}:read`)

const CATALOG = [
  "products",
  "categories",
  "collections",
  "product_types",
  "product_tags",
  "inventory",
  "price_lists",
  "brands",
  "product_cost",
]
const SALES = ["orders", "draft_orders", "returns", "fulfillments"]
const CUSTOMERS = ["customers", "customer_groups"]
const MARKETING = ["promotions", "gift_cards", "marketing_spend"]

/**
 * The investment pool is private to the owners.
 *
 * `accounting` exposes partner capital, drawings, retained earnings and the company's net
 * worth. Only the Owner and Finance get it — NOT the blanket roles below, several of which
 * build their permissions by mapping over every resource key and would otherwise hand
 * themselves read access to the partners' balances without anyone deciding that.
 *
 * Marketing spend is deliberately NOT in here: it lives in the `marketing` group and is
 * granted on its own, so a marketer can log ad costs without seeing the pool.
 */
const PRIVATE_TO_OWNERS = ["accounting"]

export type SystemRoleDef = {
  slug: string
  name: string
  description: string
  permissions: string[]
}

export const OWNER_SLUG = "owner"

export const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    slug: OWNER_SLUG,
    name: "Owner",
    description:
      "Full, unrestricted access including team, roles and destructive operations. Cannot be modified or removed.",
    permissions: ["*"],
  },
  {
    slug: "administrator",
    name: "Administrator",
    description:
      "Full store operations and settings. Cannot manage roles or reset the store.",
    permissions: [
      ...RESOURCE_KEYS.filter(
        (k) => k !== "rbac" && !PRIVATE_TO_OWNERS.includes(k)
      ).map((k) => `${k}:manage`),
      "rbac:read",
      "orders:refund",
    ],
  },
  {
    slug: "store-manager",
    name: "Store Manager",
    description:
      "Runs day-to-day store operations: catalog, orders, customers and marketing.",
    permissions: [
      ...manage(...CATALOG),
      ...manage(...SALES),
      "orders:refund",
      ...manage(...CUSTOMERS),
      ...manage(...MARKETING),
      ...manage("homepage", "store_settings", "couriers", "tracking"),
      ...read("sales_insights", "error_log"),
      ...read("regions", "shipping", "sales_channels", "stock_locations", "tax", "settings", "auth_settings"),
    ],
  },
  {
    slug: "catalog-manager",
    name: "Catalog / Product Manager",
    description: "Manages products, categories, inventory and pricing.",
    permissions: [
      ...manage(
        "products",
        "categories",
        "collections",
        "product_types",
        "product_tags",
        "inventory",
        "price_lists",
        "brands",
        "product_cost",
        "homepage"
      ),
      ...read("orders", "customers"),
    ],
  },
  {
    slug: "order-manager",
    name: "Order / Fulfillment Manager",
    description: "Processes orders, fulfillments and returns.",
    permissions: [
      ...manage("orders", "draft_orders", "returns", "fulfillments", "couriers", "tracking"),
      "orders:refund",
      "inventory:read",
      "inventory:write",
      ...read("products", "customers", "stock_locations", "shipping"),
    ],
  },
  {
    slug: "customer-support",
    name: "Customer Support",
    description:
      "Assists customers with orders and returns. Cannot issue refunds or change pricing.",
    permissions: [
      "orders:read",
      "orders:write",
      "draft_orders:read",
      "draft_orders:write",
      "returns:read",
      "returns:write",
      "customers:read",
      "customers:write",
      ...read("products", "couriers", "tracking", "error_log"),
    ],
  },
  {
    slug: "marketing-manager",
    name: "Marketing Manager",
    description: "Runs promotions, campaigns and merchandising.",
    permissions: [
      ...manage("promotions", "gift_cards", "price_lists", "customer_groups", "homepage"),
      // Can log ad spend and see whether the ads paid for themselves — but gets no access
      // to `accounting`, so the investment pool and net worth stay out of reach.
      ...manage("marketing_spend"),
      ...read("products", "categories", "collections", "customers", "sales_insights"),
    ],
  },
  {
    slug: "finance",
    name: "Finance / Accountant",
    description:
      "Reviews orders and financials, runs the investment pool, cash book and fixed assets, issues refunds and manages tax.",
    permissions: [
      "orders:read",
      "orders:refund",
      "tax:manage",
      // The primary role for the Accounting section.
      ...manage("accounting", "marketing_spend"),
      ...read("sales_insights", "regions", "settings", "customers", "price_lists", "gift_cards"),
    ],
  },
  {
    slug: "analyst",
    name: "Analyst (Read-Only)",
    description: "Read-only access to store data and insights.",
    // Reads everything EXCEPT the investment pool. This role grants itself every resource
    // key, so a new resource lands here automatically — which is exactly how partner
    // capital and net worth would have leaked to every read-only account without anyone
    // choosing that. `accounting` is excluded on purpose; see PRIVATE_TO_OWNERS.
    permissions: RESOURCE_KEYS.filter(
      (k) => !["rbac", "users", ...PRIVATE_TO_OWNERS].includes(k)
    ).map((k) => `${k}:read`),
  },
  {
    slug: "warehouse",
    name: "Inventory / Warehouse",
    description: "Manages inventory, stock locations and fulfillments.",
    permissions: [
      ...manage("inventory", "stock_locations", "fulfillments"),
      ...read("products", "orders", "couriers", "shipping"),
    ],
  },
]
