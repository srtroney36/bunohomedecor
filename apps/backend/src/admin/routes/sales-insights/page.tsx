import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { money } from "../../lib/kpi"
import { rbacFetch } from "../../lib/permissions"
import {
  ISSUE_STATUS_META,
  ORDER_STATUS_META,
  type IssueStatusKey,
  type OrderRow,
  type OrderStatusKey,
} from "../../lib/order-processing-api"

type Insights = {
  currency_code: string
  order_count: number
  revenue: { product: number; delivery_charged: number; total: number }
  costs: {
    cogs: number
    packaging: number
    courier: number
    write_off: number
    overhead: number
    marketing: number
    other_expense: number
    refunds: number
  }
  profit: {
    gross_profit: number
    delivery_margin: number
    other_income: number
    net_profit: number
    net_margin_pct: number
  }
  cash: { captured: number; refunded: number; outstanding: number }
  breakdown: {
    by_status: Record<string, number>
    by_payment: Record<string, number>
    by_issue: Record<string, number>
  }
  loss_making: OrderRow[]
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

function presetRange(key: string): [string, string] {
  const now = new Date()
  const today = iso(now)
  if (key === "last_month") {
    return [
      iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      iso(new Date(now.getFullYear(), now.getMonth(), 0)),
    ]
  }
  if (key === "last_30") {
    const s = new Date(now)
    s.setDate(s.getDate() - 29)
    return [iso(s), today]
  }
  if (key === "this_year") return [iso(new Date(now.getFullYear(), 0, 1)), today]
  return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), today]
}

function Kpi({
  label,
  value,
  hint,
  accent,
  emphasis,
}: {
  label: string
  value: string
  hint?: string
  accent?: "green" | "red" | "orange" | "base"
  emphasis?: boolean
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
    <div
      className={`flex flex-col gap-y-1 rounded-lg border p-4 ${
        emphasis ? "border-ui-border-strong bg-ui-bg-subtle" : "border-ui-border-base"
      }`}
    >
      <Text size="xsmall" className="text-ui-fg-muted">
        {label}
      </Text>
      <Text className={`text-xl font-semibold ${color}`}>{value}</Text>
      {hint && (
        <Text size="xsmall" className="text-ui-fg-muted">
          {hint}
        </Text>
      )}
    </div>
  )
}

const SalesInsightsPage = () => {
  const [[from, to], setRange] = useState<[string, string]>(() => presetRange("this_month"))

  const { data, isLoading } = useQuery({
    queryKey: ["sales-insights", from, to],
    queryFn: () => rbacFetch<Insights>(`/sales-insights?from=${from}&to=${to}`),
  })

  const cur = data?.currency_code ?? "bdt"

  return (
    <div className="flex flex-col gap-y-4 p-4">
      <Container className="flex flex-col gap-y-5 px-4 py-4 sm:px-6 sm:py-6">
        <div>
          <Heading level="h1">Sales Insights</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Built from each order's real P&amp;L — what the goods cost (FIFO), what the box cost,
            and what the courier charged. A busy store can still lose money on every parcel; this
            is where you'd see it.
          </Text>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { k: "this_month", l: "This month" },
            { k: "last_month", l: "Last month" },
            { k: "last_30", l: "Last 30 days" },
            { k: "this_year", l: "This year" },
          ].map((p) => (
            <Button key={p.k} size="small" variant="secondary" onClick={() => setRange(presetRange(p.k))}>
              {p.l}
            </Button>
          ))}
        </div>

        {isLoading || !data ? (
          <Text size="small" className="text-ui-fg-muted">
            Loading…
          </Text>
        ) : (
          <>
            {/* Headline */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Kpi label="Product revenue" value={money(data.revenue.product, cur)} hint={`${data.order_count} orders`} />
              <Kpi
                label="Gross profit"
                value={money(data.profit.gross_profit, cur)}
                hint="revenue − cost of goods"
                accent={data.profit.gross_profit >= 0 ? "green" : "red"}
              />
              <Kpi
                label="Delivery margin"
                value={money(data.profit.delivery_margin, cur)}
                hint="charged − courier cost"
                accent={data.profit.delivery_margin >= 0 ? "green" : "red"}
              />
              <Kpi
                label="Net profit"
                value={money(data.profit.net_profit, cur)}
                hint={`${data.profit.net_margin_pct.toFixed(1)}% margin`}
                accent={data.profit.net_profit >= 0 ? "green" : "red"}
                emphasis
              />
            </div>

            {/* Where the money goes */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Kpi label="Cost of goods" value={money(data.costs.cogs, cur)} accent="red" />
              <Kpi label="Packaging" value={money(data.costs.packaging, cur)} accent="red" />
              <Kpi label="Courier" value={money(data.costs.courier, cur)} accent="red" />
              <Kpi
                label="Damaged / written off"
                value={money(data.costs.write_off, cur)}
                accent={data.costs.write_off > 0 ? "red" : "base"}
              />
              <Kpi
                label="Overheads"
                value={money(data.costs.overhead, cur)}
                hint="ads, rent, other"
                accent="red"
              />
            </div>

            {/* Cash */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Cash collected" value={money(data.cash.captured, cur)} accent="green" />
              <Kpi
                label="COD outstanding"
                value={money(data.cash.outstanding, cur)}
                hint="with the courier / customer"
                accent={data.cash.outstanding > 0 ? "orange" : "base"}
              />
              <Kpi label="Refunded" value={money(data.cash.refunded, cur)} accent="red" />
              <Kpi
                label="Other income"
                value={money(data.profit.other_income, cur)}
                hint="courier compensation, scrap"
                accent="green"
              />
            </div>

            {/* Issues */}
            <div className="flex flex-wrap items-center gap-2">
              <Text size="small" weight="plus" className="text-ui-fg-subtle">
                Issues:
              </Text>
              {Object.entries(data.breakdown.by_issue)
                .filter(([k, n]) => k !== "none" && n > 0)
                .map(([k, n]) => (
                  <Badge key={k} size="2xsmall" color={ISSUE_STATUS_META[k as IssueStatusKey]?.color ?? "grey"}>
                    {ISSUE_STATUS_META[k as IssueStatusKey]?.label ?? k}: {n}
                  </Badge>
                ))}
              {Object.entries(data.breakdown.by_issue).every(([k, n]) => k === "none" || n === 0) && (
                <Text size="small" className="text-ui-fg-muted">
                  none
                </Text>
              )}
            </div>

            {/* The parcels that lost money — the whole point */}
            {data.loss_making.length > 0 && (
              <div className="flex flex-col gap-y-2">
                <Text size="small" weight="plus" className="text-ui-tag-red-text">
                  Orders that lost money
                </Text>
                <div className="overflow-x-auto rounded-lg border border-ui-border-error">
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Order</Table.HeaderCell>
                        <Table.HeaderCell>Status</Table.HeaderCell>
                        <Table.HeaderCell className="text-right">Revenue</Table.HeaderCell>
                        <Table.HeaderCell className="text-right">Goods</Table.HeaderCell>
                        <Table.HeaderCell className="text-right">Courier</Table.HeaderCell>
                        <Table.HeaderCell className="text-right">Lost</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {data.loss_making.map((o) => (
                        <Table.Row
                          key={o.order_id}
                          className="cursor-pointer"
                          onClick={() => {
                            window.location.href = `/app/orders/${o.order_id}`
                          }}
                        >
                          <Table.Cell className="font-medium">#{o.display_id}</Table.Cell>
                          <Table.Cell>
                            <Badge size="2xsmall" color={ORDER_STATUS_META[o.order_status as OrderStatusKey]?.color ?? "grey"}>
                              {ORDER_STATUS_META[o.order_status as OrderStatusKey]?.label ?? o.order_status}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell className="text-right">{money(o.product_revenue, cur)}</Table.Cell>
                          <Table.Cell className="text-right">{money(o.cogs, cur)}</Table.Cell>
                          <Table.Cell className="text-right">{money(o.courier_cost, cur)}</Table.Cell>
                          <Table.Cell className="text-right font-medium text-ui-tag-red-text">
                            {money(o.net_profit, cur)}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </div>
              </div>
            )}
          </>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Sales Insights",
  icon: CurrencyDollar,
  rank: 5,
})

export default SalesInsightsPage
