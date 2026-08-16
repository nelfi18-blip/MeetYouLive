package com.meetyoulive.app;

import android.app.Activity;
import android.os.CancellationSignal;
import android.util.Log;

import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

@CapacitorPlugin(name = "NativeGoogleAuth")
public class NativeGoogleAuthPlugin extends Plugin {
    private static final String TAG = "NativeGoogleAuth";
    // TEMP DIAGNOSTIC tag for the shared NativeGoogleAuthDiag event log (see
    // MainActivity.dump()). Only stage names / booleans / exception class
    // names are recorded - never the web client ID, ID token or any PII.
    private static final String DIAG_TAG = "NativeGoogleAuthDiag";
    private final Object signInLock = new Object();
    private CancellationSignal pendingCancellationSignal;
    private PluginCall pendingCall;

    @PluginMethod
    public void signIn(PluginCall call) {
        NativeGoogleAuthDiag.record(DIAG_TAG + ": signIn() entered");

        String webClientId = call.getString("webClientId", "");
        boolean hasWebClientId = webClientId != null && !webClientId.trim().isEmpty();
        NativeGoogleAuthDiag.record(DIAG_TAG + ": webClientId present=" + hasWebClientId);
        if (!hasWebClientId) {
            NativeGoogleAuthDiag.record(DIAG_TAG + ": signIn() call.reject code=GOOGLE_WEB_CLIENT_ID_REQUIRED");
            call.reject("Google web client ID is required", "GOOGLE_WEB_CLIENT_ID_REQUIRED");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            NativeGoogleAuthDiag.record(DIAG_TAG + ": signIn() call.reject code=ACTIVITY_UNAVAILABLE");
            call.reject("Android activity is unavailable", "ACTIVITY_UNAVAILABLE");
            return;
        }

        GetSignInWithGoogleOption signInWithGoogleOption;
        GetCredentialRequest request;
        CredentialManager credentialManager;
        try {
            signInWithGoogleOption = new GetSignInWithGoogleOption.Builder(webClientId.trim())
                .build();
            request = new GetCredentialRequest.Builder()
                .addCredentialOption(signInWithGoogleOption)
                .build();
            NativeGoogleAuthDiag.record(DIAG_TAG + ": GetSignInWithGoogleOption/GetCredentialRequest built");
            credentialManager = CredentialManager.create(activity);
            NativeGoogleAuthDiag.record(DIAG_TAG + ": CredentialManager.create() succeeded");
        } catch (RuntimeException t) {
            // Diagnostic-only: record and rethrow unchanged so Capacitor's own
            // plugin call dispatcher rejects the call exactly as it did before
            // this instrumentation was added (no change to functional error
            // handling/response shape). Only RuntimeException is caught here,
            // matching the type actually thrown by these Builder/create()
            // APIs; Errors are intentionally left unhandled.
            NativeGoogleAuthDiag.record(DIAG_TAG + ": RuntimeException before getCredentialAsync, class=" + t.getClass().getName());
            throw t;
        }

        CancellationSignal cancellationSignal = new CancellationSignal();
        replacePendingSignIn(cancellationSignal, call);
        NativeGoogleAuthDiag.record(DIAG_TAG + ": getCredentialAsync starting");
        credentialManager.getCredentialAsync(
            activity,
            request,
            cancellationSignal,
            ContextCompat.getMainExecutor(activity),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    NativeGoogleAuthDiag.record(DIAG_TAG + ": getCredentialAsync onResult (success callback)");
                    if (!consumePendingSignIn(call)) return;
                    handleCredentialResult(call, result);
                }

                @Override
                public void onError(GetCredentialException error) {
                    String type = error.getType();
                    String message = error.getMessage();
                    NativeGoogleAuthDiag.record(DIAG_TAG + ": getCredentialAsync onError, exceptionClass=" + error.getClass().getName() + " type=" + type);
                    if (!consumePendingSignIn(call)) return;
                    Log.w(TAG, "Credential Manager failed: " + type + " " + sanitizeMessage(message));
                    NativeGoogleAuthDiag.record(DIAG_TAG + ": signIn() call.reject code=" + type);
                    call.reject("Google Sign-In failed", type, error);
                }
            }
        );
    }


    private void replacePendingSignIn(CancellationSignal cancellationSignal, PluginCall call) {
        CancellationSignal previousCancellationSignal;
        PluginCall previousCall;
        synchronized (signInLock) {
            previousCancellationSignal = pendingCancellationSignal;
            previousCall = pendingCall;
            pendingCancellationSignal = cancellationSignal;
            pendingCall = call;
        }

        if (previousCancellationSignal != null && !previousCancellationSignal.isCanceled()) {
            previousCancellationSignal.cancel();
        }
        if (previousCall != null) {
            NativeGoogleAuthDiag.record(DIAG_TAG + ": signIn() call.reject code=GOOGLE_SIGN_IN_SUPERSEDED (superseded by newer call)");
            previousCall.reject("Google Sign-In was superseded", "GOOGLE_SIGN_IN_SUPERSEDED");
        }
    }

    private boolean consumePendingSignIn(PluginCall call) {
        synchronized (signInLock) {
            if (call != pendingCall) return false;
            pendingCancellationSignal = null;
            pendingCall = null;
            return true;
        }
    }

    private void handleCredentialResult(PluginCall call, GetCredentialResponse result) {
        Credential credential = result.getCredential();
        NativeGoogleAuthDiag.record(DIAG_TAG + ": credential type=" + credential.getClass().getName());
        if (!(credential instanceof CustomCredential)) {
            NativeGoogleAuthDiag.record(DIAG_TAG + ": signIn() call.reject code=UNSUPPORTED_CREDENTIAL_TYPE");
            call.reject("Unsupported credential type", "UNSUPPORTED_CREDENTIAL_TYPE");
            return;
        }

        CustomCredential customCredential = (CustomCredential) credential;
        boolean isGoogleIdTokenCredential = GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(customCredential.getType());
        NativeGoogleAuthDiag.record(DIAG_TAG + ": isGoogleIdTokenCredential=" + isGoogleIdTokenCredential);
        if (!isGoogleIdTokenCredential) {
            NativeGoogleAuthDiag.record(DIAG_TAG + ": signIn() call.reject code=UNSUPPORTED_GOOGLE_CREDENTIAL_TYPE");
            call.reject("Unsupported Google credential type", "UNSUPPORTED_GOOGLE_CREDENTIAL_TYPE");
            return;
        }

        try {
            GoogleIdTokenCredential googleCredential = GoogleIdTokenCredential.createFrom(customCredential.getData());
            String idToken = googleCredential.getIdToken();
            boolean hasIdToken = idToken != null && !idToken.trim().isEmpty();
            NativeGoogleAuthDiag.record(DIAG_TAG + ": idToken present=" + hasIdToken);
            if (!hasIdToken) {
                NativeGoogleAuthDiag.record(DIAG_TAG + ": signIn() call.reject code=GOOGLE_ID_TOKEN_MISSING");
                call.reject("Google ID token is missing", "GOOGLE_ID_TOKEN_MISSING");
                return;
            }

            JSObject response = new JSObject();
            response.put("idToken", idToken);
            NativeGoogleAuthDiag.record(DIAG_TAG + ": signIn() call.resolve (idToken present, value not logged)");
            call.resolve(response);
        } catch (RuntimeException error) {
            NativeGoogleAuthDiag.record(DIAG_TAG + ": RuntimeException while parsing Google credential, class=" + error.getClass().getName());
            Log.w(TAG, "Unable to parse Google credential: " + sanitizeMessage(error.getMessage()));
            NativeGoogleAuthDiag.record(DIAG_TAG + ": signIn() call.reject code=GOOGLE_ID_TOKEN_PARSE_FAILED");
            call.reject("Unable to parse Google credential", "GOOGLE_ID_TOKEN_PARSE_FAILED", error);
        }
    }

    /**
     * TEMP DIAGNOSTIC (observational only): lets the JS layer report its own
     * best-effort stage/result (e.g. Capacitor.isPluginAvailable() outcome,
     * or the final stage reached in lib/nativeGoogleSignIn.js) into the same
     * persistent event log exposed via MainActivity.dump(), so a single Full
     * Bug Report can show the end-to-end trail across both the native and JS
     * sides. Does not affect the sign-in flow: it only records a short,
     * caller-supplied stage label (never tokens/PII) and resolves the call.
     */
    @PluginMethod
    public void reportDiagnostic(PluginCall call) {
        String stage = call.getString("stage", "unknown");
        if (stage == null) {
            stage = "unknown";
        }
        final int maxStageLength = 128;
        if (stage.length() > maxStageLength) {
            stage = stage.substring(0, maxStageLength);
        }
        NativeGoogleAuthDiag.record("NativeGoogleAuthDiag(JS): stage=" + stage);
        call.resolve();
    }

    private String sanitizeMessage(String message) {
        if (message == null) return "";
        return message.replaceAll("[-A-Za-z0-9_=+]{10,}\\.[-A-Za-z0-9_=+]{10,}\\.[-A-Za-z0-9_=+]{10,}", "[redacted]");
    }
}
