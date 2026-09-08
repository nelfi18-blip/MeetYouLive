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
import androidx.credentials.exceptions.NoCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * MeetYouLive-owned replacement for the Google Sign-In leg of
 * {@code @capgo/capacitor-social-login}. Talks directly to
 * androidx.credentials.CredentialManager + Google Identity's
 * GetGoogleIdOption, so it is not affected by Capgo's
 * "[16] Account reauth failed" issue.
 *
 * Per Android's current Credential Manager / Sign in with Google guidance,
 * GetGoogleIdOption (bottom sheet / one-tap flow) and GetSignInWithGoogleOption
 * (explicit "Sign in with Google" button flow) serve different scenarios.
 * The primary attempt here is still GetGoogleIdOption; if it terminates with
 * NoCredentialException (no credential resolvable for the bottom sheet), a
 * single explicit-button fallback via GetSignInWithGoogleOption is attempted
 * using the same webClientId and the same foreground Activity context, since
 * the user already tapped an explicit "Continue with Google" button. This is
 * not a blind retry: it only triggers once, only for NoCredentialException,
 * and never suppresses/reclassifies whatever error the fallback itself
 * produces (including a recurrence of "[16] Account reauth failed").
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

    // Diagnostic messages are truncated to this length before being surfaced
    // to the JS/UI layer, purely as a safety cap (Credential Manager messages
    // are short, human-readable strings, not tokens/PII, but we still avoid
    // dumping arbitrarily long text to the UI).
    private static final int MAX_SANITIZED_MESSAGE_LENGTH = 200;

    // Lazily created and reused across sign-in attempts/retries instead of
    // allocating a new instance per call.
    private CredentialManager credentialManager;

    // TEMPORARY DIAGNOSTIC: carries the first (pre-retry) failure plus the
    // clearCredentialStateAsync outcome so both can be surfaced alongside the
    // second/retry attempt's failure instead of being lost when only the
    // terminal exception was shown. Remove once the native Google Sign-In
    // failure has been root-caused.
    private static final class PriorAttemptDiagnostic {
        final String firstAttemptStage;
        final String firstAttemptErrorType;
        final String firstAttemptMessageSanitized;
        final String clearStateResult;

        PriorAttemptDiagnostic(
            String firstAttemptStage,
            String firstAttemptErrorType,
            String firstAttemptMessageSanitized,
            String clearStateResult
        ) {
            this.firstAttemptStage = firstAttemptStage;
            this.firstAttemptErrorType = firstAttemptErrorType;
            this.firstAttemptMessageSanitized = firstAttemptMessageSanitized;
            this.clearStateResult = clearStateResult;
        }
    }

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
        requestGoogleCredential(call, activity, webClientId, new AtomicBoolean(false), new AtomicBoolean(false), null);
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

    // TEMPORARY DIAGNOSTIC: same as rejectWithDiagnostic, but additionally
    // preserves the first (pre-retry) attempt's stage/errorType/message and
    // the clearCredentialStateAsync outcome, so the original cause of the
    // retry is not lost behind the terminal retry exception.
    // Remove once the native Google Sign-In failure has been root-caused.
    private void rejectWithRetryDiagnostic(
        PluginCall call,
        PriorAttemptDiagnostic priorAttempt,
        String retryStage,
        String message,
        Exception retryCause
    ) {
        JSObject diagnostic = new JSObject();
        diagnostic.put("firstAttemptStage", priorAttempt.firstAttemptStage);
        diagnostic.put("firstAttemptErrorType", priorAttempt.firstAttemptErrorType);
        diagnostic.put("firstAttemptMessageSanitized", priorAttempt.firstAttemptMessageSanitized);
        diagnostic.put("clearStateResult", priorAttempt.clearStateResult);
        diagnostic.put("retryStage", retryStage);
        if (retryCause != null) {
            diagnostic.put("retryErrorType", retryCause.getClass().getSimpleName());
        }
        diagnostic.put("retryMessageSanitized", sanitizeMessage(retryCause != null ? retryCause.getMessage() : null));
        call.reject(message, "GOOGLE_NATIVE_ERROR", retryCause, diagnostic);
    }

    // TEMPORARY DIAGNOSTIC: surfaces both the original bottom sheet
    // (GetGoogleIdOption) failure and the subsequent explicit-button
    // (GetSignInWithGoogleOption) fallback failure, so the terminal error
    // never hides what actually happened on the first attempt. Deliberately
    // preserves the fallback's exact exception class (e.g. NoCredentialException,
    // GetCredentialCancellationException, or a recurrence of the "[16] Account
    // reauth failed" message) without reclassifying it.
    // Remove once the native Google Sign-In failure has been root-caused.
    private void rejectWithButtonFallbackDiagnostic(
        PluginCall call,
        String bottomSheetStage,
        String bottomSheetErrorType,
        String bottomSheetMessageSanitized,
        GetCredentialException buttonFlowError
    ) {
        JSObject diagnostic = new JSObject();
        diagnostic.put("bottomSheetStage", bottomSheetStage);
        diagnostic.put("bottomSheetErrorType", bottomSheetErrorType);
        diagnostic.put("bottomSheetMessageSanitized", bottomSheetMessageSanitized);
        diagnostic.put("stage", "native_google_button_fallback_failed");
        diagnostic.put("errorType", buttonFlowError.getClass().getSimpleName());
        diagnostic.put("messageSanitized", sanitizeMessage(buttonFlowError.getMessage()));
        call.reject(
            "Google Sign-In failed (bottom sheet + button fallback): " + buttonFlowError.getClass().getSimpleName(),
            "GOOGLE_NATIVE_ERROR",
            buttonFlowError,
            diagnostic
        );
    }

    // TEMPORARY DIAGNOSTIC: caps/trims exception messages before they are
    // surfaced to the JS/UI layer. Credential Manager messages are short,
    // human-readable strings (e.g. "[16] Account reauth failed"), not
    // tokens/PII, but this keeps the UI/logs bounded regardless.
    // Remove once the native Google Sign-In failure has been root-caused.
    private static String sanitizeMessage(String message) {
        if (message == null) {
            return null;
        }
        String trimmed = message.trim();
        if (trimmed.length() > MAX_SANITIZED_MESSAGE_LENGTH) {
            trimmed = trimmed.substring(0, MAX_SANITIZED_MESSAGE_LENGTH) + "...";
        }
        return trimmed;
    }

    private CredentialManager getCredentialManager() {
        if (credentialManager == null) {
            credentialManager = CredentialManager.create(getContext());
        }
        return credentialManager;
    }

    private void requestGoogleCredential(
        PluginCall call,
        Activity activity,
        String webClientId,
        AtomicBoolean reauthRetried,
        AtomicBoolean buttonFlowAttempted,
        PriorAttemptDiagnostic priorAttempt
    ) {
        GetGoogleIdOption googleIdOption = new GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(webClientId)
            .setAutoSelectEnabled(false)
            .build();
        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
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
                    handleSignInError(call, activity, webClientId, reauthRetried, buttonFlowAttempted, error, priorAttempt);
                }
            }
        );
    }

    private void handleSignInError(
        PluginCall call,
        Activity activity,
        String webClientId,
        AtomicBoolean reauthRetried,
        AtomicBoolean buttonFlowAttempted,
        GetCredentialException error,
        PriorAttemptDiagnostic priorAttempt
    ) {
        boolean isReauthFailure = isAccountReauthFailed(error);

        if (isReauthFailure && !reauthRetried.getAndSet(true)) {
            Log.w(LOG_TAG, "native_google_reauth16_detected");
            clearCredentialStateAndRetry(
                call,
                activity,
                webClientId,
                reauthRetried,
                buttonFlowAttempted,
                "native_google_reauth16_detected",
                error.getClass().getSimpleName(),
                sanitizeMessage(error.getMessage())
            );
            return;
        }

        // Bottom sheet / one-tap (GetGoogleIdOption) could not resolve any
        // credential. Per Android's current Credential Manager / Sign in with
        // Google guidance, fall back exactly once to the explicit-button flow
        // (GetSignInWithGoogleOption) rather than surfacing NoCredentialException
        // straight to the user, since MeetYouLive already starts this flow from
        // an explicit "Continue with Google" button tap.
        if (error instanceof NoCredentialException && !buttonFlowAttempted.getAndSet(true)) {
            String bottomSheetStage = priorAttempt != null ? "native_google_retry_failed" : "native_google_sign_in_failed";
            Log.w(LOG_TAG, "native_google_no_credential_detected");
            requestGoogleCredentialViaButtonFlow(
                call,
                activity,
                webClientId,
                bottomSheetStage,
                error.getClass().getSimpleName(),
                sanitizeMessage(error.getMessage())
            );
            return;
        }

        if (priorAttempt != null) {
            // This is the retry (second) attempt failing, whether with another
            // reauth failure or a different exception: surface the first
            // attempt + clear result alongside this terminal failure instead
            // of losing the original cause. (Deliberately handles both cases
            // here instead of falling through to the generic single-stage
            // rejectWithDiagnostic below, since we now always have prior
            // attempt context to report once a retry has been attempted.)
            String retryStage = isReauthFailure ? "native_google_retry_failed" : "native_google_retry_failed_other";
            Log.e(LOG_TAG, retryStage + ":" + error.getClass().getSimpleName());
            rejectWithRetryDiagnostic(
                call,
                priorAttempt,
                retryStage,
                "Google Sign-In failed after retry: " + error.getClass().getSimpleName(),
                error
            );
            return;
        }

        Log.e(LOG_TAG, "native_google_sign_in_failed:" + error.getClass().getSimpleName());
        rejectWithDiagnostic(call, "native_google_sign_in_failed", "Google Sign-In failed: " + error.getClass().getSimpleName(), error);
    }

    // Explicit-button fallback: GetSignInWithGoogleOption is the flow Android's
    // current documentation recommends for an explicit "Sign in with Google"
    // button (as opposed to GetGoogleIdOption's bottom sheet/one-tap flow).
    // Uses the same webClientId and the same foreground Activity context as the
    // bottom sheet attempt. Triggered at most once per sign-in call (guarded by
    // buttonFlowAttempted in handleSignInError), so this never loops.
    private void requestGoogleCredentialViaButtonFlow(
        PluginCall call,
        Activity activity,
        String webClientId,
        String bottomSheetStage,
        String bottomSheetErrorType,
        String bottomSheetMessageSanitized
    ) {
        GetSignInWithGoogleOption signInWithGoogleOption = new GetSignInWithGoogleOption.Builder(webClientId).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(signInWithGoogleOption)
            .build();

        Log.i(LOG_TAG, "native_google_button_fallback_request_created");

        Executor mainExecutor = ContextCompat.getMainExecutor(activity);
        getCredentialManager().getCredentialAsync(
            activity,
            request,
            null,
            mainExecutor,
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    Log.i(LOG_TAG, "native_google_button_fallback_credential_received");
                    handleCredentialResult(call, result);
                }

                @Override
                public void onError(GetCredentialException error) {
                    // Deliberately does not retry, clear state, or reclassify the
                    // error: whatever this fallback produces (including another
                    // "[16] Account reauth failed") is surfaced as-is alongside
                    // the original bottom sheet failure.
                    Log.e(LOG_TAG, "native_google_button_fallback_failed:" + error.getClass().getSimpleName());
                    rejectWithButtonFallbackDiagnostic(
                        call,
                        bottomSheetStage,
                        bottomSheetErrorType,
                        bottomSheetMessageSanitized,
                        error
                    );
                }
            }
        );
    }

    private boolean isAccountReauthFailed(GetCredentialException error) {
        String message = error.getMessage();
        return message != null && message.toLowerCase(java.util.Locale.ROOT).contains(REAUTH_FAILURE_MARKER);
    }

    private void clearCredentialStateAndRetry(
        PluginCall call,
        Activity activity,
        String webClientId,
        AtomicBoolean reauthRetried,
        AtomicBoolean buttonFlowAttempted,
        String firstAttemptStage,
        String firstAttemptErrorType,
        String firstAttemptMessageSanitized
    ) {
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
                    retryOnce("success");
                }

                @Override
                public void onError(ClearCredentialException clearError) {
                    Log.w(LOG_TAG, "native_google_state_clear_failed:" + clearError.getClass().getSimpleName());
                    retryOnce("failure:" + clearError.getClass().getSimpleName());
                }

                private void retryOnce(String clearStateResult) {
                    Log.i(LOG_TAG, "native_google_retry_started");
                    PriorAttemptDiagnostic priorAttempt = new PriorAttemptDiagnostic(
                        firstAttemptStage,
                        firstAttemptErrorType,
                        firstAttemptMessageSanitized,
                        clearStateResult
                    );
                    requestGoogleCredential(call, activity, webClientId, reauthRetried, buttonFlowAttempted, priorAttempt);
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
