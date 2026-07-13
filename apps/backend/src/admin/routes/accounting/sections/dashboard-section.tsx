import { Spinner } from "@medusajs/icons"
import { Badge, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"

import { Kpi, money } from "../../../lib/kpi"
import { api } from "../lib/api"

export function DashboardSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["accounting", "dashboard"],
    queryFn: () => api.dashboard(),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-ui-fg-subtle">
        <Spinner className="animate-spin" />
      </div>
    )
  }
  if (isError || !data) {
    return <Text className="py-8 text-ui-fg-error">Could not load the dashboard.</Text>
  }

  const cur = data.currency_code
  const p = data.profit

  return (
    <div className="flex flex-col gap-y-6">
      {data.variants_missing_cost > 0 && (
        <div className="rounded-lg border border-ui-tag-orange-border bg-ui-tag-orange-bg p-3">
          <Text size="small" className="text-ui-tag-orange-text">
            {data.variants_missing_cost} stocked variant
            {data.variants_missing_cost === 1 ? " has" : "s have"} no cost recorded
            ({data.units_missing_cost} units). Until you set their cost, inventory value —
            and therefore net worth — is understated. Add costs on each product page.
          </Text>
        </div>
      )}

      {/* Headline */}
      <div>
        <Text size="small" weight="plus" className="mb-2 text-ui-fg-subtle">
          Where the business stands
        </Text>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Kpi
            label="Business net worth"
            value={money(data.headline.net_worth, cur)}
            hint="Everything owned, at cost. No debts modelled."
            emphasis
          />
          <Kpi
            label="Money rolling in the ecommerce"
            value={money(data.headline.working_capital, cur)}
            hint="Stock + cash + money couriers owe you"
            emphasis
          />
          <Kpi
            label="Total invested by partners"
            value={money(data.headline.total_invested, cur)}
            hint="Contributions less drawings"
            emphasis
          />
        </div>
      </div>

      {/* Assets */}
      <div>
        <Text size="small" weight="plus" className="mb-2 text-ui-fg-subtle">
          What the money is sitting in
        </Text>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Kpi
            label="Inventory at cost"
            value={money(data.assets.inventory_at_cost, cur)}
            hint={`${data.assets.units_in_stock.toLocaleString()} units in stock`}
          />
          <Kpi
            label="Packaging pool"
            value={money(data.assets.packaging_pool, cur)}
            hint={data.assets.packaging_pool < 0 ? "Negative — presets too low" : "Packaging on hand"}
            accent={data.assets.packaging_pool < 0 ? "red" : "base"}
          />
          <Kpi label="Fixed assets" value={money(data.assets.fixed_assets_value, cur)} />
          <Kpi label="Cash on hand" value={money(data.assets.cash_on_hand, cur)} />
          <Kpi
            label="COD receivable"
            value={money(data.assets.cod_receivables, cur)}
            hint="Delivered, courier hasn't settled"
          />
        </div>
      </div>

      {/* Equity */}
      <div>
        <Text size="small" weight="plus" className="mb-2 text-ui-fg-subtle">
          The investment pool
        </Text>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Kpi
            label="Capital contributed"
            value={money(data.equity.capital_contributed, cur)}
            accent="green"
          />
          <Kpi
            label="Partner drawings"
            value={money(data.equity.partner_drawings, cur)}
            accent="red"
          />
          <Kpi
            label="Retained earnings"
            value={money(data.equity.retained_earnings, cur)}
            hint="Net worth beyond what partners put in"
            accent={data.equity.retained_earnings >= 0 ? "green" : "red"}
          />
        </div>
      </div>

      {/* Profit this month */}
      <div>
        <div className="mb-2 flex items-center gap-x-2">
          <Text size="small" weight="plus" className="text-ui-fg-subtle">
            Profit this month
          </Text>
          <Badge size="2xsmall">
            {new Date(p.range.from).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {" – "}
            {new Date(p.range.to).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Kpi label="Revenue" value={money(p.revenue, cur)} />
          <Kpi label="Gross profit" value={money(p.gross_profit, cur)} hint="Revenue − COGS" />
          <Kpi
            label="Operating expenses"
            value={money(p.operating_expenses, cur)}
            hint="Marketing + courier + other + refunds + packaging + write-offs"
            accent="red"
          />
          <Kpi
            label="Net profit"
            value={money(p.net_profit, cur)}
            hint={`${p.net_margin_pct.toFixed(1)}% margin`}
            accent={p.net_profit >= 0 ? "green" : "red"}
            emphasis
          />
        </div>

        {data.partially_fulfilled_orders > 0 && (
          <Text size="xsmall" className="text-ui-fg-muted mt-2">
            <b>Margin is provisional.</b> {data.partially_fulfilled_orders} order(s) are only
            part-shipped. Revenue counts them in full, but cost of goods only counts what actually
            left the shelf — so profit and margin read high until the rest ships.
          </Text>
        )}
      </div>

      <Text size="xsmall" className="text-ui-fg-muted">
        Net worth is gross asset value — supplier credit and unpaid invoices are not
        tracked. Revenue and COGS come from your Medusa orders; capital, restocks, assets
        and expenses come from the Cash Book.
      </Text>
    </div>
  )
}
