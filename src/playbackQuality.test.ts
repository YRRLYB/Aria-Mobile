import { describe, expect, it } from "vitest";
import { formatPlaybackQuality, positiveAudioValue } from "./playbackQuality";

describe("actual playback quality", () => {
  it("does not claim quality before the player reports an input format", () => {
    expect(formatPlaybackQuality(null)).toBe("实际音质：等待音频加载");
  });
  it("shows a returned 128 kbps MP3 without the catalog's fixed 320K label", () => {
    expect(formatPlaybackQuality({ audioFormat: "audio/mpeg", bitrate: 128002, sampleRate: 44100 }))
      .toBe("实际 MP3 · 128 kbps · 44.1 kHz");
  });
  it("keeps the encoded lossless bitrate instead of substituting the PCM bitrate", () => {
    expect(formatPlaybackQuality({ audioFormat: "audio/flac", bitrate: 876543, sampleRate: 96000 }))
      .toBe("实际 FLAC · 877 kbps · 96 kHz");
  });
  it("does not invent values when the engine reports unknown metadata", () => {
    expect(formatPlaybackQuality({ audioFormat: "audio/flac", bitrate: -1, sampleRate: null }))
      .toBe("实际 FLAC · 码率未知 · 采样率未知");
    for (const value of [-1, 0, NaN, Infinity, null, undefined, "320000"]) expect(positiveAudioValue(value)).toBeNull();
  });
});
