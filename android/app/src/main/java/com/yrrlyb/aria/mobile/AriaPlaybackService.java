package com.yrrlyb.aria.mobile;

import android.content.Context;
import android.content.Intent;
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
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;

import java.util.HashMap;
import java.util.Map;

/**
 * Foreground playback service: Media3 ExoPlayer + MediaSession.
 *
 * Owns the notification/lock-screen media card and reliable background
 * playback (the WebView cannot keep audio alive once it is killed). The
 * plugin drives it through static entry points; playback events travel back
 * through {@link EventSink} as plain maps so the Capacitor layer stays
 * dependency-free.
 */
public class AriaPlaybackService extends MediaSessionService {

    public static final String ACTION_LOAD = "com.yrrlyb.aria.mobile.action.LOAD";
    private static final String CHANNEL_ID = "aria_playback";
    private static final int TEMP_NOTIFICATION_ID = 42;

    public interface EventSink {
        void emit(Map<String, Object> event);
    }

    private static volatile AriaPlaybackService instance;
    private static volatile EventSink eventSink;

    private ExoPlayer player;
    private MediaSession session;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    // True while our placeholder notification owns the foreground slot. The
    // system gives a startForegroundService() call ~5s to reach
    // startForeground() or it kills the process — rapid track switching with
    // a slow LAN stream used to hit exactly that. We now promote immediately
    // on the LOAD intent and hand the slot back once media3's media
    // notification can take over (playback READY).
    private boolean tempForeground = false;

    private final Player.Listener playerListener = new Player.Listener() {
        @Override
        public void onPlaybackStateChanged(int playbackState) {
            if (playbackState == Player.STATE_READY) {
                releaseTempForeground();
                Map<String, Object> event = baseEvent("loaded");
                event.put("duration", safeDuration());
                event.put("position", safePosition());
                emit(event);
            } else if (playbackState == Player.STATE_ENDED) {
                emit(baseEvent("ended"));
            }
        }

        @Override
        public void onIsPlayingChanged(boolean isPlaying) {
            android.util.Log.i("AriaPlayback", "playing=" + isPlaying + " trackId=" + currentTrackId());
            Map<String, Object> event = baseEvent("state");
            event.put("playing", isPlaying);
            emit(event);
        }

        @Override
        public void onMediaItemTransition(MediaItem mediaItem, int reason) {
            if (mediaItem == null) return;
            // AUTO = gapless advance to the item appended via loadNext();
            // the JS layer adopts the new track id so queue UI follows.
            Map<String, Object> event = baseEvent("advanced");
            event.put("trackId", trackIdOf(mediaItem));
            event.put("duration", safeDuration());
            emit(event);
        }

        @Override
        public void onPlayerError(PlaybackException error) {
            releaseTempForeground();
            Map<String, Object> event = baseEvent("error");
            event.put("message", error != null ? String.valueOf(error.getMessage()) : "unknown playback error");
            emit(event);
        }
    };

    private final Runnable progressRunnable = new Runnable() {
        @Override
        public void run() {
            ExoPlayer activePlayer = player;
            if (activePlayer != null) {
                Map<String, Object> event = baseEvent("progress");
                event.put("position", safePosition());
                event.put("duration", safeDuration());
                emit(event);
                mainHandler.postDelayed(this, 500);
            }
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
        player = new ExoPlayer.Builder(this)
                .setAudioAttributes(audioAttributes, true)
                .setHandleAudioBecomingNoisy(true)
                .setWakeMode(C.WAKE_MODE_NETWORK)
                .build();
        player.addListener(playerListener);
        // Tapping the lockscreen / notification media card opens the app.
        PendingIntent sessionActivity = PendingIntent.getActivity(
                this,
                0,
                new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaSession.Builder(this, player)
                .setSessionActivity(sessionActivity)
                .build();
        instance = this;
    }

    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_LOAD.equals(intent.getAction()) && intent.getExtras() != null) {
            // Promote to foreground right away: rapid LOAD intents must never
            // depend on the stream actually starting within the system's
            // foreground-service grace period (miss it and the process is
            // killed — the "crash when tapping fast" bug).
            ensureTempForeground();
            applyLoad(intent.getExtras());
        }
        return super.onStartCommand(intent, flags, startId);
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
        instance = null;
        releaseTempForeground();
        if (session != null) {
            session.release();
            session = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        ExoPlayer activePlayer = player;
        if (activePlayer == null || !activePlayer.isPlaying()) {
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

    // ---- Payload application ----

    private void applyLoad(Bundle extras) {
        runOnMain(() -> {
            android.util.Log.i("AriaPlayback", "applyLoad trackId=" + extras.getString("trackId", "")
                    + " url=" + extras.getString("url", "")
                    + " paused=" + extras.getBoolean("paused", false));
            MediaItem item = buildItem(extras);
            double position = extras.getDouble("position", 0.0);
            long startPosition = position > 0.1 ? (long) (position * 1000) : C.TIME_UNSET;
            player.setMediaItem(item, startPosition);
            player.setVolume((float) clampVolume(extras.getDouble("volume", 1.0)));
            player.prepare();
            player.setPlayWhenReady(!extras.getBoolean("paused", false));
            restartProgressLoop();
        });
    }

    static void appendNext(Bundle extras) {
        AriaPlaybackService service = instance;
        if (service == null) return;
        service.runOnMain(() -> {
            if (service.player == null) return;
            service.player.addMediaItem(service.buildItem(extras));
        });
    }

    private MediaItem buildItem(Bundle extras) {
        String trackId = extras.getString("trackId", "");
        Bundle itemExtras = new Bundle();
        itemExtras.putString("trackId", trackId);

        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                .setTitle(extras.getString("title", ""))
                .setArtist(extras.getString("artist", ""))
                .setAlbumTitle(extras.getString("album", ""))
                .setExtras(itemExtras);
        String artworkUrl = extras.getString("artworkUrl", "");
        if (artworkUrl != null && !artworkUrl.isEmpty()) {
            metadata.setArtworkUri(Uri.parse(artworkUrl));
        }

        return new MediaItem.Builder()
                .setUri(extras.getString("url", ""))
                .setMediaMetadata(metadata.build())
                .build();
    }

    private void restartProgressLoop() {
        mainHandler.removeCallbacks(progressRunnable);
        mainHandler.postDelayed(progressRunnable, 500);
    }

    // ---- Helpers ----

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

    private static double clampVolume(double volume) {
        return Math.max(0.0, Math.min(1.0, volume));
    }

    private Map<String, Object> baseEvent(String kind) {
        AriaPlaybackService service = instance;
        String currentTrackId = "";
        if (service != null && service.player != null && service.player.getCurrentMediaItem() != null) {
            currentTrackId = trackIdOf(service.player.getCurrentMediaItem());
        }
        Map<String, Object> event = new HashMap<>();
        event.put("kind", kind);
        event.put("trackId", currentTrackId);
        return event;
    }

    private void emit(Map<String, Object> event) {
        EventSink sink = eventSink;
        if (sink != null) sink.emit(event);
    }
}
