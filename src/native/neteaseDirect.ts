import { Capacitor, registerPlugin } from "@capacitor/core";
import QRCode from "qrcode";
import { parseLrc, parseYrc, withTranslations } from "../lyrics";
import {
  registerNeteaseDirectProvider,
  type NeteaseAccountSummary,
  type NeteaseQrCheck,
  type NeteaseQrStart,
  type ProviderArtist,
  type ProviderDailyBundle,
  type ProviderPlaylist,
  type ProviderTrack,
} from "@/lib/api";

// ---- Plugin ----

type InvokeResult = { ok: boolean; data?: unknown; code?: number; message?: string };

const NeteaseDirectPlugin = registerPlugin<{
  status(): Promise<{ loggedIn: boolean; userId: number; nickname: string; avatarUrl: string }>;
  loginQrStart(): Promise<{ ok: boolean; key: string; qrUrl: string }>;
  loginQrCheck(options: { key: string }): Promise<{ code: number; loggedIn: boolean; message?: string; nickname?: string; avatarUrl?: string }>;
  loginCellphone(options: { phone: string; password?: string; captcha?: string; countryCode?: string }): Promise<{
    ok: boolean; code: number; message: string; nickname?: string; avatarUrl?: string;
  }>;
  captchaSent(options: { phone: string; countryCode?: string }): Promise<{ ok: boolean; code: number; message: string }>;
  logout(): Promise<void>;
  invoke(options: { endpoint: string; data?: string }): Promise<InvokeResult>;
}>("NeteaseDirect");

export function isDirectCapable(): boolean {
  return Capacitor.isNativePlatform();
}

// ---- Data mode persistence ----

const MODE_KEY = "aria-data-mode";

export type DataMode = "desktop" | "direct";

export function getDataMode(): DataMode {
  try {
    return localStorage.getItem(MODE_KEY) === "direct" ? "direct" : "desktop";
  } catch {
    return "desktop";
  }
}

export function setDataMode(mode: DataMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // best effort
  }
}

// ---- Raw response mappers (netease shapes → desktop ProviderTrack) ----

type RawSong = {
  id: number;
  name: string;
  ar?: Array<{ id: number; name: string }>;
  artists?: Array<{ id: number; name: string }>;
  singers?: Array<{ id: number; name: string }>;
  al?: { id: number; name: string; picUrl?: string };
  album?: { id: number; name: string; picUrl?: string };
  dt?: number;
  duration?: number;
  likedAt?: number;
  fee?: number;
  privilege?: {
    maxbr?: number;
    pl?: number;
    fee?: number;
    l?: number;
    m?: number;
    h?: number;
    sq?: number;
    hr?: number;
    jymaster?: number;
  };
};

const LEVELS = ["standard", "higher", "exhigh", "lossless", "hires", "jymaster"] as const;
type QualityLevel = (typeof LEVELS)[number];

function qualityLevelsFromSong(song: RawSong): QualityLevel[] {
  const privilege = song.privilege;
  const levels: QualityLevel[] = [];
  if (privilege?.l) levels.push("standard");
  if (privilege?.m) levels.push("higher");
  if (privilege?.h) levels.push("exhigh");
  if (privilege?.sq) levels.push("lossless");
  if (privilege?.hr) levels.push("hires");
  if (privilege?.jymaster) levels.push("jymaster");
  if (levels.length) return levels;
  const maxbr = privilege?.maxbr ?? 0;
  return maxbr >= 1_400_000
    ? ["standard", "higher", "exhigh", "lossless", "hires"]
    : maxbr >= 999_000
      ? ["standard", "higher", "exhigh", "lossless"]
      : ["standard", "higher", "exhigh"];
}

export function neteaseCoverUrl(sourceUrl: string | null | undefined, size = 480): string | null {
  if (!sourceUrl) return null;
  let next = sourceUrl.replace(/^http:/i, "https:");
  if (/music\.126\.net/i.test(next) && !/[?&]param=/.test(next)) {
    next += `${next.includes("?") ? "&" : "?"}param=${size}y${size}`;
  }
  return next;
}

function mapSong(song: RawSong): ProviderTrack {
  const maxbr = song.privilege?.maxbr ?? 0;
  const availableLevels = qualityLevelsFromSong(song);
  const highest = availableLevels[availableLevels.length - 1];
  return {
    // Raw numeric id — the desktop-shaped mapping (providerTrackToUiTrack)
    // adds the netease: prefix exactly once, like the desktop server does.
    id: String(song.id),
    title: song.name ?? `#${song.id}`,
    artist: (song.ar ?? song.artists ?? song.singers ?? []).map((artist) => artist.name).join(" / "),
    album: song.al?.name ?? song.album?.name ?? "",
    duration: Math.round((song.dt ?? song.duration ?? 0) / 1000),
    quality: highest === "jymaster" || highest === "hires"
      ? "Hi-Res"
      : highest === "lossless" ? "Lossless" : "320K",
    source: "netease",
    // Sentinel: resolved against songUrlV1 at playback time (MobileApp).
    streamUrl: `direct:${song.id}`,
    coverUrl: neteaseCoverUrl(song.al?.picUrl ?? song.album?.picUrl, 480),
    likedAt: song.likedAt ?? null,
    bpm: null,
    vip: (song.fee ?? song.privilege?.fee) === 1,
    bitrate: maxbr || null,
    sampleRate: null,
    audioFormat: null,
    currentLevel: null,
    availableLevels,
  };
}

async function invoke<T>(endpoint: string, data?: Record<string, unknown>): Promise<T> {
  const result = await NeteaseDirectPlugin.invoke({ endpoint, data: data ? JSON.stringify(data) : "{}" });
  if (!result.ok) throw new Error(result.message || `netease ${endpoint} failed (${result.code ?? "?"})`);
  return (result.data ?? {}) as T;
}

function today(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function numericSongId(trackId: string): number {
  return Number(trackId.replace(/^(netease:|direct:)+/, ""));
}

// ---- Provider ----

let directActive = false;

export function isDirectActive(): boolean {
  return directActive;
}

export async function refreshDirectStatus(): Promise<boolean> {
  if (!isDirectCapable()) return false;
  try {
    const status = await NeteaseDirectPlugin.status();
    directActive = status.loggedIn;
  } catch {
    directActive = false;
  }
  return directActive;
}

const ACCOUNT_CACHE_KEY = "aria-account-cache";

function readCachedAccount(): NeteaseAccountSummary | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NeteaseAccountSummary;
    return parsed.connected ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedAccount(account: NeteaseAccountSummary): void {
  try {
    if (account.connected) localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(account));
    else localStorage.removeItem(ACCOUNT_CACHE_KEY);
  } catch {
    // best effort
  }
}

export function cachedDirectAccount(): NeteaseAccountSummary | null {
  return readCachedAccount();
}

export async function directAccount(): Promise<NeteaseAccountSummary> {
  const status = await NeteaseDirectPlugin.status();
  if (!status.loggedIn) {
    writeCachedAccount({ connected: false, nickname: null, userId: null, avatarUrl: null, cookiePreview: null });
    return { connected: false, nickname: null, userId: null, avatarUrl: null, cookiePreview: null };
  }
  try {
    await invoke("userAccount");
    const refreshed = await NeteaseDirectPlugin.status();
    const account: NeteaseAccountSummary = {
      connected: true,
      nickname: refreshed.nickname || null,
      userId: String(refreshed.userId || ""),
      avatarUrl: neteaseCoverUrl(refreshed.avatarUrl, 240),
      cookiePreview: "本机会话 · 直连",
    };
    writeCachedAccount(account);
    return account;
  } catch {
    const account: NeteaseAccountSummary = {
      connected: true,
      nickname: status.nickname || null,
      userId: String(status.userId || ""),
      avatarUrl: neteaseCoverUrl(status.avatarUrl, 240),
      cookiePreview: "本机会话 · 直连",
    };
    writeCachedAccount(account);
    return account;
  }
}

export async function directQrStart(): Promise<NeteaseQrStart> {
  const started = await NeteaseDirectPlugin.loginQrStart();
  if (!started.ok || !started.key || !started.qrUrl) {
    throw new Error("二维码生成失败,请稍后重试");
  }
  const qrImage = await QRCode.toDataURL(started.qrUrl, { margin: 1, width: 320 });
  return { key: started.key, qrUrl: started.qrUrl, qrImage, expiresIn: 180 };
}

export async function directQrCheck(key: string): Promise<NeteaseQrCheck> {
  const result = await NeteaseDirectPlugin.loginQrCheck({ key });
  if ((result.code === 803 && !result.loggedIn) || (result.code !== 800 && result.code !== 801 && result.code !== 802 && result.code !== 803)) {
    return {
      code: result.code,
      status: "error",
      message: result.message || "二维码登录失败,请重新生成二维码后重试",
      account: null,
    };
  }
  const status: NeteaseQrCheck["status"] =
    result.code === 803 ? "success" : result.code === 802 ? "scanned" : result.code === 800 ? "expired" : "waiting";
  if (result.code === 803) directActive = true;
  return {
    code: result.code,
    status,
    message: status === "success" ? "登录成功" : status === "scanned" ? "已扫描,确认中" : status === "expired" ? "二维码已过期" : "等待扫描",
    account: result.code === 803
      ? { connected: true, nickname: result.nickname ?? null, userId: null, avatarUrl: neteaseCoverUrl(result.avatarUrl, 240), cookiePreview: "本机会话 · 直连" }
      : null,
  };
}

export async function directCellphoneLogin(
  phone: string,
  credentials: { password?: string; captcha?: string },
  countryCode = "86",
): Promise<{ ok: boolean; code: number; message: string; nickname?: string; avatarUrl?: string }> {
  const result = await NeteaseDirectPlugin.loginCellphone({ phone, ...credentials, countryCode });
  if (result.ok) directActive = true;
  return result;
}

export async function directCaptchaSent(phone: string, countryCode = "86"): Promise<{ ok: boolean; code: number; message: string }> {
  return NeteaseDirectPlugin.captchaSent({ phone, countryCode });
}

export function directLogout(): void {
  directActive = false;
  writeCachedAccount({ connected: false, nickname: null, userId: null, avatarUrl: null, cookiePreview: null });
  void NeteaseDirectPlugin.logout();
}

const LEVEL_TAIL = LEVELS;

function qualityFromLevel(level: string): ProviderTrack["quality"] {
  if (level === "hires" || level === "jymaster" || level === "jyeffect" || level === "sky") return "Hi-Res";
  if (level === "lossless") return "Lossless";
  return "320K";
}

export type DirectStreamMeta = {
  url: string | null;
  bitrate: number | null;
  sampleRate: number | null;
  audioFormat: string | null;
  size: number | null;
  quality: ProviderTrack["quality"];
  currentLevel: ProviderTrack["currentLevel"];
  availableLevels: NonNullable<ProviderTrack["availableLevels"]>;
};

const QUALITY_LADDER: QualityLevel[] = [...LEVELS];

async function requestStreamLevel(trackId: string, candidate: QualityLevel): Promise<DirectStreamMeta | null> {
  const numeric = trackId.replace(/^(netease:|direct:)+/, "");
  const body = await invoke<{ data?: Array<{ url?: string; br?: number; level?: string; size?: number; sr?: number; type?: string }> }>(
    "songUrlV1",
    { id: numeric, level: candidate },
  );
  const first = body.data?.[0];
  if (!first?.url) return null;
  const resolvedLevel = (first.level ?? candidate) as DirectStreamMeta["currentLevel"];
  const tailIndex = resolvedLevel ? LEVEL_TAIL.indexOf(resolvedLevel as QualityLevel) : -1;
  return {
    url: first.url,
    bitrate: first.br ?? null,
    sampleRate: first.sr ?? null,
    audioFormat: first.type ?? null,
    size: first.size ?? null,
    quality: qualityFromLevel(resolvedLevel ?? candidate),
    currentLevel: resolvedLevel,
    availableLevels: tailIndex >= 0 ? [...LEVEL_TAIL.slice(0, tailIndex + 1)] : [...LEVEL_TAIL],
  };
}

export async function directStreamMeta(
  trackId: string,
  level: QualityLevel,
): Promise<DirectStreamMeta> {
  // Walk DOWN the ladder until NetEase actually returns a URL. A single
  // 405/429 is a global cooldown: do not keep hammering lower tiers.
  const ladder = QUALITY_LADDER.slice(0, QUALITY_LADDER.indexOf(level) + 1).reverse();
  for (const candidate of ladder) {
    try {
      const meta = await requestStreamLevel(trackId, candidate);
      if (meta) return meta;
    } catch (error) {
      const message = String(error);
      if (/频繁|风险|429|405|rate/i.test(message)) break;
    }
  }
  return { url: null, bitrate: null, sampleRate: null, audioFormat: null, size: null, quality: "320K", currentLevel: null, availableLevels: ["standard", "higher", "exhigh"] };
}

const directProvider = {
  active: () => directActive,
  liked: async () => {
    const result = await invoke<{ songs?: RawSong[] }>("likedSongs");
    if (!Array.isArray(result.songs)) throw new Error("喜欢列表加载失败");
    return { tracks: result.songs.map(mapSong).sort((a, b) => (b.likedAt ?? 0) - (a.likedAt ?? 0)) };
  },
  daily: async () => {
    const body = await invoke<{ data?: { dailySongs?: RawSong[] } }>("dailySongs");
    return { date: today(), tracks: (body.data?.dailySongs ?? []).map((song) => mapSong(song)), reason: "每日推荐" };
  },
  roam: async (limit: number, options: { excludeIds?: string[] } = {}) => {
    const songs = new Map<number, RawSong>();
    const excluded = new Set((options.excludeIds ?? []).map((id) => Number(id.replace("netease:", ""))));
    // FM usually returns three songs. Gather multiple batches, bounded to
    // avoid retry loops if the provider repeats a batch or rate limits us.
    for (let batch = 0; batch < Math.min(10, Math.ceil(limit / 3) + 2) && songs.size < limit; batch++) {
      try {
        const body = await invoke<{ data?: Array<RawSong | { mainSong: RawSong }> }>("personalFm");
        const before = songs.size;
        for (const entry of body.data ?? []) {
          const song = "mainSong" in entry ? entry.mainSong : entry;
          if (song?.id && !excluded.has(song.id)) songs.set(song.id, song);
        }
        if (songs.size === before) break;
      } catch (error) { if (!songs.size) throw error; break; }
    }
    return { date: today(), tracks: [...songs.values()].slice(0, limit).map(mapSong), reason: "私人漫游" };
  },
  playlists: async () => {
    const body = await invoke<{
      userId?: number;
      playlist?: Array<{
        id: number;
        name: string;
        coverImgUrl?: string;
        trackCount?: number;
        userId?: number;
        subscribed?: boolean;
        specialType?: number;
        creator?: { userId?: number; nickname?: string };
      }>;
    }>("userPlaylists");
    const selfId = body.userId ?? body.playlist?.find((playlist) => playlist.specialType === 5)?.userId ?? 0;
    return {
      playlists: (body.playlist ?? []).map((playlist) => {
        const ownerId = playlist.creator?.userId ?? playlist.userId;
        const owned = selfId ? ownerId === selfId : !playlist.subscribed;
        return {
          id: String(playlist.id),
          name: playlist.name,
          trackCount: playlist.trackCount ?? 0,
          subscribed: Boolean(playlist.subscribed ?? !owned),
          owned,
          creatorName: playlist.creator?.nickname ?? null,
          coverColor: "#c9d3f2",
          coverUrl: neteaseCoverUrl(playlist.coverImgUrl, 320),
        };
      }),
    };
  },
  playlistTracks: async (playlistId: string) => {
    const body = await invoke<{ songs?: RawSong[] }>("playlistTracks", { id: Number(playlistId) });
    return { tracks: (body.songs ?? []).map((song) => mapSong(song)) };
  },
  searchTracks: async (keyword: string, limit: number) => {
    const body = await invoke<{ result?: { songs?: RawSong[] } }>("search", { keyword, type: 1, limit });
    return (body.result?.songs ?? []).map((song) => mapSong(song));
  },
  searchArtists: async (keyword: string, limit: number) => {
    const body = await invoke<{ result?: { artists?: Array<{ id: number; name: string; picUrl?: string; albumSize?: number; musicSize?: number; img1v1Url?: string }> } }>(
      "search",
      { keyword, type: 100, limit },
    );
    return (body.result?.artists ?? []).map((artist): ProviderArtist => ({
      id: String(artist.id),
      name: artist.name,
      source: "netease",
      avatarUrl: neteaseCoverUrl(artist.picUrl || artist.img1v1Url, 240),
      trackCount: artist.musicSize ?? null,
      albumCount: artist.albumSize ?? null,
    }));
  },
  searchPlaylists: async (keyword: string, limit: number) => {
    const body = await invoke<{
      result?: {
        playlists?: Array<{
          id: number;
          name: string;
          coverImgUrl?: string;
          trackCount?: number;
          subscribed?: boolean;
          creator?: { userId?: number; nickname?: string };
        }>;
      };
    }>("search", { keyword, type: 1000, limit });
    return (body.result?.playlists ?? []).map((playlist): ProviderPlaylist => ({
      id: String(playlist.id),
      name: playlist.name,
      trackCount: playlist.trackCount ?? 0,
      subscribed: Boolean(playlist.subscribed),
      owned: false,
      creatorName: playlist.creator?.nickname ?? null,
      coverColor: "#c9d3f2",
      coverUrl: neteaseCoverUrl(playlist.coverImgUrl, 320),
    }));
  },
  artistTopSongs: async (artistId: string) => {
    const body = await invoke<{ songs?: RawSong[] }>("artistTopSongs", { id: Number(artistId) });
    return { tracks: (body.songs ?? []).map((song) => mapSong(song)) };
  },
  lyrics: async (trackId: string) => {
    const body = await invoke<{ lrc?: { lyric?: string }; tlyric?: { lyric?: string }; yrc?: { lyric?: string }; ytlrc?: { lyric?: string } }>("lyric", {
      id: numericSongId(trackId),
    });
    const wordLines = parseYrc(body.yrc?.lyric);
    const lines = wordLines.length ? wordLines : parseLrc(body.lrc?.lyric);
    return { lyrics: withTranslations(lines, body.ytlrc?.lyric ?? body.tlyric?.lyric) };
  },
  streamMeta: (trackId: string, level: "standard" | "higher" | "exhigh" | "lossless" | "hires" | "jymaster") =>
    directStreamMeta(trackId, level),
  setLike: async (trackId: string, liked: boolean) => {
    await invoke("setLike", { id: numericSongId(trackId), like: liked });
    return { ok: true, liked };
  },
  warmup: async (trackIds: string[], level: string) => {
    let cached = 0;
    const target = level as QualityLevel;
    for (const trackId of trackIds) {
      try {
        // Warm only the requested tier. Walking the full fallback ladder for
        // every prefetch row is the fastest way to trigger NetEase 405/-460.
        const meta = await requestStreamLevel(trackId, target);
        if (meta?.url) cached += 1;
      } catch (error) {
        // Single-track warm failures are fine; a global cooldown means stop
        // the whole batch instead of hammering the endpoint.
        if (/频繁|风险|429|405|rate/i.test(String(error))) break;
      }
    }
    return { ok: true, cached };
  },
  coverUrl: (sourceUrl: string) => neteaseCoverUrl(sourceUrl, 480) ?? sourceUrl,
  account: directAccount,
  qrStart: directQrStart,
  qrCheck: directQrCheck,
};

/** Registers the direct provider with core/api when the device can act as the source. */
export function registerDirectProvider(): void {
  registerNeteaseDirectProvider(directProvider);
}

/** Boot helper: enables direct mode when the native session is logged in. */
export async function initDirectMode(): Promise<boolean> {
  if (!isDirectCapable() || getDataMode() !== "direct") return false;
  const loggedIn = await refreshDirectStatus();
  if (loggedIn) registerDirectProvider();
  return loggedIn;
}

export async function enableDirectMode(): Promise<boolean> {
  setDataMode("direct");
  const loggedIn = await refreshDirectStatus();
  if (loggedIn) registerDirectProvider();
  return loggedIn;
}

export function disableDirectMode(): void {
  setDataMode("desktop");
  directActive = false;
  registerNeteaseDirectProvider(null);
}

// Sentinel playback URLs ("direct:<songId>") resolve here before load.
export async function resolveDirectStreamUrl(
  trackId: string,
  level: "standard" | "higher" | "exhigh" | "lossless" | "hires" | "jymaster",
): Promise<DirectStreamMeta | null> {
  try {
    // The native bridge is normally fast, but a wedged CDN request must not
    // leave the player UI on "正在获取播放链接…" forever.
    return await withTimeout(directStreamMeta(trackId, level), 20_000);
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("stream resolution timed out")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
