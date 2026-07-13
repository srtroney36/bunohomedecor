import { Text } from "@medusajs/ui"

/**
 * The KPI tile shared by Sales Insights and the Accounting dashboard. Hoisted so the two
 * pages that report the same money look like the same product.
 */
export function Kpi({
  label,
  value,
  hint,
  accent,
  emphasis,
}: {
  label: string
  value: string
  hint?: string
  accent?: "green" | "red" | "base"
  /** Headline figures (net worth, working capital) read larger. */
  emphasis?: boolean
}) {
  const color =
    accent === "green"
      ? "text-ui-tag-green-text"
      : accent === "red"
      ? "text-ui-tag-red-text"
      : "text-ui-fg-base"

  return (
    // min-w-0 lets the tile shrink inside a grid track; without it a long money value forces
    // the track wider than the screen and the whole page scrolls sideways. Value text steps up
    // in size only on larger screens, and breaks rather than overflows on a phone.
    <div className="flex flex-col gap-y-1 rounded-lg border border-ui-border-base p-3 sm:p-4 min-w-0">
      <Text size="xsmall" className="text-ui-fg-muted break-words">
        {label}
      </Text>
      <Text
        className={`${
          emphasis ? "text-xl sm:text-2xl" : "text-lg sm:text-xl"
        } font-semibold tabular-nums break-words ${color}`}
      >
        {value}
      </Text>
      {hint && (
        <Text size="xsmall" className="text-ui-fg-muted break-words">
          {hint}
        </Text>
      )}
    </div>
  )
}

/** Money is stored as-is (800 = 800 BDT). Never divide by 100. */
export function money(n: number | undefined | null, cur: string | null): string {
  const c = (cur || "BDT").toUpperCase()
  const v = Number(n) || 0
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: c,
      maximumFractionDigits: 0,
    }).format(v)
  } catch {
    return `${Math.round(v).toLocaleString()} ${c}`
  }
}

export const iso = (d: Date): string => d.toISOString().slice(0, 10)
