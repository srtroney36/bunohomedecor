import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ShoppingBag } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"

import { money } from "../../lib/kpi"
import {
  ISSUE_STATUS_META,
  ORDER_STATUS_META,
  ORDER_STATUS_ORDER,
  ORDER_TYPE_META,
  PAYMENT_STATUS_META,
  opApi,
  type OrderStatusKey,
} from "../../lib/order-processing-api"

/**
 * The PRE-ORDERS queue — pre-order and custom orders that move through a production pipeline
 * (New → Confirmed → In Production → Ready → Booked → Dispatched → Delivered). Ready-stock orders
 * work like website orders and don't need this, but a filter can show them too.
 *
 * Every status here is the TRUTH, not a label someone remembered to update: anything from
 * Dispatched onwards is derived from Medusa itself, and payment status is derived from the money
 * that actually moved.
 */
type TypeFilter = "production" | "ready_stock" | "all"

const OrderProcessingPage = () => {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("production")
  const [status, setStatus] = useState<OrderStatusKey | "all">("all")

  /**
   * Fetch every order ONCE (type=all), filter in the browser. Filtering is a view of data we
   * already have, not a new question, so switching a tab should cost nothing — the request used
   * to be re-fired on every click, which blanked the table and read as a glitch.
   */
  const { data, isLoading } = useQuery({
    queryKey: ["order-processing", "all"],
    queryFn: () => opApi.list({ type: "all" }),
  })

  const everything = useMemo(() => data?.orders ?? [], [data])
  const typeCounts = data?.type_counts ?? { ready_stock: 0, pre_order: 0, custom: 0 }
  const cur = "bdt"

  // First narrow by type (the "Pre-orders" default = pre_order + custom), then by status.
  const typeRows = useMemo(() => {
    if (typeFilter === "all") return everything
    if (typeFilter === "ready_stock") return everything.filter((r) => r.order_type === "ready_stock")
    return everything.filter((r) => r.order_type === "pre_order" || r.order_type === "custom")
  }, [everything, typeFilter])

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of typeRows) m[r.order_status] = (m[r.order_status] ?? 0) + 1
    return m
  }, [typeRows])

  const rows = useMemo(
    () => (status === "all" ? typeRows : typeRows.filter((r) => r.order_status === status)),
    [typeRows, status]
  )

  // Totals follow whatever is on screen, so the money always matches the rows below it.
  const t = useMemo(() => {
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0)
    return {
      revenue: sum((r) => r.product_revenue),
      delivery_margin: sum((r) => r.delivery_margin),
      cogs: sum((r) => r.cogs),
      packaging: sum((r) => r.packaging),
      outstanding: sum((r) => r.outstanding),
      net_profit: sum((r) => r.net_profit),
    }
  }, [rows])

  return (
    <div className="flex flex-col gap-y-4 p-4">
      <Container className="flex flex-col gap-y-5 px-4 py-4 sm:px-6 sm:py-6">
        <div>
          <Heading level="h1">Pre-orders</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Pre-orders and custom orders, worked through the production pipeline. Moving an order
            here <b>does the real thing</b> — Dispatched ships and books the cost, Delivered
            collects the cash. Statuses are derived from what actually happened, so they can't
            drift from Medusa.
          </Text>
        </div>

        {/* Type filter */}
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="small"
            variant={typeFilter === "production" ? "primary" : "secondary"}
            onClick={() => setTypeFilter("production")}
          >
            Pre-order &amp; Custom ({typeCounts.pre_order + typeCounts.custom})
          </Button>
          <Button
            size="small"
            variant={typeFilter === "ready_stock" ? "primary" : "secondary"}
            onClick={() => setTypeFilter("ready_stock")}
          >
            Ready Stock ({typeCounts.ready_stock})
          </Button>
          <Button
            size="small"
            variant={typeFilter === "all" ? "primary" : "secondary"}
            onClick={() => setTypeFilter("all")}
          >
            All ({typeCounts.ready_stock + typeCounts.pre_order + typeCounts.custom})
          </Button>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="small"
            variant={status === "all" ? "primary" : "secondary"}
            onClick={() => setStatus("all")}
          >
            All ({typeRows.length})
          </Button>
          {ORDER_STATUS_ORDER.map((s) => (
            <Button
              key={s}
              size="small"
              variant={status === s ? "primary" : "secondary"}
              onClick={() => setStatus(s)}
            >
              {ORDER_STATUS_META[s].label} {counts[s] ? `(${counts[s]})` : ""}
            </Button>
          ))}
        </div>

        {/* Money for whatever is in view */}
        {t && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Kpi label="Revenue" value={money(t.revenue, cur)} />
            <Kpi
              label="Delivery margin"
              value={money(t.delivery_margin, cur)}
              hint="charged − courier cost"
              accent={t.delivery_margin >= 0 ? "green" : "red"}
            />
            <Kpi label="COGS + packaging" value={money(t.cogs + t.packaging, cur)} accent="red" />
            <Kpi
              label="COD outstanding"
              value={money(t.outstanding, cur)}
              hint="still to collect"
              accent={t.outstanding > 0 ? "orange" : "base"}
            />
            <Kpi
              label="Net profit"
              value={money(t.net_profit, cur)}
              accent={t.net_profit >= 0 ? "green" : "red"}
            />
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-ui-border-base">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Order</Table.HeaderCell>
                <Table.HeaderCell className="hidden lg:table-cell">Type</Table.HeaderCell>
                <Table.HeaderCell>Customer</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell className="hidden sm:table-cell">Payment</Table.HeaderCell>
                <Table.HeaderCell className="hidden md:table-cell">Issue</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Total</Table.HeaderCell>
                <Table.HeaderCell className="hidden md:table-cell text-right">Delivery</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Net</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((r) => {
                const os = ORDER_STATUS_META[r.order_status]
                const ps = PAYMENT_STATUS_META[r.payment_status]
                const is = ISSUE_STATUS_META[r.issue_status]
                return (
                  <Table.Row
                    key={r.order_id}
                    className="cursor-pointer"
                    onClick={() => {
                      window.location.href = `/app/orders/${r.order_id}`
                    }}
                  >
                    <Table.Cell className="whitespace-nowrap font-medium">
                      #{r.display_id}
                    </Table.Cell>
                    <Table.Cell className="hidden lg:table-cell">
                      <Badge size="2xsmall" color={ORDER_TYPE_META[r.order_type].color}>
                        {ORDER_TYPE_META[r.order_type].label}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell className="max-w-[140px] truncate sm:max-w-[180px]">{r.customer}</Table.Cell>
                    <Table.Cell>
                      <Badge size="2xsmall" color={os.color}>
                        {os.label}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell className="hidden sm:table-cell">
                      <Badge size="2xsmall" color={ps.color}>
                        {ps.label}
                      </Badge>
                      {r.outstanding > 0 && (
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {money(r.outstanding, cur)} due
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell className="hidden md:table-cell">
                      {r.issue_status !== "none" && (
                        <Badge size="2xsmall" color={is.color}>
                          {is.label}
                        </Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell className="text-right">{money(r.total, cur)}</Table.Cell>
                    <Table.Cell
                      className={`hidden md:table-cell text-right ${
                        r.delivery_margin < 0 ? "text-ui-tag-red-text" : "text-ui-fg-subtle"
                      }`}
                    >
                      {money(r.delivery_margin, cur)}
                    </Table.Cell>
                    <Table.Cell
                      className={`text-right font-medium ${
                        r.net_profit < 0 ? "text-ui-tag-red-text" : "text-ui-tag-green-text"
                      }`}
                    >
                      {money(r.net_profit, cur)}
                    </Table.Cell>
                  </Table.Row>
                )
              })}
              {!isLoading && rows.length === 0 && (
                <Table.Row>
                  <Table.Cell colSpan={9}>
                    <Text size="small" className="py-6 text-ui-fg-muted">
                      Nothing in this queue.
                    </Text>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table>
        </div>

        <Text size="xsmall" className="text-ui-fg-muted">
          Open an order to move it through the pipeline, flag an issue, or set the courier fee.
        </Text>
      </Container>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint?: string
  accent?: "green" | "red" | "orange" | "base"
}) {
  const color =
    accent === "green"
      ? "text-ui-tag-green-text"
      : accent === "red"
        ? "text-ui-tag-red-text"
        : accent === "orange"
          ? "text-ui-tag-orange-text"
          : "text-ui-fg-base"
  return (
    <div className="flex flex-col gap-y-1 rounded-lg border border-ui-border-base p-3">
      <Text size="xsmall" className="text-ui-fg-muted">
        {label}
      </Text>
      <Text className={`text-lg font-semibold ${color}`}>{value}</Text>
      {hint && (
        <Text size="xsmall" className="text-ui-fg-muted">
          {hint}
        </Text>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Order Processing",
  icon: ShoppingBag,
  rank: 2,
})

export default OrderProcessingPage
