import type { Track } from "@/data/music";
import type { ProviderPlaylist } from "@/lib/api";
import { readCachedArtworkOverride } from "@/lib/artworkOverrides";
import { readCachedLyrics } from "@/lib/playerPresentation";

export type LibrarySnapshot = {
  daily: Track[];
  roam: Track[];
  liked: Track[];
  playlists: ProviderPlaylist[];
  device: Track[];
  likedComplete: boolean;
};
let snapshot: LibrarySnapshot = { daily: [], roam: [], liked: [], playlists: [], device: [], likedComplete: false };
let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("aria-mobile-library", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("library");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function hydrateTrack(track: Track): Track {
  const lyrics = Array.isArray(track.lyrics) && track.lyrics.length ? track.lyrics : readCachedLyrics(track.id);
  const coverUrl = readCachedArtworkOverride(track.id) ?? track.coverUrl;
  return {
    ...track,
    coverUrl,
    waveform: Array.isArray(track.waveform) ? track.waveform : [],
    lyrics: Array.isArray(lyrics) ? lyrics : [],
    lyricStatus: lyrics.length
      ? "linked"
      : track.lyricStatus === "linked" ? "searchable" : track.lyricStatus,
  };
}

function hydrateSnapshot(saved: Partial<LibrarySnapshot>): LibrarySnapshot {
  return {
    ...snapshot,
    ...saved,
    daily: (saved.daily ?? snapshot.daily).map(hydrateTrack),
    roam: (saved.roam ?? snapshot.roam).map(hydrateTrack),
    liked: (saved.liked ?? snapshot.liked).map(hydrateTrack),
    device: (saved.device ?? snapshot.device).map(hydrateTrack),
  };
}

export async function hydrateLibrary() {
  try {
    const db = await openDatabase();
    const saved = await new Promise<Partial<LibrarySnapshot> | undefined>((resolve, reject) => {
      const request = db.transaction("library").objectStore("library").get("snapshot");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (saved) { snapshot = hydrateSnapshot(saved); return; }
  } catch { /* Migrate the older cache if database access is unavailable. */ }
  try {
    const old = JSON.parse(localStorage.getItem("aria-pools-cache") || "{}");
    for (const key of ["daily", "roam", "liked", "playlists"] as const) {
      if (Array.isArray(old[key])) (snapshot[key] as unknown[]) = old[key];
    }
    snapshot = hydrateSnapshot(snapshot);
  } catch { /* A malformed legacy cache must not prevent startup. */ }
}

export function readLibrary() { return snapshot; }

export function compactTrack(track: Track): Track {
  return {
    ...track,
    // Lyrics/artwork overrides live in their own bounded caches. Keeping
    // them inside every library entry bloated the IndexedDB snapshot.
    lyrics: [],
    waveform: [],
    coverUrl: track.coverUrl?.startsWith("data:") ? undefined : track.coverUrl,
    // CDN links expire. Device content:// URIs and desktop URLs stay intact.
    streamUrl: track.source === "netease" && track.streamUrl?.startsWith("http") && !track.streamUrl.includes("/api/")
      ? `direct:${track.providerId ?? track.id.replace("netease:", "")}` : track.streamUrl,
  };
}

export async function saveLibrary(patch: Partial<LibrarySnapshot>) {
  snapshot = { ...snapshot, ...patch };
  const value = { ...snapshot };
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("library", "readwrite");
    transaction.objectStore("library").put(value, "snapshot");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function rememberSearch(history: string[], query: string) {
  const text = query.trim();
  return text ? [text, ...history.filter((item) => item.toLocaleLowerCase() !== text.toLocaleLowerCase())].slice(0, 10) : history;
}

export function newestLiked(tracks: Track[]) {
  // Stable sort retains the provider's playlist order where dates are absent.
  return [...tracks].sort((a, b) => (b.likedAt ?? 0) - (a.likedAt ?? 0));
}
