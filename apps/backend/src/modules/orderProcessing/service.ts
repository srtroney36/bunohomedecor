import { MedusaService } from "@medusajs/framework/utils"

import CourierRate from "./models/courier-rate"
import OrderStatusEvent from "./models/order-status-event"
import OrderWorkflow from "./models/order-workflow"

/**
 * CRUD only. Every rule — what a status may transition to, what a transition actually DOES to
 * stock and cash — lives in the workflows, where a failure can be compensated.
 */
class OrderProcessingModuleService extends MedusaService({
  OrderWorkflow,
  OrderStatusEvent,
  CourierRate,
}) {}

export default OrderProcessingModuleService
