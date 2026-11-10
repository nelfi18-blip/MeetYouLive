import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getGooglePlayCoinDisplayPrice } from "../lib/googlePlayCoinPricing.js";

test("Google Play display preserves store localization and rejects missing prices", () => {
  assert.equal(getGooglePlayCoinDisplayPrice({ formattedPrice: "  €9,99  " }), "€9,99");
  assert.equal(getGooglePlayCoinDisplayPrice({ formattedPrice: "¥1,200" }), "¥1,200");
  assert.equal(getGooglePlayCoinDisplayPrice({ formattedPrice: "$4.99" }), "$4.99");
  for (const value of [null, undefined, {}, { formattedPrice: "" },
    { formattedPrice: "   " }, { formattedPrice: 9.99 }]) {
    assert.equal(getGooglePlayCoinDisplayPrice(value), null);
  }
});

test("native bridge maps the three exact Google Play products to their official offers", async () => {
  // Billing's native plugin is already covered separately; node:test cannot
  // import its extensionless Capacitor/Next module imports without Next's
  // bundler. Validate its source contract without creating a mock JS copy.
  const bridge = await readFile(new URL("../lib/googlePlayBilling.js", import.meta.url), "utf8");
  const nativePlugin = await readFile(new URL("../android/app/src/main/java/com/meetyoulive/app/GooglePlayBillingPlugin.java", import.meta.url), "utf8");
  assert.match(bridge, /100: "coins_pack_100"/);
  assert.match(bridge, /250: "coins_pack_250"/);
  assert.match(bridge, /700: "coins_pack_700"/);
  assert.match(bridge, /GooglePlayBilling\.queryProducts\(\{ productIds \}\)/);
  assert.match(bridge, /byProductId\[productId\] \|\| null/);
  assert.match(nativePlugin, /item\.put\("formattedPrice", offer\.getFormattedPrice\(\)\)/);
});

test("coins page uses Play pricing in Android cards and guards native checkout", async () => {
  const page = await readFile(new URL("../app/coins/page.jsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../components/ui/PurchasePackageCard.jsx", import.meta.url), "utf8");
  assert.match(page, /getGooglePlayCoinPackagePrices\(\)/);
  assert.match(page, /const androidNative = paymentProvider === "google_play"/);
  assert.match(page, /getGooglePlayCoinDisplayPrice\(googlePlayPrices\?\.\[pkg\.value\]\)/);
  assert.match(page, /price: androidNative \? \(googlePlayPrice \|\| "—"\)/);
  assert.match(page, /androidNative && \(googlePlayPricesFailed \|\| !googlePlayPrice\)/);
  assert.match(page, /if \(googlePlayPricesFailed \|\| !getGooglePlayCoinDisplayPrice\(googlePlayPrices\?\.\[pkg\]\)\)/);
  // Neither Play nor StoreKit localized prices should show static USD/coin quotes.
  assert.match(page, /perCoin: paymentProvider === "stripe" \? pkg\.perCoin : null/);
  assert.match(card, /pkg\.perCoin \? <div className="ppc-per-coin">/);
});
