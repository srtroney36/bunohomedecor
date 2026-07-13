import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

import { setCourierFeeStep, type SetCourierFeeInput } from "./steps/courier-fee"
import {
  captureAdvanceStep,
  setDeliveryChargedStep,
  setProductionCostStep,
  type CaptureAdvanceInput,
  type SetDeliveryChargedInput,
  type SetProductionCostInput,
} from "./steps/order-money"
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

/** Take an up-front advance on a COD order. */
export const captureAdvanceWorkflow = createWorkflow(
  "capture-advance",
  function (input: CaptureAdvanceInput) {
    const result = captureAdvanceStep(input)
    return new WorkflowResponse(result)
  }
)

/** Set/edit a pre-order or custom order's production cost (its COGS + a Cash Book expense). */
export const setProductionCostWorkflow = createWorkflow(
  "set-production-cost",
  function (input: SetProductionCostInput) {
    const result = setProductionCostStep(input)
    return new WorkflowResponse(result)
  }
)

/** Set/edit the delivery charged to the customer (revenue). */
export const setDeliveryChargedWorkflow = createWorkflow(
  "set-delivery-charged",
  function (input: SetDeliveryChargedInput) {
    const result = setDeliveryChargedStep(input)
    return new WorkflowResponse(result)
  }
)
