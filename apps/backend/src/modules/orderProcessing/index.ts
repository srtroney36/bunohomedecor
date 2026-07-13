import { Module } from "@medusajs/framework/utils"

import OrderProcessingModuleService from "./service"

export const ORDER_PROCESSING_MODULE = "orderProcessing"

export default Module(ORDER_PROCESSING_MODULE, {
  service: OrderProcessingModuleService,
})
