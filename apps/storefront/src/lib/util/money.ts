import { isEmpty } from "./isEmpty"

type ConvertToLocaleParams = {
  amount: number
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

export const convertToLocale = ({
  amount = 0,
  currency_code,
  minimumFractionDigits,
  maximumFractionDigits,
  locale = "en-US",
}: ConvertToLocaleParams) => {
  const num = typeof amount === "number" && !isNaN(amount) ? amount : 0
  if (currency_code && !isEmpty(currency_code)) {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency_code,
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(num)
    } catch {
      return `${currency_code.toUpperCase()} ${num}`
    }
  }
  return num.toString()
}
