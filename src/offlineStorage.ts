import type { Track } from "@/data/music";
import { readCachedLyrics } from "@/lib/playerPresentation";

export type OfflineRecord = {
  track: Track;
  path: string;
  size: number;
  downloadedAt: number;
};

const STORAGE_KEY = "aria-offline-tracks";

export function readOfflineRecords(): OfflineRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((record) => record?.track?.id && record?.track?.streamUrl && record?.path)
      .map((record) => hydrateRecord(record))
      .slice(0, 500);
  } catch {
    return [];
  }
}

function hydrateRecord(record: OfflineRecord): OfflineRecord {
  const lyrics = Array.isArray(record.track.lyrics) && record.track.lyrics.length
    ? record.track.lyrics
    : readCachedLyrics(record.track.id);
  return {
    ...record,
    track: {
      ...record.track,
      offline: true,
      source: record.track.source === "netease" ? "netease" : "local",
      lyrics: Array.isArray(lyrics) ? lyrics : [],
      waveform: Array.isArray(record.track.waveform) ? record.track.waveform : [],
      lyricStatus: lyrics.length ? "linked" : record.track.lyricStatus,
    },
  };
}

export function writeOfflineRecords(records: OfflineRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Offline files remain playable for this session even if metadata cannot persist.
  }
}

export function compactOfflineRecord(record: OfflineRecord): OfflineRecord {
  return {
    ...record,
    track: {
      ...record.track,
      offline: true,
      lyrics: [],
      waveform: [],
      coverUrl: record.track.coverUrl?.startsWith("data:") ? undefined : record.track.coverUrl,
    },
  };
}
