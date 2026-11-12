export type PlaylistPlaybackProgress = {
  trackId: string;
  position: number;
  updatedAt: number;
};

export type PlaylistProgressMap = Record<string, PlaylistPlaybackProgress>;

const STORAGE_KEY = "aria-playlist-progress";
const MAX_ENTRIES = 120;

function validProgress(value: unknown): value is PlaylistPlaybackProgress {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<PlaylistPlaybackProgress>;
  return typeof entry.trackId === "string"
    && entry.trackId.length > 0
    && typeof entry.position === "number"
    && Number.isFinite(entry.position)
    && typeof entry.updatedAt === "number"
    && Number.isFinite(entry.updatedAt);
}

export function readPlaylistProgress(): PlaylistProgressMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => validProgress(value))
        .map(([id, value]) => [id, {
          trackId: (value as PlaylistPlaybackProgress).trackId,
          position: Math.max(0, (value as PlaylistPlaybackProgress).position),
          updatedAt: (value as PlaylistPlaybackProgress).updatedAt,
        }]),
    );
  } catch {
    return {};
  }
}

export function writePlaylistProgress(progress: PlaylistProgressMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // A full quota must not affect playback; the in-memory map still works.
  }
}

/**
 * Stores the last audible track and playhead for one playlist. Keeping this
 * separate from the player snapshot means opening a different source never
 * erases where each playlist left off.
 */
export function recordPlaylistProgress(
  progress: PlaylistProgressMap,
  playlistId: string,
  trackId: string,
  position: number,
  now = Date.now(),
): PlaylistProgressMap {
  if (!playlistId || !trackId) return progress;
  const next: PlaylistProgressMap = {
    ...progress,
    [playlistId]: {
      trackId,
      position: Math.max(0, Number.isFinite(position) ? position : 0),
      updatedAt: now,
    },
  };
  const entries = Object.entries(next).sort((left, right) => right[1].updatedAt - left[1].updatedAt);
  return entries.length <= MAX_ENTRIES ? next : Object.fromEntries(entries.slice(0, MAX_ENTRIES));
}
