"use client"

import { addToCart } from "@lib/data/cart"
import { trackAddToCart } from "@lib/analytics"
import { useIntersection } from "@lib/hooks/use-in-view"
import { StoreContactSettings } from "@lib/data/store-settings"
import { HttpTypes } from "@medusajs/types"
import { Button } from "@modules/common/components/ui"
import Divider from "@modules/common/components/divider"
import OptionSelect from "@modules/products/components/product-actions/option-select"
import { isEqual } from "lodash"
import { useParams, usePathname, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import ProductPrice from "../product-price"
import MobileActions from "./mobile-actions"
import { useRouter } from "next/navigation"

type ProductActionsProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  disabled?: boolean
  storeSettings?: StoreContactSettings
}

const optionsAsKeymap = (
  variantOptions: HttpTypes.StoreProductVariant["options"]
) => {
  return variantOptions?.reduce((acc: Record<string, string>, varopt) => {
    const optId = varopt.option_id || (varopt as any).option?.id
    if (optId && varopt.value) acc[optId] = varopt.value
    return acc
  }, {})
}

export default function ProductActions({
  product,
  disabled,
  storeSettings,
}: ProductActionsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const optionsToRender = useMemo(() => {
    if (product.options && product.options.length > 0) {
      return product.options
    }
    if ((product.variants?.length ?? 0) > 1) {
      const optionMap = new Map<string, { id: string; title: string; values: any[] }>()
      for (const variant of product.variants ?? []) {
        for (const opt of variant.options ?? []) {
          const id = opt.option_id || (opt as any).option?.id || "default"
          if (!optionMap.has(id)) {
            optionMap.set(id, {
              id,
              title: (opt as any).option?.title || "Option",
              values: [],
            })
          }
          const entry = optionMap.get(id)!
          if (
            opt.value &&
            !entry.values.some(
              (v: any) => (typeof v === "string" ? v : v.value) === opt.value
            )
          ) {
            entry.values.push({ id: opt.id, value: opt.value, option_id: id })
          }
        }
      }
      return Array.from(optionMap.values()) as HttpTypes.StoreProductOption[]
    }
    return []
  }, [product.options, product.variants])

  // Find initial variant: from searchParams v_id if valid, or default to first variant
  const initialVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) return undefined
    const vId = searchParams.get("v_id")
    if (vId) {
      const found = product.variants.find((v) => v.id === vId)
      if (found) return found
    }
    return product.variants[0]
  }, [product.variants, searchParams])

  const [options, setOptions] = useState<Record<string, string | undefined>>(() => {
    return initialVariant ? (optionsAsKeymap(initialVariant.options) ?? {}) : {}
  })
  const [isAdding, setIsAdding] = useState(false)
  const [isBuyingNow, setIsBuyingNow] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const countryCode = (useParams().countryCode as string) || "bd"

  // Sync options if URL searchParams changes or variants load
  useEffect(() => {
    const vId = searchParams.get("v_id")
    if (vId && product.variants?.length) {
      const target = product.variants.find((v) => v.id === vId)
      if (target) {
        const variantOptions = optionsAsKeymap(target.options)
        if (variantOptions) {
          setOptions(variantOptions)
          return
        }
      }
    }
    // If no options selected yet and variants are present, pre-select first variant
    if (product.variants?.length && Object.keys(options).length === 0) {
      const first = product.variants[0]
      const variantOptions = optionsAsKeymap(first.options)
      if (variantOptions) {
        setOptions(variantOptions)
      }
    }
  }, [searchParams, product.variants])

  const selectedVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) return undefined
    return product.variants.find((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [product.variants, options])

  const setOptionValue = (optionId: string, value: string) => {
    setOptions((prev) => {
      const next = { ...prev, [optionId]: value }

      // 1. Direct match with existing options
      const exactMatch = product.variants?.find((v) => {
        const variantOptions = optionsAsKeymap(v.options)
        return isEqual(variantOptions, next)
      })
      if (exactMatch) {
        return next
      }

      // 2. Intelligent fallback: find a variant having this option value and pick its options
      const candidate = product.variants?.find((v) => {
        return v.options?.some(
          (o) =>
            (o.option_id === optionId || (o as any).option?.id === optionId) &&
            o.value === value
        )
      })
      if (candidate) {
        const candidateOpts = optionsAsKeymap(candidate.options)
        if (candidateOpts && Object.keys(candidateOpts).length > 0) {
          return candidateOpts
        }
      }

      return next
    })
  }

  const isValidVariant = !!selectedVariant

  // Update URL search param smoothly without unmounting/flickering
  useEffect(() => {
    if (!selectedVariant?.id) return
    const params = new URLSearchParams(searchParams.toString())
    if (params.get("v_id") === selectedVariant.id) return

    params.set("v_id", selectedVariant.id)
    const newUrl = `${pathname}?${params.toString()}`

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", newUrl)
    }
  }, [selectedVariant?.id, pathname, searchParams])

  const inStock = useMemo(() => {
    if (!selectedVariant) return false
    if (selectedVariant.manage_inventory === false) return true
    if (selectedVariant.allow_backorder) return true
    if (selectedVariant.manage_inventory && (selectedVariant.inventory_quantity || 0) > 0) return true
    // If manage_inventory is not strictly true or quantity is not tracked, treat as in stock
    if (selectedVariant.manage_inventory === undefined || selectedVariant.manage_inventory === null) return true
    return false
  }, [selectedVariant])

  const actionsRef = useRef<HTMLDivElement>(null)
  const inView = useIntersection(actionsRef, "0px")

  const handleAddToCart = async () => {
    if (!selectedVariant?.id) return
    setIsAdding(true)
    await addToCart({ variantId: selectedVariant.id, quantity, countryCode })
    const cp = selectedVariant?.calculated_price as
      | { calculated_amount?: number; currency_code?: string }
      | undefined
    trackAddToCart({
      id: selectedVariant.id,
      name: product.title ?? "",
      price: cp?.calculated_amount ?? undefined,
      currency: cp?.currency_code ?? undefined,
    })
    setIsAdding(false)
  }

  const handleBuyNow = async () => {
    if (!selectedVariant?.id) return
    setIsBuyingNow(true)
    await addToCart({ variantId: selectedVariant.id, quantity, countryCode })
    router.push(`/${countryCode}/checkout`)
    setIsBuyingNow(false)
  }

  const isActionDisabled = !inStock || !selectedVariant || !!disabled || !isValidVariant || isAdding || isBuyingNow
  const addToCartLabel = !selectedVariant
    ? "Select variant"
    : !inStock
    ? "Out of stock"
    : "Add to Cart"

  const whatsappNumber = storeSettings?.whatsapp_number
  const orderPhone = storeSettings?.order_phone

  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hi, I'd like to order: ${product.title}${selectedVariant?.title ? ` - ${selectedVariant.title}` : ""}`
      )}`
    : null

  return (
    <>
      <div className="flex flex-col gap-y-4" ref={actionsRef}>
        {/* Variant options */}
        {(product.variants?.length ?? 0) > 1 && optionsToRender.length > 0 && (
          <div className="flex flex-col gap-y-4">
            {optionsToRender.map((option) => (
              <div key={option.id}>
                <OptionSelect
                  option={option}
                  current={options[option.id]}
                  updateOption={setOptionValue}
                  title={option.title ?? ""}
                  data-testid="product-options"
                  disabled={!!disabled || isAdding || isBuyingNow}
                  productVariants={product.variants}
                />
              </div>
            ))}
            <Divider />
          </div>
        )}

        {/* Price */}
        <ProductPrice product={product} variant={selectedVariant} />

        {/* Quantity stepper */}
        <div className="flex items-center gap-x-1">
          <span className="text-sm font-medium text-ui-fg-subtle mr-2">Quantity:</span>
          <div className="flex items-center border border-ui-border-base rounded-lg overflow-hidden">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1 || !!disabled}
              className="w-9 h-9 flex items-center justify-center text-ui-fg-base hover:bg-ui-bg-subtle disabled:opacity-40 transition-colors text-lg font-medium"
            >
              −
            </button>
            <span className="w-10 h-9 flex items-center justify-center text-sm font-semibold border-x border-ui-border-base select-none">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              disabled={!!disabled}
              className="w-9 h-9 flex items-center justify-center text-ui-fg-base hover:bg-ui-bg-subtle disabled:opacity-40 transition-colors text-lg font-medium"
            >
              +
            </button>
          </div>
        </div>

        {/* 2×2 action button grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Add to Cart */}
          <button
            onClick={handleAddToCart}
            disabled={isActionDisabled || isAdding || isBuyingNow}
            data-testid="add-product-button"
            className="flex items-center justify-center gap-x-2 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 transition-all duration-150 bg-[#fcbc06] hover:bg-[#e0a800] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {isAdding ? (
              <span className="animate-pulse">Adding…</span>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {addToCartLabel}
              </>
            )}
          </button>

          {/* Buy Now */}
          <button
            onClick={handleBuyNow}
            disabled={isActionDisabled || isAdding || isBuyingNow}
            className="flex items-center justify-center gap-x-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all duration-150 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {isBuyingNow ? (
              <span className="animate-pulse">Processing…</span>
            ) : (
              "Buy Now"
            )}
          </button>

          {/* Order on WhatsApp */}
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-x-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all duration-150 bg-green-500 hover:bg-green-600 active:scale-[0.98]"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Order on WhatsApp
            </a>
          ) : (
            <div />
          )}

          {/* Call For Order */}
          {orderPhone ? (
            <a
              href={`tel:${orderPhone}`}
              className="flex items-center justify-center gap-x-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all duration-150 bg-blue-900 hover:bg-blue-800 active:scale-[0.98]"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call For Order
            </a>
          ) : (
            <div />
          )}
        </div>

        <MobileActions
          product={{ ...product, options: optionsToRender }}
          variant={selectedVariant}
          options={options}
          updateOptions={setOptionValue}
          inStock={inStock}
          handleAddToCart={handleAddToCart}
          isAdding={isAdding}
          show={!inView}
          optionsDisabled={!!disabled || isAdding}
        />
      </div>
    </>
  )
}
