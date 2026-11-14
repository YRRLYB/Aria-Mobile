import { StrictMode, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import "./mobile.css";
import type { LyricLine, Track } from "@/data/music";
import type { MobileControls } from "./MobileApp";
import { CollectionScreen } from "./Collections";
import { ConnectScreen } from "./ConnectScreen";
import { MiniPlayer, TabBar } from "./Chrome";
import { NowPlaying } from "./NowPlaying";
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
  { id: "p1", name: "深夜电台", trackCount: 38, subscribed: true, owned: false, creatorName: "云村电台", coverColor: "#8a5a72", coverUrl: cover("深夜电台", "#8a5a72", "#221722", "#d6a2b9") },
  { id: "p2", name: "驾驶时听", trackCount: 24, subscribed: true, owned: false, creatorName: "公路音乐", coverColor: "#4d567d", coverUrl: cover("驾驶时听", "#4d567d", "#161b2b", "#9fa9d9") },
  { id: "p3", name: "雨天房间", trackCount: 16, subscribed: false, owned: true, creatorName: "云村听友", coverColor: "#3d6b70", coverUrl: cover("雨天房间", "#3d6b70", "#142524", "#9cd1d1") },
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
    nickname: "云村听友",
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
  kaleidoscopeEnabled: true,
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
  setSearchQuery: noop,
  setKaleidoscopeEnabled: noop,
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
const section = (params.get("section") ?? "liked") as "liked" | "albums" | "artists" | "offline" | "device" | "local" | "playlists" | "history";
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

createRoot(previewRoot).render(
  <StrictMode>
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
  </StrictMode>,
);
