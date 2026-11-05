package com.yrrlyb.aria.mobile.netease;

import android.content.Context;
import android.content.SharedPreferences;

import java.security.SecureRandom;

/**
 * NetEase session storage: the raw cookie string captured at QR-login time
 * (MUSIC_U is the credential) plus a small cached account summary. The cookie
 * never leaves the device and is never logged.
 */
public final class NeteaseSession {
    private static final String PREFS = "netease_session";
    private static final String KEY_COOKIE = "cookie";
    private static final String KEY_USER_ID = "userId";
    private static final String KEY_NICKNAME = "nickname";
    private static final String KEY_AVATAR = "avatarUrl";
    private static final String KEY_DEVICE_ID = "sDeviceId";
    private static final String KEY_NUID = "_ntes_nuid";
    private static final String KEY_NNID = "_ntes_nnid";
    private static final String KEY_WNMCID = "WNMCID";
    private static final String KEY_CREATED_AT = "profileCreatedAt";
    private static final SecureRandom RANDOM = new SecureRandom();

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static String cookie(Context context) {
        return prefs(context).getString(KEY_COOKIE, "");
    }

    public static boolean isLoggedIn(Context context) {
        return cookie(context).contains("MUSIC_U=");
    }

    public static long userId(Context context) {
        return prefs(context).getLong(KEY_USER_ID, 0);
    }

    public static String nickname(Context context) {
        return prefs(context).getString(KEY_NICKNAME, "");
    }

    public static String avatarUrl(Context context) {
        return prefs(context).getString(KEY_AVATAR, "");
    }

    /**
     * Stable browser-like device id. NetEase's QR "device environment" check
     * expects the chainId embedded in the login QR URL to belong to a device
     * that stays the same across requests. A fresh random id for every QR code
     * is what triggers "当前设备环境异常".
     */
    public static synchronized String deviceId(Context context) {
        SharedPreferences preferences = prefs(context);
        String existing = preferences.getString(KEY_DEVICE_ID, "");
        if (existing != null && !existing.isEmpty()) return existing;
        StringBuilder builder = new StringBuilder(52);
        String hex = "0123456789ABCDEF";
        for (int index = 0; index < 52; index++) {
            builder.append(hex.charAt(RANDOM.nextInt(hex.length())));
        }
        String created = builder.toString();
        preferences.edit().putString(KEY_DEVICE_ID, created).apply();
        return created;
    }

    private static String randomHex(int chars) {
        StringBuilder builder = new StringBuilder(chars);
        String hex = "0123456789abcdef";
        for (int index = 0; index < chars; index++) {
            builder.append(hex.charAt(RANDOM.nextInt(hex.length())));
        }
        return builder.toString();
    }

    /**
     * A stable anonymous browser profile. NetEase risk control compares the
     * device/tracking cookies between the QR key, QR poll and later login
     * requests; fresh random values on every call look like a changed device.
     */
    public static synchronized String trackingCookie(Context context) {
        SharedPreferences preferences = prefs(context);
        String deviceId = deviceId(context);
        long createdAt = preferences.getLong(KEY_CREATED_AT, 0L);
        String nuid = preferences.getString(KEY_NUID, "");
        String nnid = preferences.getString(KEY_NNID, "");
        String wnmcid = preferences.getString(KEY_WNMCID, "");
        if (createdAt <= 0L || nuid == null || nuid.isEmpty()
                || nnid == null || nnid.isEmpty()
                || wnmcid == null || wnmcid.isEmpty()) {
            createdAt = System.currentTimeMillis();
            nuid = randomHex(32);
            nnid = nuid + "," + createdAt;
            wnmcid = nuid.substring(0, 6) + "." + createdAt + ".01.0";
            preferences.edit()
                    .putLong(KEY_CREATED_AT, createdAt)
                    .putString(KEY_NUID, nuid)
                    .putString(KEY_NNID, nnid)
                    .putString(KEY_WNMCID, wnmcid)
                    .apply();
        }
        return "deviceId=" + deviceId
                + "; sDeviceId=" + deviceId
                + "; _ntes_nuid=" + nuid
                + "; _ntes_nnid=" + nnid
                + "; WNMCID=" + wnmcid;
    }

    public static void save(Context context, String cookie, long userId, String nickname, String avatarUrl) {
        prefs(context).edit()
                .putString(KEY_COOKIE, cookie == null ? "" : cookie)
                .putLong(KEY_USER_ID, userId)
                .putString(KEY_NICKNAME, nickname == null ? "" : nickname)
                .putString(KEY_AVATAR, avatarUrl == null ? "" : avatarUrl)
                .apply();
    }

    public static void updateAccount(Context context, long userId, String nickname, String avatarUrl) {
        prefs(context).edit()
                .putLong(KEY_USER_ID, userId)
                .putString(KEY_NICKNAME, nickname == null ? "" : nickname)
                .putString(KEY_AVATAR, avatarUrl == null ? "" : avatarUrl)
                .apply();
    }

    public static void clear(Context context) {
        // Keep the stable device/tracking profile: rotating it on every logout
        // makes the next QR/login look like a brand-new environment to NetEase.
        prefs(context).edit()
                .remove(KEY_COOKIE)
                .remove(KEY_USER_ID)
                .remove(KEY_NICKNAME)
                .remove(KEY_AVATAR)
                .apply();
    }
}
