import { model } from "@medusajs/framework/utils"

/**
 * Who moved this order, when, and to what.
 *
 * Not decoration: when an order goes wrong, "who marked it dispatched before it was packed" is
 * the first question anyone asks. Every transition writes one of these, including the ones the
 * system makes itself (a courier webhook marking a parcel delivered), so an automatic change is
 * as traceable as a human one.
 */
const OrderStatusEvent = model
  .define("order_status_event", {
    id: model.id({ prefix: "opev" }).primaryKey(),

    order_id: model.text(),

    /** Which dimension moved: "order" | "payment" | "issue". */
    field: model.text(),
    from_value: model.text().nullable(),
    to_value: model.text(),

    /** The admin user, or null when the system did it (courier sync, subscriber). */
    actor_id: model.text().nullable(),
    /** "courier-sync", "medusa-fulfillment", etc. — how we found out. */
    source: model.text().default("admin"),

    note: model.text().nullable(),
  })
  .indexes([{ on: ["order_id"] }])

export default OrderStatusEvent
