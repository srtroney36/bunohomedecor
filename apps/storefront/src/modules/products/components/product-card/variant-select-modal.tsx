"use client"

import { addToCart } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

type VariantSelectModalProps = {
  product: HttpTypes.StoreProduct
  mode: "add" | "buy"
  countryCode: string
  onClose: () => void
}

export default function VariantSelectModal({
  product,
  mode,
  countryCode,
  onClose,
}: VariantSelectModalProps) {
  const router = useRouter()
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Lock scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  const options = product.options ?? []

  // Find the variant that matches all selected option values
  const resolvedVariant = product.variants?.find((v) =>
    v.options?.every(
      (o) => selectedOptions[o.option_id ?? (o as any).option?.id ?? ""] === o.value
    )
  )

  const inStock = resolvedVariant
    ? resolvedVariant.manage_inventory === false ||
      resolvedVariant.allow_backorder ||
      (resolvedVariant.inventory_quantity || 0) > 0 ||
      resolvedVariant.manage_inventory == null
    : false

  const allSelected = options.every((opt) => selectedOptions[opt.id ?? ""] !== undefined)
  const canSubmit = allSelected && !!resolvedVariant && inStock

  const handleSelect = (optionId: string, value: string) => {
    setSelectedOptions((prev) => {
      const next = { ...prev, [optionId]: value }
      const match = product.variants?.find((v) =>
        v.options?.every(
          (o) => next[o.option_id ?? (o as any).option?.id ?? ""] === o.value
        )
      )
      if (match) return next
      const candidate = product.variants?.find((v) =>
        v.options?.some(
          (o) =>
            (o.option_id === optionId || (o as any).option?.id === optionId) &&
            o.value === value
        )
      )
      if (candidate) {
        const candidateMap: Record<string, string> = {}
        for (const opt of candidate.options ?? []) {
          const id = opt.option_id || (opt as any).option?.id
          if (id && opt.value) candidateMap[id] = opt.value
        }
        if (Object.keys(candidateMap).length > 0) return candidateMap
      }
      return next
    })
  }

  const handleSubmit = async () => {
    if (!resolvedVariant?.id) return
    setSubmitting(true)
    try {
      await addToCart({ variantId: resolvedVariant.id, quantity: 1, countryCode })
      if (mode === "buy") {
        router.push(`/${countryCode}/checkout`)
      } else {
        onClose()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Title */}
        <div className="pr-6">
          <p className="text-sm font-semibold text-gray-900 line-clamp-2">{product.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">Select your options</p>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-y-4">
          {options.map((option) => {
            const seen = new Set<string>()
            const values = (
              product.variants
                ?.flatMap((v) => v.options ?? [])
                .filter((o) => o.option_id === option.id)
                .map((o) => o.value)
                .filter(Boolean) as string[]
            ).filter((v) => { if (seen.has(v)) return false; seen.add(v); return true })

            return (
              <div key={option.id} className="flex flex-col gap-y-2">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  {option.title}
                </p>
                <div className="flex flex-wrap gap-2">
                  {values.map((val) => {
                    const isSelected = selectedOptions[option.id ?? ""] === val
                    return (
                      <button
                        key={val}
                        onClick={() => handleSelect(option.id ?? "", val)}
                        className={[
                          "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150",
                          isSelected
                            ? "border-[#fcbc06] bg-[#fcbc06] text-gray-900"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-400",
                        ].join(" ")}
                      >
                        {val}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Action button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full rounded-xl py-3 text-sm font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed bg-gray-900 text-white hover:bg-gray-700 disabled:hover:bg-gray-900"
        >
          {submitting ? (
            <span className="animate-pulse">
              {mode === "buy" ? "Processing…" : "Adding…"}
            </span>
          ) : resolvedVariant && !inStock ? (
            "Out of stock"
          ) : mode === "buy" ? (
            "Buy Now"
          ) : (
            "Add to Cart"
          )}
        </button>
      </div>
    </div>
  )
}
