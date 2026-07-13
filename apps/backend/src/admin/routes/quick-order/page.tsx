import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ShoppingBag, Trash, Plus } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Label, Select, Text, toast } from "@medusajs/ui"
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
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`
    try {
      const body = await res.json()
      if (body?.message || body?.error) msg = body.message || body.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

type OrderType = "ready_stock" | "pre_order" | "custom"
type Channel = { id: string; name: string }
type Line = {
  key: string
  variant_id?: string
  product_id?: string
  title: string
  quantity: number
  unit_price: number
}
type SearchVariant = {
  variant_id: string
  product_id: string
  title: string
  unit_price: number
}

const TYPE_INFO: Record<OrderType, { label: string; blurb: string }> = {
  ready_stock: {
    label: "Ready Stock",
    blurb: "Off the shelf. Reserves and cuts real inventory, exactly like a website order.",
  },
  pre_order: {
    label: "Pre-order",
    blurb: "Sold before it's made. No stock is touched — you enter what it costs to produce.",
  },
  custom: {
    label: "Custom",
    blurb: "Made to order, not in your catalogue. Free-form items + a production cost.",
  },
}

function variantPrice(prices: any[] | undefined, cur: string): number {
  if (!prices?.length) return 0
  const hit = prices.find((p) => (p.currency_code || "").toLowerCase() === cur)
  return Number((hit ?? prices[0])?.amount ?? 0)
}

let keySeq = 0
const nextKey = () => `ln_${Date.now()}_${keySeq++}`

const QuickOrderPage = () => {
  const [orderType, setOrderType] = useState<OrderType>("ready_stock")
  const isCustom = orderType === "custom"
  const isProduction = orderType !== "ready_stock"

  // reference data
  const [channels, setChannels] = useState<Channel[]>([])
  const [regionId, setRegionId] = useState("")
  const [currency, setCurrency] = useState("bdt")
  const [shipOptId, setShipOptId] = useState<string | undefined>()

  // customer
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [postal, setPostal] = useState("")

  // options / money
  const [channelId, setChannelId] = useState("")
  const [delivery, setDelivery] = useState("0")
  const [advance, setAdvance] = useState("0")
  const [production, setProduction] = useState("0")
  const [note, setNote] = useState("")

  // items
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchVariant[]>([])
  const [lines, setLines] = useState<Line[]>([])

  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ id: string; warning?: string } | null>(null)

  useEffect(() => {
    adminFetch<{ sales_channels: Channel[] }>("/sales-channels?fields=id,name&limit=100")
      .then(({ sales_channels }) => {
        setChannels(sales_channels)
        if (sales_channels[0]) setChannelId(sales_channels[0].id)
      })
      .catch(() => toast.error("Failed to load sales channels"))

    adminFetch<{ regions: { id: string; currency_code: string }[] }>("/regions?fields=id,currency_code&limit=10")
      .then(({ regions }) => {
        if (regions[0]) {
          setRegionId(regions[0].id)
          setCurrency((regions[0].currency_code || "bdt").toLowerCase())
        }
      })
      .catch(() => {})

    adminFetch<{ shipping_options: { id: string; name: string; prices?: any[] }[] }>(
      "/shipping-options?fields=id,name,prices.amount,prices.currency_code&limit=20"
    )
      .then(({ shipping_options }) => {
        const opt = shipping_options[0]
        if (opt) {
          setShipOptId(opt.id)
          setDelivery(String(variantPrice(opt.prices, "bdt") || 0))
        }
      })
      .catch(() => {})
  }, [])

  // product search (ready-stock + pre-order pick from the catalogue; custom does not)
  useEffect(() => {
    if (isCustom) {
      setResults([])
      return
    }
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const { products } = await adminFetch<{ products: any[] }>(
          `/products?q=${encodeURIComponent(q)}&limit=8&fields=id,title,variants.id,variants.title,variants.sku,variants.prices.amount,variants.prices.currency_code`
        )
        const flat: SearchVariant[] = []
        for (const p of products) {
          for (const v of p.variants ?? []) {
            flat.push({
              variant_id: v.id,
              product_id: p.id,
              title:
                v.title && v.title !== "Default variant" ? `${p.title} — ${v.title}` : p.title,
              unit_price: variantPrice(v.prices, currency),
            })
          }
        }
        setResults(flat)
      } catch {
        /* ignore */
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, currency, isCustom])

  const addFromCatalogue = (v: SearchVariant) => {
    setLines((ls) => {
      const existing = ls.find((l) => l.variant_id === v.variant_id)
      if (existing) {
        return ls.map((l) =>
          l.variant_id === v.variant_id ? { ...l, quantity: l.quantity + 1 } : l
        )
      }
      return [...ls, { key: nextKey(), ...v, quantity: 1 }]
    })
    setQuery("")
    setResults([])
  }

  const addCustomLine = () =>
    setLines((ls) => [...ls, { key: nextKey(), title: "", quantity: 1, unit_price: 0 }])

  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key))

  const itemsTotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const grandTotal = itemsTotal + (Number(delivery) || 0)
  const advanceNum = Number(advance) || 0
  const dueAtDelivery = Math.max(0, grandTotal - advanceNum)
  // Pre/custom profit preview: selling price + delivery − production cost. Courier cost isn't
  // known until the order ships, so it's excluded here and settled on the order later.
  const estProfit = itemsTotal + (Number(delivery) || 0) - (Number(production) || 0)

  const fmt = (n: number) => `${(n || 0).toLocaleString()} ${currency.toUpperCase()}`

  const switchType = (t: OrderType) => {
    setOrderType(t)
    // Line shapes differ (catalogue vs free-form), so start the items clean on a type change.
    setLines([])
    setQuery("")
    setResults([])
    setProduction("0")
  }

  const create = async () => {
    if (!name.trim() || !phone.trim() || !address.trim())
      return toast.error("Name, phone and address are required")
    if (!lines.length) return toast.error("Add at least one item")
    if (isCustom && lines.some((l) => !l.title.trim()))
      return toast.error("Give every custom item a name")
    if (!channelId || !regionId) return toast.error("Sales channel / region not loaded")

    setCreating(true)
    try {
      const resp = await adminFetch<{ order_id: string; warning?: string }>("/quick-orders", {
        method: "POST",
        body: JSON.stringify({
          order_type: orderType,
          customer: {
            name,
            phone,
            email: email.trim() || undefined,
            address_1: address,
            city,
            postal_code: postal,
            country_code: "bd",
          },
          items: lines.map((l) => ({
            title: l.title,
            quantity: l.quantity,
            unit_price: l.unit_price,
            // Ready-stock carries the variant (draws stock). Pre-order keeps only the product
            // for identity; custom carries neither — that's what keeps stock untouched.
            ...(orderType === "ready_stock"
              ? { variant_id: l.variant_id, product_id: l.product_id }
              : orderType === "pre_order" && l.product_id
                ? { product_id: l.product_id }
                : {}),
          })),
          region_id: regionId,
          sales_channel_id: channelId,
          shipping: { name: "Delivery", amount: Number(delivery) || 0, shipping_option_id: shipOptId },
          currency_code: currency,
          advance_amount: advanceNum,
          production_cost: isProduction ? Number(production) || 0 : 0,
          note: note.trim() || undefined,
        }),
      })
      setCreated({ id: resp.order_id, warning: resp.warning })
      if (resp.warning) toast.warning(resp.warning)
      else toast.success("Order created")
    } catch (e: any) {
      toast.error(e.message || "Failed to create order")
    } finally {
      setCreating(false)
    }
  }

  const resetForm = () => {
    setName(""); setPhone(""); setEmail(""); setAddress(""); setCity(""); setPostal("")
    setNote(""); setLines([]); setQuery(""); setResults([]); setCreated(null)
    setAdvance("0"); setProduction("0")
  }

  if (created) {
    return (
      <div className="flex flex-col gap-y-4 p-4">
        <Container className="px-6 py-10 flex flex-col items-center gap-y-4 text-center">
          <Heading level="h1">Order created 🎉</Heading>
          <Badge color={orderType === "custom" ? "purple" : orderType === "pre_order" ? "blue" : "grey"}>
            {TYPE_INFO[orderType].label}
          </Badge>
          {created.warning && (
            <Text size="small" className="text-ui-tag-orange-text max-w-md">
              {created.warning}
            </Text>
          )}
          <div className="flex gap-3">
            <a href={`/app/orders/${created.id}`}>
              <Button>Open order</Button>
            </a>
            <Button variant="secondary" onClick={resetForm}>
              Create another
            </Button>
          </div>
        </Container>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-y-4 p-4">
      <Container className="px-4 py-4 sm:px-6 sm:py-6 flex flex-col gap-y-6">
        <div>
          <Heading level="h1">New Order</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Place an order for a customer from social, phone, WhatsApp, or in-store.
          </Text>
        </div>

        {/* Type */}
        <div className="flex flex-col gap-y-2">
          <Text size="small" weight="plus">Order type</Text>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TYPE_INFO) as OrderType[]).map((t) => (
              <Button
                key={t}
                size="small"
                variant={orderType === t ? "primary" : "secondary"}
                onClick={() => switchType(t)}
              >
                {TYPE_INFO[t].label}
              </Button>
            ))}
          </div>
          <Text size="xsmall" className="text-ui-fg-muted">{TYPE_INFO[orderType].blurb}</Text>
        </div>

        {/* Customer */}
        <div className="flex flex-col gap-y-3 border-t border-ui-border-base pt-4">
          <Text size="small" weight="plus">Customer</Text>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" /></Field>
            <Field label="Phone *"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801…" /></Field>
            <Field label="Address *"><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House, road, area" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field>
              <Field label="Postal"><Input value={postal} onChange={(e) => setPostal(e.target.value)} /></Field>
            </div>
            <Field label="Email (optional)"><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Leave blank if none" /></Field>
          </div>
        </div>

        {/* Items */}
        <div className="flex flex-col gap-y-3 border-t border-ui-border-base pt-4">
          <div className="flex items-center justify-between">
            <Text size="small" weight="plus">Items</Text>
            {isCustom && (
              <Button size="small" variant="secondary" onClick={addCustomLine}>
                <Plus /> Add item
              </Button>
            )}
          </div>

          {!isCustom && (
            <div className="relative">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products by name or SKU…"
              />
              {results.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-ui-border-base bg-ui-bg-base shadow-lg">
                  {results.map((r) => (
                    <button
                      key={r.variant_id}
                      onClick={() => addFromCatalogue(r)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-ui-bg-subtle"
                    >
                      <Text size="small" className="truncate">{r.title}</Text>
                      <span className="flex items-center gap-1 text-ui-fg-muted">
                        <Text size="xsmall">{fmt(r.unit_price)}</Text>
                        <Plus className="w-3 h-3" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {lines.length === 0 ? (
            <Text size="small" className="text-ui-fg-muted">
              {isCustom ? "No items yet — add one above." : "No items yet — search above."}
            </Text>
          ) : (
            <div className="flex flex-col gap-y-3 sm:gap-y-2">
              {/* Column labels — hidden on phones where each item stacks into its own card */}
              <div className="hidden sm:flex items-center gap-2 text-ui-fg-muted">
                <Text size="xsmall" className="flex-1">Item</Text>
                <Text size="xsmall" className="w-16 text-center">Qty</Text>
                <Text size="xsmall" className="w-28 text-center">Selling price</Text>
                <Text size="xsmall" className="w-24 text-right">Line total</Text>
                <span className="w-4" />
              </div>
              {lines.map((l) => (
                <div
                  key={l.key}
                  className="flex flex-col gap-2 rounded-lg border border-ui-border-base p-3 sm:flex-row sm:items-center sm:gap-2 sm:rounded-none sm:border-0 sm:p-0"
                >
                  {/* Row 1 on mobile: the item name (or label) + remove */}
                  <div className="flex items-center gap-2 sm:flex-1 sm:min-w-0">
                    {isCustom ? (
                      <Input
                        className="flex-1 min-w-0"
                        placeholder="Item name"
                        value={l.title}
                        onChange={(e) => updateLine(l.key, { title: e.target.value })}
                      />
                    ) : (
                      <Text size="small" className="flex-1 min-w-0 truncate">{l.title}</Text>
                    )}
                    <button
                      onClick={() => removeLine(l.key)}
                      className="shrink-0 text-ui-fg-muted hover:text-ui-fg-error sm:hidden"
                      aria-label="Remove item"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Row 2 on mobile: qty × price = total, each labelled */}
                  <div className="flex items-end gap-2 sm:contents">
                    <label className="flex flex-1 flex-col gap-y-1 sm:w-16 sm:flex-none">
                      <Text size="xsmall" className="text-ui-fg-muted sm:hidden">Qty</Text>
                      <Input
                        type="number" min={1}
                        value={String(l.quantity)}
                        onChange={(e) => updateLine(l.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-y-1 sm:w-28 sm:flex-none">
                      <Text size="xsmall" className="text-ui-fg-muted sm:hidden">Selling price</Text>
                      <Input
                        type="number" min={0}
                        value={String(l.unit_price)}
                        onChange={(e) => updateLine(l.key, { unit_price: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </label>
                    <Text size="small" className="w-24 pb-2 text-right text-ui-fg-subtle sm:pb-0">
                      {fmt(l.quantity * l.unit_price)}
                    </Text>
                    <button
                      onClick={() => removeLine(l.key)}
                      className="hidden shrink-0 pb-2 text-ui-fg-muted hover:text-ui-fg-error sm:block sm:pb-0"
                      aria-label="Remove item"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-ui-border-base pt-4">
          <Field label="Sales channel">
            <Select value={channelId} onValueChange={setChannelId}>
              <Select.Trigger><Select.Value placeholder="Channel" /></Select.Trigger>
              <Select.Content>
                {channels.map((ch) => (
                  <Select.Item key={ch.id} value={ch.id}>{ch.name}</Select.Item>
                ))}
              </Select.Content>
            </Select>
          </Field>
          <Field label={`Delivery charged (${currency.toUpperCase()})`}>
            <Input type="number" min={0} value={delivery} onChange={(e) => setDelivery(e.target.value)} />
            <Text size="xsmall" className="text-ui-fg-muted">
              Shipment charge billed to the customer — revenue. What the courier costs you is set
              on the order later.
            </Text>
          </Field>
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note" />
          </Field>
        </div>

        {/* Payment + production */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-ui-border-base pt-4">
          <Field label={`Advance paid now (${currency.toUpperCase()})`}>
            <Input type="number" min={0} value={advance} onChange={(e) => setAdvance(e.target.value)} />
            <Text size="xsmall" className="text-ui-fg-muted">
              Optional. The rest is Cash on Delivery, collected when you mark it Delivered.
            </Text>
          </Field>
          {isProduction && (
            <Field label={`Production cost (${currency.toUpperCase()})`}>
              <Input type="number" min={0} value={production} onChange={(e) => setProduction(e.target.value)} />
              <Text size="xsmall" className="text-ui-fg-muted">
                What it costs you to make. This is the order's cost of goods — editable later.
              </Text>
            </Field>
          )}
        </div>

        {/* Profit preview — shows exactly how the order's profit is worked out */}
        {isProduction && (itemsTotal > 0 || Number(production) > 0) && (
          <div className="flex flex-col gap-y-1 rounded-lg bg-ui-bg-subtle p-3">
            <Text size="xsmall" className="text-ui-fg-muted">
              Selling price {fmt(itemsTotal)} + delivery {fmt(Number(delivery) || 0)} − production{" "}
              {fmt(Number(production) || 0)} = estimated profit
              <span className="text-ui-fg-muted"> (before courier cost)</span>
            </Text>
            <Text
              size="small"
              weight="plus"
              className={estProfit >= 0 ? "text-ui-tag-green-text" : "text-ui-tag-red-text"}
            >
              Est. profit {fmt(estProfit)}
            </Text>
          </div>
        )}

        {/* Total + submit */}
        <div className="flex items-center justify-between border-t border-ui-border-base pt-4">
          <div className="flex flex-col">
            <Text size="small" className="text-ui-fg-muted">
              Items {fmt(itemsTotal)} + Delivery {fmt(Number(delivery) || 0)}
              {advanceNum > 0 ? ` · Advance ${fmt(advanceNum)} · Due ${fmt(dueAtDelivery)}` : ""}
            </Text>
            <Text className="text-lg font-semibold">Total {fmt(grandTotal)}</Text>
          </div>
          <Button onClick={create} isLoading={creating} disabled={creating}>
            Create {TYPE_INFO[orderType].label} order
          </Button>
        </div>
      </Container>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-y-1">
      <Label size="small">{label}</Label>
      {children}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "New Order",
  icon: ShoppingBag,
  rank: 1,
})

export default QuickOrderPage
