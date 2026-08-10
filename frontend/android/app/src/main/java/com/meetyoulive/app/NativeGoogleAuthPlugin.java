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
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException;

@CapacitorPlugin(name = "NativeGoogleAuth")
public class NativeGoogleAuthPlugin extends Plugin {
    private static final String TAG = "NativeGoogleAuth";
    private CancellationSignal pendingCancellationSignal;
    private PluginCall pendingCall;

    @PluginMethod
    public void signIn(PluginCall call) {
        String webClientId = call.getString("webClientId", "");
        if (webClientId == null || webClientId.trim().isEmpty()) {
            call.reject("Google web client ID is required", "GOOGLE_WEB_CLIENT_ID_REQUIRED");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Android activity is unavailable", "ACTIVITY_UNAVAILABLE");
            return;
        }

        cancelPendingSignIn();

        GetGoogleIdOption googleIdOption = new GetGoogleIdOption.Builder()
            .setServerClientId(webClientId.trim())
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(false)
            .build();

        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build();

        CredentialManager credentialManager = CredentialManager.create(activity);
        CancellationSignal cancellationSignal = new CancellationSignal();
        pendingCancellationSignal = cancellationSignal;
        pendingCall = call;
        credentialManager.getCredentialAsync(
            activity,
            request,
            cancellationSignal,
            ContextCompat.getMainExecutor(activity),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    if (call != pendingCall) return;
                    clearPendingSignIn();
                    handleCredentialResult(call, result);
                }

                @Override
                public void onError(GetCredentialException error) {
                    if (call != pendingCall) return;
                    clearPendingSignIn();
                    String type = error.getType();
                    String message = error.getMessage();
                    Log.w(TAG, "Credential Manager failed: " + type + " " + sanitizeMessage(message));
                    call.reject("Google Sign-In failed", type, error);
                }
            }
        );
    }

    private void cancelPendingSignIn() {
        if (pendingCancellationSignal != null && !pendingCancellationSignal.isCanceled()) {
            pendingCancellationSignal.cancel();
        }
        if (pendingCall != null) {
            pendingCall.reject("Google Sign-In was superseded", "GOOGLE_SIGN_IN_SUPERSEDED");
        }
        clearPendingSignIn();
    }

    private void clearPendingSignIn() {
        pendingCancellationSignal = null;
        pendingCall = null;
    }

    private void handleCredentialResult(PluginCall call, GetCredentialResponse result) {
        Credential credential = result.getCredential();
        if (!(credential instanceof CustomCredential)) {
            call.reject("Unsupported credential type", "UNSUPPORTED_CREDENTIAL_TYPE");
            return;
        }

        CustomCredential customCredential = (CustomCredential) credential;
        if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(customCredential.getType())) {
            call.reject("Unsupported Google credential type", "UNSUPPORTED_GOOGLE_CREDENTIAL_TYPE");
            return;
        }

        try {
            GoogleIdTokenCredential googleCredential = GoogleIdTokenCredential.createFrom(customCredential.getData());
            String idToken = googleCredential.getIdToken();
            if (idToken == null || idToken.trim().isEmpty()) {
                call.reject("Google ID token is missing", "GOOGLE_ID_TOKEN_MISSING");
                return;
            }

            JSObject response = new JSObject();
            response.put("idToken", idToken);
            call.resolve(response);
        } catch (GoogleIdTokenParsingException error) {
            Log.w(TAG, "Unable to parse Google credential: " + sanitizeMessage(error.getMessage()));
            call.reject("Unable to parse Google credential", "GOOGLE_ID_TOKEN_PARSE_FAILED", error);
        }
    }

    private String sanitizeMessage(String message) {
        if (message == null) return "";
        return message.replaceAll("[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}", "[redacted]");
    }
}
