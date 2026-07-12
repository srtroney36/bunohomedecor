import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { RBAC_MODULE } from "../../modules/rbac"
import { OWNER_SLUG } from "../../modules/rbac/permissions"

export type UpdateRoleInput = {
  id: string
  name?: string
  description?: string | null
  permissions?: string[]
}

const updateRoleStep = createStep(
  "access-control-update-role-step",
  async (input: UpdateRoleInput, { container }) => {
    const rbac: any = container.resolve(RBAC_MODULE)
    const before = await rbac.retrieveRole(input.id)

    // The Owner role is fully locked to prevent lockout.
    if (before.slug === OWNER_SLUG) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "The Owner role cannot be modified."
      )
    }

    const { id, ...data } = input
    const [role] = await rbac.updateRoles([{ id, ...data }])

    return new StepResponse(role, {
      id: before.id,
      name: before.name,
      description: before.description,
      permissions: before.permissions,
    })
  },
  async (prev, { container }) => {
    if (!prev) return
    const rbac: any = container.resolve(RBAC_MODULE)
    await rbac.updateRoles([prev])
  }
)

export const updateRoleWorkflow = createWorkflow(
  "access-control-update-role",
  function (input: UpdateRoleInput) {
    const role = updateRoleStep(input)
    return new WorkflowResponse(role)
  }
)
