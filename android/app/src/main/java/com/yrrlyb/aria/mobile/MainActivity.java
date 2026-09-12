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
        try {
            pushCurrentInsets();
        } catch (Throwable ignored) {
            // never block resume; the inset listener re-pushes later
        }
    }

    private void pushCurrentInsets() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        android.view.View view = getBridge().getWebView();
        // On the first resume the WebView is not attached to a window yet and
        // getRootWindowInsets() returns null — skip; the inset listener and
        // the later re-pushes cover it once attachment happens.
        if (!view.isAttachedToWindow()) return;
        android.view.WindowInsets rootInsets = view.getRootWindowInsets();
        if (rootInsets == null) return;
        androidx.core.graphics.Insets insets = androidx.core.view.WindowInsetsCompat
                .toWindowInsetsCompat(rootInsets)
                .getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()
                        | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
        writeSafeAreaVars(insets);
    }

    private void applySafeAreaInsets(androidx.core.view.WindowInsetsCompat windowInsets) {
        Insets top = windowInsets.getInsets(
                androidx.core.view.WindowInsetsCompat.Type.statusBars()
                        | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
        Insets bottom = windowInsets.getInsets(androidx.core.view.WindowInsetsCompat.Type.navigationBars());
        writeSafeAreaVars(
                androidx.core.graphics.Insets.of(top.top, top.left, top.right, bottom.bottom));
    }

    /** Insets arrive in physical pixels; CSS needs density-independent px. */
    private void writeSafeAreaVars(androidx.core.graphics.Insets insets) {
        float density = getBridge().getWebView().getResources().getDisplayMetrics().density;
        int topCss = Math.round(insets.top / density);
        int bottomCss = Math.round(insets.bottom / density);
        String script = "window.__ariaSafeTop=" + topCss + ";window.__ariaSafeBottom=" + bottomCss + ";"
                + "document.documentElement.style.setProperty('--aria-safe-top','" + topCss + "px');"
                + "document.documentElement.style.setProperty('--aria-safe-bottom','" + bottomCss + "px');"
                + "window.dispatchEvent(new CustomEvent('aria-safe-area',{detail:{top:" + topCss + ",bottom:" + bottomCss + "}}));";
        getBridge().getWebView().evaluateJavascript(script, null);
    }
}
