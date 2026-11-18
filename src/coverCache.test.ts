import { describe, expect, it } from "vitest";
import { cachedCoverUrl, normalizedCoverUrl } from "./coverCache";

describe("coverCache", () => {
  it("normalizes netease and desktop cover urls with 480y480 sizing", () => {
    expect(normalizedCoverUrl("http://p1.music.126.net/abc/123.jpg")).toBe(
      "https://p1.music.126.net/abc/123.jpg?param=480y480",
    );
    expect(normalizedCoverUrl("http://192.168.1.29:3636/api/providers/netease/cover?url=x")).toBe(
      "http://192.168.1.29:3636/api/providers/netease/cover?url=x&size=480y480",
    );
  });

  it("passes through local capacitor file urls without remote fetching", async () => {
    const localUrl = "http://localhost/_capacitor_file_/data/user/0/com.yrrlyb.aria.mobile/cache/local-covers/a.jpg";
    expect(normalizedCoverUrl(localUrl)).toBe(localUrl);
    await expect(cachedCoverUrl(localUrl)).resolves.toBe(localUrl);
    await expect(cachedCoverUrl("")).resolves.toBe("");
  });
});
