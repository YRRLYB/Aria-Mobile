package com.yrrlyb.aria.mobile;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.BroadcastReceiver;
import android.app.KeyguardManager;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.audiofx.Equalizer;
import android.provider.Settings;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;

import com.yrrlyb.aria.mobile.netease.NeteaseClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground playback service: Media3 ExoPlayer + MediaSession.
 *
 * Owns the notification/lock-screen media card and reliable background
 * playback. The WebView cannot be trusted to stay alive once Android freezes
 * or kills the activity, so the service also owns the upcoming queue: it
 * appends the next item ahead of time, resolves direct NetEase URLs on-device
 * when needed and advances/repeats without waiting for JavaScript.
 */
public class AriaPlaybackService extends MediaSessionService {

    public static final String ACTION_LOAD = "com.yrrlyb.aria.mobile.action.LOAD";
    private static final String CHANNEL_ID = "aria_playback";
    private static final int TEMP_NOTIFICATION_ID = 42;

    // Resolve direct CDN URLs only shortly before they are needed. NetEase
    // links expire after a few minutes, so resolving the whole queue up front
    // would leave dead links at the front.
    private static final long DIRECT_PREPARE_WINDOW_MS = 120_000L;
    private static final String[] QUALITY_LEVELS = {
            "standard", "higher", "exhigh", "lossless", "hires", "jymaster",
    };

    public interface EventSink {
        void emit(Map<String, Object> event);
    }

    private static volatile AriaPlaybackService instance;
    private static volatile EventSink eventSink;
    private static volatile boolean requestedUsbExclusive = false;

    private ExoPlayer player;
    private AudioBitrateMeter bitrateMeter = new AudioBitrateMeter();
    private long lastMeasuredBitrate = 0;
    private SimpleCache audioCache;
    private DataSource.Factory cachedDataSourceFactory;
    private Equalizer equalizer;
    private int pendingEqualizerPreset = -1;
    private MediaSession session;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    // True while our placeholder notification owns the foreground slot. The
    // system gives a startForegroundService() call ~5s to reach
    // startForeground() or it kills the process — rapid track switching with
    // a slow LAN stream used to hit exactly that. We now promote immediately
    // on the LOAD intent and hand the slot back once media3's media
    // notification can take over (playback READY).
    private boolean tempForeground = false;
    private boolean usbExclusiveEnabled = false;
    private AudioFocusRequest usbFocusRequest;
    private final AudioManager.OnAudioFocusChangeListener usbFocusListener = focusChange -> {
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS) usbExclusiveEnabled = false;
    };
    private boolean lockScreenArmed;
    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) {
                lockScreenArmed = player != null && player.getPlayWhenReady() && player.getCurrentMediaItem() != null;
                if (lockScreenArmed) showMusicLockScreen();
            } else if (Intent.ACTION_SCREEN_ON.equals(intent.getAction())) {
                KeyguardManager keyguard = getSystemService(KeyguardManager.class);
                if (lockScreenArmed && keyguard != null && keyguard.isKeyguardLocked()) showMusicLockScreen();
            } else if (Intent.ACTION_USER_PRESENT.equals(intent.getAction())) {
                lockScreenArmed = false;
                LockPlayerActivity.dismiss();
            }
        }
    };

    // ---- Native-owned queue (survives WebView suspension) ----
    private final List<QueueEntry> nativeQueue = new ArrayList<>();
    private int nativeQueueIndex = -1;
    private String nativeRepeatMode = "all";
    private String playbackRequestId = "";
    private int queueGeneration = 0;
    private int navigationToken = 0;
    private int appendToken = 0;
    private boolean nextAppendBusy = false;
    private boolean startInFlight = false;
    private final Set<Integer> failedQueuePositions = new HashSet<>();
    private final Set<Integer> retriedQueuePositions = new HashSet<>();
    private final ExecutorService urlExecutor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "aria-playback-url");
        thread.setDaemon(true);
        return thread;
    });
    private String lastEmittedTrackId = "";

    private static final class QueueEntry {
        final String trackId;
        final String url;
        final String directId;
        final String level;
        final String title;
        final String artist;
        final String album;
        final String artworkUrl;
        String resolvedUrl;

        QueueEntry(String trackId, String url, String directId, String level,
                   String title, String artist, String album, String artworkUrl) {
            this.trackId = trackId == null ? "" : trackId;
            this.url = url == null ? "" : url;
            this.directId = directId == null ? "" : directId;
            this.level = level == null || level.isEmpty() ? "exhigh" : level;
            this.title = title == null ? "" : title;
            this.artist = artist == null ? "" : artist;
            this.album = album == null ? "" : album;
            this.artworkUrl = artworkUrl == null ? "" : artworkUrl;
            this.resolvedUrl = this.url;
        }

        static QueueEntry fromBundle(Bundle bundle) {
            return new QueueEntry(
                    bundle.getString("trackId", ""),
                    bundle.getString("url", ""),
                    bundle.getString("directId", ""),
                    bundle.getString("level", ""),
                    bundle.getString("title", ""),
                    bundle.getString("artist", ""),
                    bundle.getString("album", ""),
                    bundle.getString("artworkUrl", ""));
        }

        static QueueEntry fromLoad(Bundle extras) {
            return new QueueEntry(
                    extras.getString("trackId", ""),
                    extras.getString("url", ""),
                    extras.getString("directId", ""),
                    extras.getString("level", ""),
                    extras.getString("title", ""),
                    extras.getString("artist", ""),
                    extras.getString("album", ""),
                    extras.getString("artworkUrl", ""));
        }

        boolean hasPlayableUrl() {
            return resolvedUrl != null && !resolvedUrl.isEmpty();
        }

        String playableUrl() {
            return resolvedUrl == null ? "" : resolvedUrl;
        }
    }

    private void showMusicLockScreen() {
        if (!getSharedPreferences("aria-lock-screen", MODE_PRIVATE).getBoolean("enabled", false)) return;
        if (!Settings.canDrawOverlays(this)) return;
        AudioManager audio = getSystemService(AudioManager.class);
        if (audio != null && audio.getMode() != AudioManager.MODE_NORMAL) return;
        if (LockPlayerActivity.isVisible()) return;
        try {
            startActivity(new Intent(this, LockPlayerActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NO_ANIMATION));
        } catch (RuntimeException error) {
            android.util.Log.w("AriaLockScreen", "Unable to show music lock screen", error);
        }
    }

    private final Player.Listener playerListener = new Player.Listener() {
        @Override
        public void onPlaybackStateChanged(int playbackState) {
            if (playbackState == Player.STATE_READY) {
                // Media3 owns this service's foreground state now. Calling
                // stopForeground here also removes its actual media card.
                if (session != null) onUpdateNotification(session, player.getPlayWhenReady());
                mainHandler.postDelayed(() -> {
                    NotificationManager manager = getSystemService(NotificationManager.class);
                    if (manager != null) manager.cancel(TEMP_NOTIFICATION_ID);
                    tempForeground = false;
                }, 500);
                Map<String, Object> event = baseEvent("loaded");
                event.put("duration", safeDuration());
                event.put("position", safePosition());
                appendAudioFormat(event);
                emit(event);
                maybeAppendNext();
                if (pendingEqualizerPreset >= 0) {
                    applyEqualizerPreset(pendingEqualizerPreset);
                    pendingEqualizerPreset = -1;
                }
            } else if (playbackState == Player.STATE_ENDED) {
                // Normally the next item is already appended. If resolution was
                // still in flight (or the network failed), try the queue once
                // more before telling the web layer playback stopped.
                if (playNextFromQueue(false)) return;
                emit(baseEvent("ended"));
            }
        }

        @Override
        public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
            // Report the playback INTENT (playWhenReady), not isPlaying():
            // buffering also makes isPlaying false, and mirroring that to JS
            // made the web layer pause the player mid-buffer — tracks then
            // never started after switching.
            android.util.Log.i("AriaPlayback", "playWhenReady=" + playWhenReady + " trackId=" + currentTrackId());
            Map<String, Object> event = baseEvent("state");
            event.put("playing", playWhenReady);
            emit(event);
            if (playWhenReady) maybeAppendNext();
        }

        @Override
        public void onMediaItemTransition(MediaItem mediaItem, int reason) {
            if (mediaItem == null) return;
            if (reason != Player.MEDIA_ITEM_TRANSITION_REASON_AUTO
                    && reason != Player.MEDIA_ITEM_TRANSITION_REASON_SEEK) return;

            int queuePosition = queuePositionOf(mediaItem);
            int previousPosition = nativeQueueIndex;
            if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                bitrateMeter.reset();
                lastMeasuredBitrate = 0;
            }
            if (queuePosition >= 0) nativeQueueIndex = queuePosition;
            else {
                int found = indexOfTrack(trackIdOf(mediaItem));
                if (found >= 0) nativeQueueIndex = found;
            }
            // A direct CDN URL is short-lived. Once its item has been played,
            // drop the cached link so a repeat-all pass resolves a fresh one.
            if (previousPosition >= 0 && previousPosition < nativeQueue.size()) {
                QueueEntry played = nativeQueue.get(previousPosition);
                if (played.url.isEmpty() && !played.directId.isEmpty()) played.resolvedUrl = "";
            }
            nextAppendBusy = false;
            maybeAppendNext();

            String trackId = trackIdOf(mediaItem);
            if (trackId.isEmpty() || trackId.equals(lastEmittedTrackId)) return;
            lastEmittedTrackId = trackId;
            Map<String, Object> event = baseEvent("advanced");
            event.put("duration", safeDuration());
            event.put("position", safePosition());
            emit(event);
        }

        @Override
        public void onPlayerError(PlaybackException error) {
            String message = error != null ? String.valueOf(error.getMessage()) : "unknown playback error";
            android.util.Log.w("AriaPlayback", "player error: " + message);
            int position = nativeQueueIndex;
            // Expired CDN links are common in direct mode. Refresh the same
            // item once before skipping; only blacklist it if that fails too.
            if (position >= 0 && position < nativeQueue.size() && !retriedQueuePositions.contains(position)) {
                retriedQueuePositions.add(position);
                QueueEntry entry = nativeQueue.get(position);
                int generation = queueGeneration;
                long startMs = Math.max(0, (long) (safePosition() * 1000));
                entry.resolvedUrl = "";
                urlExecutor.execute(() -> {
                    String url = resolveEntryUrl(entry);
                    mainHandler.post(() -> {
                        if (generation != queueGeneration || nativeQueueIndex != position) return;
                        if (!url.isEmpty()) {
                            entry.resolvedUrl = url;
                            startEntry(entry, position, startMs, false);
                            return;
                        }
                        failedQueuePositions.add(position);
                        if (!playNextFromQueue(true)) {
                            releaseTempForeground();
                            Map<String, Object> event = baseEvent("error");
                            event.put("message", message);
                            emit(event);
                        }
                    });
                });
                return;
            }
            if (position >= 0) failedQueuePositions.add(position);
            if (playNextFromQueue(true)) return;
            releaseTempForeground();
            Map<String, Object> event = baseEvent("error");
            event.put("message", message);
            emit(event);
        }
    };

    private final Runnable progressRunnable = new Runnable() {
        @Override
        public void run() {
            ExoPlayer activePlayer = player;
            if (activePlayer == null) return;
            // This runs from the service, so gapless preparation continues
            // even when the WebView has been frozen in the background.
            maybeAppendNext();
            Map<String, Object> event = baseEvent("progress");
            event.put("position", safePosition());
            event.put("duration", safeDuration());
            if (activePlayer.getPlaybackState() == Player.STATE_READY) appendAudioFormat(event);
            emit(event);
            mainHandler.postDelayed(this, 500);
        }
    };

    private final Runnable sleepTimerRunnable = () -> {
        ExoPlayer activePlayer = player;
        if (activePlayer != null) {
            activePlayer.setPlayWhenReady(false);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build();
        try {
            File cacheDir = new File(getCacheDir(), "audio-cache");
            audioCache = new SimpleCache(
                    cacheDir,
                    new LeastRecentlyUsedCacheEvictor(128L * 1024 * 1024),
                    new StandaloneDatabaseProvider(this));
            cachedDataSourceFactory = new CacheDataSource.Factory()
                    .setCache(audioCache)
                    .setUpstreamDataSourceFactory(new DefaultDataSource.Factory(this))
                    .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
        } catch (Throwable error) {
            android.util.Log.w("AriaPlayback", "audio cache unavailable", error);
            audioCache = null;
            cachedDataSourceFactory = new DefaultDataSource.Factory(this);
        }
        player = new ExoPlayer.Builder(this)
                .setAudioAttributes(audioAttributes, true)
                .setHandleAudioBecomingNoisy(true)
                .setWakeMode(C.WAKE_MODE_NETWORK)
                .setLoadControl(new DefaultLoadControl.Builder()
                        .setBufferDurationsMs(40_000, 120_000, 1_500, 5_000)
                        .setPrioritizeTimeOverSizeThresholds(true)
                        .build())
                .build();
        player.addListener(playerListener);
        // Tapping the lockscreen / notification media card opens the app.
        PendingIntent sessionActivity = PendingIntent.getActivity(
                this,
                0,
                new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Player controls = new ForwardingPlayer(player) {
            @Override public Player.Commands getAvailableCommands() {
                return super.getAvailableCommands().buildUpon()
                        .add(Player.COMMAND_SEEK_TO_NEXT).add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                        .add(Player.COMMAND_SEEK_TO_PREVIOUS).add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM).build();
            }
            @Override public boolean isCommandAvailable(int command) { return getAvailableCommands().contains(command); }
            @Override public void seekToNext() { requestSkip(true); }
            @Override public void seekToNextMediaItem() { requestSkip(true); }
            @Override public void seekToPrevious() { requestSkip(false); }
            @Override public void seekToPreviousMediaItem() { requestSkip(false); }
        };
        session = new MediaSession.Builder(this, controls)
                .setSessionActivity(sessionActivity)
                .build();
        instance = this;
        if (requestedUsbExclusive) applyUsbExclusive(true);
        // Playback starts via a service intent, not a bound MediaController.
        // Register explicitly so Media3 creates and updates its notification.
        addSession(session);
        IntentFilter screenFilter = new IntentFilter();
        screenFilter.addAction(Intent.ACTION_SCREEN_OFF);
        screenFilter.addAction(Intent.ACTION_SCREEN_ON);
        screenFilter.addAction(Intent.ACTION_USER_PRESENT);
        ContextCompat.registerReceiver(this, screenReceiver, screenFilter, ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            // Recreated by START_STICKY without a payload: there is no queue
            // to restore, so release the empty service instead of lingering.
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_LOAD.equals(intent.getAction()) && intent.getExtras() != null) {
            // Promote to foreground right away: rapid LOAD intents must never
            // depend on the stream actually starting within the system's
            // foreground-service grace period (miss it and the process is
            // killed — the "crash when tapping fast" bug).
            ensureTempForeground();
            applyLoad(intent.getExtras());
        }
        super.onStartCommand(intent, flags, startId);
        // If an OEM still kills the process, let Android recreate the service
        // instead of leaving the app without a playback component.
        return START_STICKY;
    }

    private void createNotificationChannel() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "播放控制", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Aria 后台播放与媒体卡片");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private void ensureTempForeground() {
        if (tempForeground) return;
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("Aria")
                .setContentText("正在准备播放…")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(TEMP_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(TEMP_NOTIFICATION_ID, notification);
        }
        tempForeground = true;
    }

    private void releaseTempForeground() {
        if (!tempForeground) return;
        tempForeground = false;
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
    }

    @Override
    public void onDestroy() {
        queueGeneration++;
        unregisterReceiver(screenReceiver);
        LockPlayerActivity.dismiss();
        mainHandler.removeCallbacks(progressRunnable);
        mainHandler.removeCallbacks(sleepTimerRunnable);
        applyUsbExclusive(false);
        instance = null;
        releaseTempForeground();
        urlExecutor.shutdownNow();
        if (session != null) {
            session.release();
            session = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        if (equalizer != null) {
            try { equalizer.release(); } catch (Throwable ignored) { }
            equalizer = null;
        }
        if (audioCache != null) {
            try { audioCache.release(); } catch (Throwable ignored) { }
            audioCache = null;
            cachedDataSourceFactory = null;
        }
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        ExoPlayer activePlayer = player;
        // Do not tear down a live/ready session when the user swipes the app
        // away: the foreground service and its notification are the only
        // reason music keeps playing in the background. A service that was
        // already paused can be released.
        if (activePlayer == null || activePlayer.getCurrentMediaItem() == null
                || !activePlayer.getPlayWhenReady()) {
            stopSelf();
        }
        super.onTaskRemoved(rootIntent);
    }

    // ---- Static entry points used by the Capacitor plugin ----

    static void setEventSink(EventSink sink) {
        eventSink = sink;
    }

    static void startWithLoad(Context context, Bundle payload) {
        Intent intent = new Intent(context, AriaPlaybackService.class);
        intent.setAction(ACTION_LOAD);
        intent.putExtras(payload);
        ContextCompat.startForegroundService(context, intent);
    }

    static void withPlayer(PlayerOperation operation) {
        AriaPlaybackService service = instance;
        ExoPlayer activePlayer = service != null ? service.player : null;
        if (activePlayer != null) {
            service.runOnMain(() -> operation.run(activePlayer));
        }
    }

    interface PlayerOperation {
        void run(ExoPlayer player);
    }

    static void requestSkip(boolean next) {
        AriaPlaybackService service = instance;
        if (service != null) service.runOnMain(() -> service.skipNative(next));
    }

    static void requestLike() {
        AriaPlaybackService service = instance;
        if (service != null) service.runOnMain(() -> service.emit(service.baseEvent("like")));
    }

    /** minutes <= 0 clears the timer. Executes in the service so it keeps
     *  working while the WebView is suspended. */
    static void setSleepTimer(int minutes) {
        AriaPlaybackService service = instance;
        if (service == null) return;
        service.runOnMain(() -> {
            service.mainHandler.removeCallbacks(service.sleepTimerRunnable);
            if (minutes > 0) {
                service.mainHandler.postDelayed(service.sleepTimerRunnable, minutes * 60_000L);
            }
        });
    }

    static void setPlaybackSpeed(float speed) {
        ExoPlayer activePlayer = instance != null ? instance.player : null;
        if (activePlayer != null) {
            activePlayer.setPlaybackSpeed((float) clampSpeed(speed));
        }
    }

    static Map<String, Object> getEqualizerSettings() {
        Map<String, Object> result = new HashMap<>();
        AriaPlaybackService service = instance;
        if (service == null || service.player == null) {
            result.put("supported", false);
            result.put("enabled", false);
            result.put("current", -1);
            result.put("presets", new java.util.ArrayList<String>());
            return result;
        }
        service.ensureEqualizer();
        Equalizer eq = service.equalizer;
        if (eq == null) {
            result.put("supported", false);
            result.put("enabled", false);
            result.put("current", -1);
            result.put("presets", new java.util.ArrayList<String>());
            return result;
        }
        try {
            java.util.ArrayList<String> presets = new java.util.ArrayList<>();
            short count = eq.getNumberOfPresets();
            for (short index = 0; index < count; index++) {
                presets.add(eq.getPresetName(index));
            }
            result.put("supported", true);
            result.put("enabled", eq.getEnabled());
            result.put("current", (int) eq.getCurrentPreset());
            result.put("presets", presets);
        } catch (Throwable error) {
            result.put("supported", false);
            result.put("enabled", false);
            result.put("current", -1);
            result.put("presets", new java.util.ArrayList<String>());
        }
        return result;
    }

    static void setEqualizerPreset(int preset) {
        AriaPlaybackService service = instance;
        if (service == null) return;
        service.runOnMain(() -> {
            service.pendingEqualizerPreset = preset;
            service.applyEqualizerPreset(preset);
        });
    }

    static void stopPlayback() {
        AriaPlaybackService service = instance;
        if (service == null) return;
        service.runOnMain(() -> {
            service.queueGeneration++;
            service.navigationToken++;
            service.appendToken++;
            service.mainHandler.removeCallbacks(service.sleepTimerRunnable);
            service.nativeQueue.clear();
            service.nativeQueueIndex = -1;
            service.nextAppendBusy = false;
            service.startInFlight = false;
            if (service.player != null) {
                service.player.stop();
                service.player.clearMediaItems();
            }
            service.releaseTempForeground();
            service.stopSelf();
        });
    }

    // ---- Payload application ----

    @SuppressWarnings("deprecation")
    private void applyLoad(Bundle extras) {
        runOnMain(() -> {
            if (player == null) return;
            int generation = ++queueGeneration;
            navigationToken++;
            appendToken++;
            android.util.Log.i("AriaPlayback", "applyLoad trackId=" + extras.getString("trackId", "")
                    + " requestId=" + extras.getString("requestId", "")
                    + " paused=" + extras.getBoolean("paused", false));
            playbackRequestId = extras.getString("requestId", "");
            nativeRepeatMode = "one".equals(extras.getString("repeatMode", "all")) ? "one" : "all";
            nativeQueue.clear();
            failedQueuePositions.clear();
            retriedQueuePositions.clear();
            nextAppendBusy = false;
            startInFlight = false;

            ArrayList<Bundle> queueBundles = Build.VERSION.SDK_INT >= 33
                    ? extras.getParcelableArrayList("queue", Bundle.class)
                    : extras.getParcelableArrayList("queue");
            if (queueBundles != null) {
                for (Bundle bundle : queueBundles) {
                    if (bundle == null) continue;
                    QueueEntry entry = QueueEntry.fromBundle(bundle);
                    if (!entry.trackId.isEmpty()) nativeQueue.add(entry);
                }
            }

            String trackId = extras.getString("trackId", "");
            int currentIndex = indexOfTrack(trackId);
            if (currentIndex < 0) {
                nativeQueue.add(0, QueueEntry.fromLoad(extras));
                currentIndex = 0;
            }
            nativeQueueIndex = currentIndex;
            lastEmittedTrackId = trackId;

            MediaItem item = buildCurrentItem(extras, currentIndex);
            double position = extras.getDouble("position", 0.0);
            long startPosition = position > 0.1 ? (long) (position * 1000) : C.TIME_UNSET;
            bitrateMeter = new AudioBitrateMeter();
            lastMeasuredBitrate = 0;
            DataSource.Factory dataSourceFactory = cachedDataSourceFactory != null
                    ? cachedDataSourceFactory
                    : new DefaultDataSource.Factory(this);
            androidx.media3.exoplayer.source.DefaultMediaSourceFactory sourceFactory =
                    new androidx.media3.exoplayer.source.DefaultMediaSourceFactory(
                            dataSourceFactory,
                            new MeasuredExtractorsFactory(bitrateMeter));
            player.setRepeatMode(repeatModeForNative());
            player.setMediaSource(sourceFactory.createMediaSource(item), startPosition);
            player.setVolume((float) clampVolume(extras.getDouble("volume", 1.0)));
            player.setPlaybackSpeed((float) clampSpeed(extras.getDouble("speed", 1.0)));
            pendingEqualizerPreset = extras.getInt("equalizerPreset", -1);
            player.prepare();
            player.setPlayWhenReady(!extras.getBoolean("paused", false));
            restartProgressLoop();
            if (generation == queueGeneration) maybeAppendNext();
        });
    }

    private int repeatModeForNative() {
        return "one".equals(nativeRepeatMode) ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_OFF;
    }

    static void setRepeatMode(String repeatMode) {
        AriaPlaybackService service = instance;
        if (service == null) return;
        service.runOnMain(() -> {
            service.nativeRepeatMode = "one".equals(repeatMode) ? "one" : "all";
            if (service.player != null) service.player.setRepeatMode(service.repeatModeForNative());
            if (!"one".equals(service.nativeRepeatMode)) service.maybeAppendNext();
        });
    }

    static void appendNext(Bundle extras) {
        AriaPlaybackService service = instance;
        if (service == null) return;
        service.runOnMain(() -> {
            if (service.player == null || service.player.hasNextMediaItem()) return;
            QueueEntry entry = QueueEntry.fromBundle(extras);
            if (!entry.hasPlayableUrl()) return;
            service.player.addMediaItem(service.buildQueueItem(entry, -1));
        });
    }

    static Map<String, Object> getUsbExclusiveSettings(Context context) {
        AriaPlaybackService service = instance;
        Map<String, Object> result = new HashMap<>();
        result.put("enabled", service != null ? service.usbExclusiveEnabled : requestedUsbExclusive);
        result.put("connected", service != null ? service.hasUsbOutput() : hasUsbOutput(context));
        result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
        return result;
    }

    static Map<String, Object> setUsbExclusiveEnabled(Context context, boolean enabled) {
        AriaPlaybackService service = instance;
        Map<String, Object> result = new HashMap<>();
        boolean connected = service != null ? service.hasUsbOutput() : hasUsbOutput(context);
        if (service == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            requestedUsbExclusive = enabled;
            result.put("enabled", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && enabled);
            result.put("connected", connected);
            result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
            return result;
        }
        requestedUsbExclusive = enabled;
        service.runOnMain(() -> service.applyUsbExclusive(enabled));
        result.put("enabled", enabled);
        result.put("connected", connected);
        result.put("supported", true);
        return result;
    }

    // ---- Native queue helpers ----

    private MediaItem buildCurrentItem(Bundle extras, int queuePosition) {
        QueueEntry entry = QueueEntry.fromLoad(extras);
        // The top-level load always carries the already-resolved URL; the
        // queue copy is only used for later transitions.
        entry.resolvedUrl = extras.getString("url", "");
        return buildQueueItem(entry, queuePosition);
    }

    private MediaItem buildQueueItem(QueueEntry entry, int queuePosition) {
        Bundle itemExtras = new Bundle();
        itemExtras.putString("trackId", entry.trackId);
        itemExtras.putString("requestId", playbackRequestId);
        itemExtras.putInt("queuePos", queuePosition);

        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                .setTitle(entry.title)
                .setArtist(entry.artist)
                .setAlbumTitle(entry.album)
                .setExtras(itemExtras);
        if (!entry.artworkUrl.isEmpty()) {
            metadata.setArtworkUri(Uri.parse(entry.artworkUrl));
            LockPlayerActivity.prepareArtwork(this, entry.artworkUrl);
        }

        return new MediaItem.Builder()
                .setMediaId(entry.trackId)
                .setUri(entry.playableUrl())
                .setMediaMetadata(metadata.build())
                .build();
    }

    private int indexOfTrack(String trackId) {
        if (trackId == null || trackId.isEmpty()) return -1;
        for (int index = 0; index < nativeQueue.size(); index++) {
            if (trackId.equals(nativeQueue.get(index).trackId)) return index;
        }
        return -1;
    }

    private int nextQueuePosition(int from, boolean wrap) {
        if (nativeQueue.isEmpty()) return -1;
        if (from < 0) return 0;
        if (from + 1 < nativeQueue.size()) return from + 1;
        return wrap ? 0 : -1;
    }

    private int previousQueuePosition(int from) {
        if (nativeQueue.isEmpty()) return -1;
        if (from <= 0) return nativeQueue.size() - 1;
        return from - 1;
    }

    private void maybeAppendNext() {
        ExoPlayer activePlayer = player;
        if (activePlayer == null || nativeQueue.isEmpty()) return;
        if ("one".equals(nativeRepeatMode)) return;
        if (activePlayer.hasNextMediaItem() || nextAppendBusy || startInFlight) return;
        int position = nextQueuePosition(nativeQueueIndex, true);
        if (position >= 0) maybeAppendAt(position, 0);
    }

    private void maybeAppendAt(int position, int attempts) {
        ExoPlayer activePlayer = player;
        if (activePlayer == null || nativeQueue.isEmpty()) return;
        if (attempts > nativeQueue.size()) return;
        if (position < 0 || position >= nativeQueue.size()) return;
        if (failedQueuePositions.contains(position)) {
            maybeAppendAt(nextQueuePosition(position, true), attempts + 1);
            return;
        }
        QueueEntry entry = nativeQueue.get(position);
        if (entry.hasPlayableUrl()) {
            activePlayer.addMediaItem(buildQueueItem(entry, position));
            return;
        }
        // Do not burn a short-lived CDN link while the user has deliberately
        // paused near the end of a track.
        if (!activePlayer.getPlayWhenReady()) return;
        long remaining = remainingMs();
        // Keep direct links fresh: wait until the current song is near its end
        // before asking songUrlV1 for the next CDN url.
        if (remaining > DIRECT_PREPARE_WINDOW_MS) return;
        resolveAndAppend(entry, position, attempts);
    }

    private void resolveAndAppend(QueueEntry entry, int position, int attempts) {
        nextAppendBusy = true;
        int generation = queueGeneration;
        int token = ++appendToken;
        urlExecutor.execute(() -> {
            String url = resolveEntryUrl(entry);
            mainHandler.post(() -> {
                if (generation != queueGeneration || token != appendToken) return;
                nextAppendBusy = false;
                ExoPlayer activePlayer = player;
                if (activePlayer == null) return;
                if (url.isEmpty()) {
                    failedQueuePositions.add(position);
                    android.util.Log.w("AriaPlayback", "unable to resolve next track " + entry.trackId);
                    maybeAppendAt(nextQueuePosition(position, true), attempts + 1);
                    return;
                }
                entry.resolvedUrl = url;
                // A manual skip may have moved the queue while the request was
                // in flight; never append an item for an obsolete position.
                if (nativeQueueIndex < 0 || position != nextQueuePosition(nativeQueueIndex, true)) return;
                if (!activePlayer.hasNextMediaItem()) {
                    activePlayer.addMediaItem(buildQueueItem(entry, position));
                }
            });
        });
    }

    private long remainingMs() {
        ExoPlayer activePlayer = player;
        if (activePlayer == null) return 0;
        long duration = activePlayer.getDuration();
        if (duration == C.TIME_UNSET || duration <= 0) return 0;
        return Math.max(0, duration - activePlayer.getCurrentPosition());
    }

    private String resolveEntryUrl(QueueEntry entry) {
        if (entry.hasPlayableUrl()) return entry.playableUrl();
        long songId = parseSongId(entry.directId);
        if (songId <= 0) return "";
        int start = 2;
        for (int index = 0; index < QUALITY_LEVELS.length; index++) {
            if (QUALITY_LEVELS[index].equals(entry.level)) {
                start = index;
                break;
            }
        }
        for (int index = start; index >= 0; index--) {
            try {
                JSONObject body = NeteaseClient.songUrlV1(getApplicationContext(), songId, QUALITY_LEVELS[index]);
                JSONArray data = body.optJSONArray("data");
                JSONObject first = data != null ? data.optJSONObject(0) : null;
                String url = first != null ? first.optString("url", "") : "";
                if (!url.isEmpty()) return url;
            } catch (Throwable error) {
                android.util.Log.w("AriaPlayback", "songUrlV1 failed: " + songId + " " + QUALITY_LEVELS[index], error);
            }
        }
        return "";
    }

    private static long parseSongId(String value) {
        if (value == null) return 0;
        String digits = value.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) return 0;
        try {
            return Long.parseLong(digits);
        } catch (NumberFormatException error) {
            return 0;
        }
    }

    private void skipNative(boolean next) {
        ExoPlayer activePlayer = player;
        if (activePlayer == null) return;
        navigationToken++;
        appendToken++;
        startInFlight = false;
        nextAppendBusy = false;
        if (!next) {
            if (activePlayer.getCurrentPosition() > 3000) {
                activePlayer.seekTo(0);
                return;
            }
            int previous = previousQueuePosition(nativeQueueIndex);
            if (previous >= 0) startQueuePosition(previous, 0, true, 0);
            return;
        }
        // Use Media3's pre-appended item when available: it is already
        // buffered and transitions gaplessly.
        if (activePlayer.hasNextMediaItem()) {
            activePlayer.seekToNextMediaItem();
            activePlayer.play();
            return;
        }
        startQueuePosition(nextQueuePosition(nativeQueueIndex, true), 0, true, 0);
    }

    private boolean playNextFromQueue(boolean manual) {
        if (nativeQueue.isEmpty()) return false;
        int position;
        if ("one".equals(nativeRepeatMode) && !manual) {
            position = nativeQueueIndex;
        } else {
            position = nextQueuePosition(nativeQueueIndex, true);
        }
        return startQueuePosition(position, 0, true, 0);
    }

    private boolean startQueuePosition(int position, long startMs, boolean emitAdvance, int attempts) {
        if (position < 0 || position >= nativeQueue.size()) return false;
        if (attempts > nativeQueue.size()) return false;
        if (failedQueuePositions.contains(position)) {
            return startQueuePosition(nextQueuePosition(position, true), startMs, emitAdvance, attempts + 1);
        }
        QueueEntry entry = nativeQueue.get(position);
        if (entry.hasPlayableUrl()) {
            startEntry(entry, position, startMs, emitAdvance);
            return true;
        }
        // Resolve before handing the item to ExoPlayer. The UI (if alive) will
        // receive the advanced event once playback actually starts.
        int generation = queueGeneration;
        int token = ++navigationToken;
        startInFlight = true;
        urlExecutor.execute(() -> {
            String url = resolveEntryUrl(entry);
            mainHandler.post(() -> {
                if (generation != queueGeneration || token != navigationToken) return;
                startInFlight = false;
                if (url.isEmpty()) {
                    failedQueuePositions.add(position);
                    if (!startQueuePosition(nextQueuePosition(position, true), startMs, emitAdvance, attempts + 1)) {
                        emit(baseEvent("error"));
                    }
                    return;
                }
                entry.resolvedUrl = url;
                startEntry(entry, position, startMs, emitAdvance);
            });
        });
        return true;
    }

    private void startEntry(QueueEntry entry, int position, long startMs, boolean emitAdvance) {
        ExoPlayer activePlayer = player;
        if (activePlayer == null) return;
        navigationToken++;
        appendToken++;
        startInFlight = false;
        nextAppendBusy = false;
        int previousIndex = nativeQueueIndex;
        if (previousIndex >= 0 && previousIndex < nativeQueue.size() && previousIndex != position) {
            QueueEntry previous = nativeQueue.get(previousIndex);
            if (previous.url.isEmpty() && !previous.directId.isEmpty()) previous.resolvedUrl = "";
        }
        nativeQueueIndex = position;
        bitrateMeter.reset();
        lastMeasuredBitrate = 0;
        MediaItem item = buildQueueItem(entry, position);
        boolean wasSameTrack = entry.trackId.equals(lastEmittedTrackId);
        activePlayer.setRepeatMode(repeatModeForNative());
        activePlayer.setMediaItem(item, startMs > 0 ? startMs : C.TIME_UNSET);
        activePlayer.prepare();
        activePlayer.setPlayWhenReady(true);
        restartProgressLoop();
        lastEmittedTrackId = entry.trackId;
        if (emitAdvance && !wasSameTrack) {
            Map<String, Object> event = baseEvent("advanced");
            event.put("duration", 0.0);
            event.put("position", startMs / 1000.0);
            emit(event);
        }
        maybeAppendNext();
    }

    private void restartProgressLoop() {
        mainHandler.removeCallbacks(progressRunnable);
        mainHandler.postDelayed(progressRunnable, 500);
    }

    // ---- USB / helpers ----

    private boolean hasUsbOutput() {
        return hasUsbOutput(this);
    }

    private static boolean hasUsbOutput(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
        AudioManager audioManager = context.getSystemService(AudioManager.class);
        if (audioManager == null) return false;
        for (AudioDeviceInfo device : audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int type = device.getType();
            if (type == AudioDeviceInfo.TYPE_USB_DEVICE
                    || type == AudioDeviceInfo.TYPE_USB_HEADSET
                    || type == AudioDeviceInfo.TYPE_USB_ACCESSORY) return true;
        }
        return false;
    }

    private void applyUsbExclusive(boolean enabled) {
        AudioManager audioManager = getSystemService(AudioManager.class);
        if (audioManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (!enabled) {
            if (usbFocusRequest != null) audioManager.abandonAudioFocusRequest(usbFocusRequest);
            usbFocusRequest = null;
            usbExclusiveEnabled = false;
            return;
        }
        if (!hasUsbOutput()) {
            usbExclusiveEnabled = false;
            return;
        }
        android.media.AudioAttributes focusAttributes = new android.media.AudioAttributes.Builder()
                .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
        usbFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                .setAudioAttributes(focusAttributes)
                .setOnAudioFocusChangeListener(usbFocusListener)
                .build();
        usbExclusiveEnabled = audioManager.requestAudioFocus(usbFocusRequest)
                == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void runOnMain(Runnable runnable) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            runnable.run();
        } else {
            mainHandler.post(runnable);
        }
    }

    private double safePosition() {
        return player != null ? player.getCurrentPosition() / 1000.0 : 0.0;
    }

    private void appendAudioFormat(Map<String, Object> event) {
        if (player == null) return;
        androidx.media3.common.Format format = player.getAudioFormat();
        if (format == null) return;
        // Source encoding parameters, not the resampled PCM output or download speed.
        if (format.sampleMimeType != null) event.put("audioFormat", format.sampleMimeType);
        long measuredBitrate = bitrateMeter.bitrateAt(player.getCurrentPosition());
        if (measuredBitrate > 0) {
            lastMeasuredBitrate = measuredBitrate;
        } else if (lastMeasuredBitrate <= 0 && format.bitrate > 0) {
            // Container metadata is a useful fallback until enough frames have
            // been parsed (and after the WebView resumes from the background).
            lastMeasuredBitrate = format.bitrate;
        }
        if (lastMeasuredBitrate > 0) event.put("bitrate", (double) lastMeasuredBitrate);
        if (format.sampleRate > 0) event.put("sampleRate", (double) format.sampleRate);
    }

    private double safeDuration() {
        if (player == null) return 0.0;
        long duration = player.getDuration();
        return duration == C.TIME_UNSET || duration <= 0 ? 0.0 : duration / 1000.0;
    }

    private String currentTrackId() {
        ExoPlayer activePlayer = player;
        if (activePlayer != null && activePlayer.getCurrentMediaItem() != null) {
            return trackIdOf(activePlayer.getCurrentMediaItem());
        }
        return "";
    }

    private static String trackIdOf(MediaItem item) {
        MediaMetadata metadata = item.mediaMetadata;
        Bundle extras = metadata != null ? metadata.extras : null;
        return extras != null ? extras.getString("trackId", "") : "";
    }

    private static int queuePositionOf(MediaItem item) {
        MediaMetadata metadata = item.mediaMetadata;
        Bundle extras = metadata != null ? metadata.extras : null;
        return extras != null ? extras.getInt("queuePos", -1) : -1;
    }

    private static double clampVolume(double volume) {
        return Math.max(0.0, Math.min(1.0, volume));
    }

    private static double clampSpeed(double speed) {
        return Math.max(0.5, Math.min(3.0, speed));
    }

    private void ensureEqualizer() {
        if (equalizer != null || player == null) return;
        try {
            int sessionId = player.getAudioSessionId();
            if (sessionId == 0) return;
            equalizer = new Equalizer(0, sessionId);
            equalizer.setEnabled(true);
        } catch (Throwable error) {
            equalizer = null;
            android.util.Log.w("AriaEqualizer", "unavailable", error);
        }
    }

    private void applyEqualizerPreset(int preset) {
        ensureEqualizer();
        if (equalizer == null) return;
        try {
            if (preset < 0) {
                equalizer.setEnabled(false);
                return;
            }
            short count = equalizer.getNumberOfPresets();
            if (preset >= count) return;
            equalizer.setEnabled(true);
            equalizer.usePreset((short) preset);
        } catch (Throwable error) {
            android.util.Log.w("AriaEqualizer", "preset failed: " + preset, error);
        }
    }

    private Map<String, Object> baseEvent(String kind) {
        Map<String, Object> event = new HashMap<>();
        event.put("kind", kind);
        String trackId = "";
        String requestId = "";
        int queuePosition = -1;
        MediaItem item = player != null ? player.getCurrentMediaItem() : null;
        if (item != null) {
            trackId = trackIdOf(item);
            Bundle itemExtras = item.mediaMetadata != null ? item.mediaMetadata.extras : null;
            if (itemExtras != null) {
                requestId = itemExtras.getString("requestId", "");
                queuePosition = itemExtras.getInt("queuePos", -1);
            }
        }
        event.put("trackId", trackId);
        event.put("requestId", requestId);
        event.put("queuePosition", queuePosition);
        return event;
    }

    private void emit(Map<String, Object> event) {
        EventSink sink = eventSink;
        if (sink != null) sink.emit(event);
    }
}
