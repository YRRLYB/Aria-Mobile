import { describe, expect, it } from "vitest";
import { recordPlaylistProgress, type PlaylistProgressMap } from "./playlistProgress";

describe("playlist playback progress", () => {
  it("keeps one resumable entry per playlist", () => {
    const first = recordPlaylistProgress({}, "playlist-a", "track-1", 42, 1000);
    const second = recordPlaylistProgress(first, "playlist-a", "track-2", 17, 2000);
    expect(second["playlist-a"]).toEqual({ trackId: "track-2", position: 17, updatedAt: 2000 });
  });

  it("drops the least recently used playlists when the map grows", () => {
    let progress: PlaylistProgressMap = {};
    for (let index = 0; index < 130; index += 1) {
      progress = recordPlaylistProgress(progress, `playlist-${index}`, `track-${index}`, index, index + 1);
    }
    expect(Object.keys(progress)).toHaveLength(120);
    expect(progress["playlist-0"]).toBeUndefined();
    expect(progress["playlist-129"]?.trackId).toBe("track-129");
  });

  it("clamps invalid positions instead of persisting NaN", () => {
    const progress = recordPlaylistProgress({}, "playlist-a", "track-1", Number.NaN, 1);
    expect(progress["playlist-a"].position).toBe(0);
  });
});
