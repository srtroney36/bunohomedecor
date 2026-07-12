import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  Modules,
  MedusaError,
} from "@medusajs/framework/utils"
import { RBAC_MODULE } from "../../modules/rbac"
import { OWNER_SLUG } from "../../modules/rbac/permissions"
import { invalidateUserPermissions } from "../../modules/rbac/cache"

export type AssignUserRolesInput = {
  user_id: string
  role_ids: string[]
}

const setUserRolesStep = createStep(
  "access-control-set-user-roles-step",
  async (input: AssignUserRolesInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    const rbac: any = container.resolve(RBAC_MODULE)

    // Current roles held by this user.
    const { data } = await query.graph({
      entity: "user",
      fields: ["id", "roles.id", "roles.slug"],
      filters: { id: input.user_id },
    })
    const current: string[] = (data?.[0]?.roles ?? []).map((r: any) => r.id)

    // Last-Owner protection: never let the final Owner be demoted.
    const [owner] = await rbac.listRoles({ slug: OWNER_SLUG })
    if (owner) {
      const hadOwner = current.includes(owner.id)
      const willHaveOwner = input.role_ids.includes(owner.id)
      if (hadOwner && !willHaveOwner) {
        const { data: ownerRoles } = await query.graph({
          entity: "role",
          fields: ["id", "users.id"],
          filters: { id: owner.id },
        })
        const ownerUserIds: string[] = (ownerRoles?.[0]?.users ?? []).map(
          (u: any) => u.id
        )
        const others = ownerUserIds.filter((id) => id !== input.user_id)
        if (others.length === 0) {
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "You cannot remove the last Owner. Assign the Owner role to another user first."
          )
        }
      }
    }

    // Set semantics: dismiss removed links, create added links.
    const toRemove = current.filter((id) => !input.role_ids.includes(id))
    const toAdd = input.role_ids.filter((id) => !current.includes(id))

    for (const roleId of toRemove) {
      await link.dismiss({
        [Modules.USER]: { user_id: input.user_id },
        [RBAC_MODULE]: { role_id: roleId },
      })
    }
    for (const roleId of toAdd) {
      await link.create({
        [Modules.USER]: { user_id: input.user_id },
        [RBAC_MODULE]: { role_id: roleId },
      })
    }

    invalidateUserPermissions(input.user_id)

    return new StepResponse(
      { user_id: input.user_id, role_ids: input.role_ids },
      { user_id: input.user_id, toRemove, toAdd }
    )
  },
  async (comp, { container }) => {
    if (!comp) return
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    // Reverse the change: re-add removed, dismiss added.
    for (const roleId of comp.toRemove) {
      await link.create({
        [Modules.USER]: { user_id: comp.user_id },
        [RBAC_MODULE]: { role_id: roleId },
      })
    }
    for (const roleId of comp.toAdd) {
      await link.dismiss({
        [Modules.USER]: { user_id: comp.user_id },
        [RBAC_MODULE]: { role_id: roleId },
      })
    }
    invalidateUserPermissions(comp.user_id)
  }
)

export const assignUserRolesWorkflow = createWorkflow(
  "access-control-assign-user-roles",
  function (input: AssignUserRolesInput) {
    const result = setUserRolesStep(input)
    return new WorkflowResponse(result)
  }
)
