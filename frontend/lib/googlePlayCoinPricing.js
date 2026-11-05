// Google Play returns a localized, formatted store price (e.g. "€9,99").
// Never substitute a USD reference price when the native product is unavailable.
export function getGooglePlayCoinDisplayPrice(product) {
  const formatted = typeof product?.formattedPrice === "string"
    ? product.formattedPrice.trim()
    : "";
  return formatted || null;
}
