package com.meetyoulive.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.Window;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.PluginHandle;

import java.io.FileDescriptor;
import java.io.PrintWriter;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final String APP_URL = "https://meetyoulive.net";
    private static final int LOAD_TIMEOUT_MS = 15000;
    private static final String TAG_DIAG = "NativeGoogleAuthDiag";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private View errorView;
    private Runnable loadTimeout;
    private boolean loadFailed;
    private String lastFailedUrl = APP_URL;

    private static void recordDiag(String message) {
        NativeGoogleAuthDiag.record(message);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenSecurityPlugin.class);

        String msgBeforeRegister = "Before registerPlugin(NativeGoogleAuthPlugin.class)";
        Log.d(TAG_DIAG, msgBeforeRegister);
        recordDiag(msgBeforeRegister);
        try {
            registerPlugin(NativeGoogleAuthPlugin.class);
            String msgAfterRegister = "After registerPlugin(NativeGoogleAuthPlugin.class) - class added to bridge builder, no exception thrown";
            Log.d(TAG_DIAG, msgAfterRegister);
            recordDiag(msgAfterRegister);
        } catch (Throwable t) {
            Log.e(TAG_DIAG, "Throwable while registering NativeGoogleAuthPlugin", t);
            recordDiag("Throwable while registering NativeGoogleAuthPlugin: " + t);
        }

        String msgBeforeSuper = "Immediately before super.onCreate() - Bridge/registerAllPlugins() will run here";
        Log.d(TAG_DIAG, msgBeforeSuper);
        recordDiag(msgBeforeSuper);
        super.onCreate(savedInstanceState);
        String msgAfterSuper = "Immediately after super.onCreate() returned successfully";
        Log.d(TAG_DIAG, msgAfterSuper);
        recordDiag(msgAfterSuper);

        try {
            Bridge diagBridge = getBridge();
            if (diagBridge == null) {
                Log.e(TAG_DIAG, "getBridge() returned null after super.onCreate()");
                recordDiag("getBridge() returned null after super.onCreate()");
            } else {
                PluginHandle handle = diagBridge.getPlugin("NativeGoogleAuth");
                if (handle != null) {
                    Object pluginInstance = handle.getInstance();
                    String pluginClassName = pluginInstance != null ? pluginInstance.getClass().getName() : "null";
                    String msgHandleFound = "getBridge().getPlugin(\"NativeGoogleAuth\") returned a PluginHandle for plugin class: " + pluginClassName;
                    Log.d(TAG_DIAG, msgHandleFound);
                    recordDiag(msgHandleFound);
                } else {
                    Log.e(TAG_DIAG, "getBridge().getPlugin(\"NativeGoogleAuth\") returned null - plugin not available at runtime");
                    recordDiag("getBridge().getPlugin(\"NativeGoogleAuth\") returned null - plugin not available at runtime");
                }
            }
        } catch (Throwable t) {
            Log.e(TAG_DIAG, "Throwable while checking getBridge().getPlugin(\"NativeGoogleAuth\")", t);
            recordDiag("Throwable while checking getBridge().getPlugin(\"NativeGoogleAuth\"): " + t);
        }

        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#0f0821"));
        window.setNavigationBarColor(Color.parseColor("#0f0821"));
        createNotificationChannels();
        configureWebViewFallback();
    }

    private void configureWebViewFallback() {
        Bridge bridge = getBridge();
        if (bridge == null) return;

        WebView webView = bridge.getWebView();
        errorView = createErrorView(webView);
        FrameLayout root = findViewById(android.R.id.content);
        root.addView(errorView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        bridge.setWebViewClient(new MeetYouLiveWebViewClient(bridge));
        scheduleLoadTimeout(webView);
    }

    private View createErrorView(WebView webView) {
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setGravity(Gravity.CENTER);
        container.setPadding(dp(24), dp(24), dp(24), dp(24));
        container.setBackgroundColor(Color.parseColor("#0f0821"));
        container.setVisibility(View.GONE);

        TextView title = new TextView(this);
        title.setText(getString(R.string.webview_error_title));
        title.setTextColor(Color.WHITE);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        container.addView(title);

        TextView message = new TextView(this);
        message.setText(getString(R.string.webview_error_message));
        message.setTextColor(Color.parseColor("#d8c8ff"));
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        messageParams.setMargins(0, dp(12), 0, dp(24));
        container.addView(message, messageParams);

        Button retry = new Button(this);
        retry.setText(getString(R.string.webview_error_retry));
        retry.setAllCaps(false);
        retry.setOnClickListener((view) -> {
            loadFailed = false;
            hideError();
            scheduleLoadTimeout(webView);
            webView.loadUrl(lastFailedUrl != null ? lastFailedUrl : APP_URL);
        });
        container.addView(retry);

        return container;
    }

    private void scheduleLoadTimeout(WebView webView) {
        cancelLoadTimeout();
        loadTimeout = () -> showError(webView);
        mainHandler.postDelayed(loadTimeout, LOAD_TIMEOUT_MS);
    }

    private void cancelLoadTimeout() {
        if (loadTimeout != null) {
            mainHandler.removeCallbacks(loadTimeout);
            loadTimeout = null;
        }
    }

    private void showError(WebView webView) {
        showError(webView, webView != null ? webView.getUrl() : null);
    }

    private void showError(WebView webView, String failedUrl) {
        runOnUiThread(() -> {
            cancelLoadTimeout();
            if (webView != null) {
                webView.stopLoading();
            }
            loadFailed = true;
            if (failedUrl != null && !failedUrl.trim().isEmpty()) {
                lastFailedUrl = failedUrl;
            }
            if (errorView != null) {
                errorView.setVisibility(View.VISIBLE);
            }
        });
    }

    private void hideError() {
        runOnUiThread(() -> {
            if (errorView != null) {
                errorView.setVisibility(View.GONE);
            }
        });
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density);
    }

    private boolean isMeetYouLiveUrl(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        String normalizedScheme = scheme != null ? scheme.toLowerCase(Locale.ROOT) : "";
        String normalizedHost = host != null ? host.toLowerCase(Locale.ROOT) : "";
        return ("https".equals(normalizedScheme) || "http".equals(normalizedScheme)) &&
            ("meetyoulive.net".equals(normalizedHost) || "www.meetyoulive.net".equals(normalizedHost));
    }

    private boolean loadMeetYouLiveUrlInWebView(WebView view, String url, boolean isMainFrame) {
        if (!isMainFrame || !isMeetYouLiveUrl(url)) {
            return false;
        }
        if (view != null) {
            view.loadUrl(url);
        }
        return true;
    }

    @Override
    public void onDestroy() {
        cancelLoadTimeout();
        super.onDestroy();
    }

    // TEMP DIAGNOSTIC: dumpsys invokes this live (e.g. when the user triggers
    // "Take bug report"), independent of the logcat ring buffer, so the
    // NativeGoogleAuth registration + end-to-end sign-in state below is
    // guaranteed to be captured in the report even if it is generated long
    // after onCreate() ran and the original Log.d/Log.w/Log.e lines have
    // rotated out of logcat. Safe to remove once Google Sign-In is confirmed
    // working end-to-end.
    @Override
    public void dump(String prefix, FileDescriptor fd, PrintWriter writer, String[] args) {
        super.dump(prefix, fd, writer, args);
        NativeGoogleAuthDiag.dumpRecordedEvents(prefix, writer, TAG_DIAG);
        writer.println(prefix + TAG_DIAG + ": --- live re-check at dump() time ---");
        try {
            Bridge diagBridge = getBridge();
            if (diagBridge == null) {
                writer.println(prefix + TAG_DIAG + ": getBridge() is currently null");
            } else {
                PluginHandle handle = diagBridge.getPlugin("NativeGoogleAuth");
                if (handle != null) {
                    Object pluginInstance = handle.getInstance();
                    String pluginClassName = pluginInstance != null ? pluginInstance.getClass().getName() : "null";
                    writer.println(prefix + TAG_DIAG + ": getBridge().getPlugin(\"NativeGoogleAuth\") is currently non-null, plugin class: " + pluginClassName);
                } else {
                    writer.println(prefix + TAG_DIAG + ": getBridge().getPlugin(\"NativeGoogleAuth\") is currently null");
                }
            }
        } catch (Throwable t) {
            writer.println(prefix + TAG_DIAG + ": Throwable during live re-check: " + t);
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        manager.createNotificationChannel(new NotificationChannel(
            "messages",
            "Mensajes",
            NotificationManager.IMPORTANCE_HIGH
        ));
        manager.createNotificationChannel(new NotificationChannel(
            "matches",
            "Matches",
            NotificationManager.IMPORTANCE_DEFAULT
        ));
        manager.createNotificationChannel(new NotificationChannel(
            "calls",
            "Llamadas",
            NotificationManager.IMPORTANCE_HIGH
        ));
        manager.createNotificationChannel(new NotificationChannel(
            "lives",
            "Lives",
            NotificationManager.IMPORTANCE_DEFAULT
        ));
        manager.createNotificationChannel(new NotificationChannel(
            "account_payments",
            "Cuenta y pagos",
            NotificationManager.IMPORTANCE_DEFAULT
        ));
    }

    private class MeetYouLiveWebViewClient extends BridgeWebViewClient {
        MeetYouLiveWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            loadFailed = false;
            if (url != null && !url.trim().isEmpty()) {
                lastFailedUrl = url;
            }
            hideError();
            scheduleLoadTimeout(view);
            super.onPageStarted(view, url, favicon);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request != null && request.getUrl() != null ? request.getUrl().toString() : null;
            if (loadMeetYouLiveUrlInWebView(view, url, request == null || request.isForMainFrame())) {
                return true;
            }
            return super.shouldOverrideUrlLoading(view, request);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (loadMeetYouLiveUrlInWebView(view, url, true)) {
                return true;
            }
            return super.shouldOverrideUrlLoading(view, url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            cancelLoadTimeout();
            if (!loadFailed) {
                hideError();
            }
            super.onPageFinished(view, url);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request != null && request.isForMainFrame()) {
                showError(view, request.getUrl() != null ? request.getUrl().toString() : null);
            }
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            super.onReceivedHttpError(view, request, errorResponse);
            if (request != null && request.isForMainFrame()) {
                showError(view, request.getUrl() != null ? request.getUrl().toString() : null);
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            showError(view);
            return true;
        }
    }
}
