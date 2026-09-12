package com.yrrlyb.aria.mobile.netease;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * JS bridge for direct NetEase access. All network work runs off the main
 * thread; results are plain JSONObjects the web layer maps into the desktop
 * ProviderTrack shapes (see src/native/neteaseDirect.ts).
 */
@CapacitorPlugin(name = "NeteaseDirect")
public class NeteaseDirectPlugin extends Plugin {

    private final ExecutorService executor = java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "netease-direct");
        thread.setDaemon(true);
        return thread;
    });

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("loggedIn", NeteaseSession.isLoggedIn(getContext()));
        result.put("userId", NeteaseSession.userId(getContext()));
        result.put("nickname", NeteaseSession.nickname(getContext()));
        result.put("avatarUrl", NeteaseSession.avatarUrl(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void loginQrStart(PluginCall call) {
        executor.execute(() -> {
            try {
                JSONObject keyBody = NeteaseClient.loginQrKey(getContext());
                String unikey = keyBody.optJSONObject("data") != null
                        ? keyBody.optJSONObject("data").optString("unikey", "")
                        : "";
                JSObject result = new JSObject();
                result.put("ok", !unikey.isEmpty());
                result.put("key", unikey);
                result.put("qrUrl", "https://music.163.com/login?codekey=" + unikey);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("loginQrStart failed", String.valueOf(error.getMessage()));
            }
        });
    }

    @PluginMethod
    public void loginQrCheck(PluginCall call) {
        String key = call.getString("key", "");
        if (key.isEmpty()) {
            call.reject("key is required");
            return;
        }
        executor.execute(() -> {
            try {
                NeteaseClient.QrCheckResult result = NeteaseClient.loginQrCheck(getContext(), key);
                JSObject out = new JSObject();
                out.put("code", result.code);
                out.put("loggedIn", result.code == 803);
                if (result.code == 803) {
                    out.put("nickname", NeteaseSession.nickname(getContext()));
                    out.put("avatarUrl", NeteaseSession.avatarUrl(getContext()));
                }
                call.resolve(out);
            } catch (Exception error) {
                call.reject("loginQrCheck failed", String.valueOf(error.getMessage()));
            }
        });
    }

    @PluginMethod
    public void logout(PluginCall call) {
        NeteaseClient.logout(getContext());
        call.resolve();
    }

    /**
     * Generic endpoint dispatcher. `endpoint` matches the method list in
     * NETEASE_API.md; `dataJson` carries endpoint arguments. Returns the raw
     * body JSON so the JS mapper stays the single place that knows shapes.
     */
    @PluginMethod
    public void invoke(PluginCall call) {
        String endpoint = call.getString("endpoint", "");
        String dataJson = call.getString("data", "{}");
        executor.execute(() -> {
            try {
                org.json.JSONObject body = dispatch(endpoint, new org.json.JSONObject(dataJson));
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("data", JSObject.fromJSONObject(body));
                call.resolve(result);
            } catch (NeteaseHttp.NeteaseException error) {
                JSObject result = new JSObject();
                result.put("ok", false);
                result.put("code", error.code);
                result.put("message", String.valueOf(error.getMessage()));
                call.resolve(result);
            } catch (Exception error) {
                call.reject(endpoint + " failed", String.valueOf(error.getMessage()));
            }
        });
    }

    private org.json.JSONObject dispatch(String endpoint, org.json.JSONObject data) throws Exception {
        switch (endpoint) {
            case "userAccount":
                return NeteaseClient.userAccount(getContext());
            case "likedIds":
                return NeteaseClient.likedIds(getContext());
            case "dailySongs":
                return NeteaseClient.dailySongs(getContext());
            case "personalFm":
                return NeteaseClient.personalFm(getContext());
            case "userPlaylists":
                return NeteaseClient.userPlaylists(getContext());
            case "playlistTracks":
                return NeteaseClient.playlistTracks(getContext(), data.optLong("id", 0));
            case "search":
                return NeteaseClient.search(getContext(), data.optString("keyword", ""),
                        data.optInt("type", 1), data.optInt("limit", 30));
            case "lyric":
                return NeteaseClient.lyric(getContext(), data.optLong("id", 0));
            case "songUrlV1":
                return NeteaseClient.songUrlV1(getContext(), data.optLong("id", 0), data.optString("level", "lossless"));
            case "setLike":
                return NeteaseClient.setLike(getContext(), data.optLong("id", 0), data.optBoolean("like", true));
            case "songDetail": {
                org.json.JSONArray ids = data.optJSONArray("ids");
                long[] parsed = new long[ids == null ? 0 : ids.length()];
                for (int i = 0; i < parsed.length; i++) parsed[i] = ids != null ? ids.optLong(i, 0) : 0;
                return NeteaseClient.songDetail(getContext(), parsed);
            }
            case "artistTopSongs":
                return NeteaseClient.artistTopSongs(getContext(), data.optLong("id", 0));
            default:
                throw new NeteaseHttp.NeteaseException(400, "unknown endpoint: " + endpoint);
        }
    }
}
