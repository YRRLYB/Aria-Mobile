import type { Track } from "@/data/music";
import type { ProviderPlaylist } from "@/lib/api";

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

export async function hydrateLibrary() {
  try {
    const db = await openDatabase();
    const saved = await new Promise<Partial<LibrarySnapshot> | undefined>((resolve, reject) => {
      const request = db.transaction("library").objectStore("library").get("snapshot");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (saved) { snapshot = { ...snapshot, ...saved }; return; }
  } catch { /* Migrate the older cache if database access is unavailable. */ }
  try {
    const old = JSON.parse(localStorage.getItem("aria-pools-cache") || "{}");
    for (const key of ["daily", "roam", "liked", "playlists"] as const) {
      if (Array.isArray(old[key])) (snapshot[key] as unknown[]) = old[key];
    }
  } catch { /* A malformed legacy cache must not prevent startup. */ }
}

export function readLibrary() { return snapshot; }

export function compactTrack(track: Track): Track {
  return {
    ...track, lyrics: [], waveform: [],
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
