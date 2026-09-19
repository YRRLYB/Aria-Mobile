import { describe, expect, it } from "vitest";
import { compactTrack, newestLiked, rememberSearch } from "./libraryStorage";
import { idleTrack } from "@/lib/trackMappers";
import { PlaybackSession, updateMatchingTrack } from "./playbackSession";

describe("mobile library", () => {
  it("retains every favorite and preserves device URIs when compacting", () => {
    const tracks = Array.from({ length: 583 }, (_, i) => ({ ...idleTrack, id: `device:${i}`, source: "local" as const, streamUrl: `content://media/${i}` }));
    const saved = tracks.map(compactTrack);
    expect(saved).toHaveLength(583);
    expect(saved[582].streamUrl).toBe("content://media/582");
  });
  it("orders timestamps newest first and retains provider order for undated items", () => {
    const items = [{ ...idleTrack, id: "older", likedAt: 10 }, { ...idleTrack, id: "unknown1", likedAt: null }, { ...idleTrack, id: "newer", likedAt: 20 }, { ...idleTrack, id: "unknown2", likedAt: null }];
    expect(newestLiked(items).map((t) => t.id)).toEqual(["newer", "older", "unknown1", "unknown2"]);
  });
  it("deduplicates search history and retains the latest ten", () => {
    expect(rememberSearch(["Aimer", "Aria"], " aimer ")).toEqual(["aimer", "Aria"]);
    expect(rememberSearch(Array.from({ length: 10 }, (_, i) => String(i)), "new")).toHaveLength(10);
    expect(rememberSearch(["Aria"], " ")).toEqual(["Aria"]);
  });
});

describe("playback regression", () => {
  it("keeps other tracks intact during metadata updates", () => {
    const tracks = [{ ...idleTrack, id: "a" }, { ...idleTrack, id: "b" }];
    expect(updateMatchingTrack(tracks, "a", (track) => ({ ...track, streamUrl: "new-url" }))[1]).toBe(tracks[1]);
  });
  it("accepts transport commands but only ends a prepared load once", () => {
    const session = new PlaybackSession();
    const old = session.begin("a");
    const requestId = session.begin("b");
    expect(session.accept({ kind: "ended", requestId: old, trackId: "a" })).toBe(false);
    expect(session.accept({ kind: "next", requestId, trackId: "b" })).toBe(true);
    expect(session.accept({ kind: "ended", requestId, trackId: "b" })).toBe(false);
    expect(session.accept({ kind: "loaded", requestId, trackId: "b" })).toBe(true);
    expect(session.accept({ kind: "ended", requestId, trackId: "b" })).toBe(true);
    expect(session.accept({ kind: "ended", requestId, trackId: "b" })).toBe(false);
  });
});
