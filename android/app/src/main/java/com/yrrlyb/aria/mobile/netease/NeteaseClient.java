package com.yrrlyb.aria.mobile.netease;

/**
 * M2 (0.2.0) scope: direct NetEase access from the phone — no desktop needed.
 *
 * How to extend this module (for any maintainer, human or AI agent):
 *  1. Read NETEASE_API.md in the repository root — endpoint list, signing
 *     rules, cache/throttle policy and the golden-test discipline.
 *  2. Add ONE method per endpoint to this class; keep the method list in
 *     sync with the checklist in NETEASE_API.md.
 *  3. Session cookie lives in NeteaseSession (SharedPreferences); never log it.
 *  4. JSON parsing: org.json (bundled with Android) is enough for these
 *     responses; do not add heavyweight dependencies.
 *
 * Signing primitives are ready in NeteaseCrypto (golden-tested). This class
 * is intentionally left unimplemented until the HTTP layer lands.
 */
public final class NeteaseClient {

    private NeteaseClient() {
    }

    // Endpoint checklist (see NETEASE_API.md for signatures/paths):
    // loginQrKey() / loginQrCreate(key) / loginQrCheck(key)
    // userAccount() / likedList(uid) / dailyRecommendations() / personalFm(limit)
    // userPlaylists(uid) / playlistTrackAll(id, page) / cloudSearch(keyword)
    // lyric(id) / songUrlV1(id, level) / setLike(id, like)
}
