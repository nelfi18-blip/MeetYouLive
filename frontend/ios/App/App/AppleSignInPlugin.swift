import AuthenticationServices
import Capacitor

@objc(MeetYouLiveBridgeViewController)
class MeetYouLiveBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(AppleIAPPlugin())
    }
}

@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin,
    ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "MeetYouLiveAppleAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var authorizationController: ASAuthorizationController?
    private var expectedState: String?
    private var presentationWindow: UIWindow?

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingCall == nil else {
                call.reject("Apple sign-in is already in progress", "APPLE_BUSY")
                return
            }
            guard let nonce = call.getString("nonce"), nonce.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                  let state = call.getString("state"), state.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                  let window = self.bridge?.viewController?.view.window else {
                call.reject("Apple sign-in is unavailable", "APPLE_UNAVAILABLE")
                return
            }
            self.pendingCall = call
            self.expectedState = state
            self.presentationWindow = window
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = nonce
            request.state = state
            let controller = ASAuthorizationController(authorizationRequests: [request])
            self.authorizationController = controller
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return presentationWindow!
    }

    public func authorizationController(controller: ASAuthorizationController,
                                        didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { clearRequest() }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              credential.state == expectedState,
              let data = credential.identityToken,
              let idToken = String(data: data, encoding: .utf8), !idToken.isEmpty else {
            pendingCall?.reject("Invalid Apple credential", "APPLE_INVALID_TOKEN")
            return
        }
        var result: [String: Any] = ["idToken": idToken]
        if let name = credential.fullName {
            result["name"] = PersonNameComponentsFormatter().string(from: name)
        }
        // Credentials stay in memory only; the backend verifies all identity claims.
        pendingCall?.resolve(result)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        pendingCall?.reject(cancelled ? "Apple sign-in cancelled" : "Apple sign-in failed",
                            cancelled ? "APPLE_CANCELLED" : "APPLE_NATIVE_ERROR")
        clearRequest()
    }

    private func clearRequest() {
        pendingCall = nil
        authorizationController = nil
        expectedState = nil
        presentationWindow = nil
    }
}
