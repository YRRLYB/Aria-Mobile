import { describe, expect, it } from "vitest";
import type { Track } from "@/data/music";
import { groupTracksByAlbum, formatTotalDuration } from "./libraryView";

function track(id: string, album: string, artist: string, albumArtist?: string): Track {
  return {
    id,
    title: id,
    artist,
    album,
    albumArtist,
    duration: "03:00",
    quality: "320K",
    source: "local",
    streamUrl: `content://audio/${id}`,
    cover: "#123456",
    accent: "#123456",
    waveform: [],
    lyrics: [],
    lyricStatus: "missing",
  };
}

describe("groupTracksByAlbum", () => {
  it("groups by album and album artist without duplicating ids", () => {
    const groups = groupTracksByAlbum([
      track("a1", "Album A", "Artist", "Album Artist"),
      track("a2", "Album A", "Artist", "Album Artist"),
      track("a2", "Album A", "Artist", "Album Artist"),
      track("b1", "Album B", "Other"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.title === "Album A")?.tracks).toHaveLength(2);
    expect(groups.find((group) => group.title === "Album A")?.artist).toBe("Album Artist");
  });

  it("falls back to unknown labels and sorts predictably", () => {
    const groups = groupTracksByAlbum([
      track("z", "", ""),
      track("a", "A Album", "B"),
    ]);
    expect(groups.map((group) => group.title)).toEqual(["未知专辑", "A Album"]);
    expect(groups[0]?.artist).toBe("未知歌手");
  });

  it("formats album duration from track durations", () => {
    expect(formatTotalDuration([track("a", "A", "B"), track("b", "A", "B")])).toBe("6 分钟");
  });
});
