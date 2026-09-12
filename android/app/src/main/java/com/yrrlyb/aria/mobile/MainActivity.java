package com.yrrlyb.aria.mobile;

import android.os.Bundle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void attachBaseContext(android.content.Context base) {
        super.attachBaseContext(base);
        // Diagnostics: persist any launch crash to
        // Android/data/com.yrrlyb.aria.mobile/files/crash/last-crash.txt
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                java.io.File dir = new java.io.File(getExternalFilesDir(null), "crash");
                dir.mkdirs();
                java.io.PrintWriter writer = new java.io.PrintWriter(
                        new java.io.FileWriter(new java.io.File(dir, "last-crash.txt"), false));
                writer.println(new java.util.Date().toString());
                error.printStackTrace(writer);
                writer.close();
            } catch (Throwable ignored) {
            }
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

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
        try {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            ViewCompat.setOnApplyWindowInsetsListener(getBridge().getWebView(), (view, windowInsets) -> {
                applySafeAreaInsets(windowInsets);
                return WindowInsetsCompat.CONSUMED;
            });
            // The first inset callback can fire before the WebView document
            // exists, losing the CSS variables. Re-push a few times after
            // launch and on every resume so a freshly (re)loaded page always
            // gets them.
            for (long delay : new long[]{600L, 1800L, 3500L}) {
                getBridge().getWebView().postDelayed(() -> {
                    try {
                        ViewCompat.requestApplyInsets(getBridge().getWebView());
                        pushCurrentInsets();
                    } catch (Throwable ignored) {
                    }
                }, delay);
            }
        } catch (Throwable error) {
            // Immersive layout is cosmetic — never let it block startup.
            android.util.Log.e("Aria", "safe-area setup failed", error);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        pushCurrentInsets();
    }

    private void pushCurrentInsets() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        androidx.core.graphics.Insets insets = androidx.core.view.WindowInsetsCompat
                .toWindowInsetsCompat(getBridge().getWebView().getRootWindowInsets())
                .getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()
                        | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
        String script = "window.__ariaSafeTop=" + insets.top + ";window.__ariaSafeBottom=" + insets.bottom + ";"
                + "document.documentElement.style.setProperty('--aria-safe-top','" + insets.top + "px');"
                + "document.documentElement.style.setProperty('--aria-safe-bottom','" + insets.bottom + "px');"
                + "window.dispatchEvent(new CustomEvent('aria-safe-area',{detail:{top:" + insets.top + ",bottom:" + insets.bottom + "}}));";
        getBridge().getWebView().evaluateJavascript(script, null);
    }

    private void applySafeAreaInsets(androidx.core.view.WindowInsetsCompat windowInsets) {
        Insets top = windowInsets.getInsets(
                androidx.core.view.WindowInsetsCompat.Type.statusBars()
                        | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
        Insets bottom = windowInsets.getInsets(androidx.core.view.WindowInsetsCompat.Type.navigationBars());
        String script = "window.__ariaSafeTop=" + top.top + ";window.__ariaSafeBottom=" + bottom.bottom + ";"
                + "document.documentElement.style.setProperty('--aria-safe-top','" + top.top + "px');"
                + "document.documentElement.style.setProperty('--aria-safe-bottom','" + bottom.bottom + "px');"
                + "window.dispatchEvent(new CustomEvent('aria-safe-area',{detail:{top:" + top.top + ",bottom:" + bottom.bottom + "}}));";
        getBridge().getWebView().evaluateJavascript(script, null);
    }
}
