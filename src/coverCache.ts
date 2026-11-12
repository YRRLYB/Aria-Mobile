const CACHE_NAME = "aria-cover-cache-v1";
const MAX_ENTRIES = 240;
const MEMORY_ENTRIES = 160;
const FETCH_TIMEOUT_MS = 6_000;
const FAILURE_COOLDOWN_MS = 5_000;

export type CoverCacheStats = {
  entries: number;
  bytes: number;
  memoryEntries: number;
};

const memory = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const failures = new Map<string, number>();
let generation = 0;

function isRemote(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Cache sized artwork instead of full-resolution originals. */
export function normalizedCoverUrl(url: string): string {
  if (!isRemote(url)) return url;
  try {
    const parsed = new URL(url);
    if (/(^|\.)music\.126\.net$/i.test(parsed.hostname)) {
      parsed.protocol = "https:";
      if (!parsed.searchParams.has("param")) parsed.searchParams.set("param", "480y480");
      return parsed.href;
    }
    if (/\/api\/providers\/netease\/cover(?:\?|$)/.test(parsed.pathname + parsed.search)) {
      if (!parsed.searchParams.has("size")) parsed.searchParams.set("size", "480y480");
      return parsed.href;
    }
  } catch {
    // Keep the original URL if it cannot be parsed.
  }
  return url;
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function trimCache(cache: Cache): Promise<void> {
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;
    const excess = keys.length - MAX_ENTRIES;
    await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  } catch {
    // Best-effort cleanup only.
  }
}

function remember(url: string, objectUrl: string): void {
  memory.delete(url);
  memory.set(url, objectUrl);
  while (memory.size > MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    const evicted = memory.get(oldest);
    memory.delete(oldest);
    if (evicted?.startsWith("blob:")) {
      try { URL.revokeObjectURL(evicted); } catch { /* best effort */ }
    }
  }
}

export async function getCoverCacheStats(): Promise<CoverCacheStats> {
  const stats: CoverCacheStats = { entries: 0, bytes: 0, memoryEntries: memory.size };
  const cache = await openCache();
  if (!cache) return stats;
  try {
    const keys = await cache.keys();
    stats.entries = keys.length;
    const sizes = await Promise.all(keys.map(async (key) => {
      try {
        const response = await cache.match(key);
        if (!response) return 0;
        return (await response.blob()).size;
      } catch {
        return 0;
      }
    }));
    stats.bytes = sizes.reduce((total, size) => total + size, 0);
  } catch {
    // Stats are informational; a failed read should not block settings.
  }
  return stats;
}

/**
 * Drops the persisted cover bytes and the in-memory lookup map. Object URLs
 * already attached to mounted <img> elements are intentionally not revoked:
 * revoking them would blank every visible cover, and they stay bounded by the
 * memory LRU until the page is reloaded.
 */
export async function clearCoverCache(): Promise<CoverCacheStats> {
  generation += 1;
  memory.clear();
  pending.clear();
  failures.clear();
  const cache = await openCache();
  if (cache) {
    try {
      const keys = await cache.keys();
      await Promise.all(keys.map((key) => cache.delete(key)));
    } catch {
      // Best-effort; the next stats read reports what remains.
    }
  }
  return getCoverCacheStats();
}

/**
 * Resolves a cover URL to a locally cached object URL. NetEase artwork is
 * immutable, so caching the bytes avoids re-downloading the same cover every
 * time a list, the player, or a detail page remounts.
 */
export function cachedCoverUrl(url: string | undefined | null): Promise<string> {
  if (!url) return Promise.resolve("");
  if (!isRemote(url)) return Promise.resolve(url);

  const target = normalizedCoverUrl(url);
  const memo = memory.get(target);
  if (memo) {
    // Refresh LRU order.
    memory.delete(target);
    memory.set(target, memo);
    return Promise.resolve(memo);
  }

  const failedAt = failures.get(target);
  if (failedAt && Date.now() - failedAt < FAILURE_COOLDOWN_MS) return Promise.resolve(target);

  const inFlight = pending.get(target);
  if (inFlight) return inFlight;

  const taskGeneration = generation;
  const task = (async () => {
    const cache = await openCache();
    if (cache) {
      try {
        const hit = await cache.match(target);
        if (hit) {
          if (taskGeneration !== generation) return target;
          const objectUrl = URL.createObjectURL(await hit.blob());
          remember(target, objectUrl);
          return objectUrl;
        }
      } catch {
        // Fall through to the network request.
      }
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
    try {
      const response = await fetch(target, {
        mode: "cors",
        credentials: "omit",
        cache: "force-cache",
        signal: controller?.signal,
      });
      if (!response.ok) throw new Error(`cover ${response.status}`);
      if (taskGeneration !== generation) return target;
      if (cache) {
        await cache.put(target, response.clone()).catch(() => undefined);
        void trimCache(cache);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      if (taskGeneration !== generation) {
        try { URL.revokeObjectURL(objectUrl); } catch { /* best effort */ }
        return target;
      }
      remember(target, objectUrl);
      failures.delete(target);
      return objectUrl;
    } catch {
      if (taskGeneration === generation) failures.set(target, Date.now());
      // Let the normal <img> path handle it; do not memoize the failure.
      return target;
    } finally {
      if (timer !== null) window.clearTimeout(timer);
      if (taskGeneration === generation) pending.delete(target);
    }
  })();

  pending.set(target, task);
  return task;
}
