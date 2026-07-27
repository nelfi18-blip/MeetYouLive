package com.meetyoulive.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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

public class MainActivity extends BridgeActivity {
    private static final String APP_URL = "https://meetyoulive.net";
    private static final int LOAD_TIMEOUT_MS = 15000;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private View errorView;
    private Runnable loadTimeout;
    private boolean loadFailed;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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
        title.setText("No se pudo cargar MeetYouLive");
        title.setTextColor(Color.WHITE);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        container.addView(title);

        TextView message = new TextView(this);
        message.setText("Revisa tu conexión e inténtalo de nuevo.");
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
        retry.setText("Reintentar");
        retry.setAllCaps(false);
        retry.setOnClickListener((view) -> {
            loadFailed = false;
            hideError();
            scheduleLoadTimeout(webView);
            webView.loadUrl(APP_URL);
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
        runOnUiThread(() -> {
            cancelLoadTimeout();
            if (webView != null) {
                webView.stopLoading();
            }
            loadFailed = true;
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

    @Override
    protected void onDestroy() {
        cancelLoadTimeout();
        super.onDestroy();
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
            hideError();
            scheduleLoadTimeout(view);
            super.onPageStarted(view, url, favicon);
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
                showError(view);
            }
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            super.onReceivedHttpError(view, request, errorResponse);
            if (request != null && request.isForMainFrame()) {
                showError(view);
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            showError(view);
            return true;
        }
    }
}
