"use client"

import { Heading, Text, clx } from "@modules/common/components/ui"
import brand from "brand.config"

import PaymentButton from "../payment-button"
import { useSearchParams } from "next/navigation"
import { HttpTypes } from "@medusajs/types"

const Review = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const searchParams = useSearchParams()

  const isOpen = searchParams.get("step") === "review"

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards && ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])?.length > 0 && cart?.total === 0
  )

  const hasPayment =
    Boolean(cart.payment_collection) ||
    Boolean(cart.payment_collection?.payment_sessions?.length) ||
    paidByGiftcard ||
    Boolean(cart.total === 0)

  const previousStepsCompleted =
    Boolean(cart.shipping_address) &&
    (cart.shipping_methods?.length ?? 0) > 0 &&
    hasPayment

  return (
    <div className="bg-white">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-3xl-regular gap-x-2 items-baseline",
            {
              "opacity-50 pointer-events-none select-none": !isOpen,
            }
          )}
        >
          Review
        </Heading>
      </div>
      {isOpen && previousStepsCompleted && (
        <>
          <div className="flex items-start gap-x-1 w-full mb-6">
            <div className="w-full">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                By clicking the Place Order button, you confirm that you have
                read, understand and accept our Terms of Use, Terms of Sale and
                Returns Policy and acknowledge that you have read{" "}
                {brand.storeName}&apos;s Privacy Policy.
              </Text>
            </div>
          </div>
          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </>
      )}
      {isOpen && !previousStepsCompleted && (
        <div className="p-4 bg-ui-bg-subtle rounded-rounded text-ui-fg-subtle text-small-regular">
          Please complete your delivery address, shipping method, and payment selection above to review and place your order.
        </div>
      )}
    </div>
  )
}

export default Review
