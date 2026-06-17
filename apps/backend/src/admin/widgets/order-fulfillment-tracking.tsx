import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Text, Badge } from "@medusajs/ui"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"

type NormalizedStatus = "pending_booking" | "booked" | "pending" | "in_transit" | "delivered" | "returned" | "cancelled" | "unknown"

const STATUS_LABELS: Record<string, { label: string; color: "grey" | "blue" | "green" | "orange" | "red" }> = {
  pending_booking: { label: "Pending booking", color: "grey" },
  booked:          { label: "Booked",          color: "blue" },
  pending:         { label: "Pending pickup",  color: "grey" },
  in_transit:      { label: "In transit",      color: "blue" },
  delivered:       { label: "Delivered",       color: "green" },
  returned:        { label: "Returned",        color: "orange" },
  cancelled:       { label: "Cancelled",       color: "red" },
  unknown:         { label: "Unknown",         color: "grey" },
}

const COURIER_NAMES: Record<string, string> = {
  steadfast: "Steadfast Courier",
  redx:      "RedX",
  pathao:    "Pathao",
}

function TrackingWidget({ data: order }: DetailWidgetProps<HttpTypes.AdminOrder>) {
  const fulfillments: any[] = (order as any).fulfillments ?? []
  const courierFulfillments = fulfillments.filter(
    (f: any) => f.provider_id === "fp_courier_courier" && f.data?.courier_id
  )

  if (courierFulfillments.length === 0) return null

  return (
    <Container className="divide-y divide-ui-border-base p-0">
      <div className="px-6 py-4">
        <Text size="base" weight="plus">
          Courier Tracking
        </Text>
      </div>

      {courierFulfillments.map((f: any) => {
        const d = f.data ?? {}
        const statusInfo = STATUS_LABELS[d.courier_status as NormalizedStatus] ?? STATUS_LABELS.unknown
        const courierName = COURIER_NAMES[d.courier_id] ?? d.courier_id ?? "Courier"

        return (
          <div key={f.id} className="flex flex-col gap-y-2 px-6 py-4">
            <div className="flex items-center justify-between">
              <Text size="small" weight="plus" className="text-ui-fg-base">
                {courierName}
              </Text>
              <Badge color={statusInfo.color} size="2xsmall">
                {statusInfo.label}
              </Badge>
            </div>

            {d.tracking_id && (
              <div className="flex items-center gap-x-2">
                <Text size="small" className="text-ui-fg-subtle">
                  Tracking #:
                </Text>
                <Text size="small" className="text-ui-fg-base font-mono">
                  {d.tracking_id}
                </Text>
              </div>
            )}

            {d.consignment_id && d.consignment_id !== d.tracking_id && (
              <div className="flex items-center gap-x-2">
                <Text size="small" className="text-ui-fg-subtle">
                  Consignment:
                </Text>
                <Text size="small" className="text-ui-fg-base font-mono">
                  {d.consignment_id}
                </Text>
              </div>
            )}
          </div>
        )
      })}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default TrackingWidget
