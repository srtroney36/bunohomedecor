import { Module } from "@medusajs/framework/utils"

import AccountingModuleService from "./service"

// camelCase. A dash here causes runtime resolution errors.
export const ACCOUNTING_MODULE = "accounting"

export default Module(ACCOUNTING_MODULE, {
  service: AccountingModuleService,
})
