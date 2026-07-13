import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ShoppingBag } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { money } from "../../lib/kpi"
import {
  ISSUE_STATUS_META,
  ORDER_STATUS_META,
  ORDER_STATUS_ORDER,
  PAYMENT_STATUS_META,
  opApi,
  type OrderStatusKey,
} from "../../lib/order-processing-api"

/**
 * The ops queue. The team works left to right: New → Confirmed → In Production → Ready →
 * Booked → Dispatched → Delivered.
 *
 * Every status here is the TRUTH, not a label someone remembered to update: anything from
 * Dispatched onwards is derived from Medusa itself, and payment status is derived from the money
 * that actually moved. If a colleague fulfils an order in Medusa's own screen, it appears in
 * "Dispatched" here without anyone touching it.
 */
const OrderProcessingPage = () => {
  const [status, setStatus] = useState<OrderStatusKey | "all">("all")

  const { data, isLoading } = useQuery({
    queryKey: ["order-processing", status],
    queryFn: () => opApi.list(status === "all" ? {} : { status }),
  })

  const rows = data?.orders ?? []
  const counts = data?.counts ?? {}
  const t = data?.totals
  const cur = "bdt"

  return (
    <div className="flex flex-col gap-y-4 p-4">
      <Container className="flex flex-col gap-y-5 px-6 py-6">
        <div>
          <Heading level="h1">Order Processing</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Moving an order here <b>does the real thing</b> — Dispatched ships the goods and books
            the cost, Delivered collects the cash, Returned puts stock back. Statuses are derived
            from what actually happened, so they can't drift from Medusa.
          </Text>
        </div>

        {/* Queue tabs */}
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="small"
            variant={status === "all" ? "primary" : "secondary"}
            onClick={() => setStatus("all")}
          >
            All {data ? `(${data.total})` : ""}
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
                <Table.HeaderCell>Customer</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Payment</Table.HeaderCell>
                <Table.HeaderCell>Issue</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Total</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Delivery</Table.HeaderCell>
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
                    <Table.Cell className="max-w-[180px] truncate">{r.customer}</Table.Cell>
                    <Table.Cell>
                      <Badge size="2xsmall" color={os.color}>
                        {os.label}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge size="2xsmall" color={ps.color}>
                        {ps.label}
                      </Badge>
                      {r.outstanding > 0 && (
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {money(r.outstanding, cur)} due
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {r.issue_status !== "none" && (
                        <Badge size="2xsmall" color={is.color}>
                          {is.label}
                        </Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell className="text-right">{money(r.total, cur)}</Table.Cell>
                    <Table.Cell
                      className={`text-right ${
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
                  <Table.Cell colSpan={8}>
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
