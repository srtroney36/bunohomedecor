import { MedusaService } from "@medusajs/framework/utils"
import Role from "./models/role"

class RbacModuleService extends MedusaService({
  Role,
}) {}

export default RbacModuleService
