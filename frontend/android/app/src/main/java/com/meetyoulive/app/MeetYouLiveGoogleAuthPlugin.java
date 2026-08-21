package com.meetyoulive.app;

import android.app.Activity;
import android.util.Log;

import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * MeetYouLive-owned replacement for the Google Sign-In leg of
 * {@code @capgo/capacitor-social-login}. Talks directly to
 * androidx.credentials.CredentialManager + Google Identity's
 * GetSignInWithGoogleOption, so it is not affected by Capgo's
 * "[16] Account reauth failed" issue.
 *
 * Only the Google idToken flow lives here; Web/NextAuth and any other
 * social providers are untouched.
 */
@CapacitorPlugin(name = "MeetYouLiveGoogleAuth")
public class MeetYouLiveGoogleAuthPlugin extends Plugin {

    private static final String LOG_TAG = "MeetYouLiveGoogleAuth";

    // Substring Credential Manager/Google Identity uses for the well known
    // "[16] Account reauth failed" failure. Matching on the substring (not the
    // full message) keeps this resilient to minor message wording changes.
    private static final String REAUTH_FAILURE_MARKER = "reauth failed";

    // Lazily created and reused across sign-in attempts/retries instead of
    // allocating a new instance per call.
    private CredentialManager credentialManager;

    @PluginMethod
    public void signIn(PluginCall call) {
        String webClientId = call.getString("webClientId");
        if (webClientId == null || webClientId.trim().isEmpty()) {
            rejectWithDiagnostic(call, "native_google_start", "webClientId is required", null);
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            rejectWithDiagnostic(call, "native_google_start", "Activity is not available", null);
            return;
        }

        Log.i(LOG_TAG, "native_google_start");
        requestGoogleCredential(call, activity, webClientId, new AtomicBoolean(false));
    }

    // TEMPORARY DIAGNOSTIC: attaches the last reached native stage (e.g.
    // native_google_request_created, native_google_credential_received, ...)
    // plus the sanitized exception class name to the rejected PluginCall so
    // the JS/UI layer can surface it without needing ADB/logcat access.
    // Remove once the native Google Sign-In failure has been root-caused.
    private void rejectWithDiagnostic(PluginCall call, String stage, String message, Exception cause) {
        JSObject diagnostic = new JSObject();
        diagnostic.put("stage", stage);
        if (cause != null) {
            diagnostic.put("errorType", cause.getClass().getSimpleName());
        }
        call.reject(message, "GOOGLE_NATIVE_ERROR", cause, diagnostic);
    }

    private CredentialManager getCredentialManager() {
        if (credentialManager == null) {
            credentialManager = CredentialManager.create(getContext());
        }
        return credentialManager;
    }

    private void requestGoogleCredential(PluginCall call, Activity activity, String webClientId, AtomicBoolean reauthRetried) {
        GetSignInWithGoogleOption signInWithGoogleOption = new GetSignInWithGoogleOption.Builder(webClientId).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(signInWithGoogleOption)
            .build();

        Log.i(LOG_TAG, "native_google_request_created");

        Executor mainExecutor = ContextCompat.getMainExecutor(activity);
        getCredentialManager().getCredentialAsync(
            activity,
            request,
            null,
            mainExecutor,
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    Log.i(LOG_TAG, "native_google_credential_received");
                    handleCredentialResult(call, result);
                }

                @Override
                public void onError(GetCredentialException error) {
                    handleSignInError(call, activity, webClientId, reauthRetried, error);
                }
            }
        );
    }

    private void handleSignInError(
        PluginCall call,
        Activity activity,
        String webClientId,
        AtomicBoolean reauthRetried,
        GetCredentialException error
    ) {
        boolean isReauthFailure = isAccountReauthFailed(error);

        if (isReauthFailure && !reauthRetried.getAndSet(true)) {
            Log.w(LOG_TAG, "native_google_reauth16_detected");
            clearCredentialStateAndRetry(call, activity, webClientId, reauthRetried);
            return;
        }

        if (isReauthFailure) {
            Log.e(LOG_TAG, "native_google_retry_failed");
            rejectWithDiagnostic(call, "native_google_retry_failed", "Google Sign-In failed after retry: Account reauth failed", error);
            return;
        }

        Log.e(LOG_TAG, "native_google_sign_in_failed:" + error.getClass().getSimpleName());
        rejectWithDiagnostic(call, "native_google_sign_in_failed", "Google Sign-In failed: " + error.getClass().getSimpleName(), error);
    }

    private boolean isAccountReauthFailed(GetCredentialException error) {
        String message = error.getMessage();
        return message != null && message.toLowerCase(java.util.Locale.ROOT).contains(REAUTH_FAILURE_MARKER);
    }

    private void clearCredentialStateAndRetry(PluginCall call, Activity activity, String webClientId, AtomicBoolean reauthRetried) {
        ClearCredentialStateRequest clearRequest = new ClearCredentialStateRequest();
        Executor mainExecutor = ContextCompat.getMainExecutor(activity);

        getCredentialManager().clearCredentialStateAsync(
            clearRequest,
            null,
            mainExecutor,
            new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override
                public void onResult(Void unused) {
                    Log.i(LOG_TAG, "native_google_state_cleared");
                    retryOnce();
                }

                @Override
                public void onError(ClearCredentialException clearError) {
                    Log.w(LOG_TAG, "native_google_state_clear_failed:" + clearError.getClass().getSimpleName());
                    retryOnce();
                }

                private void retryOnce() {
                    Log.i(LOG_TAG, "native_google_retry_started");
                    requestGoogleCredential(call, activity, webClientId, reauthRetried);
                }
            }
        );
    }

    private void handleCredentialResult(PluginCall call, GetCredentialResponse result) {
        Credential credential = result.getCredential();

        if (!(credential instanceof CustomCredential)) {
            rejectWithDiagnostic(call, "native_google_credential_received", "Unsupported credential type received from Credential Manager", null);
            return;
        }

        CustomCredential customCredential = (CustomCredential) credential;
        if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(customCredential.getType())) {
            rejectWithDiagnostic(call, "native_google_credential_received", "Unsupported credential type: " + customCredential.getType(), null);
            return;
        }

        try {
            GoogleIdTokenCredential googleIdTokenCredential = GoogleIdTokenCredential.createFrom(customCredential.getData());
            String idToken = googleIdTokenCredential.getIdToken();
            if (idToken == null || idToken.trim().isEmpty()) {
                rejectWithDiagnostic(call, "native_google_credential_received", "Google did not return an ID token", null);
                return;
            }

            JSObject data = new JSObject();
            data.put("idToken", idToken);
            if (googleIdTokenCredential.getId() != null) {
                data.put("email", googleIdTokenCredential.getId());
            }
            if (googleIdTokenCredential.getDisplayName() != null) {
                data.put("displayName", googleIdTokenCredential.getDisplayName());
            }
            if (googleIdTokenCredential.getProfilePictureUri() != null) {
                data.put("profilePictureUri", googleIdTokenCredential.getProfilePictureUri().toString());
            }

            Log.i(LOG_TAG, "native_google_success");
            call.resolve(data);
        } catch (IllegalArgumentException | NullPointerException parsingException) {
            Log.e(LOG_TAG, "native_google_credential_parse_failed");
            rejectWithDiagnostic(call, "native_google_credential_parse_failed", "Failed to parse Google ID token credential", parsingException);
        }
    }
}
