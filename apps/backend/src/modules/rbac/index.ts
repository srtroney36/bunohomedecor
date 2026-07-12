import { Module } from "@medusajs/framework/utils"
import RbacModuleService from "./service"

export const RBAC_MODULE = "rbac"

export default Module(RBAC_MODULE, {
  service: RbacModuleService,
})
