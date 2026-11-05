import { describe, expect, it } from "vitest";
import { PlaybackSession } from "./playbackSession";

describe("PlaybackSession", () => {
  it("resumes a native session that outlived the WebView", () => {
    const session = new PlaybackSession();
    expect(session.resume("netease:42", "native-request")).toBe(true);
    expect(session.accept({ kind: "progress", requestId: "native-request", trackId: "netease:42", position: 12 }))
      .toBe(true);
    expect(session.accept({ kind: "progress", requestId: "other", trackId: "netease:42" })).toBe(false);
  });

  it("only advances once per successful load", () => {
    const session = new PlaybackSession();
    const requestId = session.begin("netease:1");
    expect(session.accept({ kind: "ended", requestId, trackId: "netease:1" })).toBe(false);
    expect(session.accept({ kind: "loaded", requestId, trackId: "netease:1" })).toBe(true);
    expect(session.accept({ kind: "ended", requestId, trackId: "netease:1" })).toBe(true);
    expect(session.accept({ kind: "ended", requestId, trackId: "netease:1" })).toBe(false);
  });

  it("ignores events from a superseded request", () => {
    const session = new PlaybackSession();
    const first = session.begin("netease:1");
    const second = session.begin("netease:2");
    expect(session.accept({ kind: "loaded", requestId: first, trackId: "netease:1" })).toBe(false);
    expect(session.accept({ kind: "loaded", requestId: second, trackId: "netease:2" })).toBe(true);
  });
});
