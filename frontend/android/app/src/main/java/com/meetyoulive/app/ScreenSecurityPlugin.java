package com.meetyoulive.app;

import android.app.Activity;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScreenSecurity")
public class ScreenSecurityPlugin extends Plugin {
    @PluginMethod
    public void enable(PluginCall call) {
        setSecureFlag(call, true);
    }

    @PluginMethod
    public void disable(PluginCall call) {
        setSecureFlag(call, false);
    }

    private void setSecureFlag(PluginCall call, boolean enabled) {
        try {
            final Activity activity = getActivity();
            if (activity == null) {
                call.reject("Screen protection activity is unavailable", "SCREEN_SECURITY_UNAVAILABLE");
                return;
            }
            activity.runOnUiThread(() -> {
                try {
                    if (getActivity() != activity || activity.isFinishing() || activity.isDestroyed()) {
                        call.reject("Screen protection activity is unavailable", "SCREEN_SECURITY_UNAVAILABLE");
                        return;
                    }
                    final Window window = activity.getWindow();
                    if (window == null) {
                        call.reject("Screen protection window is unavailable", "SCREEN_SECURITY_UNAVAILABLE");
                        return;
                    }
                    if (enabled) {
                        window.setFlags(
                            WindowManager.LayoutParams.FLAG_SECURE,
                            WindowManager.LayoutParams.FLAG_SECURE
                        );
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    }
                    final boolean secure = (window.getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
                    if (secure != enabled) {
                        call.reject("Screen protection verification failed", "SCREEN_SECURITY_VERIFY_FAILED");
                        return;
                    }
                    // Resolve only after the UI thread has applied AND read back
                    // the bit on this Activity's current Window. No media changes.
                    JSObject result = new JSObject();
                    result.put("screenSecurityContract", 1);
                    result.put("verifiedOnUiThread", true);
                    result.put("secure", secure);
                    call.resolve(result);
                } catch (RuntimeException error) {
                    call.reject("Screen protection operation failed", "SCREEN_SECURITY_FAILED");
                }
            });
        } catch (RuntimeException error) {
            call.reject("Screen protection scheduling failed", "SCREEN_SECURITY_FAILED");
        }
    }
}
