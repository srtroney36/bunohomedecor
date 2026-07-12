import { defineLink } from "@medusajs/framework/utils"
import UserModule from "@medusajs/medusa/user"
import RbacModule from "../modules/rbac"

// Many-to-many: a user can hold multiple roles and a role can be held by many users.
export default defineLink(
  { linkable: UserModule.linkable.user, isList: true },
  { linkable: RbacModule.linkable.role, isList: true }
)
