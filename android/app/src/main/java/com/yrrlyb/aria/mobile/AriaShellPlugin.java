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

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Small shell helpers that have no cross-platform plugin equivalent:
 * status-bar icon appearance, safe-area sizes, battery-optimization
 * exemption (uninterrupted background playback) and the device-local
 * audio index for the "手机音乐" library section.
 */
@CapacitorPlugin(name = "AriaShell")
public class AriaShellPlugin extends Plugin {

    private static final int NOTIFICATION_PERMISSION_REQUEST = 4711;
    private volatile boolean destroyed = false;
    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "aria-offline-download");
        thread.setDaemon(true);
        return thread;
    });

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        try { downloadExecutor.shutdownNow(); } catch (Throwable ignored) { }
        super.handleOnDestroy();
    }

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
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            call.reject("Unsupported URL");
            return;
        }
        if (getActivity() == null) {
            call.reject("Activity unavailable");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Unable to open link", error);
        }
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
            if (getBridge() == null || getBridge().getActivity() == null) {
                JSObject fallback = new JSObject();
                fallback.put("top", 0);
                fallback.put("bottom", 0);
                call.resolve(fallback);
                return;
            }
            android.view.View decor = getBridge().getActivity().getWindow().getDecorView();
            android.view.WindowInsets rootInsets = decor.getRootWindowInsets();
            if (rootInsets == null) {
                JSObject fallback = new JSObject();
                fallback.put("top", 0);
                fallback.put("bottom", 0);
                call.resolve(fallback);
                return;
            }
            float density = decor.getResources().getDisplayMetrics().density;
            androidx.core.graphics.Insets insets = WindowInsetsCompat
                    .toWindowInsetsCompat(rootInsets)
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

    /** Downloads a resolved NetEase/desktop stream into app-private storage so
     *  it can be played without the network. Runs off the main thread. */
    @PluginMethod
    public void downloadTrack(PluginCall call) {
        String trackId = call.getString("trackId", "");
        String url = call.getString("url", "");
        String extension = safeExtension(call.getString("extension", ""));
        if (trackId.isEmpty() || url.isEmpty()) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("message", "缺少下载地址");
            call.resolve(result);
            return;
        }
        final android.content.Context app = getContext().getApplicationContext();
        downloadExecutor.execute(() -> {
            if (destroyed) return;
            JSObject result = new JSObject();
            try {
                File directory = new File(app.getExternalFilesDir(null), "offline");
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IllegalStateException("无法创建离线目录");
                }
                File target = new File(directory, safeFileName(trackId) + extension);
                if (!target.exists() || target.length() <= 0) {
                    File temp = new File(directory, safeFileName(trackId) + ".part");
                    downloadToFile(url, temp);
                    if (target.exists() && !target.delete()) {
                        throw new IllegalStateException("无法覆盖旧文件");
                    }
                    if (!temp.renameTo(target)) {
                        throw new IllegalStateException("无法保存离线文件");
                    }
                }
                result.put("ok", true);
                result.put("path", target.getAbsolutePath());
                result.put("fileUrl", Uri.fromFile(target).toString());
                result.put("size", target.length());
                if (!destroyed) call.resolve(result);
            } catch (Throwable error) {
                android.util.Log.w("AriaOffline", "download failed", error);
                result.put("ok", false);
                result.put("message", error.getMessage() == null ? "下载失败" : error.getMessage());
                if (!destroyed) call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void deleteDownload(PluginCall call) {
        String path = call.getString("path", "");
        JSObject result = new JSObject();
        try {
            File directory = new File(getContext().getApplicationContext().getExternalFilesDir(null), "offline");
            File target = new File(path);
            if (!target.getCanonicalPath().startsWith(directory.getCanonicalPath() + File.separator)) {
                result.put("ok", false);
                call.resolve(result);
                return;
            }
            if (target.exists()) target.delete();
            result.put("ok", true);
            call.resolve(result);
        } catch (Throwable error) {
            result.put("ok", false);
            call.resolve(result);
        }
    }

    private static void downloadToFile(String url, File target) throws Exception {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(30_000);
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 Aria-Mobile");
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("HTTP " + status);
            }
            try (InputStream input = connection.getInputStream();
                 OutputStream output = new FileOutputStream(target)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
                output.flush();
            }
            if (target.length() <= 0) throw new IllegalStateException("下载内容为空");
        } finally {
            if (connection != null) connection.disconnect();
            if (target.exists() && target.length() <= 0) target.delete();
        }
    }

    private static String safeFileName(String value) {
        return value.replaceAll("[^A-Za-z0-9._-]", "_");
    }

    private static String safeExtension(String value) {
        String extension = value == null ? "" : value.trim().toLowerCase();
        if (!extension.startsWith(".")) extension = "." + extension;
        if (extension.matches("\\.(mp3|flac|m4a|aac|ogg|opus|wav)")) return extension;
        return ".audio";
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
