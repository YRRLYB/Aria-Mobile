import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Compass,
  Disc3,
  Download,
  ExternalLink,
  Heart,
  History,
  Immersive,
  ListMusic,
  Loader2,
  LogOut,
  MusicNote,
  Play,
  Playing,
  Radar,
  RefreshCw,
  Search,
  Server,
  Shuffle,
  SlidersHorizontal,
  Trash2,
  Usb,
  UserRound,
  Wifi,
  X,
  ChevronRight,
} from "./icons";
import { TrackCover } from "./Chrome";
import type { Track } from "@/data/music";
import {
  directAccount,
  directCaptchaSent,
  directCellphoneLogin,
  directLogout,
  directQrCheck,
  directQrStart,
  isDirectCapable,
  registerDirectProvider,
} from "./native/neteaseDirect";
import {
  openExternal,
  requestUninterruptedPlayback,
} from "./native/ariaShell";
import {
  parseDuration,
  qualityOptions,
  splitArtistNames,
  type QualityLevel,
} from "@/lib/playerPresentation";
import { createLocalArtistSummaries, type ArtistSummary } from "@/lib/artists";
import { APP_VERSION } from "./version";
import type { NeteaseAccountSummary, ProviderPlaylist } from "@/lib/api";
import type { MobileControls } from "./MobileApp";
import { rememberSearch, newestLiked } from "./libraryStorage";
import { AriaAudio, isNativeApp, type AudioCacheStats } from "./native/ariaAudio";
import { DetailHeader, EmptyState, InlineError, LoadingState, PageHeader, SettingsGroup, SettingsRow, Toggle } from "./ui";
import { LikeHeart } from "./HeartPulse";
import { groupTracksByAlbum, formatTotalDuration, type AlbumGroup } from "./libraryView";
import { ArtistAvatar } from "./ArtistAvatar";
import { clearCoverCache, getCoverCacheStats, type CoverCacheStats } from "./coverCache";
import { AUTO_UPDATE_INTERVALS, formatAutoUpdateTime } from "./autoUpdate";

export function TrackRow({
  track,
  index,
  active,
  liked,
  sourceTag,
  onPlay,
  onLike,
  onRemove,
}: {
  track: { id: string; title: string; artist: string; album: string; duration: string; cover: string; vip?: boolean };
  index?: number;
  active?: boolean;
  liked?: boolean;
  /** Tiny origin mark at the row end (网易云 / 桌面 / 手机 / 离线). */
  sourceTag?: string;
  onPlay: () => void;
  onLike?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`tap-scale flex items-center gap-3 rounded-[1rem] px-2.5 py-2 transition ${
        active
          ? "bg-white/88 shadow-[0_8px_22px_rgba(47,55,76,0.08)] ring-1 ring-neutral-950/[0.05]"
          : "active:bg-white/60"
      }`}
    >
      <button type="button" onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {typeof index === "number" ? (
          <span className="flex w-6 shrink-0 items-center justify-center text-xs tabular-nums text-neutral-400">
            {active ? <Playing className="size-3.5 text-emerald-600" /> : index + 1}
          </span>
        ) : null}
        <TrackCover
          track={track}
          className="size-10 shrink-0 rounded-[0.65rem] shadow-[0_6px_16px_rgba(47,55,76,0.14)] ring-1 ring-black/5"
        />
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-1.5 truncate text-sm ${active ? "font-bold text-neutral-950" : "font-semibold text-neutral-900"}`}>
            {active && <Playing className="size-3.5 shrink-0 text-emerald-600" />}
            <span className="truncate">{track.title}</span>
            {track.vip && (
              <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600">
                VIP
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs text-neutral-500">
            {track.artist} · {track.album}
          </span>
        </span>
        {sourceTag && (
          <span className="shrink-0 rounded-full bg-neutral-950/[0.05] px-1.5 py-0.5 text-[9px] font-medium leading-none text-neutral-500">
            {sourceTag}
          </span>
        )}
        <span className="shrink-0 text-xs tabular-nums text-neutral-400">{track.duration}</span>
      </button>
      {onLike && (
        <LikeHeart
          liked={Boolean(liked)}
          onToggle={onLike}
          iconPx={16}
          buttonClass="size-8"
          iconClass="size-4"
          activeLabel="取消喜欢"
          inactiveLabel="喜欢"
        />
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="tap-scale flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-400 transition active:text-rose-600"
          aria-label="删除离线文件"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}

function HorizontalTrackCard({
  track,
  active,
  onPlay,
}: {
  track: { id: string; title: string; artist: string; cover: string };
  active?: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="tap-scale w-36 shrink-0 text-left"
    >
      {/* Content covers are rounded squares; circles are reserved for avatars
          and the spinning disc of the playing track. */}
      <div className={`overflow-hidden rounded-[1.1rem] shadow-[0_12px_30px_rgba(47,55,76,0.18)] ring-1 ring-black/5 ${active ? "ring-2 ring-neutral-950" : ""}`}>
        <TrackCover track={track} className="aspect-square w-full" />
      </div>
      <p className="mt-2 truncate text-[0.95rem] font-bold text-neutral-950">{track.title}</p>
      <p className="mt-0.5 truncate text-xs text-neutral-500">{track.artist}</p>
    </button>
  );
}

export function PlayAllButton({ onPlay, count, label }: { onPlay: () => void; count: number; label?: string }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onPlay}
      className="tap-scale flex items-center gap-1.5 whitespace-nowrap rounded-full bg-neutral-950 px-3.5 py-2 text-xs font-semibold text-white shadow-[0_8px_22px_rgba(23,23,23,0.22)]"
    >
      <Play className="size-3" />
      {label ?? `播放全部 ${count}`}
    </button>
  );
}

export function RandomPlayButton({ onPlay, count }: { onPlay: () => void; count: number }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onPlay}
      className="tap-scale flex size-9 items-center justify-center rounded-full bg-white/85 text-neutral-700 shadow-[0_6px_18px_rgba(47,55,76,0.1)] ring-1 ring-neutral-950/[0.06] transition active:bg-white"
      aria-label="随机播放"
    >
      <Shuffle className="size-4" />
    </button>
  );
}

/** Stacked fan of the top 3 liked covers: 1st upright on top, 2nd & 3rd fanned
 *  behind at 20° and 29° so a sliver of each peeks out like a hand fan. */
function FannedLikedCover({
  tracks,
  onOpen,
}: {
  tracks: Track[];
  onOpen: () => void;
}) {
  const first = tracks[0];
  const second = tracks[1];
  const third = tracks[2];

  if (!first) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex size-[5.5rem] shrink-0 items-center justify-center rounded-[1.3rem] bg-rose-50 text-rose-300 shadow-[0_14px_34px_rgba(47,55,76,0.18)] ring-1 ring-black/5 transition active:scale-[0.98]"
        aria-label="查看我喜欢的音乐"
      >
        <Heart className="size-8 fill-current" />
      </button>
    );
  }

  const stackWidth = third ? "w-[7.8rem]" : second ? "w-[6.8rem]" : "w-[5.5rem]";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative flex h-[5.7rem] shrink-0 items-center ${stackWidth} text-left transition active:scale-[0.98]`}
      aria-label="查看我喜欢的音乐"
    >
      {third && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-1/2 z-10 block size-[4.9rem] -translate-y-1/2 translate-x-[20px] origin-[24%_78%] rotate-[28deg] scale-[0.9] overflow-hidden rounded-[1.1rem] ring-2 ring-white/90 shadow-[0_8px_22px_rgba(47,55,76,0.18)] brightness-[0.92]"
        >
          <TrackCover track={third} className="size-full" />
        </span>
      )}
      {second && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-1/2 z-20 block size-[4.95rem] -translate-y-1/2 translate-x-[10px] origin-[24%_78%] rotate-[19deg] scale-[0.95] overflow-hidden rounded-[1.15rem] ring-2 ring-white/95 shadow-[0_10px_26px_rgba(47,55,76,0.22)] brightness-[0.96]"
        >
          <TrackCover track={second} className="size-full" />
        </span>
      )}
      <span className="relative z-30 block size-[5.2rem] overflow-hidden rounded-[1.2rem] ring-2 ring-white shadow-[0_14px_34px_rgba(47,55,76,0.26)]">
        <TrackCover track={first} className="size-full" priority />
      </span>
    </button>
  );
}

export function HomeScreen(controls: MobileControls) {
  const { neteaseAccount, dailyTracks, roamTracks, openCollection, chooseTrack } = controls;
  const likedTracks = newestLiked([...controls.likedNeteaseTracks, ...controls.likedLocalTracks]);
  const recentTracks = controls.historyTracks;
  const todayStart = (() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  })();
  const weekCount = useMemo(() => {
    const weekStart = todayStart - 6 * 86_400_000;
    return new Set(controls.playHistory.filter((entry) => entry.playedAt >= weekStart).map((entry) => entry.track.id)).size;
  }, [controls.playHistory, todayStart]);
  const daily = dailyTracks.slice(0, 5);
  const roamFirst = roamTracks[0];
  const roamCovers = roamTracks.slice(0, 2);

  return (
    <div className="pb-4">
      {/* 问候 */}
      <div className="mt-1 flex items-center justify-between gap-3">
        <h1 className="truncate text-[1.7rem] font-bold tracking-tight text-neutral-950">
          Aria向你问好
        </h1>
        {neteaseAccount?.avatarUrl
          ? <img src={neteaseAccount.avatarUrl} alt="" className="size-11 shrink-0 rounded-full object-cover shadow-sm" />
          : <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/70 text-neutral-400 shadow-sm"><UserRound className="size-5" /></span>}
      </div>

      {/* 我喜欢的音乐：扇形堆叠封面 + 超大数字 + 黑色播放圆钮 */}
      <div className="aria-rise mt-6 flex items-center gap-3.5">
        <FannedLikedCover tracks={likedTracks} onOpen={() => openCollection("liked")} />
        <button
          type="button"
          onClick={() => openCollection("liked")}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-[0.95rem] font-bold text-rose-500">我喜欢的音乐</p>
          <p className="mt-1 inline-flex items-baseline gap-1 whitespace-nowrap text-[2rem] font-extrabold leading-none tabular-nums tracking-tight text-neutral-950">
            {likedTracks.length}
            <span className="text-base font-bold">首</span>
          </p>
        </button>
        <button
          type="button"
          onClick={() => likedTracks[0] && chooseTrack(likedTracks[0].id, likedTracks)}
          disabled={!likedTracks.length}
          aria-label="播放我喜欢的音乐"
          className="tap-scale flex size-13 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white shadow-[0_12px_30px_rgba(23,23,23,0.32)] transition active:scale-95 disabled:opacity-40"
        >
          <Play className="size-5.5 translate-x-[1px]" />
        </button>
      </div>

      {/* 纯文字统计排：最近播放 | 本周播放次数 */}
      <div className="mt-6 flex items-stretch">
        <button
          type="button"
          onClick={() => openCollection("history")}
          className="min-w-0 flex-1 text-left"
        >
          <p className="text-xs text-neutral-500">最近播放</p>
          <p className="mt-1 flex items-center whitespace-nowrap text-[1.45rem] font-bold tabular-nums tracking-tight text-neutral-950">
            {recentTracks.length} 首
            <ChevronRight className="ml-1 size-4 text-neutral-400" />
          </p>
        </button>
        <div className="w-px bg-neutral-950/10" aria-hidden />
        <div className="min-w-0 flex-1 pl-6">
          <p className="text-xs text-neutral-500">本周播放次数</p>
          <p className="mt-1 whitespace-nowrap text-[1.45rem] font-bold tabular-nums tracking-tight text-neutral-950">{weekCount} 首</p>
        </div>
      </div>

      {/* 每日推荐 */}
      <section className="aria-rise mt-6">
        <button type="button" onClick={() => openCollection("daily")} className="flex w-full items-center justify-between">
          <h2 className="text-[1.3rem] font-bold tracking-tight text-neutral-950">每日推荐</h2>
          <ChevronRight className="size-5 text-neutral-950" />
        </button>
        <div className="no-scrollbar -mx-4 mt-3.5 flex gap-3.5 overflow-x-auto px-4 pb-1">
          {daily.map((track) => (
            <HorizontalTrackCard key={track.id} track={track} active={controls.activeTrackId === track.id} onPlay={() => chooseTrack(track.id, dailyTracks)} />
          ))}
          {!daily.length && (
            <button onClick={() => openCollection("daily")} className="flex h-14 w-full items-center justify-center text-xs text-neutral-400">
              还没有内容 · 点按加载
            </button>
          )}
        </div>
      </section>

      {/* 私人漫游：文案 + 开始漫游 + 右侧封面 */}
      <section className="aria-rise aria-rise-2 mt-5">
        <button type="button" onClick={() => openCollection("roam")} className="flex w-full items-center justify-between">
          <h2 className="text-[1.3rem] font-bold tracking-tight text-neutral-950">私人漫游</h2>
          <ChevronRight className="size-5 text-neutral-950" />
        </button>
        <p className="mt-1.5 text-xs text-neutral-500">根据你的口味连续推荐</p>
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={async () => {
              if (roamFirst) chooseTrack(roamFirst.id, roamTracks);
              else await controls.refreshRoamData();
            }}
            className="tap-scale flex h-11 shrink-0 items-center gap-2 rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white shadow-[0_10px_26px_rgba(23,23,23,0.3)] transition active:scale-95"
          >
            <Play className="size-4" />
            开始漫游
          </button>
          <div className="flex min-w-0 flex-1 justify-end gap-2.5">
            {roamCovers.map((track, index) => (
              <button
                key={`${track.id}-${index}`}
                type="button"
                onClick={() => openCollection("roam")}
                className="block size-[5.5rem] shrink-0 overflow-hidden rounded-[1.2rem] shadow-[0_12px_30px_rgba(47,55,76,0.22)] ring-1 ring-black/5 transition active:scale-[0.98]"
                aria-label="查看私人漫游"
              >
                <TrackCover track={track} className="size-full" priority={index === 0} />
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

type LibrarySection = "tracks" | "liked" | "albums" | "artists" | "playlists" | "history";
type LibrarySource = "all" | "netease" | "local" | "device" | "offline";

const SOURCES: Array<{ id: LibrarySource; label: string }> = [
  { id: "all", label: "全部" },
  { id: "netease", label: "网易云" },
  { id: "local", label: "桌面" },
  { id: "device", label: "手机" },
  { id: "offline", label: "离线" },
];

export function LibraryScreen({ initialSection = "liked", ...controls }: MobileControls & { initialSection?: LibrarySection }) {
  const [section, setSection] = useState<LibrarySection>(initialSection);
  const [source, setSource] = useState<LibrarySource>("all");
  const [selectedAlbumKey, setSelectedAlbumKey] = useState<string | null>(null);
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
  const likedTracks = newestLiked([...controls.likedNeteaseTracks, ...controls.likedLocalTracks]);
  const localLibraryTracks = useMemo(
    () => uniqueTracks([...controls.localTracks, ...controls.deviceTracks, ...controls.offlineTracks]),
    [controls.localTracks, controls.deviceTracks, controls.offlineTracks],
  );
  const allLibraryTracks = useMemo(
    () => uniqueTracks([...controls.deviceTracks, ...controls.localTracks, ...controls.offlineTracks, ...controls.likedNeteaseTracks]),
    [controls.deviceTracks, controls.localTracks, controls.offlineTracks, controls.likedNeteaseTracks],
  );
  const albums = useMemo(
    () => groupTracksByAlbum(localLibraryTracks),
    [localLibraryTracks],
  );
  const artists = useMemo(
    () => createLocalArtistSummaries(localLibraryTracks).sort((left, right) => right.trackCount - left.trackCount),
    [localLibraryTracks],
  );

  const sourceIds = useMemo(() => ({
    offline: new Set(controls.offlineTracks.map((track) => track.id)),
    device: new Set(controls.deviceTracks.map((track) => track.id)),
    local: new Set(controls.localTracks.map((track) => track.id)),
    netease: new Set(controls.likedNeteaseTracks.map((track) => track.id)),
  }), [controls.offlineTracks, controls.deviceTracks, controls.localTracks, controls.likedNeteaseTracks]);

  const trackInSource = useCallback(
    (track: Track) => {
      if (source === "all") return true;
      if (source === "netease") {
        return (
          sourceIds.netease.has(track.id) ||
          (track.source === "netease" &&
            !sourceIds.local.has(track.id) &&
            !sourceIds.device.has(track.id) &&
            !sourceIds.offline.has(track.id))
        );
      }
      return sourceIds[source].has(track.id);
    },
    [source, sourceIds],
  );

  function sourceTagFor(track: Track): string {
    if (sourceIds.offline.has(track.id)) return "离线";
    if (sourceIds.device.has(track.id)) return "手机";
    if (sourceIds.local.has(track.id)) return "桌面";
    if (sourceIds.netease.has(track.id) || track.source === "netease") return "网易云";
    return "";
  }

  const filteredTracks = useMemo(() => {
    if (source === "device") return controls.deviceTracks;
    if (source === "local") return controls.localTracks;
    if (source === "offline") return controls.offlineTracks;
    if (source === "netease") return controls.likedNeteaseTracks;
    return allLibraryTracks;
  }, [source, controls.deviceTracks, controls.localTracks, controls.offlineTracks, controls.likedNeteaseTracks, allLibraryTracks]);

  const filteredLiked = useMemo(() => likedTracks.filter(trackInSource), [likedTracks, trackInSource]);
  const filteredAlbums = useMemo(() => {
    if (source === "all") return albums;
    if (source === "netease") {
      return groupTracksByAlbum(controls.likedNeteaseTracks.filter((track) => Boolean(track.album?.trim())));
    }
    return groupTracksByAlbum(localLibraryTracks.filter(trackInSource));
  }, [source, albums, controls.likedNeteaseTracks, localLibraryTracks, trackInSource]);
  const filteredArtists = useMemo(() => {
    if (source === "netease") return controls.artistSummaries.slice(0, 40);
    return createLocalArtistSummaries(localLibraryTracks.filter(trackInSource))
      .sort((left, right) => right.trackCount - left.trackCount);
  }, [source, controls.artistSummaries, localLibraryTracks, trackInSource]);
  const filteredHistory = useMemo(() => controls.historyTracks.filter(trackInSource), [controls.historyTracks, trackInSource]);

  const selectedAlbum = selectedAlbumKey
    ? filteredAlbums.find((album) => album.key === selectedAlbumKey) ??
      albums.find((album) => album.key === selectedAlbumKey) ??
      null
    : null;
  const selectedArtist = selectedArtistName
    ? filteredArtists.find((artist) => artist.name.toLowerCase() === selectedArtistName.toLowerCase()) ??
      artists.find((artist) => artist.name.toLowerCase() === selectedArtistName.toLowerCase()) ??
      null
    : null;

  const sections: Array<{ id: LibrarySection; label: string }> = [
    { id: "liked", label: "我喜欢" },
    { id: "tracks", label: "歌曲" },
    { id: "albums", label: "专辑" },
    { id: "artists", label: "歌手" },
    { id: "playlists", label: "歌单" },
    { id: "history", label: "最近播放" },
  ];
  const sourceVisible = section !== "playlists";
  const removeOffline = useCallback((trackId: string) => void controls.deleteOfflineTrack(trackId), [controls]);

  function selectSection(next: LibrarySection) {
    setSection(next);
    setSelectedAlbumKey(null);
    setSelectedArtistName(null);
    // Entering "我喜欢" should not stay hidden behind a stale local/device/offline source filter.
    if (next === "liked" && (source === "local" || source === "device" || source === "offline")) {
      setSource("all");
    }
  }

  function selectSource(next: LibrarySource) {
    setSource(next);
    setSelectedAlbumKey(null);
    setSelectedArtistName(null);
    // Picking a local/device/offline source while on "我喜欢" switches to "歌曲" so unliked local music is visible.
    if (section === "liked" && (next === "local" || next === "device" || next === "offline")) {
      setSection("tracks");
    }
  }

  const [scanHint, setScanHint] = useState("");
  async function scanPhone() {
    setScanHint("");
    const result = await controls.scanDeviceLibrary(true);
    if (result.message) setScanHint(result.message);
  }

  if (selectedAlbum) {
    return (
      <AlbumDetail
        album={selectedAlbum}
        controls={controls}
        onBack={() => setSelectedAlbumKey(null)}
      />
    );
  }
  if (selectedArtist) {
    const artistPool = uniqueTracks([...localLibraryTracks, ...controls.likedNeteaseTracks, ...controls.historyTracks]);
    const tracks = artistPool.filter((track) => {
      const matchesArtist = splitArtistNames(track.artist).some(
        (name) => name.toLowerCase() === selectedArtist.name.toLowerCase(),
      );
      if (!matchesArtist) return false;
      return source === "all" ? true : trackInSource(track);
    });
    return (
      <ArtistDetail
        artist={selectedArtist}
        tracks={tracks}
        controls={controls}
        onBack={() => setSelectedArtistName(null)}
      />
    );
  }

  const stats = [
    { id: "liked" as const, label: "喜欢", value: likedTracks.length, unit: "首" },
    { id: "albums" as const, label: "专辑", value: albums.length, unit: "张" },
    { id: "artists" as const, label: "歌手", value: artists.length, unit: "位" },
    { id: "playlists" as const, label: "歌单", value: controls.providerPlaylists.length, unit: "个" },
  ];

  return (
    <div className="pb-4">
      <PageHeader
        title="音乐库"
        action={
          controls.neteaseAccount?.avatarUrl ? (
            <img src={controls.neteaseAccount.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover shadow-sm" />
          ) : undefined
        }
      />

      {/* Editorial metrics row matching Home's divider rhythm, strictly single-line numbers + units */}
      <div className="mt-5 flex items-stretch">
        {stats.map((stat, index) => (
          <div key={stat.id} className="flex min-w-0 flex-1 items-stretch">
            {index > 0 && <div className="my-1 w-px shrink-0 bg-neutral-950/10" aria-hidden />}
            <button
              type="button"
              onClick={() => selectSection(stat.id)}
              className={`tap-scale min-w-0 flex-1 text-left ${index > 0 ? "pl-3" : "pr-1.5"}`}
            >
              <p className="truncate text-xs text-neutral-500">{stat.label}</p>
              <p className="mt-1 inline-flex max-w-full items-baseline gap-0.5 whitespace-nowrap text-[1.18rem] font-bold leading-none tabular-nums tracking-tight text-neutral-950">
                <span>{stat.value}</span>
                <span className="text-[11px] font-semibold text-neutral-500">{stat.unit}</span>
                {stat.id === "liked" && <ChevronRight className="ml-0.5 size-3.5 shrink-0 self-center text-neutral-400" />}
              </p>
            </button>
          </div>
        ))}
      </div>

      {/* Sticky floating section + source navigation */}
      <div className="sticky top-0 z-20 -mx-4 mt-4 bg-[#f3f5fb]/88 px-4 pb-2.5 pt-2 backdrop-blur-xl">
        <div className="no-scrollbar flex items-center justify-between gap-0.5 overflow-x-auto rounded-full bg-white/80 p-1 shadow-[0_6px_20px_rgba(47,55,76,0.06)] ring-1 ring-neutral-950/[0.05]">
          {sections.map(({ id, label }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectSection(id)}
                className={`tap-scale shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11.5px] transition ${
                  active
                    ? "bg-neutral-950 font-semibold text-white shadow-sm"
                    : "font-medium text-neutral-500 active:text-neutral-900"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {sourceVisible && (
          <div className="mt-2.5 flex items-center gap-2 px-0.5">
            <span className="shrink-0 text-[11px] font-medium text-neutral-400">来源</span>
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
              {SOURCES.map(({ id, label }) => {
                const active = source === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectSource(id)}
                    className={`tap-scale shrink-0 rounded-full px-2.5 py-1 text-xs transition ${
                      active
                        ? "bg-neutral-950/[0.08] font-bold text-neutral-950"
                        : "font-medium text-neutral-400 active:text-neutral-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-2.5 space-y-3">
        {source === "device" && (
          <DeviceScanCard
            count={controls.deviceTracks.length}
            scanning={controls.scanningDevice}
            hint={scanHint}
            dirs={controls.autoUpdateSettings.lastScanStats?.dirs}
            onScan={() => void scanPhone()}
          />
        )}
        {section === "tracks" && (
          <SongsSection
            controls={controls}
            tracks={filteredTracks}
            sourceTagFor={source === "all" ? sourceTagFor : undefined}
            source={source}
            filterLabel={source === "all" ? undefined : SOURCES.find((item) => item.id === source)?.label}
            onRemove={source === "offline" ? removeOffline : undefined}
          />
        )}
        {section === "albums" && <AlbumSection albums={filteredAlbums} onOpen={setSelectedAlbumKey} />}
        {section === "artists" && <ArtistSection artists={filteredArtists} onOpen={setSelectedArtistName} />}
        {section === "playlists" && <PlaylistsSection {...controls} />}
        {section === "liked" && (
          <LikedSection
            controls={controls}
            tracks={filteredLiked}
            sourceTagFor={source === "all" ? sourceTagFor : undefined}
            filterLabel={source === "all" ? undefined : SOURCES.find((item) => item.id === source)?.label}
            onRemove={source === "offline" ? removeOffline : undefined}
          />
        )}
        {section === "history" && (
          <HistorySection
            controls={controls}
            tracks={filteredHistory}
            sourceTagFor={source === "all" ? sourceTagFor : undefined}
            filterLabel={source === "all" ? undefined : SOURCES.find((item) => item.id === source)?.label}
          />
        )}
      </div>
    </div>
  );
}

function DeviceScanCard({
  count,
  scanning,
  hint,
  dirs,
  onScan,
}: {
  count: number;
  scanning: boolean;
  hint: string;
  dirs?: number;
  onScan: () => void;
}) {
  return (
    <div className="rounded-[1.25rem] bg-white/85 p-4 shadow-[0_10px_28px_rgba(47,55,76,0.06)] ring-1 ring-neutral-950/[0.05]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-rose-500">本地全路径索引</p>
          <p className="mt-0.5 text-sm font-semibold text-neutral-950">
            {count > 0 ? `已索引 ${count} 首手机音频` : "扫描手机中的音频文件"}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-neutral-500">
            {count > 0
              ? `覆盖系统媒体库、下载目录、音乐软件目录及外置存储${dirs ? `（${dirs} 个目录）` : ""}`
              : "自动遍历手机内部存储、下载目录、SD 卡及音频文件夹，离线播放不上传。"}
          </p>
        </div>
        <button
          type="button"
          onClick={onScan}
          disabled={scanning}
          className="tap-scale flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-950 px-3.5 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(23,23,23,0.22)] disabled:opacity-50"
        >
          {scanning ? <Loader2 className="size-3.5 animate-spin" /> : <Radar className="size-3.5" />}
          {scanning ? "扫描中…" : count > 0 ? "重新扫描" : "开始扫描"}
        </button>
      </div>
      {hint && <p className="mt-2.5 text-xs text-neutral-600">{hint}</p>}
    </div>
  );
}

function AlbumCard({ album, onOpen }: { album: AlbumGroup; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="tap-scale min-w-0 text-left">
      <div className="overflow-hidden rounded-[1.1rem] bg-white/75 shadow-[0_12px_28px_rgba(47,55,76,0.16)] ring-1 ring-black/5">
        <TrackCover track={album.coverTrack} className="aspect-square w-full" />
      </div>
      <p className="mt-2 truncate text-[0.9rem] font-bold text-neutral-950">{album.title}</p>
      <p className="mt-0.5 truncate text-xs text-neutral-500">{album.artist} · {album.tracks.length} 首</p>
    </button>
  );
}

function AlbumSection({ albums, onOpen }: { albums: AlbumGroup[]; onOpen: (key: string) => void }) {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  function applyNow() {
    setAppliedQuery(query);
  }
  if (!albums.length) {
    return (
      <EmptyState
        icon={<Disc3 className="size-5" />}
        title="还没有专辑"
        description="扫描桌面曲库或手机音乐后，会在这里按专辑自动归类。"
      />
    );
  }
  const needle = appliedQuery.trim().toLowerCase();
  const filtered = needle
    ? albums.filter((album) => `${album.title} ${album.artist}`.toLowerCase().includes(needle))
    : albums;
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          applyNow();
        }}
        className="mb-3 flex items-center gap-2 rounded-full bg-white/85 px-3.5 py-2 shadow-[0_8px_22px_rgba(47,55,76,0.07)] ring-1 ring-neutral-950/[0.05] focus-within:ring-neutral-950/20"
      >
        <Search className="size-4 shrink-0 text-neutral-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索专辑或歌手"
          aria-label="搜索专辑或歌手"
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
        />
        {query && (
          <button
            type="submit"
            className="tap-scale shrink-0 rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-semibold text-white"
          >
            搜索
          </button>
        )}
      </form>
      <p className="mb-2.5 px-1 text-xs font-medium text-neutral-500">{filtered.length} 张专辑</p>
      {filtered.length ? (
        <div className="grid grid-cols-2 gap-3.5">
          {filtered.map((album) => (
            <AlbumCard key={album.key} album={album} onOpen={() => onOpen(album.key)} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Search className="size-5" />} title="没有匹配的专辑" description="换个专辑名或歌手名再试。" />
      )}
    </>
  );
}

export function AlbumDetail({ album, controls, onBack, backLabel = "返回专辑" }: { album: AlbumGroup; controls: MobileControls; onBack: () => void; backLabel?: string }) {
  const cover = album.coverTrack;
  return (
    <div className="pb-4">
      <DetailHeader
        backLabel={backLabel}
        onBack={onBack}
        label="专辑"
        title={album.title}
        meta={`${album.artist} · ${album.tracks.length} 首 · ${formatTotalDuration(album.tracks)}`}
        visual={
          <div className="size-28 shrink-0 overflow-hidden rounded-[1.35rem] shadow-[0_14px_34px_rgba(47,55,76,0.22)] ring-1 ring-black/5">
            <TrackCover track={cover} className="size-full" priority />
          </div>
        }
        actions={
          <>
            <PlayAllButton onPlay={() => album.tracks[0] && controls.chooseTrack(album.tracks[0].id, album.tracks)} count={album.tracks.length} />
            <RandomPlayButton onPlay={() => controls.playShuffledTracks(album.tracks)} count={album.tracks.length} />
          </>
        }
      />
      <div className="space-y-0.5">
        {album.tracks.map((track, index) => (
          <TrackRow
            key={track.id}
            track={track}
            index={index}
            active={controls.activeTrackId === track.id}
            liked={Boolean(controls.neteaseLikedIds[track.id] || controls.likedTrackIds[track.id])}
            onPlay={() => controls.chooseTrack(track.id, album.tracks)}
            onLike={() => controls.toggleLikeTrack(track.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SongsSection({
  controls,
  tracks,
  sourceTagFor,
  source,
  filterLabel,
  onRemove,
}: {
  controls: MobileControls;
  tracks: Track[];
  sourceTagFor?: (track: Track) => string;
  source: LibrarySource;
  filterLabel?: string;
  onRemove?: (trackId: string) => void;
}) {
  const { chooseTrack, toggleLikeTrack, likedTrackIds, neteaseLikedIds } = controls;
  if (!tracks.length) {
    const emptyText =
      source === "device"
        ? { title: "还没有手机本地音乐", desc: "点击上方「开始扫描」索引手机存储与下载目录中的音频文件。" }
        : source === "local"
          ? { title: "还没有桌面端歌曲", desc: "连接 Aria 桌面端并同步曲库后，桌面歌曲会显示在这里。" }
          : source === "offline"
            ? { title: "还没有离线缓存歌曲", desc: "下载或离线保存的歌曲会集中显示在这里。" }
            : source === "netease"
              ? { title: "还没有网易云曲库歌曲", desc: "登录网易云音乐后，同步的歌曲会显示在这里。" }
              : { title: "曲库还是空的", desc: "连接桌面端、登录网易云或扫描手机本地音乐后即可播放。" };
    return <EmptyState icon={<MusicNote className="size-5" />} title={emptyText.title} description={emptyText.desc} />;
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-medium text-neutral-500">{filterLabel ?? "全部歌曲"} · {tracks.length} 首</p>
        <PlayAllButton onPlay={() => tracks[0] && chooseTrack(tracks[0].id, tracks)} count={tracks.length} />
      </div>
      <div className="mt-1 space-y-0.5">
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            active={controls.activeTrackId === track.id}
            liked={Boolean(neteaseLikedIds[track.id] || likedTrackIds[track.id])}
            sourceTag={sourceTagFor?.(track) || undefined}
            onPlay={() => chooseTrack(track.id, tracks)}
            onLike={() => toggleLikeTrack(track.id)}
            onRemove={onRemove ? () => onRemove(track.id) : undefined}
          />
        ))}
      </div>
    </>
  );
}

function LikedSection({
  controls,
  tracks,
  sourceTagFor,
  filterLabel,
  onRemove,
}: {
  controls: MobileControls;
  tracks?: Track[];
  sourceTagFor?: (track: Track) => string;
  filterLabel?: string;
  onRemove?: (trackId: string) => void;
}) {
  const { chooseTrack, toggleLikeTrack, neteaseAccount } = controls;
  const all = tracks ?? newestLiked([...controls.likedNeteaseTracks, ...controls.likedLocalTracks]);
  if (!all.length) {
    return (
      <EmptyState
        icon={<Heart className="size-5" />}
        title={neteaseAccount?.connected ? "还没有喜欢的音乐" : "先登录网易云"}
        description={neteaseAccount?.connected
          ? filterLabel
            ? `${filterLabel}来源下还没有喜欢的音乐。`
            : "播放歌曲时点一下红心，它就会出现在这里。"
          : "在设置里登录网易云后，会自动同步「我喜欢的音乐」。"}
      />
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-medium text-neutral-500">{filterLabel ?? "全部喜欢"} · {all.length} 首</p>
        <PlayAllButton onPlay={() => all[0] && chooseTrack(all[0].id, all)} count={all.length} />
      </div>
      <div className="mt-1 space-y-0.5">
        {all.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            active={controls.activeTrackId === track.id}
            liked
            sourceTag={sourceTagFor?.(track) || undefined}
            onPlay={() => chooseTrack(track.id, all)}
            onLike={() => toggleLikeTrack(track.id)}
            onRemove={onRemove ? () => onRemove(track.id) : undefined}
          />
        ))}
      </div>
    </>
  );
}

function ArtistSection({ artists, onOpen }: { artists: ArtistSummary[]; onOpen: (name: string) => void }) {
  if (!artists.length) {
    return (
      <EmptyState
        icon={<UserRound className="size-5" />}
        title="还没有歌手信息"
        description="扫描本地或手机音乐后，会按歌曲的歌手信息自动归类。"
      />
    );
  }
  return (
    <div className="space-y-1">
      <p className="px-1 pb-1 text-xs font-medium text-neutral-500">共 {artists.length} 位歌手</p>
      {artists.map((artist) => (
        <button
          key={artist.id}
          type="button"
          onClick={() => onOpen(artist.name)}
          className="tap-scale flex w-full items-center gap-3 rounded-[1rem] px-2.5 py-2 text-left transition active:bg-white/70"
        >
          <ArtistAvatar name={artist.name} avatarUrl={artist.avatarUrl} size="md" className="shadow-[0_6px_16px_rgba(47,55,76,0.14)]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-neutral-950">{artist.name}</span>
            <span className="mt-0.5 block truncate text-xs text-neutral-500">
              {artist.trackCount} 首 · {artist.albumCount ?? 0} 张专辑
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-neutral-300" />
        </button>
      ))}
    </div>
  );
}

export function ArtistDetail({
  artist,
  tracks,
  controls,
  onBack,
}: {
  artist: ArtistSummary;
  tracks: Track[];
  controls: MobileControls;
  onBack: () => void;
}) {
  const [showAllSongs, setShowAllSongs] = useState(false);
  const [openedAlbum, setOpenedAlbum] = useState<AlbumGroup | null>(null);
  const albums = useMemo(() => groupTracksByAlbum(tracks), [tracks]);
  const visibleTracks = showAllSongs ? tracks : tracks.slice(0, 5);
  if (openedAlbum) {
    return <AlbumDetail album={openedAlbum} controls={controls} backLabel="返回歌手" onBack={() => setOpenedAlbum(null)} />;
  }
  return (
    <div className="pb-4">
      <DetailHeader
        backLabel="返回歌手"
        onBack={onBack}
        label="歌手"
        title={artist.name}
        meta={`${tracks.length} 首 · ${albums.length} 张专辑`}
        visual={<ArtistAvatar name={artist.name} avatarUrl={artist.avatarUrl} size="lg" className="size-28 shadow-[0_14px_34px_rgba(47,55,76,0.2)]" />}
        actions={
          <>
            <PlayAllButton onPlay={() => tracks[0] && controls.chooseTrack(tracks[0].id, tracks)} count={tracks.length} />
            <RandomPlayButton onPlay={() => controls.playShuffledTracks(tracks)} count={tracks.length} />
          </>
        }
      />

      <section className="mt-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[1.1rem] font-bold tracking-tight text-neutral-950">热门歌曲</h2>
          {tracks.length > 5 && (
            <button type="button" onClick={() => setShowAllSongs((value) => !value)} className="text-xs font-medium text-neutral-500 transition active:text-neutral-900">
              {showAllSongs ? "收起" : "查看全部"}
            </button>
          )}
        </div>
        <div className="space-y-0.5">
          {visibleTracks.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              index={index}
              active={controls.activeTrackId === track.id}
              liked={Boolean(controls.neteaseLikedIds[track.id] || controls.likedTrackIds[track.id])}
              onPlay={() => controls.chooseTrack(track.id, tracks)}
              onLike={() => controls.toggleLikeTrack(track.id)}
            />
          ))}
        </div>
      </section>

      {albums.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-[1.1rem] font-bold tracking-tight text-neutral-950">专辑</h2>
            <span className="text-xs text-neutral-400">{albums.length} 张</span>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            {albums.map((album) => (
              <AlbumCard key={album.key} album={album} onOpen={() => setOpenedAlbum(album)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function uniqueTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const result: Track[] = [];
  for (const track of tracks) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    result.push(track);
  }
  return result;
}

function PlaylistsSection(controls: MobileControls) {
  const { providerPlaylists, selectedPlaylist, openPlaylist } = controls;
  const [error, setError] = useState("");
  function loadPlaylist(playlist: (typeof providerPlaylists)[number]) {
    setError("");
    void openPlaylist(playlist).catch(() => setError("歌单加载失败，请检查网络后重试。"));
  }
  if (!providerPlaylists.length) {
    return (
      <EmptyState
        icon={<ListMusic className="size-5" />}
        title="还没有歌单"
        description="登录网易云后，你创建和收藏的歌单会显示在这里。"
      />
    );
  }
  if (selectedPlaylist) {
    return (
      <PlaylistDetail
        playlist={selectedPlaylist}
        controls={controls}
        error={error}
        onBack={() => {
          setError("");
          controls.closePlaylist();
        }}
      />
    );
  }
  const owned = providerPlaylists.filter((playlist) => playlist.owned ?? !playlist.subscribed);
  const saved = providerPlaylists.filter((playlist) => !(playlist.owned ?? !playlist.subscribed));
  return (
    <div className="space-y-6">
      {error && <InlineError message={error} />}
      {owned.length > 0 && (
        <section>
          <div className="mb-2.5 flex items-center justify-between px-1">
            <h2 className="text-[1.15rem] font-bold tracking-tight text-neutral-950">我创建的歌单</h2>
            <span className="text-xs font-medium text-neutral-400">{owned.length} 个</span>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            {owned.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} onOpen={() => loadPlaylist(playlist)} />
            ))}
          </div>
        </section>
      )}
      {saved.length > 0 && (
        <section>
          <div className="mb-2.5 flex items-center justify-between px-1">
            <h2 className="text-[1.15rem] font-bold tracking-tight text-neutral-950">我收藏的歌单</h2>
            <span className="text-xs font-medium text-neutral-400">{saved.length} 个</span>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            {saved.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} onOpen={() => loadPlaylist(playlist)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function PlaylistCard({ playlist, onOpen }: { playlist: ProviderPlaylist; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="tap-scale min-w-0 text-left">
      <div className="relative overflow-hidden rounded-[1.1rem] shadow-[0_12px_28px_rgba(47,55,76,0.16)] ring-1 ring-black/5">
        <PlaylistCover playlist={playlist} className="aspect-square w-full" />
        {playlist.subscribed && (
          <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-semibold text-white/90 backdrop-blur">
            收藏
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-[0.9rem] font-bold text-neutral-950">{playlist.name}</p>
      <p className="mt-0.5 truncate text-xs text-neutral-500">
        {playlist.trackCount} 首
        {playlist.creatorName && !playlist.owned ? ` · ${playlist.creatorName}` : ""}
      </p>
    </button>
  );
}

export function PlaylistDetail({
  playlist,
  controls,
  error,
  backLabel = "返回歌单",
  onBack,
}: {
  playlist: ProviderPlaylist;
  controls: MobileControls;
  error?: string;
  backLabel?: string;
  onBack: () => void;
}) {
  const {
    playlistTracks,
    playlistLoading,
    playlistProgress,
    chooseTrack,
    toggleLikeTrack,
    likedTrackIds,
    neteaseLikedIds,
    playShuffledTracks,
    playPlaylist,
  } = controls;
  const saved = playlistProgress[playlist.id];
  const savedTrack = saved ? playlistTracks.find((track) => track.id === saved.trackId) : undefined;
  return (
    <div>
      <DetailHeader
        backLabel={backLabel}
        onBack={onBack}
        label={playlist.subscribed ? "收藏的歌单" : "歌单"}
        title={playlist.name}
        meta={
          <>
            {playlistTracks.length} 首
            {playlistTracks.length ? ` · ${formatTotalDuration(playlistTracks)}` : ""}
            {playlist.creatorName && !playlist.owned
              ? ` · ${playlist.subscribed ? "收藏自 " : ""}${playlist.creatorName}`
              : ""}
            {savedTrack ? ` · 上次播放到《${savedTrack.title}》` : ""}
          </>
        }
        visual={<PlaylistCover playlist={playlist} tracks={playlistTracks} className="size-28 rounded-[1.35rem] shadow-[0_14px_34px_rgba(47,55,76,0.22)] ring-1 ring-black/5" />}
        actions={
          <>
            <PlayAllButton
              onPlay={() => playPlaylist(playlist, playlistTracks)}
              count={playlistTracks.length}
              label={savedTrack ? `继续播放 ${playlistTracks.length}` : undefined}
            />
            <RandomPlayButton onPlay={() => playShuffledTracks(playlistTracks, playlist.id)} count={playlistTracks.length} />
          </>
        }
      />
      {error && <div className="mb-3"><InlineError message={error} /></div>}
      {playlistLoading ? (
        <LoadingState label="歌单加载中…" />
      ) : playlistTracks.length ? (
        <div className="space-y-0.5">
          {playlistTracks.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              index={index}
              active={controls.activeTrackId === track.id}
              liked={Boolean(neteaseLikedIds[track.id] || likedTrackIds[track.id])}
              onPlay={() => chooseTrack(track.id, playlistTracks, { playlistId: playlist.id })}
              onLike={() => toggleLikeTrack(track.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ListMusic className="size-5" />}
          title="歌单里还没有歌曲"
          description="这个歌单暂时没有可播放的曲目。"
          action={<button type="button" onClick={onBack} className="tap-scale rounded-full bg-neutral-950 px-4 py-2 text-xs font-medium text-white">返回歌单列表</button>}
        />
      )}
    </div>
  );
}

function PlaylistCover({
  playlist,
  tracks = [],
  className,
}: {
  playlist: { name: string; coverUrl?: string | null };
  tracks?: Track[];
  className?: string;
}) {
  const src = /^https?:/i.test(playlist.coverUrl ?? "") || playlist.coverUrl?.startsWith("data:") ? playlist.coverUrl ?? "" : "";
  if (src) {
    return (
      <div className={`overflow-hidden bg-[linear-gradient(140deg,#c9d3f2,#e7d5ec)] shadow-sm ${className ?? ""}`}>
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  if (tracks.length) {
    return (
      <div className={`grid grid-cols-2 gap-0.5 overflow-hidden bg-white/70 shadow-sm ${className ?? ""}`}>
        {tracks.slice(0, 4).map((track) => (
          <TrackCover key={track.id} track={track} className="aspect-square w-full" />
        ))}
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-center bg-[linear-gradient(140deg,#d9e1f0,#b8c4dc)] text-neutral-500 shadow-sm ${className ?? ""}`}>
      <ListMusic className="size-8" />
    </div>
  );
}

function HistorySection({
  controls,
  tracks,
  sourceTagFor,
  filterLabel,
}: {
  controls: MobileControls;
  tracks?: Track[];
  sourceTagFor?: (track: Track) => string;
  filterLabel?: string;
}) {
  const { historyTracks, chooseTrack, playCounts } = controls;
  const list = tracks ?? historyTracks;
  if (!list.length) {
    return (
      <EmptyState
        icon={<History className="size-5" />}
        title="还没有播放记录"
        description={filterLabel ? `${filterLabel}来源下还没有播放记录。` : "播放过的歌曲会按时间倒序出现在这里。"}
      />
    );
  }
  return (
    <div className="space-y-0.5">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium text-neutral-500">最近 {list.length} 首</p>
        <button
          type="button"
          onClick={() => controls.openCollection("history")}
          className="flex items-center gap-0.5 text-xs font-medium text-neutral-500 transition active:text-neutral-900"
        >
          查看全部
          <ChevronRight className="size-3.5" />
        </button>
      </div>
      {list.slice(0, 20).map((track) => (
        <TrackRow
          key={track.id}
          track={track}
          active={controls.activeTrackId === track.id}
          sourceTag={sourceTagFor?.(track) || undefined}
          onPlay={() => chooseTrack(track.id, list)}
        />
      ))}
      <p className="pt-2 text-center text-[11px] text-neutral-400">
        共 {Object.keys(playCounts).length} 首听过
      </p>
    </div>
  );
}

export function SearchScreen(controls: MobileControls) {
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem("aria-search-history") || "[]");
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 10) : [];
    } catch { return []; }
  });
  const [expanded, setExpanded] = useState({ artists: false, playlists: false, tracks: false, albums: false });
  const [openedPlaylist, setOpenedPlaylist] = useState<ProviderPlaylist | null>(null);
  const [playlistError, setPlaylistError] = useState("");
  const [openedAlbum, setOpenedAlbum] = useState<AlbumGroup | null>(null);
  const [draft, setDraft] = useState(controls.searchQuery);
  useEffect(() => { localStorage.setItem("aria-search-history", JSON.stringify(history)); }, [history]);
  const {
    searchQuery,
    setSearchQuery,
    searchBundle,
    searchLoading,
    artistTracks,
    selectedArtist,
    setSelectedArtist,
    chooseTrack,
    toggleLikeTrack,
    likedTrackIds,
    neteaseLikedIds,
  } = controls;
  function submitSearch(raw?: string) {
    const value = (raw ?? draft).trim();
    if (!value) {
      setDraft("");
      setSearchQuery("");
      return;
    }
    setDraft(value);
    if (value !== searchQuery) setSearchQuery(value);
    setHistory((current) => rememberSearch(current, value));
  }
  const hasQuery = searchQuery.trim().length > 0;
  const trackResults = useMemo(() => {
    const seen = new Set<string>();
    return [...searchBundle.neteaseTracks, ...searchBundle.localTracks].filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
  }, [searchBundle]);
  const albumResults = useMemo(() => groupTracksByAlbum(trackResults), [trackResults]);
  const artistResults = searchBundle.artists;
  const playlistResults = searchBundle.playlists;
  const noResults = hasQuery && !searchLoading && !trackResults.length && !albumResults.length && !artistResults.length && !playlistResults.length;
  const hotTracks = controls.dailyTracks.length ? controls.dailyTracks : controls.roamTracks;

  useEffect(() => {
    setExpanded({ artists: false, playlists: false, tracks: false, albums: false });
  }, [searchQuery]);

  if (openedAlbum) {
    return <AlbumDetail album={openedAlbum} controls={controls} backLabel="返回搜索" onBack={() => setOpenedAlbum(null)} />;
  }

  if (openedPlaylist) {
    return (
      <PlaylistDetail
        playlist={openedPlaylist}
        controls={controls}
        error={playlistError}
        backLabel="返回搜索"
        onBack={() => {
          setPlaylistError("");
          setOpenedPlaylist(null);
          controls.closePlaylist();
        }}
      />
    );
  }

  if (selectedArtist) {
    return (
      <ArtistDetail
        artist={selectedArtist}
        tracks={artistTracks}
        controls={controls}
        onBack={() => setSelectedArtist(null)}
      />
    );
  }

  return (
    <div className="pb-4">
      <PageHeader title="搜索" />
      <div className="mt-4 flex items-center gap-2 rounded-full bg-white/88 py-1.5 pl-4 pr-2 shadow-[0_10px_28px_rgba(47,55,76,0.08)] ring-1 ring-neutral-950/[0.05] transition focus-within:ring-neutral-950/25">
        <Search className="size-4 shrink-0 text-neutral-400" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); submitSearch(); } }}
          enterKeyHint="search"
          aria-label="搜索音乐"
          placeholder="搜索歌曲、歌手、歌单、专辑…"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-neutral-950 outline-none placeholder:text-neutral-400"
        />
        {draft && (
          <button
            type="button"
            onClick={() => { setDraft(""); setSearchQuery(""); }}
            className="tap-scale flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-400 transition active:bg-neutral-950/[0.05]"
            aria-label="清空搜索词"
          >
            <X className="size-4" />
          </button>
        )}
        {draft.trim() && (
          <button
            type="button"
            onClick={() => submitSearch()}
            className="tap-scale shrink-0 rounded-full bg-neutral-950 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm"
            aria-label="搜索"
          >
            搜索
          </button>
        )}
      </div>

      {!hasQuery && (
        <>
          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-[1.15rem] font-bold tracking-tight text-neutral-950">最近搜索</h2>
            {history.length > 0 && (
              <button type="button" onClick={() => setHistory([])} className="text-xs font-medium text-neutral-400 transition active:text-neutral-700">
                清空
              </button>
            )}
          </div>
          {history.length ? (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {history.map((query) => (
                <button
                  key={query}
                  type="button"
                  onClick={() => submitSearch(query)}
                  className="tap-scale max-w-full truncate rounded-full bg-white/85 px-3.5 py-1.5 text-xs font-medium text-neutral-700 shadow-[0_4px_14px_rgba(47,55,76,0.06)] ring-1 ring-neutral-950/[0.05]"
                >
                  {query}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-neutral-400">还没有搜索记录。</p>
          )}

          {hotTracks.length > 0 && (
            <>
              <div className="mb-3 mt-6 flex items-center justify-between">
                <h2 className="text-[1.15rem] font-bold tracking-tight text-neutral-950">热门推荐</h2>
                <span className="text-xs text-neutral-500">从今天开始听</span>
              </div>
              <div className="no-scrollbar -mx-4 flex gap-3.5 overflow-x-auto px-4 pb-1">
                {hotTracks.slice(0, 6).map((track) => (
                  <HorizontalTrackCard
                    key={track.id}
                    track={track}
                    active={controls.activeTrackId === track.id}
                    onPlay={() => chooseTrack(track.id, hotTracks)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {hasQuery && (
        <>
          {searchLoading && <LoadingState label="搜索中…" />}

          {artistResults.length > 0 && (
            <SearchGroup
              title="歌手"
              count={artistResults.length}
              expanded={expanded.artists}
              onToggle={() => setExpanded((current) => ({ ...current, artists: !current.artists }))}
            >
              <div className="no-scrollbar -mx-4 flex gap-3.5 overflow-x-auto px-4 pb-1">
                {(expanded.artists ? artistResults : artistResults.slice(0, 5)).map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => setSelectedArtist(artist)}
                    className="tap-scale w-[4.5rem] shrink-0 text-center"
                  >
                    <ArtistAvatar name={artist.name} avatarUrl={artist.avatarUrl} size="md" className="mx-auto size-16 shadow-[0_8px_22px_rgba(47,55,76,0.16)]" />
                    <p className="mt-1.5 truncate text-xs font-semibold text-neutral-900">{artist.name}</p>
                    <p className="truncate text-[10px] text-neutral-400">
                      {artist.trackCount != null
                        ? `${artist.trackCount} 首`
                        : artist.albumCount != null
                          ? `${artist.albumCount} 张专辑`
                          : "歌手"}
                    </p>
                  </button>
                ))}
              </div>
            </SearchGroup>
          )}

          {trackResults.length > 0 && (
            <SearchGroup
              title="歌曲"
              count={trackResults.length}
              expanded={expanded.tracks}
              onToggle={() => setExpanded((current) => ({ ...current, tracks: !current.tracks }))}
            >
              <div className="space-y-0.5">
                {(expanded.tracks ? trackResults : trackResults.slice(0, 5)).map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    active={controls.activeTrackId === track.id}
                    liked={Boolean(neteaseLikedIds[track.id] || likedTrackIds[track.id])}
                    onPlay={() => chooseTrack(track.id, trackResults)}
                    onLike={() => toggleLikeTrack(track.id)}
                  />
                ))}
              </div>
            </SearchGroup>
          )}

          {albumResults.length > 0 && (
            <SearchGroup
              title="专辑"
              count={albumResults.length}
              expanded={expanded.albums}
              onToggle={() => setExpanded((current) => ({ ...current, albums: !current.albums }))}
            >
              <div className="grid grid-cols-2 gap-3.5">
                {(expanded.albums ? albumResults : albumResults.slice(0, 4)).map((album) => (
                  <AlbumCard key={album.key} album={album} onOpen={() => setOpenedAlbum(album)} />
                ))}
              </div>
            </SearchGroup>
          )}

          {playlistResults.length > 0 && (
            <SearchGroup
              title="歌单"
              count={playlistResults.length}
              expanded={expanded.playlists}
              onToggle={() => setExpanded((current) => ({ ...current, playlists: !current.playlists }))}
            >
              <div className="grid grid-cols-2 gap-3.5">
                {(expanded.playlists ? playlistResults : playlistResults.slice(0, 4)).map((playlist) => (
                  <PlaylistCard
                    key={playlist.id}
                    playlist={playlist}
                    onOpen={() => {
                      setOpenedPlaylist(playlist);
                      setPlaylistError("");
                      void controls.openPlaylist(playlist).catch(() => setPlaylistError("歌单加载失败，请检查网络后重试。"));
                    }}
                  />
                ))}
              </div>
            </SearchGroup>
          )}

          {noResults && (
            <div className="mt-6">
              <EmptyState
                icon={<Search className="size-5" />}
                title="没有找到相关音乐"
                description="换个关键词，或者检查网络连接后再试。"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SearchGroup({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="aria-rise mt-6">
      <div className="mb-2.5 flex items-center justify-between px-0.5">
        <h2 className="text-[1.15rem] font-bold tracking-tight text-neutral-950">
          {title} <span className="ml-1 text-xs font-medium text-neutral-400">{count}</span>
        </h2>
        {count > 4 && (
          <button type="button" onClick={onToggle} className="flex items-center gap-0.5 text-xs font-medium text-neutral-500 transition active:text-neutral-900">
            {expanded ? "收起" : "查看全部"}
            <ChevronRight className={`size-3.5 transition ${expanded ? "rotate-90" : ""}`} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

const GB = 1024 * 1024 * 1024;
const AUDIO_CACHE_LIMIT_OPTIONS: Array<{ label: string; bytes: number }> = [
  { label: "无限制", bytes: 0 },
  { label: "2 GB", bytes: 2 * GB },
  { label: "5 GB", bytes: 5 * GB },
  { label: "10 GB", bytes: 10 * GB },
  { label: "20 GB", bytes: 20 * GB },
];

export function SettingsScreen(controls: MobileControls) {
  const {
    neteaseAccount,
    connection,
    libraryMeta,
    localTracks,
    refreshNeteaseData,
    disconnect,
    autoUpdateSettings,
    autoUpdating,
    setAutoUpdateInterval,
    setAutoUpdateIncludeLocal,
    triggerManualUpdate,
    deviceTracks,
    scanningDevice,
    scanDeviceLibrary,
    hifiEnabled,
    setHifiEnabled,
    qualityLevel,
    setQualityLevel,
  } = controls;
  const native = isNativeApp();
  const [refreshing, setRefreshing] = useState(false);
  const [scanHint, setScanHint] = useState("");

  async function refreshAccount() {
    setRefreshing(true);
    try {
      await refreshNeteaseData();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleManualScan() {
    setScanHint("");
    const result = await scanDeviceLibrary(true);
    if (result.message) setScanHint(result.message);
  }

  const activeIntervalLabel = AUTO_UPDATE_INTERVALS.find((item) => item.value === autoUpdateSettings.intervalMinutes)?.label ?? "每小时";

  return (
    <div className="pb-6">
      <PageHeader
        title="设置"
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold text-neutral-700 shadow-[0_4px_14px_rgba(47,55,76,0.06)] ring-1 ring-neutral-950/[0.05]">
            <span className={`size-1.5 rounded-full ${controls.directMode ? "bg-emerald-500" : "bg-neutral-900"}`} />
            {controls.directMode ? "直连模式" : "桌面伴侣"}
          </span>
        }
      />

      {/* 账号主卡 */}
      {controls.directMode ? (
        <DirectNeteaseCard controls={controls} />
      ) : (
        <section className="mt-5 rounded-[1.45rem] bg-white/88 p-4 shadow-[0_12px_34px_rgba(47,55,76,0.08)] ring-1 ring-neutral-950/[0.05] backdrop-blur-sm">
          <div className="flex items-center gap-3.5">
            {neteaseAccount?.avatarUrl ? (
              <img src={neteaseAccount.avatarUrl} alt="" className="size-12 shrink-0 rounded-full object-cover shadow-sm" />
            ) : (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-neutral-950/[0.05] text-neutral-400">
                <UserRound className="size-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-rose-500">网易云账号</p>
              <p className="mt-0.5 truncate text-base font-bold text-neutral-950">
                {neteaseAccount?.connected ? neteaseAccount.nickname ?? "网易云账号" : "未登录"}
              </p>
              <p className="truncate text-[11px] text-neutral-500">
                {neteaseAccount?.connected ? "桌面端扫码登录 · 数据自动同步" : "请在桌面端设置里扫码登录"}
              </p>
            </div>
            <button
              type="button"
              onClick={refreshAccount}
              disabled={refreshing}
              className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-950/[0.05] text-neutral-700 disabled:opacity-50"
              aria-label="刷新数据"
            >
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </section>
      )}

      {/* 曲库与定时更新 */}
      <SettingsGroup
        title="曲库与定时更新"
        description={`上次更新：${formatAutoUpdateTime(autoUpdateSettings.lastUpdatedAt)}`}
        action={
          <button
            type="button"
            onClick={() => void triggerManualUpdate()}
            disabled={autoUpdating}
            className="tap-scale inline-flex items-center gap-1 rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-semibold text-white shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${autoUpdating ? "animate-spin" : ""}`} />
            {autoUpdating ? "同步中…" : "立即同步"}
          </button>
        }
      >
        <SettingsRow
          icon={<History className="size-4" />}
          title="定时更新频率"
          value={activeIntervalLabel}
          description="自动刷新喜欢列表、每日推荐、歌单及已授权的本地曲库"
        >
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {AUTO_UPDATE_INTERVALS.map((option) => {
              const active = autoUpdateSettings.intervalMinutes === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAutoUpdateInterval(option.value)}
                  className={`tap-scale rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                    active
                      ? "bg-neutral-950 text-white shadow-sm"
                      : "bg-neutral-950/[0.045] text-neutral-600 active:bg-neutral-950/[0.09]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </SettingsRow>

        {native && (
          <SettingsRow
            icon={<Radar className="size-4" />}
            title="定时索引手机本地音乐"
            description="在定时更新时自动扫描新增音频文件（仅在已授权后静默执行）"
            right={
              <Toggle
                checked={autoUpdateSettings.includeLocalScan}
                onChange={() => setAutoUpdateIncludeLocal(!autoUpdateSettings.includeLocalScan)}
                label="定时索引手机本地音乐"
              />
            }
          />
        )}

        {native && (
          <SettingsRow
            icon={<MusicNote className="size-4" />}
            title="手机本地音乐索引"
            value={`${deviceTracks.length} 首`}
            description={
              autoUpdateSettings.lastScanStats
                ? `覆盖 ${autoUpdateSettings.lastScanStats.roots} 个存储卷 · ${autoUpdateSettings.lastScanStats.dirs} 个目录`
                : "深度扫描手机内全部媒体库、下载与外置存储音频路径"
            }
            right={
              <button
                type="button"
                onClick={() => void handleManualScan()}
                disabled={scanningDevice}
                className="tap-scale rounded-full bg-neutral-950/[0.06] px-3 py-1.5 text-[11px] font-semibold text-neutral-800 disabled:opacity-45"
              >
                {scanningDevice ? "扫描中…" : "全路径扫描"}
              </button>
            }
          >
            {scanHint && <p className="mt-1.5 text-[11px] text-neutral-600">{scanHint}</p>}
          </SettingsRow>
        )}

        {!controls.directMode && (
          <>
            <SettingsRow
              icon={<Server className="size-4" />}
              title="桌面端服务器"
              description={connection.serverUrl || "未连接"}
            />
            <SettingsRow
              icon={<Wifi className="size-4" />}
              title="桌面端曲库"
              value={`${localTracks.length} 首`}
              description={`已索引 ${libraryMeta.roots} 个电脑目录`}
            />
            <SettingsRow
              icon={<LogOut className="size-4 text-rose-500" />}
              title={<span className="text-rose-600">断开桌面端连接</span>}
              description="返回连接页面，可重新配对或改用网易云直连"
              onClick={disconnect}
              right={<ChevronRight className="size-4 text-neutral-300" />}
            />
          </>
        )}
      </SettingsGroup>

      {/* 音频与播放 */}
      <SettingsGroup title="音频与播放">
        <SettingsRow
          icon={<SlidersHorizontal className="size-4" />}
          title="HiFi 最高音质优先"
          description="播放网易云歌曲时自动匹配可用最高母带/无损档位"
          right={<Toggle checked={hifiEnabled} onChange={() => setHifiEnabled(!hifiEnabled)} label="HiFi 最高音质优先" />}
        />
        <SettingsRow
          icon={<Disc3 className="size-4" />}
          title="在线默认音质"
          value={hifiEnabled ? "HiFi 自动" : qualityOptions.find((item) => item.value === qualityLevel)?.label}
          description={hifiEnabled ? "已开启 HiFi 优先；关闭后可手动指定固定档位" : "在网速或流量受限时选择默认音质"}
        >
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {qualityOptions.map((option) => {
              const active = !hifiEnabled && qualityLevel === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setQualityLevel(option.value as QualityLevel)}
                  className={`tap-scale rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                    active
                      ? "bg-neutral-950 text-white shadow-sm"
                      : "bg-neutral-950/[0.045] text-neutral-600 active:bg-neutral-950/[0.09]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </SettingsRow>
        {native && (
          <SettingsRow
            icon={<Usb className="size-4" />}
            title="USB 音频焦点"
            value={controls.usbExclusive.connected ? "已连接" : "未接入"}
            description={
              controls.usbExclusive.connected
                ? "已检测到 USB DAC / 耳机，播放时优先占用音频焦点"
                : "插入 USB 音频设备后可启用，减少系统提示音打断"
            }
            right={
              <Toggle
                checked={controls.usbExclusive.enabled}
                disabled={!controls.usbExclusive.supported || !controls.usbExclusive.connected}
                onChange={() => void controls.setUsbExclusiveEnabled(!controls.usbExclusive.enabled)}
                label="USB 独占"
              />
            }
          />
        )}
      </SettingsGroup>

      {/* 存储与缓存 */}
      <CacheSettings controls={controls} />

      {/* 系统与后台保护 */}
      {native && (
        <SettingsGroup title="系统与权限" description="保障锁屏控制与长时间后台连续播放。">
          <LockScreenSettings />
          <BackgroundPlaybackSettings />
        </SettingsGroup>
      )}

      {/* 模式与关于 */}
      <SettingsGroup title="关于与模式">
        {controls.directMode && isDirectCapable() && (
          <SettingsRow
            icon={<Server className="size-4" />}
            title="切换桌面伴侣模式"
            description="局域网连接电脑端 Aria，串流电脑无损曲库"
            onClick={controls.switchToDesktopMode}
            right={
              <span className="rounded-full bg-neutral-950/[0.06] px-2.5 py-1 text-[11px] font-semibold text-neutral-700">
                切换
              </span>
            }
          />
        )}
        <SettingsRow
          icon={<CheckCircle2 className="size-4" />}
          title="Aria Mobile"
          value={`v${APP_VERSION}`}
          description={`${controls.directMode ? "手机直连网易云" : "桌面伴侣模式"} · 登录凭据仅保存在本机`}
        />
        <SettingsRow
          icon={<ExternalLink className="size-4" />}
          title="GitHub 仓库"
          description="github.com/YRRLYB/Aria-Mobile"
          onClick={() => void openExternal("https://github.com/YRRLYB/Aria-Mobile")}
          right={<ChevronRight className="size-4 text-neutral-400" />}
        />
      </SettingsGroup>
    </div>
  );
}

function BackgroundPlaybackSettings() {
  const [hint, setHint] = useState("");
  async function requestExemption() {
    setHint("");
    try {
      const result = await requestUninterruptedPlayback();
      if (!result) return;
      setHint(result.alreadyExempt
        ? "已加入电池优化白名单。部分手机还需在最近任务里锁定 Aria。"
        : "请在系统弹窗中允许 Aria 后台运行；部分手机还需在最近任务里锁定 Aria。");
    } catch {
      setHint("无法打开系统设置，请到系统设置中手动允许 Aria 后台运行。");
    }
  }
  return (
    <SettingsRow
      icon={<Compass className="size-4" />}
      title="后台播放保护"
      description="允许忽略电池优化并设为「不限制」后台运行，避免熄屏被系统暂停。"
    >
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={() => void requestExemption()}
          className="tap-scale flex-1 rounded-full bg-neutral-950 px-3 py-2 text-xs font-semibold text-white"
        >
          允许后台运行
        </button>
        <button
          type="button"
          onClick={() => void AriaAudio.openLockScreenAppSettings().catch(() => setHint("无法打开应用权限设置"))}
          className="tap-scale flex-1 rounded-full bg-neutral-950/[0.05] px-3 py-2 text-xs font-medium text-neutral-700"
        >
          打开系统权限页
        </button>
      </div>
      {hint && <p role="status" className="mt-2 text-[11px] leading-4 text-neutral-500">{hint}</p>}
    </SettingsRow>
  );
}

function formatCacheSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function CacheSettings({ controls }: { controls: MobileControls }) {
  const native = isNativeApp();
  const [coverStats, setCoverStats] = useState<CoverCacheStats>({ entries: 0, bytes: 0, memoryEntries: 0 });
  const [audioStats, setAudioStats] = useState<AudioCacheStats | null>(null);
  const [busy, setBusy] = useState<"cover" | "audio" | "limit" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getCoverCacheStats()
        .then((stats) => { if (!cancelled) setCoverStats(stats); })
        .catch(() => undefined);
      if (native) {
        void AriaAudio.getCacheStats()
          .then((stats) => { if (!cancelled) setAudioStats(stats); })
          .catch(() => undefined);
      }
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [native]);

  async function clearCovers() {
    if (busy) return;
    setBusy("cover");
    setMessage("");
    try {
      setCoverStats(await clearCoverCache());
      setMessage("封面缓存已清理");
    } catch {
      setMessage("封面缓存清理失败，请重试");
    } finally {
      setBusy(null);
    }
  }

  async function clearAudio() {
    if (busy || !native) return;
    const confirmed = window.confirm("清空音频缓存会停止当前播放，确定继续吗？");
    if (!confirmed) return;
    setBusy("audio");
    setMessage("");
    try {
      const stats = await AriaAudio.clearCache();
      setAudioStats(stats);
      controls.stopPlayback();
      setMessage("音频缓存已清理");
    } catch {
      setMessage("音频缓存清理失败，请重试");
    } finally {
      setBusy(null);
    }
  }

  async function changeLimit(maxBytes: number) {
    if (!native || busy) return;
    setBusy("limit");
    setMessage("");
    try {
      const stats = await AriaAudio.setCacheLimit({ maxBytes });
      setAudioStats(stats);
      setMessage(maxBytes <= 0 ? "已设为无限制缓存" : `缓存上限已设为 ${formatCacheSize(maxBytes)}`);
    } catch {
      setMessage("缓存上限设置失败，请重试");
    } finally {
      setBusy(null);
    }
  }

  const maxBytes = audioStats ? audioStats.maxBytes : 10 * GB;
  const limitLabel = maxBytes <= 0 ? "无限制" : formatCacheSize(maxBytes);
  const usageRatio = audioStats && maxBytes > 0 ? Math.min(1, audioStats.bytes / maxBytes) : 0;

  return (
    <SettingsGroup
      title="存储与缓存"
      description="封面缓存无条目上限，默认音频缓存 10 GB，也可设为无限制；清理不会删除离线下载。"
    >
      {native && (
        <SettingsRow
          icon={<Download className="size-4" />}
          title="音频缓存上限"
          value={limitLabel}
          description="边听边存播放过的完整音频片段，默认 10 GB"
        >
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {AUDIO_CACHE_LIMIT_OPTIONS.map((option) => {
              const active = option.bytes === 0
                ? maxBytes <= 0
                : Math.abs(maxBytes - option.bytes) < 1024 * 1024;
              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={busy === "limit"}
                  onClick={() => void changeLimit(option.bytes)}
                  className={`tap-scale rounded-full px-3 py-1.5 text-[11px] font-medium transition disabled:opacity-50 ${
                    active
                      ? "bg-neutral-950 text-white shadow-sm"
                      : "bg-neutral-950/[0.045] text-neutral-600 active:bg-neutral-950/[0.09]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {audioStats && maxBytes > 0 && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-950/[0.06]">
              <div
                className="h-full rounded-full bg-neutral-950 transition-[width] duration-300"
                style={{ width: `${Math.max(audioStats.bytes > 0 ? 2 : 0, Math.round(usageRatio * 100))}%` }}
              />
            </div>
          )}
        </SettingsRow>
      )}
      {native && (
        <SettingsRow
          icon={<History className="size-4" />}
          title="音频缓存占用"
          value={audioStats ? formatCacheSize(audioStats.bytes) : "…"}
          description={
            audioStats
              ? `${formatCacheSize(audioStats.bytes)} / ${limitLabel}${audioStats.files > 0 ? ` · ${audioStats.files} 个文件` : ""}`
              : "读取中…"
          }
          right={
            <button
              type="button"
              onClick={() => void clearAudio()}
              disabled={busy !== null || !audioStats || audioStats.bytes === 0}
              className="tap-scale shrink-0 rounded-full bg-neutral-950/[0.06] px-3 py-1.5 text-[11px] font-semibold text-neutral-700 disabled:opacity-40"
            >
              {busy === "audio" ? "清理中…" : "清空"}
            </button>
          }
        />
      )}
      <SettingsRow
        icon={<Disc3 className="size-4" />}
        title="封面缓存"
        value={formatCacheSize(coverStats.bytes)}
        description={`${coverStats.entries} 张已缓存${coverStats.memoryEntries ? ` · ${coverStats.memoryEntries} 张内存热副本` : ""}`}
        right={
          <button
            type="button"
            onClick={() => void clearCovers()}
            disabled={busy !== null || (coverStats.entries === 0 && coverStats.memoryEntries === 0)}
            className="tap-scale shrink-0 rounded-full bg-neutral-950/[0.06] px-3 py-1.5 text-[11px] font-semibold text-neutral-700 disabled:opacity-40"
          >
            {busy === "cover" ? "清理中…" : "清理"}
          </button>
        }
      />
      <SettingsRow
        icon={<CheckCircle2 className="size-4" />}
        title="离线下载音乐"
        value={`${controls.offlineTracks.length} 首`}
        description="离线文件独立保存在应用存储中，清理缓存不会受影响"
      />
      {message && <p role="status" className="py-2.5 text-[11px] font-medium text-neutral-600">{message}</p>}
    </SettingsGroup>
  );
}

function LockScreenSettings() {
  const [settings, setSettings] = useState({ enabled: false, permission: false });
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => { void AriaAudio.getLockScreenSettings().then(setSettings).catch(() => setError("无法读取锁屏设置")); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  async function toggle() {
    try {
      const enabled = !settings.enabled;
      await AriaAudio.setLockScreenEnabled({ enabled });
      setSettings((current) => ({ ...current, enabled }));
      setError("");
    } catch { setError("无法保存锁屏设置，请重试"); }
  }
  return (
    <SettingsRow
      icon={<Immersive className="size-4" />}
      title="音乐锁屏"
      value={settings.enabled ? (settings.permission ? "已授权" : "待授权") : "未开启"}
      description="播放时亮屏直接显示封面、歌词与控制按钮"
      right={<Toggle checked={settings.enabled} onChange={() => void toggle()} label="音乐锁屏" />}
    >
      {settings.enabled && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            {!settings.permission && (
              <button
                type="button"
                onClick={() => void AriaAudio.openLockScreenPermission().catch(() => setError("无法打开系统设置"))}
                className="tap-scale flex-1 rounded-full bg-neutral-950 px-3 py-2 text-xs font-semibold text-white"
              >
                允许锁屏显示
              </button>
            )}
            <button
              type="button"
              onClick={() => void AriaAudio.openLockScreenAppSettings().catch(() => setError("无法打开应用权限设置"))}
              className="tap-scale flex-1 rounded-full bg-neutral-950/[0.05] px-3 py-2 text-xs font-medium text-neutral-700"
            >
              设置锁屏权限
            </button>
          </div>
          <p className="text-[11px] leading-4 text-neutral-500">
            {settings.permission ? "已允许悬浮显示。部分手机还需在应用权限中允许「锁屏显示」和「后台弹出界面」。" : "请允许 Aria 显示在其他应用上层，并开启「锁屏显示」与「后台弹出界面」。"}
          </p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
    </SettingsRow>
  );
}

function DirectNeteaseCard({ controls }: { controls: MobileControls }) {
  const [account, setAccount] = useState<NeteaseAccountSummary | null>(controls.neteaseAccount);
  const [qr, setQr] = useState<{ key: string; qrImage: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [countryCode, setCountryCode] = useState("86");
  const [countdown, setCountdown] = useState(0);
  const [formError, setFormError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [smsRateLimited, setSmsRateLimited] = useState(() => {
    try {
      return Number(localStorage.getItem("aria-netease-sms-rate-limit-until") || 0) > Date.now();
    } catch { return false; }
  });
  const qrPollInFlightRef = useRef(false);

  useEffect(() => {
    setAccount(controls.neteaseAccount);
  }, [controls.neteaseAccount]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  async function sendCaptcha() {
    if (!phone.trim() || countdown > 0 || smsRateLimited) return;
    setFormError("");
    try {
      const result = await directCaptchaSent(phone.trim(), countryCode.trim() || "86");
      if (result.ok) {
        setCountdown(60);
      } else {
        setFormError(friendlyLoginMessage(result.message || `发送失败(${result.code})`));
        if (isSmsRateLimited(result.message)) {
          markSmsRateLimited();
          setSmsRateLimited(true);
        }
      }
    } catch (error) {
      const msg = friendlyLoginMessage(loginErrorMessage(error, "验证码发送失败,请检查网络后重试"));
      setFormError(msg);
      if (isSmsRateLimited(msg)) {
        markSmsRateLimited();
        setSmsRateLimited(true);
      }
    }
  }

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!phone.trim() || loggingIn || !captcha.trim()) return;
    setLoggingIn(true);
    setFormError("");
    try {
      const result = await directCellphoneLogin(
        phone.trim(),
        { captcha: captcha.trim() },
        countryCode.trim() || "86",
      );
      if (!result.ok) {
        setFormError(friendlyLoginMessage(result.message || `登录失败(${result.code})`));
        if (isSmsRateLimited(result.message)) {
          markSmsRateLimited();
          setSmsRateLimited(true);
        }
        return;
      }
      setCaptcha("");
      registerDirectProvider();
      try {
        const nextAccount = await directAccount();
        setAccount(nextAccount);
        controls.setNeteaseAccount(nextAccount);
      } catch {
        const nextAccount = {
          connected: true,
          nickname: result.nickname ?? null,
          userId: null,
          avatarUrl: result.avatarUrl ?? null,
          cookiePreview: "本机会话 · 直连",
        } satisfies NeteaseAccountSummary;
        setAccount(nextAccount);
        controls.setNeteaseAccount(nextAccount);
      }
      setMessage("登录成功");
      void controls.refreshNeteaseData();
    } catch (error) {
      const msg = friendlyLoginMessage(loginErrorMessage(error, "登录失败,请检查网络后重试"));
      setFormError(msg);
      if (isSmsRateLimited(msg)) {
        markSmsRateLimited();
        setSmsRateLimited(true);
      }
    } finally {
      setLoggingIn(false);
    }
  }

  async function startQrLogin() {
    setBusy(true);
    setMessage("");
    setFormError("");
    try {
      const started = await directQrStart();
      setQr({ key: started.key, qrImage: started.qrImage });
      setMessage("网易云音乐 App → 扫一扫，对准此二维码");
    } catch (error) {
      const msg = friendlyLoginMessage(loginErrorMessage(error, "获取二维码失败,请检查网络后重试"));
      setMessage(msg);
      setFormError(msg);
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!qr) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      if (stopped || qrPollInFlightRef.current) return;
      qrPollInFlightRef.current = true;
      try {
        const result = await directQrCheck(qr.key);
        setMessage(result.message);
        if (result.status === "success") {
          window.clearInterval(timer);
          setQr(null);
          setMessage("");
          registerDirectProvider();
          const nextAccount = await directAccount();
          setAccount(nextAccount);
          controls.setNeteaseAccount(nextAccount);
          controls.refreshNeteaseData();
        }
        if (result.status === "expired") {
          window.clearInterval(timer);
          setQr(null);
          setMessage("二维码已过期，请重新获取");
        }
        if (result.status === "error") {
          window.clearInterval(timer);
          setQr(null);
          setFormError(friendlyLoginMessage(result.message));
        }
      } catch (error) {
        const msg = friendlyLoginMessage(loginErrorMessage(error, "二维码状态检查失败,请保持网络连接后重试"));
        setMessage(msg);
        if (/二维码已确认|登录凭据未保存/.test(msg)) {
          window.clearInterval(timer);
          setQr(null);
          setFormError(msg);
        }
      } finally {
        qrPollInFlightRef.current = false;
      }
    }, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr]);

  async function refresh() {
    const nextAccount = await directAccount();
    setAccount(nextAccount);
    controls.setNeteaseAccount(nextAccount);
    controls.refreshNeteaseData();
  }

  if (!isDirectCapable()) return null;
  const connected = Boolean(account?.connected);

  return (
    <section className="mt-5 rounded-[1.45rem] bg-white/88 p-4 shadow-[0_12px_34px_rgba(47,55,76,0.08)] ring-1 ring-neutral-950/[0.05] backdrop-blur-sm">
      <div className="flex items-center gap-3.5">
        {connected && account?.avatarUrl ? (
          <img src={account.avatarUrl} alt="" className="size-12 shrink-0 rounded-full object-cover shadow-sm" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-neutral-950/[0.05] text-neutral-500">
            <UserRound className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-rose-500">网易云直连</p>
          <p className="mt-0.5 truncate text-base font-bold text-neutral-950">
            {connected ? account?.nickname ?? "网易云账号" : qr ? "等待扫码确认" : "未登录"}
          </p>
          <p className="truncate text-[11px] text-neutral-500">
            {connected ? account?.cookiePreview || "本机会话 · 手机直连" : "手机直连网易云，无需电脑即可听歌"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={refresh}
            className="tap-scale flex size-9 items-center justify-center rounded-full bg-neutral-950/[0.05] text-neutral-700"
            aria-label="刷新登录状态"
          >
            <RefreshCw className="size-4" />
          </button>
          {connected && (
            <button
              type="button"
              onClick={() => {
                directLogout();
                const nextAccount = { connected: false, nickname: null, userId: null, avatarUrl: null, cookiePreview: null } satisfies NeteaseAccountSummary;
                setAccount(nextAccount);
                controls.setNeteaseAccount(nextAccount);
                controls.refreshNeteaseData();
              }}
              className="tap-scale rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600"
            >
              退出
            </button>
          )}
        </div>
      </div>

      {!connected && (
        <div className="mt-4 border-t border-neutral-950/[0.06] pt-4">
          {qr ? (
            <div className="flex flex-col items-center gap-2.5">
              <img src={qr.qrImage} alt="网易云登录二维码" className="size-44 rounded-[0.9rem] ring-1 ring-black/5" />
              <p className="text-center text-xs text-neutral-500">
                {message || "等待扫描…"}
                <br />
                <span className="text-neutral-400">打开网易云 App → 扫一扫，对准此码即可</span>
              </p>
              {formError && <p role="alert" className="text-center text-xs text-rose-600">{formError}</p>}
              <button type="button" onClick={() => setQr(null)} className="text-xs font-medium text-neutral-500 underline">
                改用手机短信登录
              </button>
            </div>
          ) : (
            <form onSubmit={submitLogin} className="space-y-2.5">
              {message && <p role="status" className="text-xs text-amber-700">{message}</p>}
              <div className="flex gap-2">
                <input
                  value={countryCode}
                  onChange={(event) => setCountryCode(event.target.value)}
                  inputMode="numeric"
                  aria-label="区号"
                  className="w-16 rounded-[0.85rem] border border-neutral-950/10 bg-white px-2.5 py-2.5 text-sm outline-none focus:border-neutral-950/40"
                />
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="网易云手机号"
                  inputMode="tel"
                  autoComplete="tel"
                  className="min-w-0 flex-1 rounded-[0.85rem] border border-neutral-950/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-950/40"
                />
              </div>
              <div className="flex gap-2">
                <input
                  value={captcha}
                  onChange={(event) => setCaptcha(event.target.value)}
                  placeholder="短信验证码"
                  inputMode="numeric"
                  className="min-w-0 flex-1 rounded-[0.85rem] border border-neutral-950/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-950/40"
                />
                <button
                  type="button"
                  onClick={sendCaptcha}
                  disabled={!phone.trim() || countdown > 0 || smsRateLimited}
                  className="shrink-0 rounded-[0.85rem] bg-neutral-950/[0.06] px-3.5 text-xs font-semibold text-neutral-700 disabled:opacity-50"
                >
                  {smsRateLimited ? "今日已限流" : countdown > 0 ? `${countdown}s` : "发送验证码"}
                </button>
              </div>
              {formError && <p className="text-xs text-rose-600">{formError}</p>}
              <button
                type="submit"
                disabled={loggingIn || !phone.trim() || !captcha.trim()}
                className="tap-scale w-full rounded-full bg-neutral-950 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              >
                {loggingIn ? "登录中…" : "登录"}
              </button>
              <button
                type="button"
                onClick={startQrLogin}
                disabled={busy}
                className="w-full rounded-full bg-neutral-950/[0.045] px-3 py-2.5 text-xs font-medium text-neutral-600 transition disabled:opacity-50"
              >
                {busy ? "获取二维码…" : "改用二维码扫码登录"}
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function loginErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function friendlyLoginMessage(message: string): string {
  if (!message) return message;
  if (/环境异常|设备异常|当前设备/.test(message)) {
    return `${message}。请关闭 VPN/代理，切换 Wi-Fi 或移动网络后重试；扫码登录也更稳定。`;
  }
  return message;
}

function isSmsRateLimited(message: string): boolean {
  return /次数过多|调用过于频繁|操作频繁|rate.?limit|too many/i.test(message);
}

function markSmsRateLimited(): void {
  try {
    localStorage.setItem("aria-netease-sms-rate-limit-until", String(Date.now() + 24 * 60 * 60 * 1000));
  } catch {
    // best effort
  }
}
