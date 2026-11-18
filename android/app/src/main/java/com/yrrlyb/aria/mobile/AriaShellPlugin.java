package com.yrrlyb.aria.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.os.storage.StorageManager;
import android.os.storage.StorageVolume;
import android.provider.MediaStore;

import androidx.core.content.ContextCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Small shell helpers that have no cross-platform plugin equivalent:
 * status-bar icon appearance, safe-area sizes, battery-optimization
 * exemption (uninterrupted background playback) and the device-local
 * audio index for the "手机音乐" library section.
 */
@CapacitorPlugin(
        name = "AriaShell",
        permissions = {
                @Permission(alias = "audio", strings = { "android.permission.READ_MEDIA_AUDIO" }),
                @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
        }
)
public class AriaShellPlugin extends Plugin {

    private static final int NOTIFICATION_PERMISSION_REQUEST = 4711;
    private static final long MIN_AUDIO_BYTES = 32L * 1024L;
    private static final long MIN_AUDIO_DURATION_MS = 5_000L;
    private static final int MAX_SCAN_DEPTH = 12;
    private static final int MAX_SCAN_TRACKS = 15_000;
    private static final Set<String> AUDIO_EXTENSIONS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "mp3", "flac", "m4a", "aac", "ogg", "oga", "opus", "wav",
            "wma", "ape", "alac", "aiff", "aif", "wv", "tta", "tak",
            "dsf", "dff", "mka", "mp2"
    )));
    private static final String[] HIGH_YIELD_SUBDIRS = {
            "Music", "Download", "Downloads", "Documents", "Audio",
            "Podcasts", "Audiobooks", "Recordings", "Sounds", "SoundRecorder",
            "netease/cloudmusic/Music", "netease/cloudmusic/Download",
            "qqmusic/song", "kgmusic/download", "KuwoMusic/music",
            "MIUI/music/mp3", "HiRes", "DSD", "BiliMusic"
    };

    private volatile boolean destroyed = false;
    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "aria-offline-download");
        thread.setDaemon(true);
        return thread;
    });
    private final ExecutorService scanExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "aria-local-scan");
        thread.setDaemon(true);
        return thread;
    });

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        try { downloadExecutor.shutdownNow(); } catch (Throwable ignored) { }
        try { scanExecutor.shutdownNow(); } catch (Throwable ignored) { }
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

    private boolean isAudioPermissionGranted() {
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(getContext(), "android.permission.READ_MEDIA_AUDIO")
                    == PackageManager.PERMISSION_GRANTED;
        }
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED;
    }

    /** Non-prompting check so scheduled background indexing respects current grants. */
    @PluginMethod
    public void hasAudioPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", isAudioPermissionGranted());
        call.resolve(result);
    }

    /** Runtime permission for MediaStore + storage audio (waits for user response). */
    @PluginMethod
    public void requestAudioPermission(PluginCall call) {
        if (isAudioPermissionGranted()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        String alias = Build.VERSION.SDK_INT >= 33 ? "audio" : "storage";
        if (getPermissionState(alias) == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias(alias, call, "audioPermissionCallback");
    }

    @PermissionCallback
    private void audioPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", isAudioPermissionGranted());
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

    /** Comprehensive device-local audio index: scans all MediaStore volumes,
     *  MediaStore.Files audio entries, and all accessible storage roots/paths. */
    @PluginMethod
    public void scanLocalAudio(PluginCall call) {
        final Context app = getContext().getApplicationContext();
        scanExecutor.execute(() -> {
            if (destroyed) return;
            List<JSObject> found = new ArrayList<>();
            Set<String> seenPaths = new HashSet<>();
            Set<String> seenSignatures = new HashSet<>();
            List<String> toMediaScan = new ArrayList<>();
            int[] scanCounts = new int[]{0, 0}; // [scannedRoots, scannedDirs]
            try {
                File coverDir = new File(app.getCacheDir(), "local-covers");
                if (!coverDir.exists()) coverDir.mkdirs();

                // 1. MediaStore.Audio across all mounted volumes (without IS_MUSIC=1 or 30s gate)
                queryMediaStoreAudio(app, found, seenPaths, seenSignatures);

                // 2. MediaStore.Files audio entries missed by MediaStore.Audio (FLAC/APE/DSD/OPUS/etc.)
                queryMediaStoreFiles(app, coverDir, found, seenPaths, seenSignatures);

                // 3. Direct recursive traversal across all mounted storage volumes + known music folders
                Set<File> roots = collectStorageRoots(app);
                scanCounts[0] = roots.size();
                scanCounts[1] = scanStorageRoots(app, roots, coverDir, found, seenPaths, seenSignatures, toMediaScan);

                if (!toMediaScan.isEmpty()) {
                    try {
                        String[] paths = toMediaScan.subList(0, Math.min(64, toMediaScan.size())).toArray(new String[0]);
                        MediaScannerConnection.scanFile(app, paths, null, null);
                    } catch (Throwable ignored) {
                    }
                }
            } catch (Throwable error) {
                android.util.Log.w("AriaScan", "local audio scan error", error);
            }

            Collections.sort(found, (a, b) -> {
                String ta = a.optString("title", "");
                String tb = b.optString("title", "");
                return ta.compareToIgnoreCase(tb);
            });

            JSArray tracks = new JSArray();
            for (JSObject item : found) tracks.put(item);

            JSObject result = new JSObject();
            result.put("tracks", tracks);
            result.put("scannedRoots", scanCounts[0]);
            result.put("scannedDirs", scanCounts[1]);
            if (!destroyed) call.resolve(result);
        });
    }

    private static void queryMediaStoreAudio(
            Context app,
            List<JSObject> out,
            Set<String> seenPaths,
            Set<String> seenSignatures
    ) {
        List<Uri> uris = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                for (String volume : MediaStore.getExternalVolumeNames(app)) {
                    uris.add(MediaStore.Audio.Media.getContentUri(volume));
                }
            } catch (Throwable ignored) {
            }
        }
        if (uris.isEmpty()) uris.add(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI);

        String[] projection = {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.ALBUM_ID,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.DATA,
                MediaStore.Audio.Media.SIZE,
        };
        for (Uri uri : uris) {
            try (Cursor cursor = app.getContentResolver().query(uri, projection, null, null, null)) {
                if (cursor == null) continue;
                int idCol = cursor.getColumnIndex(MediaStore.Audio.Media._ID);
                int titleCol = cursor.getColumnIndex(MediaStore.Audio.Media.TITLE);
                int artistCol = cursor.getColumnIndex(MediaStore.Audio.Media.ARTIST);
                int albumCol = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM);
                int albumIdCol = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM_ID);
                int durationCol = cursor.getColumnIndex(MediaStore.Audio.Media.DURATION);
                int dataCol = cursor.getColumnIndex(MediaStore.Audio.Media.DATA);
                int sizeCol = cursor.getColumnIndex(MediaStore.Audio.Media.SIZE);

                while (cursor.moveToNext() && out.size() < MAX_SCAN_TRACKS) {
                    long id = idCol >= 0 ? cursor.getLong(idCol) : 0L;
                    long durationMs = durationCol >= 0 ? cursor.getLong(durationCol) : 0L;
                    long size = sizeCol >= 0 ? cursor.getLong(sizeCol) : 0L;
                    String path = dataCol >= 0 ? cursor.getString(dataCol) : null;
                    if (isExcludedSystemPath(path)) continue;
                    if (durationMs > 0 && durationMs < MIN_AUDIO_DURATION_MS) continue;
                    if (size > 0 && size < MIN_AUDIO_BYTES) continue;

                    String canonical = canonicalPathOrNull(path);
                    if (canonical != null && !seenPaths.add(canonical)) continue;

                    String rawTitle = titleCol >= 0 ? cursor.getString(titleCol) : null;
                    String title = normalizeTitle(rawTitle, path);
                    String artist = normalizeTag(artistCol >= 0 ? cursor.getString(artistCol) : null, "未知歌手");
                    String album = normalizeTag(albumCol >= 0 ? cursor.getString(albumCol) : null, "未知专辑");
                    String sig = trackSignature(title, artist, durationMs);
                    if (canonical == null && !seenSignatures.add(sig)) continue;
                    seenSignatures.add(sig);

                    long albumId = albumIdCol >= 0 ? cursor.getLong(albumIdCol) : 0L;
                    JSObject track = new JSObject();
                    track.put("id", String.valueOf(id));
                    track.put("title", title);
                    track.put("artist", artist);
                    track.put("album", album);
                    track.put("durationMs", durationMs);
                    track.put("streamUrl", Uri.withAppendedPath(uri, String.valueOf(id)).toString());
                    track.put("coverUrl", albumId > 0
                            ? Uri.parse("content://media/external/audio/albums/" + albumId + "/albumart").toString()
                            : "");
                    if (path != null) track.put("filePath", path);
                    out.add(track);
                }
            } catch (Throwable ignored) {
            }
        }
    }

    private static void queryMediaStoreFiles(
            Context app,
            File coverDir,
            List<JSObject> out,
            Set<String> seenPaths,
            Set<String> seenSignatures
    ) {
        List<Uri> uris = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                for (String volume : MediaStore.getExternalVolumeNames(app)) {
                    uris.add(MediaStore.Files.getContentUri(volume));
                }
            } catch (Throwable ignored) {
            }
        }
        if (uris.isEmpty()) uris.add(MediaStore.Files.getContentUri("external"));

        String[] projection = {
                MediaStore.Files.FileColumns._ID,
                MediaStore.Files.FileColumns.DATA,
                MediaStore.Files.FileColumns.MIME_TYPE,
                MediaStore.Files.FileColumns.SIZE,
                MediaStore.Files.FileColumns.DISPLAY_NAME,
        };
        for (Uri uri : uris) {
            try (Cursor cursor = app.getContentResolver().query(
                    uri,
                    projection,
                    MediaStore.Files.FileColumns.SIZE + " >= ?",
                    new String[]{String.valueOf(MIN_AUDIO_BYTES)},
                    null)) {
                if (cursor == null) continue;
                int idCol = cursor.getColumnIndex(MediaStore.Files.FileColumns._ID);
                int dataCol = cursor.getColumnIndex(MediaStore.Files.FileColumns.DATA);
                int mimeCol = cursor.getColumnIndex(MediaStore.Files.FileColumns.MIME_TYPE);
                int nameCol = cursor.getColumnIndex(MediaStore.Files.FileColumns.DISPLAY_NAME);

                while (cursor.moveToNext() && out.size() < MAX_SCAN_TRACKS) {
                    String path = dataCol >= 0 ? cursor.getString(dataCol) : null;
                    String mime = mimeCol >= 0 ? cursor.getString(mimeCol) : null;
                    String displayName = nameCol >= 0 ? cursor.getString(nameCol) : null;
                    boolean isAudioMime = mime != null && mime.toLowerCase(Locale.ROOT).startsWith("audio/");
                    boolean isAudioExt = isAudioFileName(path != null ? path : displayName);
                    if (!isAudioMime && !isAudioExt) continue;
                    if (isExcludedSystemPath(path)) continue;

                    String canonical = canonicalPathOrNull(path);
                    if (canonical != null && !seenPaths.add(canonical)) continue;

                    File file = path != null ? new File(path) : null;
                    if (file != null && (!file.exists() || !file.canRead())) continue;

                    long id = idCol >= 0 ? cursor.getLong(idCol) : 0L;
                    Uri contentUri = Uri.withAppendedPath(uri, String.valueOf(id));
                    JSObject track = buildTrackFromFileOrUri(app, file, contentUri, coverDir, "msf-" + id);
                    if (track == null) continue;
                    String sig = trackSignature(track.optString("title", ""), track.optString("artist", ""), track.optLong("durationMs", 0L));
                    if (!seenSignatures.add(sig) && canonical == null) continue;
                    seenSignatures.add(sig);
                    out.add(track);
                }
            } catch (Throwable ignored) {
            }
        }
    }

    private static Set<File> collectStorageRoots(Context app) {
        Set<File> roots = new LinkedHashSet<>();
        try {
            File primary = Environment.getExternalStorageDirectory();
            if (primary != null && primary.exists()) roots.add(primary);
        } catch (Throwable ignored) {
        }
        try {
            StorageManager storageManager = (StorageManager) app.getSystemService(Context.STORAGE_SERVICE);
            if (storageManager != null) {
                for (StorageVolume volume : storageManager.getStorageVolumes()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        File dir = volume.getDirectory();
                        if (dir != null && dir.exists()) roots.add(dir);
                    } else {
                        try {
                            java.lang.reflect.Method getPath = volume.getClass().getMethod("getPath");
                            Object pathObj = getPath.invoke(volume);
                            if (pathObj instanceof String) {
                                File dir = new File((String) pathObj);
                                if (dir.exists()) roots.add(dir);
                            }
                        } catch (Throwable ignored) {
                        }
                    }
                }
            }
        } catch (Throwable ignored) {
        }
        try {
            File[] appDirs = ContextCompat.getExternalFilesDirs(app, null);
            if (appDirs != null) {
                for (File dir : appDirs) {
                    if (dir == null) continue;
                    String path = dir.getAbsolutePath();
                    int idx = path.indexOf("/Android/data/");
                    if (idx > 0) {
                        File root = new File(path.substring(0, idx));
                        if (root.exists()) roots.add(root);
                    }
                }
            }
        } catch (Throwable ignored) {
        }
        try {
            File storageDir = new File("/storage");
            File[] mounts = storageDir.listFiles();
            if (mounts != null) {
                for (File mount : mounts) {
                    if (!mount.isDirectory()) continue;
                    String name = mount.getName();
                    if ("self".equals(name)) continue;
                    if ("emulated".equals(name)) {
                        File user0 = new File(mount, "0");
                        if (user0.exists()) roots.add(user0);
                    } else if (mount.canRead()) {
                        roots.add(mount);
                    }
                }
            }
        } catch (Throwable ignored) {
        }
        // Ensure known high-yield subdirectories are queued explicitly in case
        // a ROM restricts listing at the storage root level.
        List<File> baseRoots = new ArrayList<>(roots);
        for (File root : baseRoots) {
            for (String sub : HIGH_YIELD_SUBDIRS) {
                File candidate = new File(root, sub);
                if (candidate.isDirectory() && candidate.canRead()) roots.add(candidate);
            }
        }
        return roots;
    }

    private static int scanStorageRoots(
            Context app,
            Set<File> roots,
            File coverDir,
            List<JSObject> out,
            Set<String> seenPaths,
            Set<String> seenSignatures,
            List<String> toMediaScan
    ) {
        Set<String> visitedDirs = new HashSet<>();
        ArrayDeque<DirEntry> queue = new ArrayDeque<>();
        for (File root : roots) {
            String canonical = canonicalPathOrNull(root.getAbsolutePath());
            if (canonical != null && visitedDirs.add(canonical)) {
                queue.add(new DirEntry(root, 0));
            }
        }
        int scannedDirs = 0;
        while (!queue.isEmpty() && out.size() < MAX_SCAN_TRACKS) {
            DirEntry current = queue.poll();
            if (current == null) break;
            File[] children = current.dir.listFiles();
            if (children == null) continue;
            scannedDirs++;
            for (File child : children) {
                if (out.size() >= MAX_SCAN_TRACKS) break;
                String name = child.getName();
                if (name.startsWith(".")) continue;
                if (child.isDirectory()) {
                    if (current.depth >= MAX_SCAN_DEPTH) continue;
                    String lower = name.toLowerCase(Locale.ROOT);
                    if ("android".equals(lower)) {
                        // Allow Android/media while skipping Android/data and Android/obb.
                        File media = new File(child, "media");
                        String mediaCanon = canonicalPathOrNull(media.getAbsolutePath());
                        if (media.isDirectory() && mediaCanon != null && visitedDirs.add(mediaCanon)) {
                            queue.add(new DirEntry(media, current.depth + 2));
                        }
                        continue;
                    }
                    if ("alarms".equals(lower) || "notifications".equals(lower) || "ringtones".equals(lower)) continue;
                    String canonDir = canonicalPathOrNull(child.getAbsolutePath());
                    if (canonDir != null && visitedDirs.add(canonDir)) {
                        queue.add(new DirEntry(child, current.depth + 1));
                    }
                    continue;
                }
                if (!child.isFile() || child.length() < MIN_AUDIO_BYTES) continue;
                if (!isAudioFileName(name)) continue;
                String path = child.getAbsolutePath();
                if (isExcludedSystemPath(path)) continue;
                String canonFile = canonicalPathOrNull(path);
                if (canonFile == null || !seenPaths.add(canonFile)) continue;

                JSObject track = buildTrackFromFileOrUri(app, child, null, coverDir, "fs-" + shortHash(canonFile));
                if (track == null) continue;
                String sig = trackSignature(track.optString("title", ""), track.optString("artist", ""), track.optLong("durationMs", 0L));
                seenSignatures.add(sig);
                out.add(track);
                if (toMediaScan.size() < 64) toMediaScan.add(path);
            }
        }
        return scannedDirs;
    }

    private static final class DirEntry {
        final File dir;
        final int depth;
        DirEntry(File dir, int depth) { this.dir = dir; this.depth = depth; }
    }

    private static JSObject buildTrackFromFileOrUri(
            Context app,
            File file,
            Uri fallbackUri,
            File coverDir,
            String id
    ) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            if (file != null) retriever.setDataSource(file.getAbsolutePath());
            else if (fallbackUri != null) retriever.setDataSource(app, fallbackUri);
            else return null;

            long durationMs = 0L;
            String durStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            if (durStr != null) {
                try { durationMs = Long.parseLong(durStr); } catch (NumberFormatException ignored) { }
            }
            if (durationMs > 0 && durationMs < MIN_AUDIO_DURATION_MS) return null;

            String path = file != null ? file.getAbsolutePath() : null;
            String title = normalizeTitle(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE), path);
            String artist = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST);
            if (artist == null || artist.trim().isEmpty()) {
                artist = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST);
            }
            artist = normalizeTag(artist, "未知歌手");
            String album = normalizeTag(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM), "未知专辑");

            String coverPath = "";
            String coverUrl = "";
            try {
                byte[] art = retriever.getEmbeddedPicture();
                if (art != null && art.length > 0) {
                    String artKey = shortHash(path != null ? path : id);
                    File coverFile = new File(coverDir, artKey + ".jpg");
                    if (!coverFile.exists() || coverFile.length() == 0) {
                        try (FileOutputStream fos = new FileOutputStream(coverFile)) {
                            fos.write(art);
                        }
                    }
                    coverPath = coverFile.getAbsolutePath();
                    coverUrl = Uri.fromFile(coverFile).toString();
                }
            } catch (Throwable ignored) {
            }

            JSObject track = new JSObject();
            track.put("id", id);
            track.put("title", title);
            track.put("artist", artist);
            track.put("album", album);
            track.put("durationMs", durationMs);
            track.put("streamUrl", file != null ? Uri.fromFile(file).toString() : fallbackUri.toString());
            track.put("coverUrl", coverUrl);
            if (!coverPath.isEmpty()) track.put("coverPath", coverPath);
            if (path != null) track.put("filePath", path);
            return track;
        } catch (Throwable ignored) {
            if (file == null) return null;
            JSObject track = new JSObject();
            track.put("id", id);
            track.put("title", normalizeTitle(null, file.getAbsolutePath()));
            track.put("artist", "未知歌手");
            track.put("album", "未知专辑");
            track.put("durationMs", 0L);
            track.put("streamUrl", Uri.fromFile(file).toString());
            track.put("coverUrl", "");
            track.put("filePath", file.getAbsolutePath());
            return track;
        } finally {
            try { retriever.release(); } catch (Throwable ignored) { }
        }
    }

    private static boolean isAudioFileName(String nameOrPath) {
        if (nameOrPath == null) return false;
        int dot = nameOrPath.lastIndexOf('.');
        if (dot < 0 || dot == nameOrPath.length() - 1) return false;
        String ext = nameOrPath.substring(dot + 1).toLowerCase(Locale.ROOT);
        return AUDIO_EXTENSIONS.contains(ext);
    }

    private static boolean isExcludedSystemPath(String path) {
        if (path == null) return false;
        String lower = path.toLowerCase(Locale.ROOT);
        return lower.contains("/android/data/")
                || lower.contains("/android/obb/")
                || lower.contains("/.thumbnails/")
                || lower.contains("/.trash/")
                || lower.contains("/notifications/")
                || lower.contains("/alarms/")
                || lower.contains("/ringtones/");
    }

    private static String canonicalPathOrNull(String path) {
        if (path == null || path.isEmpty()) return null;
        try {
            return new File(path).getCanonicalPath();
        } catch (Throwable ignored) {
            return path;
        }
    }

    private static String normalizeTitle(String rawTitle, String path) {
        if (rawTitle != null) {
            String trimmed = rawTitle.trim();
            if (!trimmed.isEmpty() && !"<unknown>".equalsIgnoreCase(trimmed)) return trimmed;
        }
        if (path != null && !path.isEmpty()) {
            String name = new File(path).getName();
            int dot = name.lastIndexOf('.');
            return dot > 0 ? name.substring(0, dot) : name;
        }
        return "未知曲目";
    }

    private static String normalizeTag(String raw, String fallback) {
        if (raw == null) return fallback;
        String trimmed = raw.trim();
        if (trimmed.isEmpty() || "<unknown>".equalsIgnoreCase(trimmed)) return fallback;
        return trimmed;
    }

    private static String trackSignature(String title, String artist, long durationMs) {
        return title.toLowerCase(Locale.ROOT) + "\0" + artist.toLowerCase(Locale.ROOT) + "\0" + (durationMs / 1000L);
    }

    private static String shortHash(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] digest = md.digest(value.getBytes("UTF-8"));
            StringBuilder hex = new StringBuilder(16);
            for (int i = 0; i < 8 && i < digest.length; i++) {
                hex.append(String.format(Locale.ROOT, "%02x", digest[i] & 0xff));
            }
            return hex.toString();
        } catch (Throwable ignored) {
            return Integer.toHexString(value.hashCode());
        }
    }
}
