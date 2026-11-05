import { describe, expect, it } from "vitest";
import type { Track } from "@/data/music";
import { createPlayerCacheSnapshot } from "./playHistory";

const track: Track = {
  id: "netease:1",
  title: "Song",
  artist: "Artist",
  album: "Album",
  duration: "03:00",
  quality: "320K",
  source: "netease",
  streamUrl: "direct:1",
  coverUrl: "data:image/jpeg;base64,large",
  cover: "#123456",
  accent: "#123456",
  waveform: [1, 2, 3],
  lyrics: [{ time: "00:01", text: "line" }],
  lyricStatus: "linked",
};

describe("createPlayerCacheSnapshot", () => {
  it("keeps playback fields but drops bulky lyrics, waveform and data covers", () => {
    const snapshot = createPlayerCacheSnapshot(track);
    expect(snapshot).toMatchObject({ id: track.id, streamUrl: track.streamUrl, source: "netease" });
    expect(snapshot.lyrics).toEqual([]);
    expect(snapshot.waveform).toEqual([]);
    expect(snapshot.coverUrl).toBeUndefined();
  });
});
