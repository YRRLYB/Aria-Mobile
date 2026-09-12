import { Capacitor, registerPlugin } from "@capacitor/core";
import QRCode from "qrcode";
import type { LyricLine } from "@/data/music";
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
  loginQrCheck(options: { key: string }): Promise<{ code: number; loggedIn: boolean; nickname?: string; avatarUrl?: string }>;
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
  al?: { id: number; name: string; picUrl?: string };
  dt?: number;
  privilege?: { maxbr?: number; pl?: number };
};

function mapSong(song: RawSong): ProviderTrack {
  const maxbr = song.privilege?.maxbr ?? 0;
  return {
    id: `netease:${song.id}`,
    title: song.name ?? `#${song.id}`,
    artist: (song.ar ?? []).map((artist) => artist.name).join(" / "),
    album: song.al?.name ?? "",
    duration: song.dt ?? 0,
    // Display tag from the strongest tier the catalog reports; the real
    // played level arrives with streamMeta after warm/play.
    quality: maxbr >= 1400_000 ? "Hi-Res" : maxbr >= 999_000 ? "Lossless" : "320K",
    source: "netease",
    // Sentinel: resolved against songUrlV1 at playback time (MobileApp).
    streamUrl: `direct:${song.id}`,
    coverUrl: song.al?.picUrl ?? null,
    likedAt: null,
    bpm: null,
    bitrate: maxbr || null,
    sampleRate: null,
    currentLevel: null,
    availableLevels: maxbr >= 999_000 ? ["standard", "higher", "exhigh", "lossless"] : ["standard", "higher", "exhigh"],
  };
}

async function invoke<T>(endpoint: string, data?: Record<string, unknown>): Promise<T> {
  const result = await NeteaseDirectPlugin.invoke({ endpoint, data: data ? JSON.stringify(data) : "{}" });
  if (!result.ok) throw new Error(result.message || `netease ${endpoint} failed (${result.code ?? "?"})`);
  return (result.data ?? {}) as T;
}

function parseLrc(source: string | undefined): LyricLine[] {
  if (!source) return [];
  const lines: LyricLine[] = [];
  for (const raw of source.split("\n")) {
    const match = raw.match(/^\s*\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/);
    if (!match) continue;
    const text = match[4].trim();
    if (!text) continue;
    lines.push({ time: `${match[1]}:${match[2]}`, text });
  }
  return lines;
}

function withTranslations(lrc: LyricLine[], translationSource: string | undefined): LyricLine[] {
  const translations = parseLrc(translationSource);
  if (!translations.length) return lrc;
  const byTime = new Map(translations.map((line) => [line.time, line.text]));
  return lrc.map((line) => {
    const translation = byTime.get(line.time);
    return translation ? { ...line, translation } : line;
  });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
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

export async function directAccount(): Promise<NeteaseAccountSummary> {
  const status = await NeteaseDirectPlugin.status();
  if (!status.loggedIn) {
    return { connected: false, nickname: null, userId: null, avatarUrl: null, cookiePreview: null };
  }
  try {
    await invoke("userAccount");
    const refreshed = await NeteaseDirectPlugin.status();
    return {
      connected: true,
      nickname: refreshed.nickname || null,
      userId: String(refreshed.userId || ""),
      avatarUrl: refreshed.avatarUrl || null,
      cookiePreview: "本机会话 · 直连",
    };
  } catch {
    return {
      connected: true,
      nickname: status.nickname || null,
      userId: String(status.userId || ""),
      avatarUrl: status.avatarUrl || null,
      cookiePreview: "本机会话 · 直连",
    };
  }
}

export async function directQrStart(): Promise<NeteaseQrStart> {
  const started = await NeteaseDirectPlugin.loginQrStart();
  const qrImage = await QRCode.toDataURL(started.qrUrl, { margin: 1, width: 320 });
  return { key: started.key, qrUrl: started.qrUrl, qrImage, expiresIn: 180 };
}

export async function directQrCheck(key: string): Promise<NeteaseQrCheck> {
  const result = await NeteaseDirectPlugin.loginQrCheck({ key });
  const status: NeteaseQrCheck["status"] =
    result.code === 803 ? "success" : result.code === 802 ? "scanned" : result.code === 800 ? "expired" : "waiting";
  if (result.code === 803) directActive = true;
  return {
    code: result.code,
    status,
    message: status === "success" ? "登录成功" : status === "scanned" ? "已扫描,确认中" : status === "expired" ? "二维码已过期" : "等待扫描",
    account: result.code === 803
      ? { connected: true, nickname: result.nickname ?? null, userId: null, avatarUrl: result.avatarUrl ?? null, cookiePreview: "本机会话 · 直连" }
      : null,
  };
}

export async function directCellphoneLogin(
  phone: string,
  credentials: { password?: string; captcha?: string },
  countryCode = "86",
): Promise<{ ok: boolean; code: number; message: string }> {
  const result = await NeteaseDirectPlugin.loginCellphone({ phone, ...credentials, countryCode });
  if (result.ok) directActive = true;
  return result;
}

export async function directCaptchaSent(phone: string, countryCode = "86"): Promise<{ ok: boolean; code: number; message: string }> {
  return NeteaseDirectPlugin.captchaSent({ phone, countryCode });
}

export function directLogout(): void {
  directActive = false;
  void NeteaseDirectPlugin.logout();
}

const LEVEL_TAIL = ["standard", "higher", "exhigh", "lossless", "hires", "jymaster"] as const;

function qualityFromLevel(level: string): ProviderTrack["quality"] {
  if (level === "hires" || level === "jymaster") return "Hi-Res";
  if (level === "lossless") return "Lossless";
  return "320K";
}

export type DirectStreamMeta = {
  url: string | null;
  bitrate: number | null;
  sampleRate: number | null;
  size: number | null;
  quality: ProviderTrack["quality"];
  currentLevel: ProviderTrack["currentLevel"];
  availableLevels: NonNullable<ProviderTrack["availableLevels"]>;
};

export async function directStreamMeta(
  trackId: string,
  level: "standard" | "higher" | "exhigh" | "lossless" | "hires" | "jymaster",
): Promise<DirectStreamMeta> {
  const numeric = trackId.replace("netease:", "");
  const body = await invoke<{ data?: Array<{ url?: string; br?: number; level?: string; size?: number; sr?: number }> }>(
    "songUrlV1",
    { id: numeric, level },
  );
  const first = body.data?.[0];
  const resolvedLevel = (first?.level ?? level) as DirectStreamMeta["currentLevel"];
  const tailIndex = LEVEL_TAIL.indexOf(resolvedLevel as (typeof LEVEL_TAIL)[number]);
  return {
    url: first?.url ?? null,
    bitrate: first?.br ?? null,
    sampleRate: null,
    size: null,
    quality: qualityFromLevel(resolvedLevel ?? "lossless"),
    currentLevel: resolvedLevel,
    availableLevels: tailIndex >= 0 ? [...LEVEL_TAIL.slice(0, tailIndex + 1)] : ["standard", "higher", "exhigh"],
  };
}

const directProvider = {
  active: () => directActive,
  liked: async () => {
    const liked = await invoke<{ ids?: number[] }>("likedIds");
    const ids = (liked.ids ?? []).map((id) => Number(id)).filter(Boolean);
    if (!ids.length) return { tracks: [] };
    const detail = await invoke<{ songs?: RawSong[] }>("songDetail", { ids });
    // song_detail may answer out of order — restore the likelist order
    // (newest liked first).
    const byId = new Map((detail.songs ?? []).map((song) => [Number(song.id), song]));
    return { tracks: ids.map((id) => byId.get(id)).filter(Boolean).map((song) => mapSong(song as RawSong)) };
  },
  daily: async () => {
    const body = await invoke<{ data?: { dailySongs?: RawSong[] } }>("dailySongs");
    return { date: today(), tracks: (body.data?.dailySongs ?? []).map((song) => mapSong(song)), reason: "每日推荐" };
  },
  roam: async (limit: number) => {
    const body = await invoke<{ data?: Array<RawSong | { mainSong: RawSong }> }>("personalFm");
    const songs = (body.data ?? [])
      .slice(0, limit)
      .map((entry) => (entry && typeof entry === "object" && "mainSong" in entry ? (entry as { mainSong: RawSong }).mainSong : entry as RawSong))
      .filter(Boolean);
    return { date: today(), tracks: songs.map((song) => mapSong(song)), reason: "私人漫游" };
  },
  playlists: async () => {
    const body = await invoke<{ playlist?: Array<{ id: number; name: string; coverImgUrl?: string; trackCount?: number; userId?: number }> }>(
      "userPlaylists",
    );
    const userId = body.playlist?.[0]?.userId;
    return {
      playlists: (body.playlist ?? [])
        .filter((playlist) => playlist.userId === userId)
        .map((playlist) => ({
          id: String(playlist.id),
          name: playlist.name,
          trackCount: playlist.trackCount ?? 0,
          subscribed: false,
          coverColor: "#c9d3f2",
          coverUrl: playlist.coverImgUrl ?? null,
        })),
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
    const body = await invoke<{ result?: { artists?: Array<{ id: number; name: string; picUrl?: string; albumSize?: number; img1v1Url?: string }> } }>(
      "search",
      { keyword, type: 100, limit },
    );
    return (body.result?.artists ?? []).map((artist): ProviderArtist => ({
      id: String(artist.id),
      name: artist.name,
      source: "netease",
      avatarUrl: artist.img1v1Url ?? artist.picUrl ?? null,
      trackCount: null,
      albumCount: artist.albumSize ?? null,
    }));
  },
  artistTopSongs: async (artistId: string) => {
    const body = await invoke<{ songs?: RawSong[] }>("artistTopSongs", { id: Number(artistId) });
    return { tracks: (body.songs ?? []).map((song) => mapSong(song)) };
  },
  lyrics: async (trackId: string) => {
    const body = await invoke<{ lrc?: { lyric?: string }; tlyric?: { lyric?: string } }>("lyric", {
      id: Number(trackId.replace("netease:", "")),
    });
    return { lyrics: withTranslations(parseLrc(body.lrc?.lyric), body.tlyric?.lyric) };
  },
  streamMeta: (trackId: string, level: "standard" | "higher" | "exhigh" | "lossless" | "hires" | "jymaster") =>
    directStreamMeta(trackId, level),
  setLike: async (trackId: string, liked: boolean) => {
    await invoke("setLike", { id: Number(trackId.replace("netease:", "")), like: liked });
    return { ok: true, liked };
  },
  warmup: async (trackIds: string[], level: string) => {
    let cached = 0;
    for (const trackId of trackIds) {
      try {
        await directStreamMeta(trackId, level as "standard" | "higher" | "exhigh" | "lossless" | "hires" | "jymaster");
        cached += 1;
      } catch {
        // single-track warm failures are fine
      }
    }
    return { ok: true, cached };
  },
  coverUrl: (sourceUrl: string) => sourceUrl,
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
    return await directStreamMeta(trackId, level);
  } catch {
    return null;
  }
}
