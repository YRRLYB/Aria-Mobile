import type { Track } from "@/data/music";
import { parseDuration } from "@/lib/playerPresentation";

export type AlbumGroup = {
  key: string;
  title: string;
  artist: string;
  coverTrack: Track;
  tracks: Track[];
};

export function totalDurationSeconds(tracks: Track[]): number {
  return tracks.reduce((total, track) => total + parseDuration(track.duration), 0);
}

export function formatTotalDuration(tracks: Track[]): string {
  const seconds = totalDurationSeconds(tracks);
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`;
}

export function groupTracksByAlbum(tracks: Track[]): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup>();
  const seen = new Set<string>();
  for (const track of tracks) {
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    const title = track.album?.trim() || "未知专辑";
    const artist = (track.albumArtist || track.artist || "未知歌手").trim();
    const key = `${artist.toLocaleLowerCase()}\u0000${title.toLocaleLowerCase()}`;
    const current = groups.get(key);
    if (current) {
      current.tracks.push(track);
      continue;
    }
    groups.set(key, { key, title, artist, coverTrack: track, tracks: [track] });
  }
  return [...groups.values()].sort((left, right) =>
    left.title.localeCompare(right.title, "zh-CN") || left.artist.localeCompare(right.artist, "zh-CN"),
  );
}
