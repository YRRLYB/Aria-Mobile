import { describe, expect, it } from "vitest";
import type { Track } from "@/data/music";
import { buildNativeQueue, playbackStreamUrl, targetLevelFor, trackArtworkUrl } from "./playbackQueue";

function track(overrides: Partial<Track> & Pick<Track, "id">): Track {
  return {
    title: overrides.id,
    artist: "artist",
    album: "album",
    duration: "03:00",
    quality: "320K",
    source: "netease",
    streamUrl: "http://desktop/api/providers/netease/stream/1",
    cover: "#123456",
    accent: "#123456",
    waveform: [],
    lyrics: [],
    lyricStatus: "missing",
    ...overrides,
  };
}

describe("playbackQueue", () => {
  it("marks HiFi as the highest requested tier", () => {
    expect(targetLevelFor(true, "standard")).toBe("jymaster");
    expect(targetLevelFor(false, "lossless")).toBe("lossless");
  });

  it("sets the desktop quality level without duplicating it", () => {
    const options = { hifiEnabled: false, level: "exhigh" as const, directMode: false };
    const once = playbackStreamUrl(track({ id: "netease:1" }), options);
    expect(once).toContain("level=exhigh");
    expect(playbackStreamUrl({ ...track({ id: "netease:1" }), streamUrl: once }, options))
      .toContain("level=exhigh");
    expect(playbackStreamUrl({ ...track({ id: "netease:1" }), streamUrl: once }, options))
      .not.toContain("level=exhigh&level");
  });

  it("never appends a level to direct-mode CDN urls or local tracks", () => {
    const options = { hifiEnabled: true, level: "lossless" as const, directMode: true };
    expect(playbackStreamUrl(track({ id: "netease:1", streamUrl: "https://cdn/song.mp3" }), options))
      .toBe("https://cdn/song.mp3");
    expect(playbackStreamUrl(track({ id: "local:1", source: "local", streamUrl: "content://audio/1" }), options))
      .toBe("content://audio/1");
  });

  it("does not hand a direct-mode sentinel to the desktop player", () => {
    expect(playbackStreamUrl(track({ id: "netease:1", streamUrl: "direct:1" }), {
      hifiEnabled: false,
      level: "exhigh",
      directMode: false,
    })).toBeUndefined();
  });

  it("builds a direct queue with ids for on-device background resolution", () => {
    const active = track({ id: "netease:1", streamUrl: "direct:1", providerId: "1" });
    const next = track({ id: "netease:2", streamUrl: "direct:2", providerId: "2" });
    const queue = buildNativeQueue([active, next], {
      activeTrack: active,
      hifiEnabled: false,
      level: "exhigh",
      directMode: true,
    });
    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({ trackId: "netease:1", directId: "1", level: "exhigh", url: undefined });
    expect(queue[1]).toMatchObject({ trackId: "netease:2", directId: "2" });
  });

  it("keeps the active track in the queue even before its source list loads", () => {
    const active = track({ id: "netease:9", streamUrl: "direct:9", providerId: "9" });
    const queue = buildNativeQueue([], {
      activeTrack: active,
      hifiEnabled: false,
      level: "standard",
      directMode: true,
    });
    expect(queue.map((item) => item.trackId)).toEqual(["netease:9"]);
  });

  it("starts a capped native window at the active track", () => {
    const tracks = Array.from({ length: 5 }, (_, index) =>
      track({ id: `netease:${index}`, streamUrl: `direct:${index}`, providerId: String(index) }),
    );
    const queue = buildNativeQueue(tracks, {
      activeTrack: tracks[3],
      hifiEnabled: false,
      level: "standard",
      directMode: true,
      maxItems: 3,
    });
    expect(queue.map((item) => item.trackId)).toEqual(["netease:2", "netease:3", "netease:4"]);
  });

  it("falls back to a content cover for device tracks", () => {
    const local = track({ id: "device:1", source: "local", streamUrl: "content://audio/1", cover: "content://cover/1" });
    expect(trackArtworkUrl(local)).toBe("content://cover/1");
  });

  it("never sends huge data-url artwork through the native bridge", () => {
    const local = track({ id: "local:1", source: "local", coverUrl: "data:image/jpeg;base64,large" });
    expect(trackArtworkUrl(local)).toBeUndefined();
  });
});
