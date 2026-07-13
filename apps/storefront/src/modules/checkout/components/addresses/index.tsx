"use client"
import { setAddresses } from "@lib/data/cart"
import useToggleState from "@lib/hooks/use-toggle-state"
import compareAddresses from "@lib/util/compare-addresses"
import { HttpTypes } from "@medusajs/types"
import Divider from "@modules/common/components/divider"
import { Heading } from "@modules/common/components/ui"
import { useActionState } from "react"
import BillingAddress from "../billing_address"
import ErrorMessage from "../error-message"
import ShippingAddress from "../shipping-address"
import { SubmitButton } from "../submit-button"

/**
 * The address step is ALWAYS open.
 *
 * It used to be gated on `?step=address` being in the URL, which meant that on a first visit to
 * checkout — when there is no step in the URL and no address on the cart yet — the form was
 * collapsed behind an "Edit" button, showing nothing but a spinner. The very first thing a
 * shopper has to do was hidden behind a click.
 *
 * There is no accordion here now, and no Edit button: the form is the step. "Continue to
 * delivery" moves them on, and the address stays editable if they change their mind.
 */
const Addresses = ({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) => {
  const { state: sameAsBilling, toggle: toggleSameAsBilling } = useToggleState(
    cart?.shipping_address && cart?.billing_address
      ? compareAddresses(cart?.shipping_address, cart?.billing_address)
      : true
  )

  const [message, formAction] = useActionState(setAddresses, null)

  return (
    <div className="bg-white">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className="flex flex-row text-3xl-regular gap-x-2 items-baseline"
        >
          Shipping Address
        </Heading>
      </div>

      <form action={formAction}>
        <div className="pb-8">
          <ShippingAddress
            customer={customer}
            checked={sameAsBilling}
            onChange={toggleSameAsBilling}
            cart={cart}
          />

          {!sameAsBilling && (
            <div>
              <Heading level="h2" className="text-3xl-regular gap-x-4 pb-6 pt-8">
                Billing address
              </Heading>

              <BillingAddress cart={cart} />
            </div>
          )}

          <SubmitButton className="mt-6" data-testid="submit-address-button">
            Continue to delivery
          </SubmitButton>
          <ErrorMessage error={message} data-testid="address-error-message" />
        </div>
      </form>

      <Divider className="mt-8" />
    </div>
  )
}

export default Addresses
