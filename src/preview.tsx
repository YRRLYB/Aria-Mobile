import { StrictMode, useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import "./mobile.css";
import type { LyricLine, Track } from "@/data/music";
import type { MobileControls } from "./MobileApp";
import { CollectionScreen } from "./Collections";
import { ConnectScreen } from "./ConnectScreen";
import { CoverCollage, MiniPlayer, TabBar, TrackCover } from "./Chrome";
import { NowPlaying } from "./NowPlaying";
import { Heart, Play, Shuffle } from "./icons";
import { HomeScreen, LibraryScreen, SearchScreen, SettingsScreen, AlbumDetail, ArtistDetail } from "./screens";
import { groupTracksByAlbum } from "./libraryView";

function cover(title: string, from: string, to: string, accent: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="720" height="720" fill="url(#g)"/><circle cx="560" cy="160" r="180" fill="${accent}" opacity=".28"/><circle cx="160" cy="600" r="240" fill="#ffffff" opacity=".08"/><text x="56" y="610" fill="#fff" font-family="Arial" font-size="54" font-weight="700">${title}</text><text x="58" y="654" fill="#fff" opacity=".55" font-family="Arial" font-size="22">ARIA SESSION</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function avatar(name: string, from: string, to: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="240" height="240" fill="url(#g)"/><circle cx="190" cy="52" r="70" fill="#fff" opacity=".14"/><text x="120" y="148" fill="#fff" text-anchor="middle" font-family="Arial" font-size="86" font-weight="700">${name.slice(0, 1)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function wordLyrics(): LyricLine[] {
  const line = (time: string, text: string, start: number): LyricLine => {
    const parts = /\s/.test(text) ? text.match(/\S+\s*|\s+/g) ?? [] : Array.from(text);
    return {
      time,
      text,
      words: parts.filter(Boolean).map((word, index) => ({
        start: start + index * 0.48,
        duration: 0.48,
        text: word,
      })),
    };
  };
  return [
    line("00:00", "夜色落在窗边", 0),
    line("00:18", "把城市调成静音", 18),
    line("00:36", "我听见风经过你的名字", 36),
    line("00:54", "像一场没有尽头的雨", 54),
    line("01:12", "灯光慢慢退到远处", 72),
    line("01:30", "只留下心跳的节拍", 90),
    line("01:48", "如果明天还会见面", 108),
    line("02:06", "就把这首歌再唱一遍", 126),
  ].map((entry, index) => ({
    ...entry,
    translation: index % 2 === 0 ? undefined : "And the night keeps listening",
  }));
}

const lyrics = wordLyrics();
const palette = ["#5b6c9a", "#8a5a72", "#3d6b70", "#7b6240", "#4d567d", "#6d4f75"];

const baseTracks: Track[] = [
  ["夜航", "林间电台", "夜间飞行", "04:12"],
  ["城市静音", "林间电台", "夜间飞行", "03:48"],
  ["风向标", "北岸", "缓慢天气", "04:36"],
  ["沿海公路", "北岸", "缓慢天气", "05:02"],
  ["留在星期四", "南方信号", "房间回声", "03:26"],
  ["雨停之后", "南方信号", "房间回声", "04:18"],
].map(([title, artist, album, duration], index) => ({
  id: `netease:${1000 + index}`,
  providerId: String(1000 + index),
  title,
  artist,
  album,
  duration,
  quality: index % 3 === 0 ? "Lossless" : "320K",
  source: "netease",
  streamUrl: `https://example.invalid/audio/${index}.flac`,
  coverUrl: cover(title, palette[index], "#12131a", palette[(index + 2) % palette.length]),
  cover: palette[index],
  accent: palette[index],
  waveform: [24, 40, 66, 48, 78, 56, 36, 84, 62, 42, 70, 52],
  lyrics: index === 0 ? lyrics : [{ time: "00:00", text: "歌词等待同步" }, { time: "00:15", text: "播放后自动加载" }],
  lyricStatus: index === 0 ? "linked" : "searchable",
  likedAt: Date.now() - index * 3_600_000,
  bitrate: 1_411_200,
  sampleRate: 44_100,
  audioFormat: "audio/flac",
}));

const offlineTrack: Track = {
  ...baseTracks[4],
  id: "netease:offline-1",
  title: "离线备份曲",
  album: "夜班记录",
  duration: "04:02",
  offline: true,
  streamUrl: "file:///storage/emulated/0/Android/data/com.yrrlyb.aria.mobile/files/offline/netease_offline-1.flac",
};

const deviceTracks: Track[] = [
  {
    ...baseTracks[1],
    id: "device:1",
    title: "通勤电台",
    artist: "北岸",
    album: "缓慢天气",
    duration: "03:32",
    source: "local",
    streamUrl: "content://media/external/audio/media/1",
    coverUrl: cover("通勤电台", "#6d7a8c", "#242a34", "#9fb4d8"),
    offline: false,
  },
  {
    ...baseTracks[3],
    id: "device:2",
    title: "夜班巴士",
    artist: "南方信号",
    album: "夜班记录",
    duration: "04:22",
    source: "local",
    streamUrl: "content://media/external/audio/media/2",
    coverUrl: cover("夜班巴士", "#4b5b78", "#171d29", "#aab8d6"),
    offline: false,
  },
];

const localTracks: Track[] = [
  {
    ...baseTracks[2],
    id: "local:1",
    title: "旧唱片店",
    artist: "林间电台",
    album: "夜间飞行",
    duration: "04:06",
    source: "local",
    streamUrl: "http://192.168.1.29:3636/api/library/tracks/1/stream",
    coverUrl: cover("旧唱片店", "#7c8a75", "#24302a", "#c7d8ad"),
  },
  {
    ...baseTracks[3],
    id: "local:2",
    title: "海岸线",
    artist: "北岸",
    album: "缓慢天气",
    duration: "03:54",
    source: "local",
    streamUrl: "http://192.168.1.29:3636/api/library/tracks/2/stream",
    coverUrl: cover("海岸线", "#6a7b8d", "#212a35", "#b7c8da"),
  },
  {
    ...baseTracks[4],
    id: "local:3",
    title: "星期四的信",
    artist: "南方信号",
    album: "房间回声",
    duration: "03:28",
    source: "local",
    streamUrl: "http://192.168.1.29:3636/api/library/tracks/3/stream",
    coverUrl: cover("星期四的信", "#9b7e6b", "#2b211b", "#d9c0aa"),
  },
  {
    ...baseTracks[5],
    id: "local:4",
    title: "雨后车站",
    artist: "南方信号",
    album: "房间回声",
    duration: "04:10",
    source: "local",
    streamUrl: "http://192.168.1.29:3636/api/library/tracks/4/stream",
    coverUrl: cover("雨后车站", "#6d6d8d", "#232334", "#c2c2e0"),
  },
];

const playlists = [
  { id: "p1", name: "深夜电台", trackCount: 38, subscribed: true, owned: false, creatorName: "Aria电台", coverColor: "#8a5a72", coverUrl: cover("深夜电台", "#8a5a72", "#221722", "#d6a2b9") },
  { id: "p2", name: "驾驶时听", trackCount: 24, subscribed: true, owned: false, creatorName: "公路音乐", coverColor: "#4d567d", coverUrl: cover("驾驶时听", "#4d567d", "#161b2b", "#9fa9d9") },
  { id: "p3", name: "雨天房间", trackCount: 16, subscribed: false, owned: true, creatorName: "YRR_LYB", coverColor: "#3d6b70", coverUrl: cover("雨天房间", "#3d6b70", "#142524", "#9cd1d1") },
  { id: "p4", name: "旧日回声", trackCount: 52, subscribed: true, owned: false, creatorName: "旧唱片店", coverColor: "#7b6240", coverUrl: cover("旧日回声", "#7b6240", "#2b2216", "#d7be8c") },
];

const history = baseTracks.map((track, index) => ({
  track,
  playedAt: Date.now() - index * 2_400_000,
  count: 1,
}));

const artists = [
  { id: "artist:lin", name: "林间电台", source: "local" as const, trackCount: 6, albumCount: 2, avatarUrl: avatar("林", "#b9c6dc", "#6f7f9c") },
  { id: "artist:north", name: "北岸", source: "local" as const, trackCount: 4, albumCount: 1, avatarUrl: avatar("北", "#c9b8d8", "#8873a0") },
  { id: "artist:south", name: "南方信号", source: "local" as const, trackCount: 3, albumCount: 1, avatarUrl: avatar("南", "#d8c1b4", "#9b7563") },
];

const noop = () => undefined;

const controls = {
  openCollection: noop,
  refreshLikedData: async () => undefined,
  refreshDailyData: async () => undefined,
  loadMoreRoam: async () => undefined,
  directMode: true,
  deviceTracks,
  neteaseLikedIds: Object.fromEntries(baseTracks.slice(0, 5).map((track) => [track.id, true])),
  activeTrack: baseTracks[0],
  actualQuality: { bitrate: 1_411_200, sampleRate: 44_100, audioFormat: "audio/flac" },
  activeTrackId: baseTracks[0].id,
  playing: true,
  currentTime: 37.8,
  durationSeconds: 252,
  volume: 72,
  sleepTimerRemaining: null,
  setSleepTimer: noop,
  playbackSpeed: 1,
  setPlaybackSpeed: noop,
  equalizerSupported: true,
  equalizerPresets: ["正常", "古典", "流行", "摇滚", "爵士", "人声"],
  equalizerPreset: 2,
  setEqualizerPreset: noop,
  offlineTracks: [offlineTrack],
  downloadingTrackIds: [],
  downloadTrack: noop,
  deleteOfflineTrack: noop,
  shuffleEnabled: false,
  repeatMode: "all" as const,
  hifiEnabled: false,
  qualityLevel: "lossless" as const,
  qualitySwitching: false,
  playQueueTracks: baseTracks,
  localTracks,
  likedLocalTracks: [localTracks[0], localTracks[2]],
  likedNeteaseTracks: baseTracks.slice(0, 4),
  dailyTracks: baseTracks.slice(0, 5),
  roamTracks: baseTracks.slice(1, 6),
  playlistTracks: baseTracks,
  providerPlaylists: playlists,
  selectedPlaylist: null,
  playlistLoading: false,
  playlistProgress: baseTracks[2]
    ? { p1: { trackId: baseTracks[2].id, position: 73, updatedAt: Date.now() } }
    : {},
  neteaseAccount: {
    connected: true,
    nickname: "YRR_LYB",
    userId: "94321",
    avatarUrl: cover("云", "#6c7a96", "#1e2430", "#c9d6ef"),
    cookiePreview: "本机会话 · 直连",
  },
  setNeteaseAccount: noop,
  playHistory: history,
  playCounts: Object.fromEntries(baseTracks.map((track, index) => [track.id, 12 - index])),
  likedTrackIds: { [localTracks[0].id]: true, [localTracks[2].id]: true },
  searchBundle: { localTracks: [], neteaseTracks: baseTracks.slice(0, 5), artists, playlists },
  searchLoading: false,
  artistTracks: [],
  selectedArtist: null,
  artistSummaries: artists,
  historyTracks: baseTracks,
  libraryMeta: { roots: 2, updatedAt: new Date().toISOString() },
  connection: { serverUrl: "http://192.168.1.29:3636", token: "aria-demo-token" },
  searchQuery: "夜",
  chooseTrack: noop,
  playShuffledTracks: noop,
  playPlaylist: noop,
  togglePlayback: noop,
  stopPlayback: noop,
  playNext: noop,
  playPrevious: noop,
  clearQueue: noop,
  reorderQueue: noop,
  removeFromQueue: noop,
  playNextInQueue: noop,
  seekTo: noop,
  setVolume: noop,
  toggleShuffle: noop,
  toggleRepeatMode: noop,
  toggleLikeTrack: noop,
  openPlaylist: async () => undefined,
  closePlaylist: noop,
  refreshNeteaseData: async () => undefined,
  refreshRoamData: async () => undefined,
  setSelectedArtist: noop,
  openArtist: noop,
  setSearchQuery: noop,
  setHifiEnabled: noop,
  setQualityLevel: noop,
  openNowPlaying: noop,
  onLyricsCollapse: noop,
  disconnect: noop,
  switchToDesktopMode: noop,
  addDeviceTracks: noop,
  usbExclusive: { enabled: false, connected: false, supported: true },
  setUsbExclusiveEnabled: async () => undefined,
} as unknown as MobileControls;

const params = new URLSearchParams(location.search);
const page = params.get("page") ?? "home";
const collection = (params.get("collection") ?? "liked") as "liked" | "history" | "daily" | "roam";
const section = (params.get("section") ?? "liked") as "liked" | "albums" | "artists" | "playlists" | "history";
const frameWidth = Math.max(320, Math.min(460, Number(params.get("w")) || 390));
const frameHeight = Math.max(700, Math.min(960, Number(params.get("h")) || 844));
const searchQueryParam = params.get("q");
const searchControls = searchQueryParam === null ? controls : {
  ...controls,
  searchQuery: searchQueryParam,
  searchBundle: params.get("empty") === "1"
    ? { localTracks: [], neteaseTracks: [], artists: [], playlists: [] }
    : controls.searchBundle,
};

function Page() {
  // Interactive like state on the player page so the pulse animation can be
  // exercised in the preview harness (the mock active track is netease-source,
  // whose liked flag comes from neteaseLikedIds).
  const [likedIds, setLikedIds] = useState<Record<string, true>>(controls.neteaseLikedIds);
  if (page === "player") {
    return (
      <NowPlaying
        {...controls}
        neteaseLikedIds={likedIds}
        toggleLikeTrack={(trackId: string) =>
          setLikedIds((current) => {
            const next = { ...current };
            if (next[trackId]) delete next[trackId];
            else next[trackId] = true;
            return next;
          })
        }
        onClose={noop}
      />
    );
  }
  if (page === "connect") {
    return <ConnectScreen onConnected={noop} />;
  }
  if (page === "collection") {
    return (
      <div className="safe-top h-full overflow-y-auto px-4 pb-4 pt-3">
        <CollectionScreen collection={collection} controls={controls} onBack={noop} />
      </div>
    );
  }
  if (page === "album") {
    const album = groupTracksByAlbum([...baseTracks, ...localTracks]).find((item) => item.title === "房间回声")
      ?? groupTracksByAlbum([...baseTracks, ...localTracks])[0];
    return (
      <div className="safe-top h-full overflow-y-auto px-4 pb-4 pt-3">
        {album && <AlbumDetail album={album} controls={controls} onBack={noop} />}
      </div>
    );
  }
  if (page === "artist") {
    const artist = artists[2];
    const tracks = [...baseTracks, ...localTracks].filter((track) => track.artist === artist.name);
    return (
      <div className="safe-top h-full overflow-y-auto px-4 pb-4 pt-3">
        <ArtistDetail artist={artist} tracks={tracks} controls={controls} onBack={noop} />
      </div>
    );
  }
  const tab = page === "search" ? "search" : page === "settings" ? "settings" : (page === "library" || page === "playlist") ? "library" : "home";
  return (
    <div className="flex h-full flex-col">
      <div className="safe-top no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-3">
        {page === "home" && <HomeScreen {...controls} />}
        {page === "library" && <LibraryScreen {...controls} initialSection={section} />}
        {page === "playlist" && (
          <LibraryScreen
            {...controls}
            selectedPlaylist={playlists[0]}
            playlistTracks={baseTracks.slice(0, 5)}
            initialSection="playlists"
          />
        )}
        {page === "search" && <SearchScreen {...searchControls} />}
        {page === "settings" && <SettingsScreen {...controls} directMode={false} />}
      </div>
      <MiniPlayer {...controls} />
      <TabBar activeTab={tab} onSelect={noop} />
    </div>
  );
}


function LabTracks() {
  return [...controls.likedNeteaseTracks, ...controls.likedLocalTracks].slice(0, 8);
}

/** A · 深色高级：渐变底 + 大字 + 封面悬浮右侧 */
function HeroLabA({ tracks, onOpen, onPlayAll, onShuffle }: { tracks: Track[]; onOpen: () => void; onPlayAll: () => void; onShuffle: () => void }) {
  const first = tracks[0];
  return (
    <div
      className="relative overflow-hidden rounded-[1.5rem] p-5 text-white shadow-[0_22px_60px_rgba(30,25,45,0.45)]"
      style={{ background: "linear-gradient(135deg, #3c2a4d 0%, #6e3b52 48%, #2c2338 100%)" }}
    >
      <div className="pointer-events-none absolute -right-8 -top-10 size-44 overflow-hidden rounded-full opacity-45 blur-xl">
        {first && <TrackCover track={first} className="size-full" />}
      </div>
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">Liked · 我喜欢的</p>
          <p className="mt-1.5 text-[1.55rem] font-bold leading-tight">{tracks.length} 首歌</p>
          <p className="mt-0.5 text-xs text-white/55">按收藏时间排序</p>
        </div>
        {first && <TrackCover track={first} className="size-20 shrink-0 rounded-[1rem] shadow-2xl ring-2 ring-white/25" />}
      </div>
      <div className="relative mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onPlayAll}
          disabled={!tracks.length}
          className="tap-scale flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-neutral-950 transition active:scale-[0.98] disabled:opacity-40"
        >
          <Play className="size-4" />
          播放全部
        </button>
        <button
          type="button"
          onClick={onShuffle}
          disabled={!tracks.length}
          className="tap-scale flex size-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white transition active:scale-95 disabled:opacity-40"
          aria-label="随机播放"
        >
          <Shuffle className="size-4" />
        </button>
      </div>
      <button type="button" onClick={onOpen} className="absolute inset-0" aria-label="查看我喜欢的音乐" />
      <div className="relative">
        <div className="pointer-events-none absolute -inset-x-5 bottom-0 h-14" />
      </div>
    </div>
  );
}

/** B · 极简排版：白卡 + 大标题 + 叠压小封面 + 玫红主按钮 */
function HeroLabB({ tracks, onOpen, onPlayAll, onShuffle }: { tracks: Track[]; onOpen: () => void; onPlayAll: () => void; onShuffle: () => void }) {
  const covers = tracks.slice(0, 4);
  return (
    <div className="rounded-[1.5rem] border border-neutral-950/[0.08] bg-white/85 p-5 shadow-[0_14px_40px_rgba(47,55,76,0.12)]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xl font-bold tracking-tight text-neutral-950">我喜欢的音乐</p>
        <p className="text-sm font-medium text-neutral-400">{tracks.length} 首</p>
      </div>
      <div className="mt-3 h-px bg-neutral-950/[0.06]" />
      <div className="mt-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center">
          {covers.map((track, index) => (
            <span
              key={`${track.id}-${index}`}
              className={`relative block size-11 shrink-0 overflow-hidden rounded-[0.55rem] shadow-md ring-2 ring-white ${index > 0 ? "-ml-2.5" : ""}`}
              style={{ zIndex: index }}
            >
              <TrackCover track={track} className="size-full" />
            </span>
          ))}
          {!covers.length && <span className="text-[11px] text-neutral-400">还没有收藏</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onShuffle}
            disabled={!tracks.length}
            className="tap-scale rounded-full bg-neutral-950/[0.05] px-3.5 py-2 text-xs font-medium text-neutral-600 transition active:scale-95 disabled:opacity-40"
          >
            随机
          </button>
          <button
            type="button"
            onClick={onPlayAll}
            disabled={!tracks.length}
            className="tap-scale rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(244,63,94,0.4)] transition active:scale-95 disabled:opacity-40"
          >
            播放
          </button>
        </div>
      </div>
      <button type="button" onClick={onOpen} className="absolute inset-0" aria-label="查看我喜欢的音乐" />
    </div>
  );
}

/** C · 转动唱片横幅：黑胶从左侧探出 */
function HeroLabC({ tracks, onOpen, onPlayAll, onShuffle }: { tracks: Track[]; onOpen: () => void; onPlayAll: () => void; onShuffle: () => void }) {
  const first = tracks[0];
  return (
    <div className="relative flex items-center gap-4 overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/78 py-5 pl-24 pr-5 shadow-[0_14px_40px_rgba(47,55,76,0.14)] backdrop-blur">
      <div className="absolute -left-7 top-1/2 -translate-y-1/2">
        <span className="aria-disc relative block size-28 overflow-hidden rounded-full shadow-[0_10px_30px_rgba(23,23,23,0.35)] ring-4 ring-white/80" data-paused="false">
          {first ? <TrackCover track={first} className="size-full" /> : <div className="size-full bg-neutral-300" />}
          <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: "repeating-radial-gradient(circle at 50% 50%, rgba(0,0,0,0.16) 0 2px, rgba(0,0,0,0) 2px 4.5px)" }} />
          <span aria-hidden className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-950/85 ring-2 ring-white/60" />
        </span>
      </div>
      <div className="relative min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-rose-500">我喜欢的音乐</p>
        <p className="mt-0.5 truncate text-lg font-bold text-neutral-950">{tracks.length} 首</p>
        <p className="truncate text-[11px] text-neutral-500">按收藏时间排序</p>
      </div>
      <div className="relative flex shrink-0 flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={onPlayAll}
          disabled={!tracks.length}
          className="tap-scale flex size-11 items-center justify-center rounded-full bg-neutral-950 text-white shadow-[0_8px_20px_rgba(23,23,23,0.3)] transition active:scale-95 disabled:opacity-40"
          aria-label="播放我喜欢的音乐"
        >
          <Play className="size-4 translate-x-[1px]" />
        </button>
        <button
          type="button"
          onClick={onShuffle}
          disabled={!tracks.length}
          className="tap-scale flex size-9 items-center justify-center rounded-full bg-neutral-950/[0.06] text-neutral-700 transition active:scale-95 disabled:opacity-40"
          aria-label="随机播放"
        >
          <Shuffle className="size-3.5" />
        </button>
      </div>
      <button type="button" onClick={onOpen} className="absolute inset-0" aria-label="查看我喜欢的音乐" />
    </div>
  );
}


/** E · 彩色玻璃：多色柔光底 + 毛玻璃内板 */
function HeroLabE({ tracks, onOpen, onPlayAll, onShuffle }: { tracks: Track[]; onOpen: () => void; onPlayAll: () => void; onShuffle: () => void }) {
  const covers = tracks.slice(0, 3);
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] p-4">
      <div className="absolute inset-0" style={{ background: "linear-gradient(130deg,#fda4af 0%,#c4b5fd 40%,#a5b4fc 68%,#fcd34d 100%)" }} aria-hidden />
      <div className="absolute -left-8 -top-12 size-40 rounded-full bg-white/45 blur-2xl" aria-hidden />
      <div className="absolute -bottom-14 right-0 size-44 rounded-full bg-rose-300/50 blur-2xl" aria-hidden />
      <div className="relative rounded-[1.1rem] border border-white/60 bg-white/55 p-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-rose-500">我喜欢的音乐</p>
            <p className="mt-0.5 text-2xl font-bold text-neutral-950">{tracks.length} 首</p>
          </div>
          <div className="flex items-center">
            {covers.map((track, index) => (
              <span
                key={`${track.id}-${index}`}
                className={`block size-10 overflow-hidden rounded-[0.6rem] shadow-md ring-2 ring-white/90 ${index > 0 ? "-ml-2" : ""}`}
                style={{ zIndex: index }}
              >
                <TrackCover track={track} className="size-full" />
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            onClick={onPlayAll}
            disabled={!tracks.length}
            className="tap-scale flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-neutral-950 text-xs font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            <Play className="size-3.5" />
            播放全部
          </button>
          <button
            type="button"
            onClick={onShuffle}
            disabled={!tracks.length}
            className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-950/[0.08] text-neutral-700 transition active:scale-95 disabled:opacity-40"
            aria-label="随机播放"
          >
            <Shuffle className="size-3.5" />
          </button>
        </div>
      </div>
      <button type="button" onClick={onOpen} className="absolute inset-0" aria-label="查看我喜欢的音乐" />
    </div>
  );
}

/** F · 迷你排行榜：直接展示前三名收藏 */
function HeroLabF({ tracks, onOpen, onPlayAll, onShuffle }: { tracks: Track[]; onOpen: () => void; onPlayAll: () => void; onShuffle: () => void }) {
  const top = tracks.slice(0, 3);
  return (
    <div className="rounded-[1.5rem] border border-neutral-950/[0.08] bg-white/85 p-4 shadow-[0_14px_40px_rgba(47,55,76,0.12)]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold tracking-tight text-neutral-950">我喜欢的音乐</p>
          <p className="text-[11px] text-neutral-500">按收藏时间排序</p>
        </div>
        <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-500">{tracks.length} 首</span>
      </div>
      <div className="mt-3 space-y-2">
        {top.map((track, index) => (
          <div key={`${track.id}-${index}`} className="flex items-center gap-2.5">
            <span className={`w-4 text-center text-sm font-black ${index === 0 ? "text-rose-500" : "text-neutral-300"}`}>{index + 1}</span>
            <TrackCover track={track} className="size-9 shrink-0 rounded-[0.55rem]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-neutral-900">{track.title}</span>
              <span className="block truncate text-[11px] text-neutral-400">{track.artist}</span>
            </span>
          </div>
        ))}
        {!top.length && <p className="py-3 text-center text-[11px] text-neutral-400">还没有收藏</p>}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onPlayAll}
          disabled={!tracks.length}
          className="tap-scale flex h-9 flex-1 items-center justify-center rounded-full bg-neutral-950 text-xs font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
        >
          播放全部
        </button>
        <button
          type="button"
          onClick={onShuffle}
          disabled={!tracks.length}
          className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-950/[0.06] text-neutral-700 transition active:scale-95 disabled:opacity-40"
          aria-label="随机播放"
        >
          <Shuffle className="size-3.5" />
        </button>
      </div>
      <button type="button" onClick={onOpen} className="absolute inset-0" aria-label="查看我喜欢的音乐" />
    </div>
  );
}

/** G · 巨型数字海报：超大幽灵数字当背景 */
function HeroLabG({ tracks, onOpen, onPlayAll, onShuffle }: { tracks: Track[]; onOpen: () => void; onPlayAll: () => void; onShuffle: () => void }) {
  const covers = tracks.slice(0, 3);
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-neutral-950/[0.08] bg-white p-5">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-2 -top-10 select-none text-[8rem] font-black leading-none text-neutral-950/[0.05]"
      >
        {tracks.length}
      </span>
      <p className="relative text-[11px] font-bold uppercase tracking-[0.22em] text-rose-500">我喜欢的音乐</p>
      <p className="relative mt-1 text-xl font-bold text-neutral-950">收藏了 {tracks.length} 首歌</p>
      <div className="relative mt-4 flex items-end justify-between">
        <div className="flex items-center">
          {covers.map((track, index) => (
            <span
              key={`${track.id}-${index}`}
              className={`block size-12 shrink-0 overflow-hidden rounded-[0.65rem] shadow-md ring-2 ring-white ${index > 0 ? "-ml-3" : ""}`}
              style={{ zIndex: index }}
            >
              <TrackCover track={track} className="size-full" />
            </span>
          ))}
          {!covers.length && <span className="text-[11px] text-neutral-400">还没有收藏</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onShuffle}
            disabled={!tracks.length}
            className="tap-scale flex size-9 items-center justify-center rounded-full bg-neutral-950/[0.06] text-neutral-700 transition active:scale-95 disabled:opacity-40"
            aria-label="随机播放"
          >
            <Shuffle className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onPlayAll}
            disabled={!tracks.length}
            className="tap-scale flex h-9 items-center gap-1.5 rounded-full bg-rose-500 px-4 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(244,63,94,0.4)] transition active:scale-95 disabled:opacity-40"
          >
            <Play className="size-3.5" />
            播放
          </button>
        </div>
      </div>
      <button type="button" onClick={onOpen} className="absolute inset-0" aria-label="查看我喜欢的音乐" />
    </div>
  );
}

/** H · 杂志封面：深色刊头 + 艺术图占右 */
function HeroLabH({ tracks, onOpen, onPlayAll, onShuffle }: { tracks: Track[]; onOpen: () => void; onPlayAll: () => void; onShuffle: () => void }) {
  const first = tracks[0];
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] shadow-[0_18px_50px_rgba(23,23,23,0.3)]">
      <div className="flex h-44">
        <div className="flex w-[46%] flex-col justify-between bg-[#141419] p-4 text-white">
          <p className="text-[9px] font-semibold tracking-[0.3em] text-white/45">ARIA · LIKED</p>
          <p className="text-[1.35rem] font-black leading-tight">
            我喜欢的
            <br />
            音乐
          </p>
          <p className="text-[11px] text-white/45">VOL.{tracks.length}</p>
        </div>
        <div className="relative w-[54%]">
          {first ? <TrackCover track={first} className="size-full" priority /> : <div className="size-full bg-neutral-800" />}
          <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, #141419 0%, rgba(20,20,25,0) 42%)" }} aria-hidden />
        </div>
      </div>
      <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] text-white/80">
          {first ? `最近收藏 · ${first.title}` : "还没有收藏"}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onShuffle}
            disabled={!tracks.length}
            className="tap-scale flex size-8 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white backdrop-blur transition active:scale-95 disabled:opacity-40"
            aria-label="随机播放"
          >
            <Shuffle className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onPlayAll}
            disabled={!tracks.length}
            className="tap-scale flex size-8 items-center justify-center rounded-full bg-white text-neutral-950 shadow-lg transition active:scale-95 disabled:opacity-40"
            aria-label="播放我喜欢的音乐"
          >
            <Play className="size-3.5 translate-x-[1px]" />
          </button>
        </div>
      </div>
      <button type="button" onClick={onOpen} className="absolute inset-0" aria-label="查看我喜欢的音乐" />
    </div>
  );
}

const labTracks = LabTracks();

/** I · 3D 视差封面墙：封面悬浮在透视空间里，各自缓慢漂浮 */
function HeroLabI({ tracks, onOpen, onPlayAll, onShuffle }: { tracks: Track[]; onOpen: () => void; onPlayAll: () => void; onShuffle: () => void }) {
  const wall = tracks.slice(0, 4);
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] bg-neutral-950 shadow-[0_22px_60px_rgba(0,0,0,0.4)]">
      <div className="relative flex h-44 items-center justify-center" style={{ perspective: "700px", transformStyle: "preserve-3d" }}>
        {wall.map((track, index) => (
          <span
            key={`${track.id}-${index}`}
            className={`aria-float absolute block size-[4.6rem] overflow-hidden rounded-[0.8rem] shadow-[0_18px_40px_rgba(0,0,0,0.55)] ring-1 ring-white/20 ${index === 0 ? "aria-float-0" : index === 1 ? "aria-float-1" : index === 2 ? "aria-float-2" : "aria-float-3"}`}
            style={{
              transform: `translateX(${(index - 1.5) * 52}px) translateZ(${index === 1 ? 70 : index === 2 ? 30 : -30}px) rotateY(${(index - 1.5) * -16}deg)`,
            }}
          >
            <TrackCover track={track} className="size-full" />
          </span>
        ))}
      </div>
      <div className="relative px-5 pb-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-white/50">我喜欢的音乐</p>
            <p className="mt-0.5 text-xl font-bold text-white">{tracks.length} 首 · 悬浮待播</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onShuffle}
              disabled={!tracks.length}
              className="tap-scale flex size-10 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition active:scale-95 disabled:opacity-40"
              aria-label="随机播放"
            >
              <Shuffle className="size-4" />
            </button>
            <button
              type="button"
              onClick={onPlayAll}
              disabled={!tracks.length}
              className="tap-scale flex size-12 items-center justify-center rounded-full bg-white text-neutral-950 shadow-[0_10px_30px_rgba(255,255,255,0.25)] transition active:scale-95 disabled:opacity-40"
              aria-label="播放我喜欢的音乐"
            >
              <Play className="size-5 translate-x-[1px]" />
            </button>
          </div>
        </div>
      </div>
      <button type="button" onClick={onOpen} className="absolute inset-0" aria-label="查看我喜欢的音乐" />
    </div>
  );
}

/** J · 全幅沉浸轮播：整张卡是一首歌，左右滑切换，自动指示点 */
function HeroLabJ({ tracks, onOpen, onPlayAll, onShuffle }: { tracks: Track[]; onOpen: () => void; onPlayAll: () => void; onShuffle: () => void }) {
  const reel = tracks.slice(0, 5);
  const [active, setActive] = useState(0);
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] shadow-[0_22px_60px_rgba(0,0,0,0.4)]">
      <div
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(event) => {
          const el = event.currentTarget;
          setActive(Math.min(reel.length - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
        }}
      >
        {reel.map((track, index) => (
          <div key={`${track.id}-${index}`} className="relative h-52 w-full shrink-0 snap-center">
            <TrackCover track={track} className="size-full" priority={index === 0} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.30)_0%,rgba(0,0,0,0.05)_45%,rgba(0,0,0,0.72)_100%)]" aria-hidden />
            <p className="absolute bottom-11 left-4 right-4 truncate text-[1.3rem] font-bold tracking-tight text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.6)]">
              {track.title}
            </p>
            <p className="absolute bottom-6 left-4 truncate text-xs text-white/65">{track.artist} · 滑动切换</p>
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-0 items-start justify-between px-4 pt-4">
        <span className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">我喜欢的音乐</span>
        <span className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-medium text-white/85 backdrop-blur">
          {active + 1} / {reel.length}
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-3.5 left-1/2 flex -translate-x-1/2 gap-1.5">
        {reel.map((_, index) => (
          <span key={index} className={`h-1.5 rounded-full transition-all ${index === active ? "w-5 bg-white" : "w-1.5 bg-white/40"}`} />
        ))}
      </div>
      <div className="absolute bottom-11 right-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onShuffle}
          disabled={!tracks.length}
          className="tap-scale flex size-10 items-center justify-center rounded-full border border-white/30 bg-black/30 text-white backdrop-blur transition active:scale-95 disabled:opacity-40"
          aria-label="随机播放"
        >
          <Shuffle className="size-4" />
        </button>
        <button
          type="button"
          onClick={onPlayAll}
          disabled={!tracks.length}
          className="tap-scale flex size-12 items-center justify-center rounded-full bg-white text-neutral-950 shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition active:scale-95 disabled:opacity-40"
          aria-label="播放当前歌曲"
        >
          <Play className="size-5 translate-x-[1px]" />
        </button>
      </div>
      <button type="button" onClick={onOpen} className="absolute inset-0" aria-label="查看我喜欢的音乐" />
    </div>
  );
}

/** K · 动态极光玻璃：色块缓慢流动 + 毛玻璃内容板 */
function HeroLabK({ tracks, onOpen, onPlayAll, onShuffle }: { tracks: Track[]; onOpen: () => void; onPlayAll: () => void; onShuffle: () => void }) {
  const first = tracks[0];
  return (
    <div className="relative overflow-hidden rounded-[1.5rem]">
      <div className="absolute inset-0 bg-neutral-950" aria-hidden />
      <div className="aria-aurora-blob absolute -left-10 -top-12 size-52 rounded-full bg-rose-500/70" aria-hidden />
      <div className="aria-aurora-blob aria-aurora-blob-2 absolute -bottom-16 left-16 size-56 rounded-full bg-indigo-500/70" aria-hidden />
      <div className="aria-aurora-blob aria-aurora-blob-3 absolute -right-12 -top-10 size-48 rounded-full bg-amber-400/60" aria-hidden />
      <div className="relative p-5">
        <div className="rounded-[1.2rem] border border-white/35 bg-white/22 p-4 backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wide text-white/75">我喜欢的音乐</p>
              <p className="mt-0.5 text-2xl font-bold text-white">{tracks.length} 首</p>
              <p className="mt-0.5 text-[11px] text-white/65">按收藏时间排序</p>
            </div>
            {first && (
              <span className="block size-16 shrink-0 overflow-hidden rounded-[0.95rem] shadow-[0_14px_36px_rgba(0,0,0,0.45)] ring-1 ring-white/50">
                <TrackCover track={first} className="size-full" priority />
              </span>
            )}
          </div>
          <div className="mt-3.5 flex items-center gap-2">
            <button
              type="button"
              onClick={onPlayAll}
              disabled={!tracks.length}
              className="tap-scale flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-white text-sm font-semibold text-neutral-950 shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition active:scale-[0.98] disabled:opacity-40"
            >
              <Play className="size-4" />
              播放全部
            </button>
            <button
              type="button"
              onClick={onShuffle}
              disabled={!tracks.length}
              className="tap-scale flex size-10 shrink-0 items-center justify-center rounded-full border border-white/35 bg-white/15 text-white transition active:scale-95 disabled:opacity-40"
              aria-label="随机播放"
            >
              <Shuffle className="size-4" />
            </button>
          </div>
        </div>
      </div>
      <button type="button" onClick={onOpen} className="absolute inset-0" aria-label="查看我喜欢的音乐" />
    </div>
  );
}

const previewRoot = document.getElementById("root")!;
// The app shell locks html/body/#root to the viewport. The preview page needs
// the document to grow to the simulated phone size so full-page captures are
// not clipped by the visible Review pane height.
document.documentElement.style.height = "auto";
document.body.style.height = "auto";
document.body.style.overflow = "visible";
previewRoot.style.height = "auto";
previewRoot.style.minHeight = "0";
previewRoot.style.overflow = "visible";

const labEntries: Array<[string, ReactNode]> = [
  ["A · 深色高级", <HeroLabA tracks={labTracks} onOpen={noop} onPlayAll={noop} onShuffle={noop} />],
  ["B · 极简排版", <HeroLabB tracks={labTracks} onOpen={noop} onPlayAll={noop} onShuffle={noop} />],
  ["C · 转动唱片横幅", <HeroLabC tracks={labTracks} onOpen={noop} onPlayAll={noop} onShuffle={noop} />],
  ["E · 彩色玻璃", <HeroLabE tracks={labTracks} onOpen={noop} onPlayAll={noop} onShuffle={noop} />],
  ["F · 迷你排行榜", <HeroLabF tracks={labTracks} onOpen={noop} onPlayAll={noop} onShuffle={noop} />],
  ["G · 巨型数字海报", <HeroLabG tracks={labTracks} onOpen={noop} onPlayAll={noop} onShuffle={noop} />],
  ["H · 杂志封面", <HeroLabH tracks={labTracks} onOpen={noop} onPlayAll={noop} onShuffle={noop} />],
  ["I · 3D 视差封面墙", <HeroLabI tracks={labTracks} onOpen={noop} onPlayAll={noop} onShuffle={noop} />],
  ["J · 全幅沉浸轮播（左右滑）", <HeroLabJ tracks={labTracks} onOpen={noop} onPlayAll={noop} onShuffle={noop} />],
  ["K · 动态极光玻璃", <HeroLabK tracks={labTracks} onOpen={noop} onPlayAll={noop} onShuffle={noop} />],
];

const phoneFrame = (
  <div className="flex w-full flex-col items-center bg-[#12141c] p-8">
    <div
      id="phone"
      role="group"
      tabIndex={0}
      aria-label="Aria Mobile phone preview"
      className="relative overflow-hidden rounded-[2.2rem] border-4 border-[#242733] bg-[linear-gradient(170deg,#f7f8fb_0%,#eef1fa_60%,#f4eef8_100%)] shadow-[0_30px_100px_rgba(0,0,0,0.55)]"
      style={{ transform: "translateZ(0)", width: frameWidth, height: frameHeight, "--aria-safe-top": "28px", "--aria-safe-bottom": "14px" } as CSSProperties}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 z-50 flex h-7 items-center justify-between px-5 text-[10px] font-semibold ${page === "player" ? "text-white/80" : "text-neutral-800/60"}`}>
        <span>9:41</span>
        <span>5G&nbsp;&nbsp;▮▮▮</span>
      </div>
      <Page />
    </div>
  </div>
);

createRoot(previewRoot).render(
  <StrictMode>
    {page === "herolab" ? (
      // No phone frame here: all eight candidates flow in the document so
      // nothing is clipped and the whole page scrolls normally.
      <div className="mx-auto w-full max-w-[440px] px-3 py-10">
        <p className="pb-7 text-center text-sm font-semibold text-white">
          liked 主卡候选 · 共 8 个，看中哪个告诉我字母
        </p>
        <div className="space-y-9">
          {labEntries.map(([label, node]) => (
            <div key={label}>
              <p className="mb-2 text-[11px] font-bold text-white/55">{label}</p>
              {node}
            </div>
          ))}
        </div>
      </div>
    ) : (
      phoneFrame
    )}
  </StrictMode>,
);
