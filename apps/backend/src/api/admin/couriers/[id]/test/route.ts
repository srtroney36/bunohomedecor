import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { COURIER_CONFIG_MODULE } from "../../../../../modules/courierConfig"
import { decryptSecret } from "../../../../../lib/crypto"

// POST /admin/couriers/:id/test — decrypt credentials and make a real connection test
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const courierId = req.params.id
  const svc = req.scope.resolve(COURIER_CONFIG_MODULE) as any
  const logger = req.scope.resolve("logger") as any

  const [row] = await svc.listCourierConfigs({ courier_id: courierId })
  if (!row) return res.status(404).json({ error: `Courier "${courierId}" not found` })
  if (!row.configured || !row.credentials_encrypted) {
    return res.json({ success: false, message: "Courier credentials not configured." })
  }

  // Decrypt all credential fields
  const credentials: Record<string, string> = {}
  try {
    for (const [field, payload] of Object.entries(row.credentials_encrypted as Record<string, unknown>)) {
      credentials[field] = decryptSecret(payload as any)
    }
  } catch (err: any) {
    logger.error(`[couriers:test] Decryption failed for ${courierId}: ${err.message}`)
    return res.json({ success: false, message: "Failed to decrypt credentials. Check APP_SECRETS_ENCRYPTION_KEY." })
  }

  const sandbox = row.settings?.sandbox !== false

  try {
    let result: { success: boolean; message: string }

    if (courierId === "steadfast") {
      result = await testSteadfast(credentials, sandbox)
    } else if (courierId === "redx") {
      result = await testRedx(credentials, sandbox)
    } else if (courierId === "pathao") {
      result = await testPathao(credentials, sandbox)
    } else {
      result = { success: false, message: `Unknown courier: ${courierId}` }
    }

    return res.json(result)
  } catch (err: any) {
    logger.error(`[couriers:test] ${courierId} test error: ${err.message}`)
    return res.json({ success: false, message: err.message })
  }
}

async function testSteadfast(
  creds: Record<string, string>,
  _sandbox: boolean
): Promise<{ success: boolean; message: string }> {
  // Steadfast has no sandbox; same API for all. Check balance/account endpoint.
  const res = await fetch("https://portal.packzy.com/api/v1/get_balance", {
    headers: {
      "Api-Key": creds.api_key ?? "",
      "Secret-Key": creds.secret_key ?? "",
      "Content-Type": "application/json",
    },
  })
  if (res.status === 401 || res.status === 403) {
    return { success: false, message: "Steadfast: invalid API key or secret." }
  }
  if (!res.ok) {
    return { success: false, message: `Steadfast API returned HTTP ${res.status}` }
  }
  const json = await res.json() as any
  if (json.status && json.status !== 200) {
    return { success: false, message: `Steadfast: ${json.message ?? json.status}` }
  }
  const balance = json.current_balance ?? json.balance ?? "—"
  return { success: true, message: `Steadfast connected. Balance: ৳${balance}` }
}

async function testRedx(
  creds: Record<string, string>,
  sandbox: boolean
): Promise<{ success: boolean; message: string }> {
  const base = sandbox
    ? "https://sandbox.redx.com.bd"
    : "https://openapi.redx.com.bd"
  const res = await fetch(`${base}/v1.0.0-beta/parcel/info`, {
    headers: {
      Authorization: `Bearer ${creds.api_token ?? ""}`,
      "Content-Type": "application/json",
    },
  })
  if (res.status === 401 || res.status === 403) {
    return { success: false, message: "RedX: invalid API token." }
  }
  if (res.status === 404) {
    // 404 on info endpoint is OK — it means auth passed but no parcel found
    return { success: true, message: `RedX (${sandbox ? "sandbox" : "live"}) token is valid.` }
  }
  if (!res.ok) {
    return { success: false, message: `RedX API returned HTTP ${res.status}` }
  }
  return { success: true, message: `RedX (${sandbox ? "sandbox" : "live"}) connected.` }
}

async function testPathao(
  creds: Record<string, string>,
  sandbox: boolean
): Promise<{ success: boolean; message: string }> {
  const base = sandbox
    ? "https://courier-api-sandbox.pathao.com"
    : "https://api-hermes.pathao.com"
  const res = await fetch(`${base}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: creds.client_id ?? "",
      client_secret: creds.client_secret ?? "",
      username: creds.username ?? "",
      password: creds.password ?? "",
      grant_type: "password",
    }),
  })
  if (!res.ok) {
    return { success: false, message: `Pathao token grant failed: HTTP ${res.status}` }
  }
  const json = await res.json() as any
  if (!json.access_token) {
    return { success: false, message: `Pathao: ${json.message ?? "token grant failed"}` }
  }
  return { success: true, message: `Pathao (${sandbox ? "sandbox" : "live"}) credentials are valid.` }
}
