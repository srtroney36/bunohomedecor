import { MedusaService } from "@medusajs/framework/utils"

import FixedAsset from "./models/fixed-asset"
import LedgerEntry from "./models/ledger-entry"
import MarketingSpend from "./models/marketing-spend"
import Partner from "./models/partner"

/**
 * CRUD only, by design. All the business logic — category/direction validation, the
 * register -> ledger mirroring — lives in the workflows, which is where Medusa expects
 * mutations to be composed and where a failure can be compensated.
 */
class AccountingModuleService extends MedusaService({
  Partner,
  LedgerEntry,
  FixedAsset,
  MarketingSpend,
}) {}

export default AccountingModuleService
