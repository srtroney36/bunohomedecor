import { ExclamationCircle } from "@medusajs/icons"
import { Badge, Button, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"

import { stockApi } from "../lib/stock-api"

/**
 * Tells you what's wrong and where to fix it. It does not fix anything itself — a setup problem
 * that a tool silently patches is one you never actually fix, and the next one lands somewhere
 * the tool can't reach. Map it correctly once in Medusa's own settings and this disappears for
 * good; stock, reservation and fulfilment then just work.
 */
export function StockHealthBanner() {
  const { data: health } = useQuery({
    queryKey: ["stock-health"],
    queryFn: () => stockApi.health(),
  })

  if (!health || health.healthy) return null

  const blocking = health.issues.filter((i) => i.blocking)
  const notes = health.issues.filter((i) => !i.blocking)
  const isBlocked = blocking.length > 0

  return (
    <div
      className={`flex flex-col gap-y-3 rounded-lg border p-4 ${
        isBlocked
          ? "border-ui-tag-red-border bg-ui-tag-red-bg"
          : "border-ui-tag-orange-border bg-ui-tag-orange-bg"
      }`}
    >
      <div className="flex items-center gap-x-2">
        <ExclamationCircle
          className={isBlocked ? "text-ui-tag-red-icon" : "text-ui-tag-orange-icon"}
        />
        <Text
          size="small"
          weight="plus"
          className={isBlocked ? "text-ui-tag-red-text" : "text-ui-tag-orange-text"}
        >
          {isBlocked
            ? "Stock can't be reserved or shipped until this is fixed"
            : "Stock setup — worth tidying"}
        </Text>
        <Badge size="2xsmall" color={isBlocked ? "red" : "orange"}>
          {health.issues.length}
        </Badge>
      </div>

      {[...blocking, ...notes].map((issue) => (
        <div key={issue.code} className="flex flex-col gap-y-1">
          <Text size="small" className="text-ui-fg-base">
            {issue.blocking ? "⛔" : "•"} {issue.message}
          </Text>
          <div className="flex items-center gap-x-2">
            <Text size="xsmall" className="text-ui-fg-subtle">
              <b>Fix:</b> {issue.fix_where}
            </Text>
            {issue.fix_link && (
              <Button
                size="small"
                variant="transparent"
                onClick={() => {
                  window.location.href = issue.fix_link as string
                }}
              >
                Take me there →
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
