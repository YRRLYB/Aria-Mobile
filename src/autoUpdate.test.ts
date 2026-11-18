import { describe, expect, it } from "vitest";
import {
  defaultAutoUpdateSettings,
  formatAutoUpdateTime,
  isAutoUpdateDue,
  type AutoUpdateSettings,
} from "./autoUpdate";

describe("autoUpdate", () => {
  it("reports overdue updates only when enabled and elapsed", () => {
    const base: AutoUpdateSettings = {
      ...defaultAutoUpdateSettings(),
      intervalMinutes: 30,
      lastUpdatedAt: 1_000_000,
    };
    expect(isAutoUpdateDue({ ...base, intervalMinutes: 0 }, 9_999_999)).toBe(false);
    expect(isAutoUpdateDue(base, 1_000_000 + 29 * 60_000)).toBe(false);
    expect(isAutoUpdateDue(base, 1_000_000 + 30 * 60_000)).toBe(true);
    expect(isAutoUpdateDue({ ...base, lastUpdatedAt: null }, 1_000_000)).toBe(true);
  });

  it("formats relative update timestamps cleanly", () => {
    const now = 1_700_000_000_000;
    expect(formatAutoUpdateTime(null, now)).toBe("尚未更新");
    expect(formatAutoUpdateTime(now - 20_000, now)).toBe("刚刚更新");
    expect(formatAutoUpdateTime(now - 5 * 60_000, now)).toBe("5 分钟前");
    expect(formatAutoUpdateTime(now - 3 * 3_600_000, now)).toBe("3 小时前");
  });
});
