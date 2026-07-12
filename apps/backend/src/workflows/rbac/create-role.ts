import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { RBAC_MODULE } from "../../modules/rbac"

export type CreateRoleInput = {
  name: string
  slug: string
  description?: string | null
  permissions: string[]
}

const createRoleStep = createStep(
  "access-control-create-role-step",
  async (input: CreateRoleInput, { container }) => {
    const rbac: any = container.resolve(RBAC_MODULE)
    const [role] = await rbac.createRoles([{ ...input, is_system: false }])
    return new StepResponse(role, role.id)
  },
  async (roleId: string | undefined, { container }) => {
    if (!roleId) return
    const rbac: any = container.resolve(RBAC_MODULE)
    await rbac.deleteRoles([roleId])
  }
)

export const createRoleWorkflow = createWorkflow(
  "access-control-create-role",
  function (input: CreateRoleInput) {
    const role = createRoleStep(input)
    return new WorkflowResponse(role)
  }
)
