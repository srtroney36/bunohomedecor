"use client"

import { useCallback, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Funnel, XMark } from "@medusajs/icons"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import FilterDrawer from "@modules/store/components/filter-drawer"
import { StoreBrand } from "@lib/data/brands"

const sortOptions: { value: SortOptions; label: string }[] = [
  { value: "created_at", label: "Latest" },
  { value: "price_asc", label: "Price: Low → High" },
  { value: "price_desc", label: "Price: High → Low" },
]

type Props = {
  sortBy: SortOptions
  brands: Pick<StoreBrand, "id" | "name" | "handle">[]
  categories: { id: string; name: string; handle: string }[]
  collections: { id: string; handle: string; title: string }[]
  selectedBrand?: string
  selectedCategory?: string
  selectedCollection?: string
}

export default function FilterSortBar({
  sortBy,
  brands,
  categories,
  collections,
  selectedBrand,
  selectedCategory,
  selectedCollection,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  const setSort = useCallback(
    (value: SortOptions) => {
      const params = new URLSearchParams(searchParams)
      params.set("sortBy", value)
      router.push(`${pathname}?${params.toString()}`)
      setSortOpen(false)
    },
    [pathname, router, searchParams]
  )

  const activeCount = [selectedBrand, selectedCategory, selectedCollection].filter(Boolean).length

  const pillCls = (active: boolean) =>
    [
      "px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-150",
      active
        ? "bg-gray-900 text-white"
        : "bg-ui-bg-subtle text-ui-fg-subtle hover:bg-ui-bg-base hover:text-ui-fg-base border border-ui-border-base",
    ].join(" ")

  return (
    <>
      {/* ── Desktop bar ── */}
      <div className="hidden md:flex items-center justify-between mb-6">
        <div className="flex items-center gap-x-2">
          <span className="text-sm text-ui-fg-muted mr-1">Sort by:</span>
          {sortOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={pillCls(sortBy === opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setFilterOpen(true)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors duration-150"
          style={
            activeCount > 0
              ? {
                  backgroundColor: "var(--brand-primary)",
                  color: "#fff",
                  borderColor: "var(--brand-primary)",
                }
              : undefined
          }
          data-active={activeCount > 0}
        >
          <Funnel className="w-4 h-4" />
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      </div>

      {/* ── Mobile bar ── */}
      <div className="flex md:hidden items-center gap-3 mb-5">
        {/* Sort button */}
        <button
          onClick={() => setSortOpen(true)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-medium border border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle hover:bg-ui-bg-base"
        >
          <span className="text-base leading-none">⇅</span>
          Sort
        </button>

        {/* Filter button */}
        <button
          onClick={() => setFilterOpen(true)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-medium border transition-colors"
          style={
            activeCount > 0
              ? {
                  backgroundColor: "var(--brand-primary)",
                  color: "#fff",
                  borderColor: "var(--brand-primary)",
                }
              : { borderColor: "var(--ui-border-base)" }
          }
        >
          <Funnel className="w-4 h-4" />
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      </div>

      {/* ── Mobile sort bottom sheet ── */}
      <>
        <div
          className="fixed inset-0 z-[58] md:hidden"
          style={{
            background: "rgba(0,0,0,0.25)",
            opacity: sortOpen ? 1 : 0,
            pointerEvents: sortOpen ? "auto" : "none",
            transition: "opacity 0.25s ease",
          }}
          onClick={() => setSortOpen(false)}
          aria-hidden="true"
        />
        <div
          className="fixed bottom-0 left-0 right-0 z-[59] md:hidden bg-white rounded-t-2xl shadow-xl"
          style={{
            transform: sortOpen ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-ui-border-base"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            <span className="text-sm font-semibold text-white">Sort by</span>
            <button
              onClick={() => setSortOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
              aria-label="Close sort"
            >
              <XMark className="text-white w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col py-2 pb-8">
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                className="flex items-center justify-between px-5 py-3 text-sm transition-colors hover:bg-ui-bg-subtle"
                style={
                  sortBy === opt.value
                    ? { color: "var(--brand-primary)", fontWeight: 600 }
                    : { color: "var(--ui-fg-base)" }
                }
              >
                {opt.label}
                {sortBy === opt.value && <span className="w-2 h-2 rounded-full bg-current" />}
              </button>
            ))}
          </div>
        </div>
      </>

      {/* ── Filter drawer (all screen sizes) ── */}
      <FilterDrawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        brands={brands}
        categories={categories}
        collections={collections}
        selectedBrand={selectedBrand}
        selectedCategory={selectedCategory}
        selectedCollection={selectedCollection}
      />
    </>
  )
}
