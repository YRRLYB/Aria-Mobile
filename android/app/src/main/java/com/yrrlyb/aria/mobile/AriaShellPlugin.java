package com.yrrlyb.aria.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.MediaStore;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Small shell helpers that have no cross-platform plugin equivalent:
 * status-bar icon appearance, safe-area sizes, battery-optimization
 * exemption (uninterrupted background playback) and the device-local
 * audio index for the "手机音乐" library section.
 */
@CapacitorPlugin(name = "AriaShell")
public class AriaShellPlugin extends Plugin {

    private static final int NOTIFICATION_PERMISSION_REQUEST = 4711;

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

    @PluginMethod
    public void getSafeAreas(PluginCall call) {
        if (getBridge() == null || getBridge().getActivity() == null || getBridge().getWebView() == null) {
            JSObject fallback = new JSObject();
            fallback.put("top", 0);
            fallback.put("bottom", 0);
            call.resolve(fallback);
            return;
        }
        getActivity().runOnUiThread(() -> {
            android.view.View decor = getBridge().getActivity().getWindow().getDecorView();
            float density = decor.getResources().getDisplayMetrics().density;
            androidx.core.graphics.Insets insets = WindowInsetsCompat
                    .toWindowInsetsCompat(decor.getRootWindowInsets())
                    .getInsets(WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout());
            JSObject result = new JSObject();
            // CSS px (density-adjusted) so JS can apply them directly.
            result.put("top", Math.round(insets.top / density));
            result.put("bottom", Math.round(insets.bottom / density));
            call.resolve(result);
        });
    }

    /** Runtime permission for MediaStore audio (Android 13+). */
    @PluginMethod
    public void requestAudioPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            // Legacy READ_EXTERNAL_STORAGE is a normal install-time permission.
            boolean granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE)
                    == PackageManager.PERMISSION_GRANTED;
            JSObject result = new JSObject();
            result.put("granted", granted);
            call.resolve(result);
            return;
        }
        boolean granted = ContextCompat.checkSelfPermission(getContext(), "android.permission.READ_MEDIA_AUDIO")
                == PackageManager.PERMISSION_GRANTED;
        if (!granted) {
            ActivityCompat.requestPermissions(
                    getBridge() != null ? getBridge().getActivity() : null,
                    new String[]{"android.permission.READ_MEDIA_AUDIO"},
                    4713);
        }
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    /** Asks the system to exempt Aria from doze/battery optimization so the
     *  foreground playback service survives backgrounded sessions. */
    @PluginMethod
    public void requestUninterruptedPlayback(PluginCall call) {
        Activity activity = getBridge() != null ? getBridge().getActivity() : null;
        if (activity == null) {
            call.resolve();
            return;
        }
        PowerManager powerManager = (PowerManager) activity.getSystemService(Activity.POWER_SERVICE);
        String packageName = activity.getPackageName();
        boolean ignoring = powerManager != null && powerManager.isIgnoringBatteryOptimizations(packageName);
        if (!ignoring && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                activity.startActivity(new Intent(
                        android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + packageName)));
            } catch (Exception ignored) {
                // Some ROMs drop the dialog; playback usually still works.
            }
        }
        JSObject result = new JSObject();
        result.put("alreadyExempt", ignoring);
        call.resolve(result);
    }

    /** Device-local audio index (MediaStore) for the 手机音乐 section. */
    @PluginMethod
    public void scanLocalAudio(PluginCall call) {
        JSArray tracks = new JSArray();
        try {
            String[] projection = {
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.ALBUM_ID,
                    MediaStore.Audio.Media.DURATION,
            };
            String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0 AND "
                    + MediaStore.Audio.Media.DURATION + " >= 30000";
            try (Cursor cursor = getContext().getContentResolver().query(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, projection, selection, null,
                    MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC")) {
                if (cursor != null) {
                    int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                    int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                    int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                    int albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                    int albumIdCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);
                    int durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                    while (cursor.moveToNext()) {
                        long id = cursor.getLong(idCol);
                        long albumId = cursor.getLong(albumIdCol);
                        JSObject track = new JSObject();
                        track.put("id", String.valueOf(id));
                        track.put("title", cursor.getString(titleCol));
                        track.put("artist", cursor.getString(artistCol));
                        track.put("album", cursor.getString(albumCol));
                        track.put("durationMs", cursor.getLong(durationCol));
                        track.put("streamUrl", Uri.withAppendedPath(
                                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, String.valueOf(id)).toString());
                        track.put("coverUrl", Uri.parse("content://media/external/audio/albums/" + albumId + "/albumart").toString());
                        tracks.put(track);
                    }
                }
            }
        } catch (Exception error) {
            // A denied/failed scan returns an empty list rather than crashing.
        }
        JSObject result = new JSObject();
        result.put("tracks", tracks);
        call.resolve(result);
    }
}
