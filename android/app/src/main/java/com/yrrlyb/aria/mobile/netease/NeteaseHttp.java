package com.yrrlyb.aria.mobile.netease;

import android.content.Context;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Request backbone, a faithful port of NeteaseCloudMusicApi util/request.js
 * (see NETEASE_API.md). Everything is POST + form-encoded:
 *  - weapi: https://music.163.com/weapi/<path>, params+encSecKey
 *  - eapi:  https://interface.music.163.com/eapi/<path>, params (hex frame)
 * Responses are plain JSON for this configuration (encryptResponse=false).
 * Special body codes 201/302/400/502/800/801/802/803 count as success — the
 * QR-login polling depends on that.
 */
public final class NeteaseHttp {
    public static final String DOMAIN = "https://music.163.com";
    public static final String API_DOMAIN = "https://interface.music.163.com";

    private static final String OS = "pc";
    private static final String OSVER = "Microsoft-Windows-10-Professional-build-19045-64bit";
    private static final String CHANNEL = "netease";
    private static final String APPVER = "3.1.17.204416";
    private static final String UA_WEAPI =
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";
    private static final String UA_API =
            "NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)";

    /** Cached-response entry: counts against the desktop's TTL policy. */
    private record CacheEntry(JSONObject body, long expiresAt) {
    }

    private static final ConcurrentHashMap<String, CacheEntry> CACHE = new ConcurrentHashMap<>();
    private static final SecureRandom RANDOM = new SecureRandom();

    public static class NeteaseException extends Exception {
        public final int code;

        public NeteaseException(int code, String message) {
            super(message);
            this.code = code;
        }
    }

    private NeteaseHttp() {
    }

    public static void clearCache() {
        CACHE.clear();
    }

    /** Cached request: cacheKey null/empty means do not cache. */
    public static JSONObject cachedRequest(Context context, String cacheKey, long ttlMillis, String uri, JSONObject data, String crypto) throws NeteaseException {
        if (cacheKey != null && !cacheKey.isEmpty()) {
            CacheEntry entry = CACHE.get(cacheKey);
            if (entry != null && entry.expiresAt > System.currentTimeMillis()) {
                return entry.body();
            }
        }
        JSONObject body = request(context, uri, data, crypto);
        if (cacheKey != null && !cacheKey.isEmpty()) {
            CACHE.put(cacheKey, new CacheEntry(body, System.currentTimeMillis() + ttlMillis));
        }
        return body;
    }

    public static JSONObject request(Context context, String uri, JSONObject data, String crypto) throws NeteaseException {
        return request(NeteaseSession.cookie(context), uri, data, crypto);
    }

    /** Cookie-less overload keeps the request layer runnable on the JVM (smoke tests). */
    public static JSONObject request(String rawCookie, String uri, JSONObject data, String crypto) throws NeteaseException {
        String cookie = rawCookie == null ? "" : rawCookie;
        boolean isLoginUri = uri.contains("login");
        Map<String, String> cookieMap = cookieMap(cookie, isLoginUri);
        Map<String, String> headers = new HashMap<>();
        String url;
        String body;

        if ("weapi".equals(crypto)) {
            headers.put("Referer", DOMAIN);
            headers.put("User-Agent", UA_WEAPI);
            try {
                data.put("csrf_token", cookieMap.getOrDefault("__csrf", ""));
            } catch (JSONException ignored) {
            }
            NeteaseCrypto.WeapiParams params = NeteaseCrypto.weapi(data.toString());
            body = "params=" + urlEncode(params.params()) + "&encSecKey=" + urlEncode(params.encSecKey());
            url = DOMAIN + "/weapi" + uri.substring(4);
        } else if ("eapi".equals(crypto)) {
            Map<String, String> header = eapiHeader(cookieMap);
            // Node's JSON.stringify drops undefined values from the header
            // object, but the Cookie header renders them as literal
            // "undefined" — the server checks these; omitting them 400s.
            try {
                org.json.JSONObject headerJson = new org.json.JSONObject();
                for (Map.Entry<String, String> entry : header.entrySet()) {
                    if (!"undefined".equals(entry.getValue())) {
                        headerJson.put(entry.getKey(), entry.getValue());
                    }
                }
                data.put("e_r", false);
                data.put("header", headerJson);
            } catch (JSONException error) {
                throw new NeteaseException(500, "eapi payload build failed");
            }
            headers.put("Cookie", cookieHeader(header));
            headers.put("User-Agent", UA_API);
            NeteaseCrypto.EapiParams params = NeteaseCrypto.eapi(uri, data.toString());
            body = "params=" + urlEncode(params.params());
            url = API_DOMAIN + "/eapi" + uri.substring(4);
        } else {
            throw new NeteaseException(400, "unknown crypto: " + crypto);
        }
        headers.put("Content-Type", "application/x-www-form-urlencoded");
        return post(url, body, headers);
    }

    private static JSONObject post(String url, String body, Map<String, String> headers) throws NeteaseException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(15000);
            connection.setDoOutput(true);
            for (Map.Entry<String, String> header : headers.entrySet()) {
                connection.setRequestProperty(header.getKey(), header.getValue());
            }
            byte[] payload = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(payload);
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String text = readAll(stream);
            JSONObject json;
            try {
                json = new JSONObject(text);
            } catch (JSONException error) {
                throw new NeteaseException(status > 100 && status < 600 ? status : 502, "non-JSON response: " + text.substring(0, Math.min(120, text.length())));
            }
            int code = json.optInt("code", status);
            // The Node layer treats these as success (QR polling 800-803 etc.).
            if (code == 201 || code == 302 || code == 400 || code == 502 || (code >= 800 && code <= 803)) {
                return json;
            }
            if (code != 200) {
                throw new NeteaseException(code, json.optString("message", json.optString("msg", "code " + code)));
            }
            return json;
        } catch (NeteaseException error) {
            throw error;
        } catch (Exception error) {
            throw new NeteaseException(502, String.valueOf(error.getMessage()));
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /**
     * Cookie defaults from processCookieObject(): tracking ids, os identity,
     * an NMTID for every non-login call. MUSIC_A (anonymous token) omitted —
     * QR key generation works without it; endpoints that truly need it will
     * surface a login prompt instead of a silent anonymous identity.
     */
    private static Map<String, String> cookieMap(String rawCookie, boolean isLoginUri) {
        Map<String, String> map = new HashMap<>();
        if (rawCookie != null && !rawCookie.isEmpty()) {
            for (String part : rawCookie.split(";")) {
                int eq = part.indexOf('=');
                if (eq > 0) {
                    map.put(part.substring(0, eq).trim(), part.substring(eq + 1).trim());
                }
            }
        }
        String nuid = randomHex(32);
        map.putIfAbsent("__remember_me", "true");
        map.putIfAbsent("ntes_kaola_ad", "1");
        map.putIfAbsent("_ntes_nuid", nuid);
        map.putIfAbsent("_ntes_nnid", nuid + "," + System.currentTimeMillis());
        map.putIfAbsent("WNMCID", randomString(6) + "." + System.currentTimeMillis() + ".01.0");
        map.putIfAbsent("WEVNSM", "1.0.0");
        map.putIfAbsent("osver", OSVER);
        map.putIfAbsent("os", OS);
        map.putIfAbsent("channel", CHANNEL);
        map.putIfAbsent("appver", APPVER);
        if (!isLoginUri) {
            map.put("NMTID", randomHex(16));
        }
        return map;
    }

    private static Map<String, String> eapiHeader(Map<String, String> cookie) {
        Map<String, String> header = new HashMap<>();
        header.put("osver", cookie.getOrDefault("osver", OSVER));
        // Node renders absent entries as literal "undefined" in the cookie.
        header.put("deviceId", cookie.getOrDefault("deviceId", "undefined"));
        header.put("os", cookie.getOrDefault("os", OS));
        header.put("appver", cookie.getOrDefault("appver", APPVER));
        header.put("versioncode", cookie.getOrDefault("versioncode", "140"));
        header.put("mobilename", cookie.getOrDefault("mobilename", "undefined"));
        header.put("buildver", cookie.getOrDefault("buildver", String.valueOf(System.currentTimeMillis()).substring(0, 10)));
        header.put("resolution", cookie.getOrDefault("resolution", "1920x1080"));
        header.put("__csrf", cookie.getOrDefault("__csrf", ""));
        header.put("channel", cookie.getOrDefault("channel", CHANNEL));
        header.put("requestId", System.currentTimeMillis() + String.format("%04d", RANDOM.nextInt(1000)));
        putIfSet(header, "MUSIC_U", cookie.get("MUSIC_U"));
        return header;
    }

    private static void putIfSet(Map<String, String> map, String key, String value) {
        if (value != null && !value.isEmpty()) map.put(key, value);
    }

    private static String cookieHeader(Map<String, String> header) {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, String> entry : header.entrySet()) {
            if (out.length() > 0) out.append("; ");
            out.append(urlEncode(entry.getKey())).append('=').append(urlEncode(entry.getValue()));
        }
        return out.toString();
    }

    private static String randomHex(int chars) {
        StringBuilder out = new StringBuilder(chars);
        String hex = "0123456789abcdef";
        for (int i = 0; i < chars; i++) out.append(hex.charAt(RANDOM.nextInt(16)));
        return out.toString();
    }

    private static String randomString(int chars) {
        StringBuilder out = new StringBuilder(chars);
        String letters = "abcdefghijklmnopqrstuvwxyz";
        for (int i = 0; i < chars; i++) out.append(letters.charAt(RANDOM.nextInt(letters.length())));
        return out.toString();
    }

    private static String urlEncode(String value) {
        try {
            return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
        } catch (Exception error) {
            return value;
        }
    }

    private static String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = stream.read(buffer)) != -1) out.write(buffer, 0, read);
        stream.close();
        return out.toString("UTF-8");
    }
}
