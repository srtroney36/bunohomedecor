import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Prompt,
  Select,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { money } from "../lib/kpi"
import {
  ISSUE_STATUS_META,
  ORDER_STATUS_META,
  ORDER_TYPE_META,
  PAYMENT_STATUS_META,
  TRANSITION_EFFECT,
  opApi,
  type IssueStatusKey,
  type OrderStatusKey,
} from "../lib/order-processing-api"

/**
 * The control panel. Changing a status here PERFORMS the action — it doesn't just label it —
 * so every move is confirmed with exactly what it will do to stock and cash.
 *
 * Payment status has no dropdown on purpose: it is derived from the money that actually moved.
 * Offering to "set" it would be offering to lie.
 */
const OrderStatusPanel = ({ data: order }: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const orderId = (order as any).id
  const qc = useQueryClient()
  const cur = (order as any).currency_code ?? "bdt"

  const { data, isLoading } = useQuery({
    queryKey: ["order-processing", orderId],
    queryFn: () => opApi.get(orderId),
  })

  const [pending, setPending] = useState<OrderStatusKey | null>(null)
  const [fee, setFee] = useState("")
  const [rateId, setRateId] = useState<string>("")
  const [deliveryCharged, setDeliveryCharged] = useState("")
  const [prodCost, setProdCost] = useState("")

  const o = data?.order

  useEffect(() => {
    if (!o) return
    setFee(String(o.courier_cost ?? 0))
    setDeliveryCharged(String(o.delivery_charged ?? 0))
    setProdCost(String(o.production_cost ?? 0))
  }, [o?.courier_cost, o?.delivery_charged, o?.production_cost]) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["order-processing"] })
    setTimeout(() => location.reload(), 700) // Medusa's own order panels must re-read too
  }

  const move = useMutation({
    mutationFn: (to: OrderStatusKey) => opApi.update(orderId, { order_status: to }),
    onSuccess: () => {
      toast.success("Order updated — stock and cash follow automatically")
      setPending(null)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const setIssue = useMutation({
    mutationFn: (issue: IssueStatusKey) => opApi.update(orderId, { issue_status: issue }),
    onSuccess: (_r, issue) => {
      toast.success(
        issue === "damaged"
          ? "Marked damaged — the goods were written off at cost, not restocked"
          : "Issue updated"
      )
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const saveFee = useMutation({
    mutationFn: () =>
      opApi.update(orderId, {
        courier_fee: Number(fee) || 0,
        courier_rate_id: rateId || null,
      }),
    onSuccess: () => {
      toast.success("Courier fee saved and booked to the Cash Book")
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const saveDelivery = useMutation({
    mutationFn: () => opApi.update(orderId, { delivery_charged: Number(deliveryCharged) || 0 }),
    onSuccess: () => {
      toast.success("Delivery charge updated — revenue recalculated")
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const saveProdCost = useMutation({
    mutationFn: () => opApi.update(orderId, { production_cost: Number(prodCost) || 0 }),
    onSuccess: () => {
      toast.success("Production cost updated — this order's COGS recalculated")
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading || !o) return null

  const os = ORDER_STATUS_META[o.order_status]
  const ps = PAYMENT_STATUS_META[o.payment_status]
  const is = ISSUE_STATUS_META[o.issue_status]
  const ot = ORDER_TYPE_META[o.order_type]
  const isProduction = o.order_type !== "ready_stock"
  const next = data?.allowed_next ?? []
  const rates = data?.courier_rates ?? []

  const feeNum = Number(fee) || 0
  const deliveryNum = Number(deliveryCharged) || 0
  const margin = deliveryNum - feeNum

  return (
    <Container className="flex flex-col gap-y-4 px-6 py-6">
      <div>
        <Heading level="h2">Order Processing</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Moving the status here does the real work — it isn't a label.
        </Text>
      </div>

      {/* Current state */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge size="small" color={ot.color}>
          {ot.label}
        </Badge>
        <Badge size="small" color={os.color}>
          {os.label}
        </Badge>
        <Badge size="small" color={ps.color}>
          {ps.label}
        </Badge>
        {o.issue_status !== "none" && (
          <Badge size="small" color={is.color}>
            {is.label}
          </Badge>
        )}
      </div>

      {o.outstanding > 0 && (
        <Text size="xsmall" className="text-ui-fg-muted">
          {money(o.captured, cur)} collected · <b>{money(o.outstanding, cur)} still owed</b>
          {o.payment_status === "cod" || o.payment_status === "advance_paid"
            ? " — collected when you mark it Delivered."
            : ""}
        </Text>
      )}

      {/* Move it on */}
      {next.length > 0 && (
        <div className="flex flex-col gap-y-2">
          <Label size="small">Move to</Label>
          <div className="flex flex-wrap gap-1.5">
            {next.map((s) => (
              <Button
                key={s}
                size="small"
                variant={s === "cancelled" ? "danger" : "secondary"}
                onClick={() => setPending(s)}
              >
                {ORDER_STATUS_META[s].label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Courier fee → delivery margin */}
      <div className="flex flex-col gap-y-2 border-t border-ui-border-base pt-4">
        <Label size="small">Courier fee (what they charge us)</Label>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            value={rateId}
            onValueChange={(v) => {
              setRateId(v)
              const r = rates.find((x) => x.id === v)
              if (r) setFee(String(r.fee))
            }}
          >
            <Select.Trigger className="w-40">
              <Select.Value placeholder="Zone" />
            </Select.Trigger>
            <Select.Content>
              {rates.map((r) => (
                <Select.Item key={r.id} value={r.id}>
                  {r.name} — {money(r.fee, cur)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Input
            type="number"
            min="0"
            step="1"
            className="w-24"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
          <Button size="small" onClick={() => saveFee.mutate()} isLoading={saveFee.isPending}>
            Save
          </Button>
        </div>
        <Text size="xsmall" className={margin < 0 ? "text-ui-tag-red-text" : "text-ui-fg-muted"}>
          Charged the customer {money(deliveryNum, cur)} · costs us {money(feeNum, cur)} ·{" "}
          <b>delivery {margin >= 0 ? "makes" : "loses"} {money(Math.abs(margin), cur)}</b>
        </Text>
      </div>

      {/* Delivery charged (revenue) — the editable "overcharge" */}
      <div className="flex flex-col gap-y-2 border-t border-ui-border-base pt-4">
        <Label size="small">Delivery charged (what the customer pays us)</Label>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="number"
            min="0"
            step="1"
            className="w-28"
            value={deliveryCharged}
            onChange={(e) => setDeliveryCharged(e.target.value)}
          />
          <Button
            size="small"
            variant="secondary"
            onClick={() => saveDelivery.mutate()}
            isLoading={saveDelivery.isPending}
          >
            Save
          </Button>
        </div>
      </div>

      {/* Production cost — pre-order / custom only */}
      {isProduction && (
        <div className="flex flex-col gap-y-2 border-t border-ui-border-base pt-4">
          <Label size="small">Production cost (this order's cost of goods)</Label>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              type="number"
              min="0"
              step="1"
              className="w-28"
              value={prodCost}
              onChange={(e) => setProdCost(e.target.value)}
            />
            <Button
              size="small"
              variant="secondary"
              onClick={() => saveProdCost.mutate()}
              isLoading={saveProdCost.isPending}
            >
              Save
            </Button>
          </div>
          <Text size="xsmall" className="text-ui-fg-muted">
            What it cost to make. Booked to the Cash Book and used as this order's COGS. Editable
            any time — the P&amp;L recomputes.
          </Text>
        </div>
      )}

      {/* Issue */}
      <div className="flex flex-col gap-y-2 border-t border-ui-border-base pt-4">
        <Label size="small">Issue</Label>
        <Select
          value={o.issue_status}
          onValueChange={(v) => setIssue.mutate(v as IssueStatusKey)}
        >
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {(Object.keys(ISSUE_STATUS_META) as IssueStatusKey[]).map((k) => (
              <Select.Item key={k} value={k}>
                {ISSUE_STATUS_META[k].label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <Text size="xsmall" className="text-ui-fg-muted">
          <b>Damaged</b> writes the goods off at cost — they are not put back on the shelf, because
          they no longer exist.
        </Text>
      </div>

      {/* This order's P&L */}
      <div className="flex flex-col gap-y-1 rounded-lg bg-ui-bg-subtle p-3">
        <Text size="xsmall" className="text-ui-fg-muted">
          Revenue {money(o.product_revenue, cur)} + delivery {money(o.delivery_charged, cur)} −
          goods {money(o.cogs, cur)} − packaging {money(o.packaging, cur)} − courier{" "}
          {money(o.courier_cost, cur)}
          {o.write_off > 0 ? ` − written off ${money(o.write_off, cur)}` : ""}
        </Text>
        <Text
          size="small"
          weight="plus"
          className={o.net_profit >= 0 ? "text-ui-tag-green-text" : "text-ui-tag-red-text"}
        >
          This order {o.net_profit >= 0 ? "made" : "lost"} {money(Math.abs(o.net_profit), cur)}
        </Text>
      </div>

      {/* Confirm — always say what will actually happen */}
      <Prompt open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>
              Move to {pending ? ORDER_STATUS_META[pending].label : ""}?
            </Prompt.Title>
            <Prompt.Description>
              {(pending && TRANSITION_EFFECT[pending]) ??
                "Records the stage. Nothing moves in stock or cash."}
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={() => pending && move.mutate(pending)}>Confirm</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.before",
})

export default OrderStatusPanel
