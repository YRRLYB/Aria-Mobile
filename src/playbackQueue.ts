import type { Track } from "@/data/music";
import type { QualityLevel } from "@/lib/playerPresentation";

// A native queue item is intentionally transport-shaped: the Media3 service
// must be able to keep playing when the WebView is suspended, so every item
// carries either a ready URL or the NetEase id it can resolve on-device.
export type NativeQueueItem = {
  trackId: string;
  url?: string;
  directId?: string;
  level?: QualityLevel;
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
};

export type StreamOptions = {
  hifiEnabled: boolean;
  level: QualityLevel;
  directMode: boolean;
};

export function targetLevelFor(hifi: boolean, level: QualityLevel): QualityLevel {
  // The catalog maxbr is not authoritative (it commonly reports 320K for
  // songs that a VIP account can stream losslessly). Let songUrlV1 decide.
  return hifi ? "jymaster" : level;
}

function withQuery(url: string, name: string, value: string): string {
  const hashIndex = url.indexOf("#");
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const pattern = new RegExp(`([?&])${name}=[^&]*`);
  const encoded = `${name}=${encodeURIComponent(value)}`;
  if (pattern.test(base)) {
    return `${base.replace(pattern, `$1${encoded}`)}${hash}`;
  }
  return `${base}${base.includes("?") ? "&" : "?"}${encoded}${hash}`;
}

export function playbackStreamUrl(track: Track, options: StreamOptions): string | undefined {
  if (!track.streamUrl) return undefined;
  // Downloaded tracks are served from app-private storage regardless of the
  // original provider, so neither the quality query nor the direct resolver
  // must touch the URL again.
  if (track.offline) return track.streamUrl;
  if (track.source !== "netease") return track.streamUrl;
  // Direct mode resolves a CDN URL through songUrlV1. Appending desktop's
  // `level` query to that CDN URL would have no effect and can break it.
  if (options.directMode) return track.streamUrl;
  // A sentinel left over from direct mode cannot be played by the desktop
  // stream route. Treat it as unloaded instead of handing it to ExoPlayer.
  if (track.streamUrl.startsWith("direct:")) return undefined;
  return withQuery(track.streamUrl, "level", targetLevelFor(options.hifiEnabled, options.level));
}

export function trackArtworkUrl(track: Track): string | undefined {
  // Native media notifications accept a URI, not a WebView data URL. Data
  // URLs can be ~900KB and would blow the Binder transaction limit when a
  // whole queue is passed to the service.
  if (track.coverUrl && !track.coverUrl.startsWith("data:")) return track.coverUrl;
  return /^(https?:|content:)/.test(track.cover) ? track.cover : undefined;
}

function directSongId(track: Track): string | undefined {
  const raw = track.providerId ?? track.id.replace(/^(netease:|direct:)+/, "");
  const id = raw.replace(/[^0-9]/g, "");
  return id || undefined;
}

export function buildNativeQueue(
  tracks: Track[],
  options: StreamOptions & { activeTrack: Track; maxItems?: number },
): NativeQueueItem[] {
  const maxItems = options.maxItems ?? 200;
  const activeIndex = tracks.findIndex((track) => track.id === options.activeTrack.id);
  // The native window is capped, so a long queue starts one track before the
  // current one (for lock-screen "previous"). Short queues keep their exact
  // order so repeat-all wraps to the real first track.
  const shouldRotate = activeIndex >= 0 && tracks.length > maxItems;
  const startIndex = activeIndex > 0 ? activeIndex - 1 : 0;
  const ordered = activeIndex < 0
    ? [options.activeTrack, ...tracks]
    : shouldRotate
      ? [...tracks.slice(startIndex), ...tracks.slice(0, startIndex)]
      : tracks;
  const seen = new Set<string>();
  const queue: NativeQueueItem[] = [];

  for (const track of ordered) {
    if (queue.length >= maxItems) break;
    if (!track.streamUrl || seen.has(track.id)) continue;
    seen.add(track.id);

    const direct = options.directMode && track.source === "netease" && !track.offline;
    const url = direct ? undefined : playbackStreamUrl(track, options);
    const directId = direct ? directSongId(track) : undefined;
    if (!url && !directId) continue;

    queue.push({
      trackId: track.id,
      url,
      directId,
      level: direct ? targetLevelFor(options.hifiEnabled, options.level) : undefined,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artworkUrl: trackArtworkUrl(track),
    });
  }

  return queue;
}
