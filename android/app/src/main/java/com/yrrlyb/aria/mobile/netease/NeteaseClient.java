package com.yrrlyb.aria.mobile.netease;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * One method per NetEase endpoint, mirroring the desktop module list in
 * NETEASE_API.md (which also documents uri/crypto/data for each). Raw
 * JSONObject responses flow to the JS layer, which maps them into the
 * desktop ProviderTrack shapes — keeping this layer dumb keeps the golden
 * surface small.
 */
public final class NeteaseClient {
    private static final long DAY = 24L * 60 * 60 * 1000;

    private NeteaseClient() {
    }

    // ---- Login (works without a session) ----

    /** QR key: body.data.unikey. */
    public static JSONObject loginQrKey(Context context) throws NeteaseHttp.NeteaseException {
        try {
            return NeteaseHttp.request(context, "/api/login/qrcode/unikey", new JSONObject().put("type", 3), "eapi");
        } catch (JSONException error) {
            throw new NeteaseHttp.NeteaseException(500, "loginQrKey build failed");
        }
    }

    public static class QrCheckResult {
        public final int code; // 800 expired, 801 waiting, 802 scanned, 803 confirmed
        public final JSONObject body;

        public QrCheckResult(int code, JSONObject body) {
            this.code = code;
            this.body = body;
        }
    }

    /** QR poll; on 803 the returned cookie is persisted into the session. */
    public static QrCheckResult loginQrCheck(Context context, String key) throws NeteaseHttp.NeteaseException {
        JSONObject data;
        try {
            data = new JSONObject().put("key", key).put("type", 3);
        } catch (JSONException error) {
            throw new NeteaseHttp.NeteaseException(500, "loginQrCheck build failed");
        }
        JSONObject body = NeteaseHttp.request(context, "/api/login/qrcode/client/login", data, "eapi");
        int code = body.optInt("code", 801);
        if (code == 803) {
            // The credential lives in the response Set-Cookie headers (the
            // Node module reads result.cookie exactly like this).
            String cookie = NeteaseHttp.cookieFromLastResponse();
            if (cookie.isEmpty()) {
                cookie = body.optString("cookie", "");
            }
            if (cookie.isEmpty()) {
                cookie = cookieFromJsonArray(body.optJSONArray("cookies"));
            }
            long userId = 0;
            String nickname = "";
            String avatar = "";
            JSONObject account = body.optJSONObject("account");
            if (account != null) userId = account.optLong("id", 0);
            JSONObject profile = body.optJSONObject("profile");
            if (profile != null) {
                nickname = profile.optString("nickname", "");
                avatar = profile.optString("avatarUrl", "");
            }
            NeteaseSession.save(context, cookie, userId, nickname, avatar);
        }
        return new QrCheckResult(code, body);
    }

    private static String cookieFromJsonArray(JSONArray cookies) {
        if (cookies == null) return "";
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < cookies.length(); i++) {
            org.json.JSONObject entry = cookies.optJSONObject(i);
            if (entry == null) continue;
            String name = entry.optString("name", "");
            String value = entry.optString("value", "");
            if (name.isEmpty()) continue;
            if (out.length() > 0) out.append("; ");
            out.append(name).append('=').append(value);
        }
        return out.toString();
    }

    /**
     * Phone-number + password login (weapi /api/w/login/cellphone). The
     * password is MD5-digested here; the raw value is never stored. Returns
     * the raw body so callers can surface code/message.
     */
    /** Sends an SMS captcha (weapi /api/sms/captcha/sent). */
    public static JSONObject captchaSent(Context context, String phone, String countryCode)
            throws NeteaseHttp.NeteaseException {
        JSONObject data;
        try {
            data = new JSONObject()
                    .put("ctcode", countryCode == null || countryCode.isEmpty() ? "86" : countryCode)
                    .put("secrete", "music_middleuser_pclogin")
                    .put("cellphone", phone);
        } catch (JSONException error) {
            throw new NeteaseHttp.NeteaseException(500, "captchaSent build failed");
        }
        return NeteaseHttp.request(context, "/api/sms/captcha/sent", data, "weapi");
    }

    /** Password or SMS-captcha login — exactly one of password/captcha is used. */
    public static JSONObject loginCellphone(Context context, String phone, String password, String captcha,
            String countryCode) throws NeteaseHttp.NeteaseException {
        JSONObject data;
        try {
            data = new JSONObject()
                    .put("type", "1")
                    .put("https", "true")
                    .put("phone", phone)
                    .put("countrycode", countryCode == null || countryCode.isEmpty() ? "86" : countryCode);
            if (captcha != null && !captcha.isEmpty()) {
                data.put("captcha", captcha);
            } else {
                data.put("password", NeteaseCrypto.md5Hex(password == null ? "" : password));
            }
            data.put("remember", "true");
        } catch (JSONException error) {
            throw new NeteaseHttp.NeteaseException(500, "loginCellphone build failed");
        }
        JSONObject body = NeteaseHttp.request(context, "/api/w/login/cellphone", data, "weapi");
        if (body.optInt("code", 0) == 200) {
            String cookie = NeteaseHttp.cookieFromLastResponse();
            long userId = 0;
            String nickname = "";
            String avatar = "";
            JSONObject account = body.optJSONObject("account");
            if (account != null) userId = account.optLong("id", 0);
            JSONObject profile = body.optJSONObject("profile");
            if (profile != null) {
                nickname = profile.optString("nickname", "");
                avatar = profile.optString("avatarUrl", "");
            }
            NeteaseSession.save(context, cookie, userId, nickname, avatar);
        }
        return body;
    }

    public static void logout(Context context) {
        NeteaseHttp.clearCache();
        NeteaseSession.clear(context);
    }

    // ---- Account ----

    /** Refreshes the cached account summary; returns the raw profile body. */
    public static JSONObject userAccount(Context context) throws NeteaseHttp.NeteaseException {
        JSONObject body = NeteaseHttp.request(context, "/api/nuser/account/get", new JSONObject(), "weapi");
        JSONObject profile = body.optJSONObject("profile");
        if (profile != null) {
            long userId = body.optJSONObject("account") != null
                    ? body.optJSONObject("account").optLong("id", 0)
                    : profile.optLong("userId", 0);
            NeteaseSession.updateAccount(context, userId, profile.optString("nickname", ""), profile.optString("avatarUrl", ""));
        }
        return body;
    }

    // ---- Library pools ----

    /** Liked song id list (unordered; up to ~2000 with cookie paging done upstream). */
    public static JSONObject likedIds(Context context) throws NeteaseHttp.NeteaseException {
        try {
            return NeteaseHttp.request(context, "/api/song/like/get",
                    new JSONObject().put("uid", NeteaseSession.userId(context)), "eapi");
        } catch (JSONException error) {
            throw new NeteaseHttp.NeteaseException(500, "likedIds build failed");
        }
    }

    /** Daily recommendations: body.data.dailySongs. */
    public static JSONObject dailySongs(Context context) throws NeteaseHttp.NeteaseException {
        return NeteaseHttp.cachedRequest(context, "daily", 5 * 60_000L,
                "/api/v3/discovery/recommend/songs", new JSONObject(), "weapi");
    }

    /** Personal FM: body.data[]. */
    public static JSONObject personalFm(Context context) throws NeteaseHttp.NeteaseException {
        return NeteaseHttp.request(context, "/api/v1/radio/get", new JSONObject(), "weapi");
    }

    /** User playlists (large limit; desktop caps display anyway). */
    public static JSONObject userPlaylists(Context context) throws NeteaseHttp.NeteaseException {
        JSONObject data;
        try {
            data = new JSONObject()
                    .put("uid", NeteaseSession.userId(context))
                    .put("limit", 1000)
                    .put("offset", 0)
                    .put("includeVideo", true);
        } catch (JSONException error) {
            throw new NeteaseHttp.NeteaseException(500, "userPlaylists build failed");
        }
        return NeteaseHttp.cachedRequest(context, "playlists", 10 * 60_000L, "/api/user/playlist", data, "weapi");
    }

    /** Playlist tracks: v6 detail for ids then v3 song detail for the page. */
    public static JSONObject playlistTracks(Context context, long playlistId) throws NeteaseHttp.NeteaseException {
        try {
            JSONObject detailData = new JSONObject().put("id", playlistId).put("n", 100000).put("s", 8);
            JSONObject detail = NeteaseHttp.cachedRequest(context, "pl:" + playlistId, DAY,
                    "/api/v6/playlist/detail", detailData, "eapi");
            JSONArray trackIds = detail.optJSONObject("playlist") != null
                    ? detail.optJSONObject("playlist").optJSONArray("trackIds")
                    : null;
            if (trackIds == null) return detail;

            StringBuilder ids = new StringBuilder("[");
            for (int i = 0; i < trackIds.length(); i++) {
                if (i > 0) ids.append(',');
                JSONObject entry = trackIds.optJSONObject(i);
                ids.append("{\"id\":").append(entry != null ? entry.optLong("id") : trackIds.optLong(i)).append('}');
            }
            ids.append(']');
            JSONObject songsData = new JSONObject().put("c", ids.toString());
            return NeteaseHttp.cachedRequest(context, "pl-tracks:" + playlistId, 60 * 60_000L,
                    "/api/v3/song/detail", songsData, "eapi");
        } catch (JSONException error) {
            throw new NeteaseHttp.NeteaseException(500, "playlistTracks build failed");
        }
    }

    // ---- Discovery ----

    public static JSONObject search(Context context, String keyword, int type, int limit) throws NeteaseHttp.NeteaseException {
        JSONObject data;
        try {
            data = new JSONObject()
                    .put("s", keyword)
                    .put("type", type)
                    .put("limit", limit)
                    .put("offset", 0)
                    .put("total", true);
        } catch (JSONException error) {
            throw new NeteaseHttp.NeteaseException(500, "search build failed");
        }
        return NeteaseHttp.cachedRequest(context, "search:" + type + ":" + limit + ":" + keyword, 5 * 60_000L,
                "/api/cloudsearch/pc", data, "eapi");
    }

    public static JSONObject lyric(Context context, long songId) throws NeteaseHttp.NeteaseException {
        JSONObject data;
        try {
            data = new JSONObject()
                    .put("id", songId)
                    .put("tv", -1).put("lv", -1).put("rv", -1).put("kv", -1)
                    .put("_nmclfl", 1);
        } catch (JSONException error) {
            throw new NeteaseHttp.NeteaseException(500, "lyric build failed");
        }
        return NeteaseHttp.cachedRequest(context, "lyric:" + songId, DAY, "/api/song/lyric", data, "eapi");
    }

    // ---- Playback ----

    /**
     * Stream URL + real quality for one song. level: standard/exhigh/
     * lossless/hires/jymaster. body.data[0] carries url/br/level/...
     */
    public static JSONObject songUrlV1(Context context, long songId, String level) throws NeteaseHttp.NeteaseException {
        JSONObject data;
        try {
            data = new JSONObject()
                    .put("ids", "[" + songId + "]")
                    .put("level", level)
                    .put("encodeType", "flac");
        } catch (JSONException error) {
            throw new NeteaseHttp.NeteaseException(500, "songUrlV1 build failed");
        }
        return NeteaseHttp.cachedRequest(context, "url:" + songId + ":" + level, 25 * 60_000L,
                "/api/song/enhance/player/url/v1", data, "eapi");
    }

    public static JSONObject setLike(Context context, long songId, boolean like) throws NeteaseHttp.NeteaseException {
        JSONObject data;
        try {
            data = new JSONObject()
                    .put("alg", "itembased")
                    .put("trackId", songId)
                    .put("like", like)
                    .put("time", "3");
        } catch (JSONException error) {
            throw new NeteaseHttp.NeteaseException(500, "setLike build failed");
        }
        JSONObject body = NeteaseHttp.request(context, "/api/radio/like", data, "weapi");
        NeteaseHttp.clearCache();
        return body;
    }

    /** Batch song detail (weapi /api/v3/song/detail), chunked by 500 ids. */
    public static JSONObject songDetail(Context context, long[] ids) throws NeteaseHttp.NeteaseException {
        JSONArray merged = new JSONArray();
        for (int start = 0; start < ids.length; start += 500) {
            StringBuilder c = new StringBuilder("[");
            for (int i = start; i < Math.min(start + 500, ids.length); i++) {
                if (i > start) c.append(',');
                c.append("{\"id\":").append(ids[i]).append('}');
            }
            c.append(']');
            JSONObject data;
            try {
                data = new JSONObject().put("c", c.toString());
            } catch (JSONException error) {
                throw new NeteaseHttp.NeteaseException(500, "songDetail build failed");
            }
            JSONObject body = NeteaseHttp.cachedRequest(context, "detail:" + start + ":" + ids.length,
                    30 * 60_000L, "/api/v3/song/detail", data, "weapi");
            JSONArray songs = body.optJSONArray("songs");
            if (songs != null) {
                for (int i = 0; i < songs.length(); i++) {
                    try {
                        merged.put(songs.get(i));
                    } catch (JSONException ignored) {
                    }
                }
            }
        }
        JSONObject out = new JSONObject();
        try {
            out.put("songs", merged);
        } catch (JSONException ignored) {
        }
        return out;
    }

    /** Artist top songs (weapi /api/artist/top/song). */
    public static JSONObject artistTopSongs(Context context, long artistId) throws NeteaseHttp.NeteaseException {
        JSONObject data;
        try {
            data = new JSONObject().put("id", artistId);
        } catch (JSONException error) {
            throw new NeteaseHttp.NeteaseException(500, "artistTopSongs build failed");
        }
        return NeteaseHttp.request(context, "/api/artist/top/song", data, "weapi");
    }
}
