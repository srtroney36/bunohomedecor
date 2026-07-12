import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { RBAC_MODULE } from "../../modules/rbac"

const deleteRoleStep = createStep(
  "access-control-delete-role-step",
  async (input: { id: string }, { container }) => {
    const rbac: any = container.resolve(RBAC_MODULE)
    const role = await rbac.retrieveRole(input.id)

    if (role.is_system) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "System roles cannot be deleted."
      )
    }

    await rbac.deleteRoles([input.id])
    return new StepResponse(input.id)
  }
)

export const deleteRoleWorkflow = createWorkflow(
  "access-control-delete-role",
  function (input: { id: string }) {
    const result = deleteRoleStep(input)
    return new WorkflowResponse(result)
  }
)
