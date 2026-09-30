import { HttpTypes } from "@medusajs/types"
import { clx } from "@modules/common/components/ui"
import React from "react"

type OptionSelectProps = {
  option: HttpTypes.StoreProductOption
  current: string | undefined
  updateOption: (title: string, value: string) => void
  title: string
  disabled: boolean
  "data-testid"?: string
  productVariants?: HttpTypes.StoreProductVariant[]
}

const OptionSelect: React.FC<OptionSelectProps> = ({
  option,
  current,
  updateOption,
  title,
  "data-testid": dataTestId,
  disabled,
  productVariants,
}) => {
  const filteredOptions = React.useMemo(() => {
    if (option.values && option.values.length > 0) {
      return (option.values as any[])
        .map((v) => (typeof v === "string" ? v : v.value))
        .filter(Boolean)
    }
    if (productVariants && productVariants.length > 0) {
      const seen = new Set<string>()
      return productVariants
        .flatMap((v) => v.options ?? [])
        .filter((o) => o.option_id === option.id)
        .map((o) => o.value)
        .filter((v): v is string => {
          if (!v || seen.has(v)) return false
          seen.add(v)
          return true
        })
    }
    return []
  }, [option, productVariants])

  const isOptionInStock = React.useCallback(
    (val: string) => {
      if (!productVariants || productVariants.length === 0) return true
      const matching = productVariants.filter((variant) =>
        variant.options?.some(
          (o) =>
            (o.option_id === option.id || (o as any).option?.id === option.id) &&
            o.value === val
        )
      )
      if (matching.length === 0) return true
      return matching.some((v) => {
        if (v.manage_inventory === false) return true
        if (v.allow_backorder) return true
        if (v.manage_inventory && (v.inventory_quantity || 0) > 0) return true
        if (v.manage_inventory === undefined || v.manage_inventory === null) return true
        return false
      })
    },
    [productVariants, option.id]
  )

  return (
    <div className="flex flex-col gap-y-3">
      <span className="text-sm">Select {title}</span>
      <div
        className="flex flex-wrap justify-between gap-2"
        data-testid={dataTestId}
      >
        {filteredOptions.map((v) => {
          const inStock = isOptionInStock(v)
          return (
            <button
              onClick={() => updateOption(option.id, v)}
              key={v}
              className={clx(
                "border text-small-regular h-10 rounded-rounded p-2 flex-1 transition-all duration-150 flex items-center justify-center gap-1.5",
                {
                  "border-ui-border-interactive bg-white font-medium shadow-sm":
                    v === current,
                  "border-ui-border-base bg-ui-bg-subtle hover:bg-white hover:border-gray-400":
                    v !== current,
                  "opacity-80": !inStock && v !== current,
                }
              )}
              disabled={disabled}
              data-testid="option-button"
            >
              <span>{v}</span>
              {!inStock && (
                <span className="text-[10px] text-red-500 font-normal">
                  (Out of stock)
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default OptionSelect
