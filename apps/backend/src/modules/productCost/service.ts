import { MedusaService } from "@medusajs/framework/utils"

import StockBatch from "./models/stock-batch"
import StockMovement from "./models/stock-movement"
import VariantCost from "./models/variant-cost"

class ProductCostModuleService extends MedusaService({
  VariantCost,
  StockBatch,
  StockMovement,
}) {}

export default ProductCostModuleService
