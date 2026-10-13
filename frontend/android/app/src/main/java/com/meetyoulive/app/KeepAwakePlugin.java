package com.meetyoulive.app;

import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * KeepAwakePlugin — prevents the Android device from auto-locking its screen
 * (due to inactivity) while enabled, using the standard
 * {@link WindowManager.LayoutParams#FLAG_KEEP_SCREEN_ON} window flag.
 *
 * Why a native plugin instead of relying only on the web Screen Wake Lock
 * API (navigator.wakeLock): inside a Capacitor WebView the web Wake Lock API
 * is frequently unsupported or silently ignored by the underlying Chromium
 * WebView build, so it cannot be trusted to keep the screen on for hosts
 * broadcasting from the installed Android app. FLAG_KEEP_SCREEN_ON acts at
 * the native Activity/Window level and is reliable across WebView versions.
 *
 * Scope & limitations (documented, not oversold):
 *  - Only prevents the OS's automatic screen-off timer. It does NOT survive
 *    the user manually pressing the hardware power button to lock the
 *    phone, and it does NOT keep Agora's camera/mic connection alive if the
 *    OS suspends/kills the Activity in the background. True "continue
 *    through a manually locked screen" requires a foreground service with a
 *    persistent notification (new permissions + a new AAB release), which is
 *    intentionally out of scope here.
 *  - The flag is automatically cleared by the OS if the Activity is
 *    destroyed, so a crash cannot leave the screen permanently on. We also
 *    explicitly clear it from JS when the live session ends/unmounts.
 *  - No manifest permission is required for this window flag (the existing
 *    android.permission.WAKE_LOCK declaration is unrelated/unused by this
 *    plugin; it is already present for other purposes).
 */
@CapacitorPlugin(name = "KeepAwake")
public class KeepAwakePlugin extends Plugin {
    @PluginMethod
    public void enable(PluginCall call) {
        setKeepScreenOnFlag(true);
        call.resolve();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        setKeepScreenOnFlag(false);
        call.resolve();
    }

    private void setKeepScreenOnFlag(boolean enabled) {
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() -> {
            if (getActivity() == null) return;
            if (enabled) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        // Defensive cleanup: never leak the flag past this Activity's lifecycle
        // even if the JS side failed to call disable() (e.g. a crash/reload).
        setKeepScreenOnFlag(false);
        super.handleOnDestroy();
    }
}
