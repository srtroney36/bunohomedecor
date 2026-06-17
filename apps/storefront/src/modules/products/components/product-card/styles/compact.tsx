import { HttpTypes } from "@medusajs/types"
import { CardFields } from "@lib/data/store-settings"
import CardImage from "../card-image"

type CompactCardProps = {
  product: HttpTypes.StoreProduct
  cheapestPrice: {
    calculated_price: string
    original_price: string
    price_type: string
  } | null
  fields: CardFields
}

const CompactCard = ({ product, cheapestPrice, fields }: CompactCardProps) => {
  const modelNumber = product.metadata?.model_number as string | undefined

  return (
    <div className="flex flex-col group">
      <CardImage
        thumbnail={product.thumbnail}
        images={product.images}
        alt={product.title ?? "Product"}
        aspectClass="aspect-[1/1]"
        className="rounded-lg"
      />
      <div className="mt-2 flex flex-col gap-y-0.5 px-0.5">
        {fields.name !== false && (
          <p className="text-xs font-medium text-ui-fg-base line-clamp-1 leading-snug">
            {product.title}
          </p>
        )}
        {fields.model !== false && modelNumber && (
          <p className="text-[10px] text-ui-fg-muted leading-tight">{modelNumber}</p>
        )}
        {fields.price !== false && cheapestPrice && (
          <div className="flex items-center gap-x-1">
            <span
              className={
                cheapestPrice.price_type === "sale"
                  ? "text-xs font-semibold text-orange-500"
                  : "text-xs font-semibold text-ui-fg-base"
              }
            >
              {cheapestPrice.calculated_price}
            </span>
            {cheapestPrice.price_type === "sale" && (
              <span className="text-[10px] text-ui-fg-muted line-through">
                {cheapestPrice.original_price}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CompactCard
