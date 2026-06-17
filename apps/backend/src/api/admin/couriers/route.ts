import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { COURIER_CONFIG_MODULE } from "../../../modules/courierConfig"
import { maskSecret, decryptSecret } from "../../../lib/crypto"

const ALL_COURIER_IDS = ["steadfast", "redx", "pathao"] as const

type CourierRow = {
  id: string
  courier_id: string
  enabled: boolean
  is_active: boolean
  configured: boolean
  credentials_encrypted: Record<string, unknown> | null
  settings: Record<string, unknown> | null
}

function buildHints(row: CourierRow): Record<string, string> {
  if (!row.credentials_encrypted || !row.configured) return {}

  // credentials_encrypted stores the entire creds object encrypted as one payload
  // Each field was stored individually as { field: EncryptedPayload }
  const encrypted = row.credentials_encrypted as Record<string, unknown>
  const hints: Record<string, string> = {}

  for (const [field, payload] of Object.entries(encrypted)) {
    try {
      const plain = decryptSecret(payload as any)
      hints[field] = maskSecret(plain)
    } catch {
      hints[field] = "••••"
    }
  }

  return hints
}

// GET /admin/couriers — list all three courier configs (seeds if none exist)
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(COURIER_CONFIG_MODULE) as any

  let rows: CourierRow[] = await svc.listCourierConfigs({})

  // Seed all three if none exist
  if (rows.length === 0) {
    await svc.createCourierConfigs(
      ALL_COURIER_IDS.map((id) => ({
        courier_id: id,
        enabled: false,
        is_active: false,
        configured: false,
        credentials_encrypted: null,
        settings: null,
      }))
    )
    rows = await svc.listCourierConfigs({})
  }

  // Ensure all three exist (in case some were added later)
  const existing = new Set(rows.map((r: CourierRow) => r.courier_id))
  const missing = ALL_COURIER_IDS.filter((id) => !existing.has(id))
  if (missing.length > 0) {
    await svc.createCourierConfigs(
      missing.map((id) => ({
        courier_id: id,
        enabled: false,
        is_active: false,
        configured: false,
        credentials_encrypted: null,
        settings: null,
      }))
    )
    rows = await svc.listCourierConfigs({})
  }

  const couriers = rows.map((row: CourierRow) => ({
    id: row.id,
    courier_id: row.courier_id,
    enabled: row.enabled,
    is_active: row.is_active,
    configured: row.configured,
    settings: row.settings ?? {},
    credential_hints: buildHints(row),
    // credentials_encrypted is NEVER returned
  }))

  // Sort in canonical order
  const ORDER = { steadfast: 0, redx: 1, pathao: 2 } as Record<string, number>
  couriers.sort((a, b) => (ORDER[a.courier_id] ?? 99) - (ORDER[b.courier_id] ?? 99))

  res.json({ couriers })
}
