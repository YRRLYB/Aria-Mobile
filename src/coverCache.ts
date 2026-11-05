const CACHE_NAME = "aria-cover-cache-v1";
const MAX_ENTRIES = 240;

const memory = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function isRemote(url: string): boolean {
  return /^https?:\/\//i.test(url);
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

/**
 * Resolves a cover URL to a locally cached object URL. NetEase artwork is
 * immutable, so caching the bytes avoids re-downloading the same cover every
 * time a list, the player, or a detail page remounts.
 */
export function cachedCoverUrl(url: string | undefined | null): Promise<string> {
  if (!url) return Promise.resolve("");
  if (!isRemote(url)) return Promise.resolve(url);

  const memo = memory.get(url);
  if (memo) return Promise.resolve(memo);

  const inFlight = pending.get(url);
  if (inFlight) return inFlight;

  const task = (async () => {
    const cache = await openCache();
    if (cache) {
      try {
        const hit = await cache.match(url);
        if (hit) {
          const objectUrl = URL.createObjectURL(await hit.blob());
          memory.set(url, objectUrl);
          return objectUrl;
        }
      } catch {
        // Fall through to the network request.
      }
    }

    try {
      const response = await fetch(url, {
        mode: "cors",
        credentials: "omit",
        cache: "force-cache",
      });
      if (!response.ok) throw new Error(`cover ${response.status}`);
      if (cache) {
        await cache.put(url, response.clone()).catch(() => undefined);
        void trimCache(cache);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      memory.set(url, objectUrl);
      return objectUrl;
    } catch {
      // Let the normal <img> path handle it; do not memoize the failure so a
      // later mount can retry after the network recovers.
      return url;
    } finally {
      pending.delete(url);
    }
  })();

  pending.set(url, task);
  return task;
}
