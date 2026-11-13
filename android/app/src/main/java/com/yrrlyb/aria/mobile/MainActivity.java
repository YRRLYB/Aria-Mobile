package com.yrrlyb.aria.mobile;

import android.os.Bundle;
import android.graphics.Color;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private static boolean crashHandlerInstalled = false;
    private boolean activityResumed = false;
    private boolean rendererGone = false;
    private boolean rendererRecoveryStarted = false;

    @Override
    protected void attachBaseContext(android.content.Context base) {
        super.attachBaseContext(base);
        if (crashHandlerInstalled) return;
        crashHandlerInstalled = true;
        final android.content.Context appContext = getApplicationContext();
        // Diagnostics: persist any launch crash to
        // Android/data/com.yrrlyb.aria.mobile/files/crash/last-crash.txt
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                java.io.File dir = new java.io.File(appContext.getExternalFilesDir(null), "crash");
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
        installRendererRecovery();
        if (getBridge() == null || getBridge().getWebView() == null) return;
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
        activityResumed = true;
        if (rendererGone) {
            // The old WebView cannot be reused after its renderer is gone.
            // Rebuild the activity (and a fresh bridge) instead of letting
            // Android treat the renderer death as an app crash.
            maybeRecoverRenderer();
            return;
        }
        try {
            pushCurrentInsets();
        } catch (Throwable ignored) {
            // never block resume; the inset listener re-pushes later
        }
        scheduleBlankWebViewRecovery();
    }

    @Override
    public void onPause() {
        activityResumed = false;
        super.onPause();
    }

    private void installRendererRecovery() {
        try {
            if (getBridge() == null) return;
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                    rendererGone = true;
                    AriaPlaybackService.setWebVisible(false);
                    android.util.Log.w("Aria", "WebView renderer gone; scheduling a clean bridge rebuild");
                    maybeRecoverRenderer();
                    // Handled: returning false lets the platform kill the
                    // whole app process, which is the long-background crash.
                    return true;
                }
            });
        } catch (Throwable error) {
            android.util.Log.e("Aria", "renderer recovery hook failed", error);
        }
    }

    private void maybeRecoverRenderer() {
        if (!rendererGone || rendererRecoveryStarted || !activityResumed) return;
        rendererRecoveryStarted = true;
        final Runnable recovery = () -> {
            if (isFinishing() || isDestroyed()) return;
            android.util.Log.w("Aria", "Recreating activity after WebView renderer loss");
            try {
                recreate();
            } catch (Throwable error) {
                android.util.Log.e("Aria", "activity recreate failed", error);
                try {
                    startActivity(new android.content.Intent(this, MainActivity.class)
                            .addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
                                    | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP));
                } catch (Throwable ignored) {
                }
            }
        };
        android.view.View decor = getWindow() != null ? getWindow().getDecorView() : null;
        if (decor != null) decor.post(recovery);
        else runOnUiThread(recovery);
    }

    private boolean blankRecoveryPending = false;

    /**
     * Android can kill the WebView renderer while the foreground playback
     * service keeps running. When the user returns, the activity can then show
     * an empty white page. Probe the document once after resume and reload if
     * the React root never became ready (or if the renderer never answers).
     */
    private void scheduleBlankWebViewRecovery() {
        if (blankRecoveryPending || rendererGone || rendererRecoveryStarted) return;
        if (getBridge() == null || getBridge().getWebView() == null) return;
        final WebView webView = getBridge().getWebView();
        blankRecoveryPending = true;
        final boolean[] answered = new boolean[]{false};
        final Runnable reloadIfSilent = () -> {
            if (answered[0]) return;
            answered[0] = true;
            blankRecoveryPending = false;
            android.util.Log.w("Aria", "WebView renderer silent after resume; reloading");
            try { webView.reload(); } catch (Throwable ignored) { }
        };
        // Long background/Doze can freeze the renderer for a few seconds before
        // it wakes up. Reloading too early turns a healthy session into an
        // apparent restart, so give it a generous grace period.
        webView.postDelayed(reloadIfSilent, 6000L);
        webView.postDelayed(() -> {
            if (answered[0]) return;
            try {
                webView.evaluateJavascript(
                        "(function(){try{var r=document.getElementById('root');return !!(window.__ariaWebReady===true && r && r.childElementCount>0 && document.body && document.body.innerText.trim().length>0);}catch(e){return false;}})()",
                        value -> {
                            if (answered[0]) return;
                            answered[0] = true;
                            blankRecoveryPending = false;
                            if (!"true".equals(value)) {
                                android.util.Log.w("Aria", "WebView blank after resume; reloading");
                                try { webView.reload(); } catch (Throwable ignored) { }
                            }
                        });
            } catch (Throwable error) {
                answered[0] = true;
                blankRecoveryPending = false;
                try { webView.reload(); } catch (Throwable ignored) { }
            }
        }, 3000L);
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
