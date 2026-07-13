import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

import { setCourierFeeStep, type SetCourierFeeInput } from "./steps/courier-fee"
import {
  setOrderIssueStep,
  transitionOrderStep,
  type SetIssueInput,
  type TransitionInput,
} from "./steps/transition"

/**
 * Move an order through the pipeline. The status change IS the action — see steps/transition.ts.
 */
export const transitionOrderWorkflow = createWorkflow(
  "transition-order",
  function (input: TransitionInput) {
    const result = transitionOrderStep(input)
    return new WorkflowResponse(result)
  }
)

/** Flag what went wrong — and, for damage, write the destroyed goods off at cost. */
export const setOrderIssueWorkflow = createWorkflow(
  "set-order-issue",
  function (input: SetIssueInput) {
    const result = setOrderIssueStep(input)
    return new WorkflowResponse(result)
  }
)

/** Record what the courier charges us, and book it as a real expense against this order. */
export const setCourierFeeWorkflow = createWorkflow(
  "set-courier-fee",
  function (input: SetCourierFeeInput) {
    const result = setCourierFeeStep(input)
    return new WorkflowResponse(result)
  }
)
