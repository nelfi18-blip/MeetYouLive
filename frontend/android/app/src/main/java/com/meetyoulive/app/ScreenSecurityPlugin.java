package com.meetyoulive.app;

import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScreenSecurity")
public class ScreenSecurityPlugin extends Plugin {
    @PluginMethod
    public void enable(PluginCall call) {
        setSecureFlag(true);
        call.resolve();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        setSecureFlag(false);
        call.resolve();
    }

    private void setSecureFlag(boolean enabled) {
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            if (enabled) {
                window.setFlags(
                    WindowManager.LayoutParams.FLAG_SECURE,
                    WindowManager.LayoutParams.FLAG_SECURE
                );
            } else {
                window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
        });
    }
}
