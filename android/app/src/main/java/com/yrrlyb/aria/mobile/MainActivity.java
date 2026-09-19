package com.yrrlyb.aria.mobile;

import android.os.Bundle;
import android.graphics.Color;
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
        getBridge().getWebView().setBackgroundColor(Color.rgb(247, 248, 251));

        // True immersive layout: pages paint behind the status bar / gesture
        // bar, and the safe-area sizes are injected as CSS variables so the
        // web layer pads seamlessly (a hard WebView margin would leave a flat
        // white strip that clashes with the gradient pages).
        try {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            ViewCompat.setOnApplyWindowInsetsListener(getBridge().getWebView(), (view, windowInsets) -> {
                applySafeAreaInsets(windowInsets);
                // Pass through: consuming here zeroes the insets for every
                // later read (getRootWindowInsets), which broke the re-pushes.
                return windowInsets;
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
        // The decor view always carries the real window insets (the WebView's
        // own value can be nulled/consumed early in the lifecycle).
        android.view.View decor = getWindow().getDecorView();
        if (!decor.isAttachedToWindow()) return;
        android.view.WindowInsets rootInsets = decor.getRootWindowInsets();
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

    // Last known-good values: some ROM re-dispatches report a full zero
    // reset mid-lifecycle; a zero write must never clobber a good value.
    private static int lastGoodSafeTop = 0;
    private static int lastGoodSafeBottom = 0;

    /** Insets arrive in physical pixels; CSS needs density-independent px. */
    private void writeSafeAreaVars(androidx.core.graphics.Insets insets) {
        if (insets.top == 0 && insets.bottom == 0 && (lastGoodSafeTop > 0 || lastGoodSafeBottom > 0)) return;
        float density = getBridge().getWebView().getResources().getDisplayMetrics().density;
        int topCss = Math.round(insets.top / density);
        int bottomCss = Math.round(insets.bottom / density);
        lastGoodSafeTop = topCss;
        lastGoodSafeBottom = bottomCss;
        String script = "window.__ariaSafeTop=" + topCss + ";window.__ariaSafeBottom=" + bottomCss + ";"
                + "document.documentElement.style.setProperty('--aria-safe-top','" + topCss + "px');"
                + "document.documentElement.style.setProperty('--aria-safe-bottom','" + bottomCss + "px');"
                + "window.dispatchEvent(new CustomEvent('aria-safe-area',{detail:{top:" + topCss + ",bottom:" + bottomCss + "}}));";
        getBridge().getWebView().evaluateJavascript(script, null);
    }
}
