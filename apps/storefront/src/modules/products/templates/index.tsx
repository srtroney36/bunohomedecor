import { Suspense } from "react"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductOnboardingCta from "@modules/products/components/product-onboarding-cta"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import ViewContentTracker from "@modules/products/components/view-content-tracker"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { getStoreSettings } from "@lib/data/store-settings"
import { StoreBrand } from "@lib/data/brands"

import ProductActionsWrapper from "./product-actions-wrapper"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[]
  productBrand?: StoreBrand | null
}

const ProductTemplate = async ({
  product,
  region,
  countryCode,
  images,
  productBrand,
}: ProductTemplateProps) => {
  if (!product || !product.id) {
    return notFound()
  }

  const storeSettings = await getStoreSettings()

  const firstVariant = product.variants?.[0]
  const calculatedPrice = firstVariant?.calculated_price as
    | { calculated_amount?: number; currency_code?: string }
    | undefined

  return (
    <>
      <ViewContentTracker
        product={{
          id: product.id!,
          name: product.title ?? "",
          price: calculatedPrice?.calculated_amount ?? undefined,
          currency: calculatedPrice?.currency_code ?? undefined,
        }}
      />
      <div
        className="content-container flex flex-col lg:flex-row lg:items-start py-8 gap-x-12 gap-y-8"
        data-testid="product-container"
      >
        {/* LEFT — Image gallery (~55%) */}
        <div className="w-full lg:w-[55%] lg:sticky lg:top-24">
          <ImageGallery images={images} />
        </div>

        {/* RIGHT — Product info + actions + tabs (~45%) */}
        <div className="flex flex-col w-full lg:w-[45%] gap-y-6 lg:py-2">
          <ProductInfo product={product} productBrand={productBrand} />
          <ProductOnboardingCta />
          <Suspense
            fallback={
              <ProductActions
                disabled={true}
                product={product}
                region={region}
                storeSettings={storeSettings}
              />
            }
          >
            <ProductActionsWrapper
              id={product.id}
              region={region}
              storeSettings={storeSettings}
            />
          </Suspense>
          <ProductTabs product={product} />
        </div>
      </div>
      <div
        className="content-container my-16 small:my-32"
        data-testid="related-products-container"
      >
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate
