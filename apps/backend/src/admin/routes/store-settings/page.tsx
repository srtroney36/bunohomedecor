import { defineRouteConfig } from "@medusajs/admin-sdk"
import { AdjustmentsDone } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

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

  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json() as Promise<T>
}

const StoreSettingsPage = () => {
  const [whatsapp, setWhatsapp] = useState("")
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminFetch<{ setting: { whatsapp_number: string | null; order_phone: string | null } }>(
      "/store-settings"
    )
      .then(({ setting }) => {
        setWhatsapp(setting?.whatsapp_number ?? "")
        setPhone(setting?.order_phone ?? "")
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminFetch("/store-settings", {
        method: "POST",
        body: JSON.stringify({
          whatsapp_number: whatsapp.trim() || null,
          order_phone: phone.trim() || null,
        }),
      })
      toast.success("Settings saved")
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-y-4 p-4 max-w-2xl">
      <Container className="px-6 py-6 flex flex-col gap-y-6">
        <div>
          <Heading level="h1">Store Settings</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Configure contact buttons shown on product pages.
          </Text>
        </div>

        <div className="flex flex-col gap-y-4">
          <div className="flex flex-col gap-y-1">
            <Label>WhatsApp Number</Label>
            <Text size="xsmall" className="text-ui-fg-muted">
              Include country code, e.g. +8801712345678. Leave blank to hide the WhatsApp button.
            </Text>
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+8801712345678"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-y-1">
            <Label>Order Phone Number</Label>
            <Text size="xsmall" className="text-ui-fg-muted">
              Phone number for the "Call For Order" button, e.g. +8801712345678. Leave blank to hide.
            </Text>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+8801712345678"
              disabled={loading}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} isLoading={saving} disabled={loading || saving}>
            Save Settings
          </Button>
        </div>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Store Settings",
  icon: AdjustmentsDone,
  rank: 1,
})

export default StoreSettingsPage
