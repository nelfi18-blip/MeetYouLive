import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Capacitor } from "@capacitor/core";
import { getGooglePlayCoinDisplayPrice } from "../lib/googlePlayCoinPricing.js";

// registerPlugin() selects nativePromise when a matching native plugin header
// exists before the module is imported. Tests use a fake native bridge only.
Capacitor.PluginHeaders = [{
  name: "GooglePlayBilling",
  methods: [{ name: "queryProducts", rtype: "promise" }],
}];
const { getGooglePlayCoinPackagePrices } = await import("../lib/googlePlayBilling.js");

const originalNativePromise = Capacitor.nativePromise;

test.afterEach(() => {
  Capacitor.nativePromise = originalNativePromise;
});

test("Google Play display preserves store localization and rejects missing prices", () => {
  assert.equal(getGooglePlayCoinDisplayPrice({ formattedPrice: "  €9,99  " }), "€9,99");
  assert.equal(getGooglePlayCoinDisplayPrice({ formattedPrice: "¥1,200" }), "¥1,200");
  assert.equal(getGooglePlayCoinDisplayPrice({ formattedPrice: "$4.99" }), "$4.99");
  for (const value of [null, undefined, {}, { formattedPrice: "" },
    { formattedPrice: "   " }, { formattedPrice: 9.99 }]) {
    assert.equal(getGooglePlayCoinDisplayPrice(value), null);
  }
});

test("native product mapping keeps exact package IDs and disables missing offers", async () => {
  const calls = [];
  Capacitor.nativePromise = async (plugin, method, options) => {
    calls.push({ plugin, method, options });
    return { products: [
      { productId: "coins_pack_100", formattedPrice: "€4,49" },
      { productId: "coins_pack_700", formattedPrice: "£18.99" },
    ] };
  };
  const prices = await getGooglePlayCoinPackagePrices();
  assert.deepEqual(calls, [{
    plugin: "GooglePlayBilling", method: "queryProducts",
    options: { productIds: ["coins_pack_100", "coins_pack_250", "coins_pack_700"] },
  }]);
  assert.equal(getGooglePlayCoinDisplayPrice(prices[100]), "€4,49");
  assert.equal(prices[250], null);
  assert.equal(getGooglePlayCoinDisplayPrice(prices[250]), null);
  assert.equal(getGooglePlayCoinDisplayPrice(prices[700]), "£18.99");
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
  assert.match(page, /perCoin: androidNative \? null : pkg\.perCoin/);
  assert.match(card, /pkg\.perCoin \? <div className="ppc-per-coin">/);
});
