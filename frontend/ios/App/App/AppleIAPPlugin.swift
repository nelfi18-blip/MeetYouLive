import StoreKit
import Capacitor

/**
 * AppleIAPPlugin — native bridge to StoreKit 2 for MeetYouLive Coins
 * consumable purchases.
 *
 * Security model (see backend/src/controllers/applePurchase.controller.js
 * for the server-side half):
 *  - This plugin NEVER grants Coins itself. It only launches Apple's own
 *    purchase sheet and returns the resulting `transactionId` to JS, which
 *    must POST it to the backend for independent verification via the App
 *    Store Server API before anything is credited.
 *  - `purchase()` requires an `appAccountToken` (a UUID deterministically
 *    derived from the authenticated backend user id — see
 *    frontend/lib/appleAccountToken.js), forwarded to StoreKit via
 *    `Product.PurchaseOption.appAccountToken`. Apple echoes this back in
 *    the signed transaction the backend fetches, so the backend can reject
 *    a transaction that does not belong to the calling session.
 *  - Unlike Google Play, Apple consumables have no server-side "consume"
 *    call. Instead, a purchased transaction stays "unfinished" (and is
 *    re-delivered by `queryPendingTransactions()`/`Transaction.unfinished`
 *    on every app start) until this plugin's `finishTransaction()` is
 *    called — which the JS layer only does AFTER the backend confirms the
 *    Coins were credited. This guarantees a purchase paid for but never
 *    credited (e.g. app killed mid-flow, network failure) is never lost.
 */
@objc(AppleIAPPlugin)
public class AppleIAPPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleIAPPlugin"
    public let jsName = "AppleIAP"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "queryProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryPendingTransactions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise)
    ]

    /// Fetches StoreKit's own localized price/title for the given product
    /// IDs. The frontend must always display this price, never a
    /// hardcoded value.
    @objc func queryProducts(_ call: CAPPluginCall) {
        guard let productIds = call.getArray("productIds", String.self), !productIds.isEmpty else {
            call.reject("productIds is required", "INVALID_ARGUMENT")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: productIds)
                let resultArray = products.map { product -> [String: Any] in
                    [
                        "productId": product.id,
                        "displayName": product.displayName,
                        "displayPrice": product.displayPrice
                    ]
                }
                call.resolve(["products": resultArray])
            } catch {
                call.reject("Failed to load Apple products", "APPLE_IAP_PRODUCTS_FAILED", error)
            }
        }
    }

    /// Launches StoreKit 2's native purchase sheet for a single Consumable
    /// product. Resolves with the resulting transactionId; the caller MUST
    /// then send { productId, transactionId } to the backend for
    /// verification — Coins are never granted by this method, and the
    /// transaction is intentionally left unfinished until the backend
    /// confirms the credit (see finishTransaction()).
    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("productId is required", "INVALID_ARGUMENT")
            return
        }
        guard let tokenString = call.getString("appAccountToken"),
              let appAccountToken = UUID(uuidString: tokenString) else {
            call.reject("appAccountToken must be a valid UUID", "APP_ACCOUNT_TOKEN_INVALID")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Unknown Apple product: \(productId)", "APPLE_IAP_PRODUCT_NOT_FOUND")
                    return
                }

                let result = try await product.purchase(options: [.appAccountToken(appAccountToken)])
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        call.resolve([
                            "productId": transaction.productID,
                            "transactionId": String(transaction.id)
                        ])
                    case .unverified(_, let error):
                        call.reject("Apple transaction verification failed", "APPLE_IAP_UNVERIFIED", error)
                    }
                case .userCancelled:
                    call.reject("Apple purchase cancelled by the user", "APPLE_IAP_CANCELLED")
                case .pending:
                    call.reject("Apple purchase pending approval (e.g. Ask to Buy)", "APPLE_IAP_PENDING")
                @unknown default:
                    call.reject("Unknown Apple purchase result", "APPLE_IAP_UNKNOWN_RESULT")
                }
            } catch {
                call.reject("Apple purchase failed", "APPLE_IAP_PURCHASE_FAILED", error)
            }
        }
    }

    /// Returns any Consumable transactions StoreKit still has on record as
    /// unfinished for this device/account — i.e. purchases that were paid
    /// for but never successfully reported to (or credited by) the
    /// backend, typically because the app was killed/crashed mid-flow.
    /// Call this on app start so those transactions can be safely
    /// resubmitted; the backend's idempotent verification (unique
    /// transactionId) guarantees they are never credited twice even if
    /// they were already processed.
    @objc func queryPendingTransactions(_ call: CAPPluginCall) {
        Task {
            var resultArray: [[String: Any]] = []
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result, transaction.productType == .consumable {
                    resultArray.append([
                        "productId": transaction.productID,
                        "transactionId": String(transaction.id)
                    ])
                }
            }
            call.resolve(["transactions": resultArray])
        }
    }

    /// Marks a transaction as finished so StoreKit stops re-delivering it
    /// via queryPendingTransactions()/Transaction.unfinished. MUST only be
    /// called after the backend has confirmed the Coins credit. Resolves
    /// successfully even if the transaction is already finished or no
    /// longer found, so retries from the JS layer are always safe.
    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let transactionIdString = call.getString("transactionId"),
              let transactionId = UInt64(transactionIdString) else {
            call.reject("transactionId is required", "TRANSACTION_ID_MISSING")
            return
        }
        Task {
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result, transaction.id == transactionId {
                    await transaction.finish()
                    break
                }
            }
            call.resolve(["ok": true])
        }
    }
}
