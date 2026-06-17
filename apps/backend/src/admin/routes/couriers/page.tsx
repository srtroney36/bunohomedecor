import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Text, Alert } from "@medusajs/ui"
import { TruckFast } from "@medusajs/icons"
import { adminFetch } from "../../lib/api"
import { CourierSetupCard, type CourierRow } from "../../components/courier-setup-card"

export const config = defineRouteConfig({
  label: "Couriers",
  rank: 6,
  icon: TruckFast,
})

type CouriersResponse = { couriers: CourierRow[] }

const COURIER_ORDER = ["steadfast", "redx", "pathao"] as const

export default function CouriersPage() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<CouriersResponse>({
    queryKey: ["admin-couriers"],
    queryFn: () => adminFetch<CouriersResponse>("/couriers"),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-couriers"] })

  const couriers = data?.couriers ?? []
  // Sort by canonical order
  const sorted = [...couriers].sort(
    (a, b) =>
      COURIER_ORDER.indexOf(a.courier_id as any) -
      COURIER_ORDER.indexOf(b.courier_id as any)
  )

  return (
    <div className="flex flex-col gap-y-4 p-4 max-w-2xl">
      <div className="flex flex-col gap-y-1">
        <Text size="xlarge" weight="plus">
          Couriers
        </Text>
        <Text className="text-ui-fg-subtle" size="small">
          Configure delivery partners for Bangladesh. Only one courier can be active at a time.
          Credentials are encrypted at rest â€” never stored in plaintext.
        </Text>
      </div>

      {error && (
        <Alert variant="error">
          {(error as Error).message?.includes("ENCRYPTION_KEY")
            ? "APP_SECRETS_ENCRYPTION_KEY is not set in your .env file. Generate one with: openssl rand -hex 32"
            : (error as Error).message || "Failed to load courier configuration"}
        </Alert>
      )}

      {isLoading && (
        <Text size="small" className="text-ui-fg-subtle">
          Loading courier configurationâ€¦
        </Text>
      )}

      {!isLoading && !error && sorted.length === 0 && (
        <Text size="small" className="text-ui-fg-subtle">
          No couriers found. Make sure the server has run at least once.
        </Text>
      )}

      <div className="flex flex-col gap-y-2">
        {sorted.map((courier) => (
          <CourierSetupCard key={courier.id} courier={courier} onRefresh={refresh} />
        ))}
      </div>
    </div>
  )
}
