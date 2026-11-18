export type AutoUpdateInterval = 0 | 15 | 30 | 60 | 360 | 1440;

export type AutoUpdateSettings = {
  intervalMinutes: AutoUpdateInterval;
  includeLocalScan: boolean;
  lastUpdatedAt: number | null;
  lastLocalScanAt: number | null;
  lastScanStats: { tracks: number; roots: number; dirs: number } | null;
};

export const AUTO_UPDATE_INTERVALS: Array<{ value: AutoUpdateInterval; label: string }> = [
  { value: 0, label: "关闭" },
  { value: 15, label: "15 分钟" },
  { value: 30, label: "30 分钟" },
  { value: 60, label: "1 小时" },
  { value: 360, label: "6 小时" },
  { value: 1440, label: "每天" },
];

const STORAGE_KEY = "aria-auto-update-settings";
const VALID_INTERVALS = new Set<number>(AUTO_UPDATE_INTERVALS.map((item) => item.value));

export function defaultAutoUpdateSettings(): AutoUpdateSettings {
  return {
    intervalMinutes: 60,
    includeLocalScan: true,
    lastUpdatedAt: null,
    lastLocalScanAt: null,
    lastScanStats: null,
  };
}

export function readAutoUpdateSettings(): AutoUpdateSettings {
  const fallback = defaultAutoUpdateSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AutoUpdateSettings>;
    const interval = typeof parsed.intervalMinutes === "number" && VALID_INTERVALS.has(parsed.intervalMinutes)
      ? (parsed.intervalMinutes as AutoUpdateInterval)
      : fallback.intervalMinutes;
    const scanStats = parsed.lastScanStats
      && typeof parsed.lastScanStats.tracks === "number"
      && typeof parsed.lastScanStats.dirs === "number"
      ? {
          tracks: Math.max(0, Math.round(parsed.lastScanStats.tracks)),
          roots: typeof parsed.lastScanStats.roots === "number" ? Math.max(0, Math.round(parsed.lastScanStats.roots)) : 0,
          dirs: Math.max(0, Math.round(parsed.lastScanStats.dirs)),
        }
      : null;
    return {
      intervalMinutes: interval,
      includeLocalScan: typeof parsed.includeLocalScan === "boolean" ? parsed.includeLocalScan : fallback.includeLocalScan,
      lastUpdatedAt: typeof parsed.lastUpdatedAt === "number" && Number.isFinite(parsed.lastUpdatedAt)
        ? parsed.lastUpdatedAt
        : null,
      lastLocalScanAt: typeof parsed.lastLocalScanAt === "number" && Number.isFinite(parsed.lastLocalScanAt)
        ? parsed.lastLocalScanAt
        : null,
      lastScanStats: scanStats,
    };
  } catch {
    return fallback;
  }
}

export function writeAutoUpdateSettings(settings: AutoUpdateSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Best-effort persistence only.
  }
}

export function isAutoUpdateDue(settings: AutoUpdateSettings, now = Date.now()): boolean {
  if (settings.intervalMinutes <= 0) return false;
  if (!settings.lastUpdatedAt) return true;
  return now - settings.lastUpdatedAt >= settings.intervalMinutes * 60_000;
}

export function formatAutoUpdateTime(timestamp: number | null, now = Date.now()): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "尚未更新";
  const diffSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSeconds < 60) return "刚刚更新";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}
