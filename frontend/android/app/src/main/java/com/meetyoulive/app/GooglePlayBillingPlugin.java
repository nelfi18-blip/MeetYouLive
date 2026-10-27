package com.meetyoulive.app;

import android.app.Activity;
import android.util.Log;

import com.android.billingclient.api.AccountIdentifiers;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * GooglePlayBillingPlugin — native bridge to Google Play Billing Library for
 * MeetYouLive Coins consumable purchases.
 *
 * Security model (see backend/src/controllers/googlePlayPurchase.controller.js
 * for the server-side half):
 *  - This plugin NEVER grants Coins itself. It only launches Google's own
 *    purchase UI and returns the resulting opaque `purchaseToken` to JS,
 *    which must POST it to the backend for independent verification via the
 *    Google Play Developer API before anything is credited.
 *  - `purchase()` requires an `accountId` (the authenticated backend user
 *    id), forwarded to Billing as `setObfuscatedAccountId`. Google echoes
 *    this back in the purchase record the backend fetches, so the backend
 *    can reject a token that does not belong to the calling session.
 *  - Consumable finalization (acknowledge/consume) is NEVER done here. The
 *    backend consumes the purchase via the Developer API only after coins
 *    have been durably credited — see `restorePendingPurchases()` below for
 *    how an app restart recovers a purchase that was paid for but never
 *    reached the backend (e.g. process death mid-flow).
 */
@CapacitorPlugin(name = "GooglePlayBilling")
public class GooglePlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String LOG_TAG = "GooglePlayBilling";

    private BillingClient billingClient;
    private final AtomicBoolean connecting = new AtomicBoolean(false);

    // The PluginCall for an in-flight purchase() launch, resolved/rejected
    // from onPurchasesUpdated() once Google Play returns a result. Only one
    // purchase flow can be in flight at a time (Billing Library constraint).
    private PluginCall pendingPurchaseCall;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
            )
            .build();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        ensureConnected((connected) -> {
            JSObject result = new JSObject();
            result.put("available", connected);
            call.resolve(result);
        });
    }

    /**
     * Fetches Google Play's localized price/title for the given product IDs
     * (one-time/managed products). The frontend must always display this
     * price, never a hardcoded value.
     */
    @PluginMethod
    public void queryProducts(PluginCall call) {
        JSArray productIdsArray = call.getArray("productIds");
        if (productIdsArray == null || productIdsArray.length() == 0) {
            call.reject("productIds is required", "INVALID_ARGUMENT");
            return;
        }

        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        try {
            for (Object idObj : productIdsArray.toList()) {
                products.add(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(String.valueOf(idObj))
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()
                );
            }
        } catch (org.json.JSONException e) {
            call.reject("Invalid productIds", "INVALID_ARGUMENT", e);
            return;
        }

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(products)
            .build();

        ensureConnected((connected) -> {
            if (!connected) {
                call.reject("Google Play Billing is not available", "BILLING_UNAVAILABLE");
                return;
            }
            billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsResult) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(
                        "Failed to query product details: " + billingResult.getDebugMessage(),
                        String.valueOf(billingResult.getResponseCode())
                    );
                    return;
                }

                JSArray resultArray = new JSArray();
                for (ProductDetails details : productDetailsResult) {
                    ProductDetails.OneTimePurchaseOfferDetails offer = details.getOneTimePurchaseOfferDetails();
                    JSObject item = new JSObject();
                    item.put("productId", details.getProductId());
                    item.put("title", details.getTitle());
                    item.put("description", details.getDescription());
                    if (offer != null) {
                        item.put("formattedPrice", offer.getFormattedPrice());
                        item.put("priceAmountMicros", offer.getPriceAmountMicros());
                        item.put("priceCurrencyCode", offer.getPriceCurrencyCode());
                    }
                    resultArray.put(item);
                }

                JSObject result = new JSObject();
                result.put("products", resultArray);
                call.resolve(result);
            });
        });
    }

    /**
     * Launches Google Play's native purchase sheet for a single one-time
     * product. Resolves with the opaque purchaseToken once Google Play
     * reports a result via onPurchasesUpdated(); the caller MUST then send
     * { productId, purchaseToken } to the backend for verification — Coins
     * are never granted by this method.
     */
    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        String accountId = call.getString("accountId");
        if (productId == null || productId.isEmpty()) {
            call.reject("productId is required", "INVALID_ARGUMENT");
            return;
        }
        if (accountId == null || accountId.isEmpty()) {
            call.reject("accountId is required", "INVALID_ARGUMENT");
            return;
        }
        if (pendingPurchaseCall != null) {
            call.reject("Another purchase is already in progress", "PURCHASE_IN_PROGRESS");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No active Activity to launch the purchase flow", "NO_ACTIVITY");
            return;
        }

        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        products.add(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        );
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(products)
            .build();

        ensureConnected((connected) -> {
            if (!connected) {
                call.reject("Google Play Billing is not available", "BILLING_UNAVAILABLE");
                return;
            }
            billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsResult) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK
                    || productDetailsResult.isEmpty()) {
                    call.reject(
                        "Product not found on Google Play: " + productId,
                        String.valueOf(billingResult.getResponseCode())
                    );
                    return;
                }

                ProductDetails productDetails = productDetailsResult.get(0);
                BillingFlowParams.ProductDetailsParams detailsParams =
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(productDetails)
                        .build();

                List<BillingFlowParams.ProductDetailsParams> detailsParamsList = new ArrayList<>();
                detailsParamsList.add(detailsParams);

                BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(detailsParamsList)
                    // Binds this purchase to the authenticated MeetYouLive
                    // user id. The backend rejects any purchaseToken whose
                    // obfuscatedExternalAccountId does not match the
                    // authenticated session before crediting Coins.
                    .setObfuscatedAccountId(accountId)
                    .build();

                pendingPurchaseCall = call;
                getActivity().runOnUiThread(() ->
                    billingClient.launchBillingFlow(activity, flowParams)
                );
            });
        });
    }

    /**
     * Returns any INAPP purchases Google Play still has on record for this
     * device/account that have not yet been consumed — i.e. purchases that
     * were paid for but never successfully reported to (or credited by) the
     * backend, typically because the app was killed/crashed mid-flow. Call
     * this on app start so those purchases can be safely resubmitted; the
     * backend's idempotent verification (unique purchaseToken) guarantees
     * they are never credited twice even if they were already processed.
     */
    @PluginMethod
    public void queryPendingPurchases(PluginCall call) {
        ensureConnected((connected) -> {
            if (!connected) {
                call.reject("Google Play Billing is not available", "BILLING_UNAVAILABLE");
                return;
            }
            QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build();

            billingClient.queryPurchasesAsync(params, (billingResult, purchases) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(
                        "Failed to query purchases: " + billingResult.getDebugMessage(),
                        String.valueOf(billingResult.getResponseCode())
                    );
                    return;
                }

                JSObject result = new JSObject();
                result.put("purchases", purchasesToJsArray(purchases));
                call.resolve(result);
            });
        });
    }

    private JSArray purchasesToJsArray(List<Purchase> purchases) {
        JSArray resultArray = new JSArray();
        for (Purchase purchase : purchases) {
            // A consumable purchase can list more than one productId only
            // for bundled SKUs — MeetYouLive coin packs are always single
            // products, so the first entry is authoritative here.
            List<String> skus = purchase.getProducts();
            if (skus.isEmpty()) continue;
            JSObject item = new JSObject();
            item.put("productId", skus.get(0));
            item.put("purchaseToken", purchase.getPurchaseToken());
            item.put("purchaseState", purchase.getPurchaseState());
            item.put("isAcknowledged", purchase.isAcknowledged());
            resultArray.put(item);
        }
        return resultArray;
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;
        if (call == null) return;

        int code = billingResult.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.reject("Purchase canceled by the user", "USER_CANCELED");
            return;
        }
        if (code != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject(
                "Purchase failed: " + billingResult.getDebugMessage(),
                String.valueOf(code)
            );
            return;
        }

        Purchase purchase = purchases.get(0);
        List<String> skus = purchase.getProducts();
        JSObject result = new JSObject();
        result.put("productId", skus.isEmpty() ? null : skus.get(0));
        result.put("purchaseToken", purchase.getPurchaseToken());
        result.put("purchaseState", purchase.getPurchaseState());
        AccountIdentifiers identifiers = purchase.getAccountIdentifiers();
        result.put("obfuscatedAccountId", identifiers != null ? identifiers.getObfuscatedAccountId() : null);
        call.resolve(result);
    }

    private interface ConnectionCallback {
        void onResult(boolean connected);
    }

    private void ensureConnected(ConnectionCallback callback) {
        if (billingClient != null && billingClient.isReady()) {
            callback.onResult(true);
            return;
        }
        if (!connecting.compareAndSet(false, true)) {
            // A connection attempt is already underway; avoid piling up
            // duplicate startConnection calls under rapid repeated taps.
            callback.onResult(false);
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                connecting.set(false);
                callback.onResult(billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK);
            }

            @Override
            public void onBillingServiceDisconnected() {
                connecting.set(false);
                Log.w(LOG_TAG, "Billing service disconnected");
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (billingClient != null) {
            billingClient.endConnection();
        }
        super.handleOnDestroy();
    }
}
