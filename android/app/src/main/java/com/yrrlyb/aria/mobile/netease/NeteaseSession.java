package com.yrrlyb.aria.mobile.netease;

import android.content.Context;
import android.content.SharedPreferences;

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
        prefs(context).edit().clear().apply();
    }
}
