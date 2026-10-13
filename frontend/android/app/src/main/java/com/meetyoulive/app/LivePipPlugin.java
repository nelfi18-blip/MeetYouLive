package com.meetyoulive.app;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * LivePipPlugin — bridges a single boolean ("is there a connected Agora
 * session — host or viewer — for the Live room currently on screen?") from
 * JS to {@link MainActivity}, so the Activity knows whether pressing
 * Home/switching apps should enter Android's native Picture-in-Picture mode
 * instead of simply backgrounding the WebView.
 *
 * Why this exists (see also MainActivity#onUserLeaveHint and
 * frontend/lib/livePip.js):
 *  - The WebView itself has no way to request PiP; only the hosting
 *    Activity can call {@code enterPictureInPictureMode(...)}, and only
 *    from {@link Activity#onUserLeaveHint()} (or an explicit user action)
 *    per Android's API contract.
 *  - PiP must only engage while a Live room page has an ACTIVE Agora
 *    connection — never generically for the whole app — so `setActive`
 *    is called with `true` right when live/[id]/page.jsx's Agora join
 *    effect finishes joining (host or viewer), and `false` on that same
 *    effect's cleanup/teardown. This keeps PiP eligibility tied 1:1 to the
 *    existing single Agora session; it never creates, suspends, or joins
 *    a second one — PiP only changes the size/visibility of the same
 *    Activity/WebView that already holds that session.
 *  - Entering PiP resizes the Activity window (onPause fires, but the
 *    Activity is NOT stopped while the floating window stays visible), so
 *    the WebView keeps running and the existing Agora tracks keep
 *    publishing/rendering without any new join/publish calls from JS.
 */
@CapacitorPlugin(name = "LivePip")
public class LivePipPlugin extends Plugin {

    @PluginMethod
    public void setActive(PluginCall call) {
        boolean active = call.getBoolean("active", false);
        MainActivity.setLiveSessionActive(active);
        call.resolve();
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", isPipSupported());
        call.resolve(result);
    }

    private boolean isPipSupported() {
        Activity activity = getActivity();
        if (activity == null) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        return activity.getPackageManager()
            .hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    @Override
    protected void handleOnDestroy() {
        // Defensive cleanup: never leave a stale "active" flag pointing at a
        // destroyed Activity (e.g. a crash/reload before JS called
        // setActive(false)) — a future Home-press on a fresh Activity must
        // never accidentally trigger PiP for a Live session that's gone.
        MainActivity.setLiveSessionActive(false);
        super.handleOnDestroy();
    }
}
