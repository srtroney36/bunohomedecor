import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
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

type Row = {
  variant_id: string
  title: string
  sku: string | null
  cost: string
  packaging_cost: string
}

const ProductCostWidget = ({ data: product }: { data: { id: string } }) => {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminFetch<{
      variant_costs: {
        variant_id: string
        title: string
        sku: string | null
        cost: number
        packaging_cost: number
      }[]
    }>(`/variant-costs?product_id=${product.id}`)
      .then(({ variant_costs }) =>
        setRows(
          variant_costs.map((v) => ({
            ...v,
            cost: String(v.cost ?? 0),
            packaging_cost: String(v.packaging_cost ?? 0),
          }))
        )
      )
      .catch(() => toast.error("Failed to load cost prices"))
      .finally(() => setLoading(false))
  }, [product.id])

  const setField = (variant_id: string, field: "cost" | "packaging_cost", value: string) =>
    setRows((rs) => rs.map((r) => (r.variant_id === variant_id ? { ...r, [field]: value } : r)))

  const save = async () => {
    setSaving(true)
    try {
      await adminFetch("/variant-costs", {
        method: "POST",
        body: JSON.stringify({
          costs: rows.map((r) => ({
            variant_id: r.variant_id,
            cost: Number(r.cost) || 0,
            packaging_cost: Number(r.packaging_cost) || 0,
          })),
        }),
      })
      toast.success("Costs saved")
    } catch {
      toast.error("Failed to save costs")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="px-6 py-6 flex flex-col gap-y-4">
      <div>
        <Heading level="h2">Cost &amp; Packaging</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          <b>Cost</b> is what the item costs you (drives profit &amp; margin).{" "}
          <b>Packaging</b> is the per-unit preset drawn from the packaging pool each time a unit
          ships. Use the same currency as your selling prices.
        </Text>
      </div>

      {loading ? (
        <Text size="small" className="text-ui-fg-muted">
          Loading…
        </Text>
      ) : rows.length === 0 ? (
        <Text size="small" className="text-ui-fg-muted">
          No variants on this product.
        </Text>
      ) : (
        <div className="flex flex-col gap-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1" />
            <Text size="xsmall" className="w-32 text-ui-fg-muted">
              Cost / unit
            </Text>
            <Text size="xsmall" className="w-32 text-ui-fg-muted">
              Packaging / unit
            </Text>
          </div>
          {rows.map((r) => (
            <div key={r.variant_id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Text size="small" className="truncate">
                  {r.title}
                </Text>
                {r.sku && (
                  <Text size="xsmall" className="text-ui-fg-muted truncate">
                    {r.sku}
                  </Text>
                )}
              </div>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="w-32"
                value={r.cost}
                onChange={(e) => setField(r.variant_id, "cost", e.target.value)}
                placeholder="0"
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                className="w-32"
                value={r.packaging_cost}
                onChange={(e) => setField(r.variant_id, "packaging_cost", e.target.value)}
                placeholder="0"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="small" onClick={save} isLoading={saving} disabled={loading || saving}>
          Save
        </Button>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductCostWidget
