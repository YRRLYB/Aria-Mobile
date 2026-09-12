package com.yrrlyb.aria.mobile;

import android.os.Bundle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AriaAudioPlugin.class);
        registerPlugin(AriaShellPlugin.class);
        registerPlugin(com.yrrlyb.aria.mobile.netease.NeteaseDirectPlugin.class);
        super.onCreate(savedInstanceState);

        // True immersive layout: pages paint behind the status bar / gesture
        // bar, and the safe-area sizes are injected as CSS variables so the
        // web layer pads seamlessly (a hard WebView margin would leave a flat
        // white strip that clashes with the gradient pages).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        ViewCompat.setOnApplyWindowInsetsListener(getBridge().getWebView(), (view, windowInsets) -> {
            Insets top = windowInsets.getInsets(
                    WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout());
            Insets bottom = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars());
            String script = "document.documentElement.style.setProperty('--aria-safe-top','" + top.top + "px');"
                    + "document.documentElement.style.setProperty('--aria-safe-bottom','" + bottom.bottom + "px');";
            getBridge().getWebView().evaluateJavascript(script, null);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
