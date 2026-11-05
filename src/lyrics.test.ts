import { describe, expect, it } from "vitest";
import { parseLrc, parseYrc, withTranslations } from "./lyrics";

describe("lyrics", () => {
  it("parses ordinary LRC lines", () => {
    expect(parseLrc("[00:12.50]Hello\n[01:02]World\n[bad]skip")).toEqual([
      { time: "00:12", text: "Hello" },
      { time: "01:02", text: "World" },
    ]);
  });

  it("parses NetEase word-by-word YRC lines", () => {
    const lines = parseYrc("[12000,3000,0](12000,500,0)Hello (12500,500,0)world");
    expect(lines).toHaveLength(1);
    expect(lines[0].time).toBe("00:12.000");
    expect(lines[0].text).toBe("Hello world");
    expect(lines[0].words).toEqual([
      { start: 12, duration: 0.5, text: "Hello " },
      { start: 12.5, duration: 0.5, text: "world" },
    ]);
  });

  it("attaches translations by index when line counts match", () => {
    const lines = parseYrc(
      "[0,1000,0](0,1000,0)one\n[1000,1000,0](1000,1000,0)two",
    );
    const result = withTranslations(lines, "[00:00]一\n[00:01]二");
    expect(result.map((line) => line.translation)).toEqual(["一", "二"]);
  });
});
