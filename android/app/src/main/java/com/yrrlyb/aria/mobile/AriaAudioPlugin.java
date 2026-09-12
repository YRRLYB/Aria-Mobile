package com.yrrlyb.aria.mobile;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Map;

/**
 * Bridge between the JS audio engine and {@link AriaPlaybackService}.
 * Method names intentionally mirror the desktop nativeAudio surface so the
 * mobile shell can switch between the WebView &lt;audio&gt; fallback and this
 * native foreground-service engine with a thin adapter.
 */
@CapacitorPlugin(name = "AriaAudio")
public class AriaAudioPlugin extends Plugin {

    private static final int NOTIFICATION_PERMISSION_REQUEST = 4711;

    private final AriaPlaybackService.EventSink eventSink = event -> {
        if (getBridge() == null || getBridge().getActivity() == null) return;
        getBridge().getActivity().runOnUiThread(() -> {
            JSObject payload = new JSObject();
            for (Map.Entry<String, Object> entry : event.entrySet()) {
                Object value = entry.getValue();
                if (value instanceof Double) {
                    payload.put(entry.getKey(), (Double) value);
                } else if (value instanceof Long) {
                    payload.put(entry.getKey(), (Long) value);
                } else if (value instanceof Boolean) {
                    payload.put(entry.getKey(), (Boolean) value);
                } else if (value instanceof String) {
                    payload.put(entry.getKey(), (String) value);
                } else if (value == null) {
                    payload.put(entry.getKey(), null);
                }
            }
            notifyListeners("audioEvent", payload);
        });
    };

    @Override
    public void load() {
        AriaPlaybackService.setEventSink(eventSink);
    }

    @PluginMethod
    public void load(PluginCall call) {
        Bundle bundle = new Bundle();
        bundle.putString("url", orEmpty(call.getString("url")));
        bundle.putString("trackId", orEmpty(call.getString("trackId")));
        bundle.putString("title", orEmpty(call.getString("title")));
        bundle.putString("artist", orEmpty(call.getString("artist")));
        bundle.putString("album", orEmpty(call.getString("album")));
        bundle.putString("artworkUrl", orEmpty(call.getString("artworkUrl")));
        bundle.putDouble("position", call.getDouble("position", 0.0));
        bundle.putDouble("volume", call.getDouble("volume", 1.0));
        bundle.putBoolean("paused", Boolean.TRUE.equals(call.getBoolean("paused", false)));
        AriaPlaybackService.startWithLoad(getContext(), bundle);
        call.resolve();
    }

    @PluginMethod
    public void loadNext(PluginCall call) {
        Bundle bundle = new Bundle();
        bundle.putString("url", orEmpty(call.getString("url")));
        bundle.putString("trackId", orEmpty(call.getString("trackId")));
        bundle.putString("title", orEmpty(call.getString("title")));
        bundle.putString("artist", orEmpty(call.getString("artist")));
        bundle.putString("album", orEmpty(call.getString("album")));
        bundle.putString("artworkUrl", orEmpty(call.getString("artworkUrl")));
        AriaPlaybackService.appendNext(bundle);
        call.resolve();
    }

    @PluginMethod
    public void setPaused(PluginCall call) {
        boolean paused = Boolean.TRUE.equals(call.getBoolean("paused", false));
        AriaPlaybackService.withPlayer(player -> player.setPlayWhenReady(!paused));
        call.resolve();
    }

    @PluginMethod
    public void seek(PluginCall call) {
        double position = call.getDouble("position", 0.0);
        AriaPlaybackService.withPlayer(player -> player.seekTo((long) (position * 1000)));
        call.resolve();
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        double volume = call.getDouble("volume", 1.0);
        AriaPlaybackService.withPlayer(player -> player.setVolume((float) Math.max(0.0, Math.min(1.0, volume))));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        AriaPlaybackService.withPlayer(player -> {
            player.stop();
            player.clearMediaItems();
        });
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject state = new JSObject();
        state.put("active", false);
        state.put("position", 0.0);
        state.put("duration", 0.0);
        state.put("paused", true);
        state.put("trackId", null);
        AriaPlaybackService.withPlayer(player -> {
            state.put("active", player.getCurrentMediaItem() != null);
            state.put("position", player.getCurrentPosition() / 1000.0);
            long duration = player.getDuration();
            state.put("duration", duration <= 0 ? 0.0 : duration / 1000.0);
            state.put("paused", !player.getPlayWhenReady());
            androidx.media3.common.MediaItem item = player.getCurrentMediaItem();
            if (item != null && item.mediaMetadata != null && item.mediaMetadata.extras != null) {
                state.put("trackId", item.mediaMetadata.extras.getString("trackId"));
            }
        });
        call.resolve(state);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        if (getBridge() == null || getBridge().getActivity() == null) {
            JSObject result = new JSObject();
            result.put("granted", false);
            call.resolve(result);
            return;
        }
        ActivityCompat.requestPermissions(
                getBridge().getActivity(),
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                NOTIFICATION_PERMISSION_REQUEST);
        call.resolve();
    }

    private static String orEmpty(String value) {
        return value != null ? value : "";
    }
}
