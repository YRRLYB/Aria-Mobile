package com.yrrlyb.aria.mobile;

import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Small shell helpers that have no cross-platform plugin equivalent:
 * status-bar icon appearance for the immersive dark now-playing page.
 */
@CapacitorPlugin(name = "AriaShell")
public class AriaShellPlugin extends Plugin {

    @PluginMethod
    public void setStatusBarIconsLight(PluginCall call) {
        boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        if (getBridge() == null || getBridge().getActivity() == null) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (getBridge() == null || getBridge().getActivity() == null) return;
            WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(
                    getBridge().getActivity().getWindow(),
                    getBridge().getActivity().getWindow().getDecorView());
            // light=true renders white icons (dark pages); light=false dark icons.
            controller.setAppearanceLightStatusBars(!light);
        });
        call.resolve();
    }
}
