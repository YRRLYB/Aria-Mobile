package com.yrrlyb.aria.mobile;

import android.content.Context;
import android.content.Intent;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.content.IntentFilter;
import android.content.BroadcastReceiver;
import android.app.KeyguardManager;
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
import androidx.media3.exoplayer.DefaultLoadControl;
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
    private static volatile boolean requestedUsbExclusive = false;

    private ExoPlayer player;
    private AudioBitrateMeter bitrateMeter = new AudioBitrateMeter();
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
            } else if (playbackState == Player.STATE_ENDED) {
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
        }

        @Override
        public void onMediaItemTransition(MediaItem mediaItem, int reason) {
            if (mediaItem == null || reason != Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) return;
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
                if (activePlayer.getPlaybackState() == Player.STATE_READY) appendAudioFormat(event);
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
        unregisterReceiver(screenReceiver);
        LockPlayerActivity.dismiss();
        mainHandler.removeCallbacks(progressRunnable);
        applyUsbExclusive(false);
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
        // isPlaying() is false while a network item is buffering. Stopping the
        // service at that moment is why background playback often survived one
        // song and then became silent.
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
        if (service != null) service.runOnMain(() -> service.emit(service.baseEvent(next ? "next" : "previous")));
    }

    static void requestLike() {
        AriaPlaybackService service = instance;
        if (service != null) service.runOnMain(() -> service.emit(service.baseEvent("like")));
    }

    // ---- Payload application ----

    private void applyLoad(Bundle extras) {
        runOnMain(() -> {
            android.util.Log.i("AriaPlayback", "applyLoad trackId=" + extras.getString("trackId", "")
                    + " requestId=" + extras.getString("requestId", "")
                    + " paused=" + extras.getBoolean("paused", false));
            MediaItem item = buildItem(extras);
            double position = extras.getDouble("position", 0.0);
            long startPosition = position > 0.1 ? (long) (position * 1000) : C.TIME_UNSET;
            bitrateMeter = new AudioBitrateMeter();
            androidx.media3.exoplayer.source.DefaultMediaSourceFactory sourceFactory =
                    new androidx.media3.exoplayer.source.DefaultMediaSourceFactory(this, new MeasuredExtractorsFactory(bitrateMeter));
            player.setMediaSource(sourceFactory.createMediaSource(item), startPosition);
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

    private MediaItem buildItem(Bundle extras) {
        String trackId = extras.getString("trackId", "");
        Bundle itemExtras = new Bundle();
        itemExtras.putString("trackId", trackId);
        itemExtras.putString("requestId", extras.getString("requestId", ""));

        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                .setTitle(extras.getString("title", ""))
                .setArtist(extras.getString("artist", ""))
                .setAlbumTitle(extras.getString("album", ""))
                .setExtras(itemExtras);
        String artworkUrl = extras.getString("artworkUrl", "");
        if (artworkUrl != null && !artworkUrl.isEmpty()) {
            metadata.setArtworkUri(Uri.parse(artworkUrl));
            LockPlayerActivity.prepareArtwork(this, artworkUrl);
        }

        return new MediaItem.Builder()
                .setMediaId(trackId)
                .setUri(extras.getString("url", ""))
                .setMediaMetadata(metadata.build())
                .build();
    }

    private void restartProgressLoop() {
        mainHandler.removeCallbacks(progressRunnable);
        mainHandler.postDelayed(progressRunnable, 500);
    }

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

    private void appendAudioFormat(Map<String, Object> event) {
        androidx.media3.common.Format format = player.getAudioFormat();
        if (format == null) return;
        // Source encoding parameters, not the resampled PCM output or download speed.
        if (format.sampleMimeType != null) event.put("audioFormat", format.sampleMimeType);
        long measuredBitrate = bitrateMeter.bitrateAt(player.getCurrentPosition());
        if (measuredBitrate > 0) event.put("bitrate", (double) measuredBitrate);
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
        MediaItem item = player != null ? player.getCurrentMediaItem() : null;
        Bundle itemExtras = item != null ? item.mediaMetadata.extras : null;
        event.put("requestId", itemExtras != null ? itemExtras.getString("requestId", "") : "");
        return event;
    }

    private void emit(Map<String, Object> event) {
        EventSink sink = eventSink;
        if (sink != null) sink.emit(event);
    }
}
