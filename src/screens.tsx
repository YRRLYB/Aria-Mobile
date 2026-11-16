import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";import {
  Compass,
  Disc3,
  Download,
  Heart,
  History,
  Immersive,
  ListMusic,
  Loader2,
  LogOut,
  Play,
  Playing,
  Radar,
  RefreshCw,
  Server,
  UserRound,
  Wifi,
  ChevronRight,
  Search,
  Shuffle,
  X,
  Trash2,
  Usb,
  ExternalLink,
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
  requestAudioPermission,
  requestUninterruptedPlayback,
  scanDeviceAudio,
} from "./native/ariaShell";
import { formatDuration, parseDuration, splitArtistNames } from "@/lib/playerPresentation";
import { createLocalArtistSummaries, type ArtistSummary } from "@/lib/artists";
import { APP_VERSION } from "./version";
import type { NeteaseAccountSummary, ProviderPlaylist } from "@/lib/api";
import type { MobileControls } from "./MobileApp";
import { rememberSearch, newestLiked } from "./libraryStorage";
import { AriaAudio, isNativeApp, type AudioCacheStats } from "./native/ariaAudio";
import { DetailHeader, EmptyState, InlineError, LoadingState, PageHeader, SettingsGroup, SettingsRow, Surface, Toggle } from "./ui";
import { LikeHeart } from "./HeartPulse";
import { groupTracksByAlbum, formatTotalDuration, type AlbumGroup } from "./libraryView";
import { ArtistAvatar } from "./ArtistAvatar";
import { cachedCoverUrl, clearCoverCache, getCoverCacheStats, type CoverCacheStats } from "./coverCache";

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
      className={`tap-scale flex items-center gap-3 rounded-[0.9rem] px-2 py-1.5 transition ${active ? "bg-neutral-950/[0.06]" : "active:bg-neutral-950/[0.04]"}`}
    >
      <button type="button" onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {typeof index === "number" ? (
          <span className="flex w-6 shrink-0 items-center justify-center text-xs tabular-nums text-neutral-400">
            {active ? <Playing className="size-3.5 text-emerald-600" /> : index + 1}
          </span>
        ) : null}
        <TrackCover track={track} className="size-9 shrink-0 rounded-[0.55rem]" />
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-1.5 truncate text-sm ${active ? "font-semibold text-neutral-950" : "font-medium"}`}>
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
          <span className="shrink-0 rounded bg-neutral-950/[0.05] px-1 py-0.5 text-[9px] leading-none text-neutral-400">
            {sourceTag}
          </span>
        )}
        <span className="shrink-0 text-xs text-neutral-500">{track.duration}</span>
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

function SectionHeader({ title, Icon, action }: { title: string; Icon?: typeof Compass; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-6 flex items-center justify-between first:mt-1">
      <h2 className="flex items-center gap-2 text-[1.05rem] font-bold tracking-tight text-neutral-950">
        {Icon && <Icon className="size-4 text-neutral-950" />}
        {title}
      </h2>
      {action}
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
      className="tap-scale flex items-center gap-1.5 whitespace-nowrap rounded-full bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white"
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
      className="tap-scale flex size-8 items-center justify-center rounded-full bg-neutral-950/[0.05] text-neutral-600 shadow-sm transition active:bg-neutral-950/10"
      aria-label="随机播放"
    >
      <Shuffle className="size-4" />
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
  const todayListening = useMemo(() => {
    const entries = controls.playHistory.filter((entry) => entry.playedAt >= todayStart);
    const ids = new Set(entries.map((entry) => entry.track.id));
    const seconds = entries.reduce((total, entry) => total + parseDuration(entry.track.duration), 0);
    return { count: ids.size, seconds };
  }, [controls.playHistory, todayStart]);
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

      {/* 我喜欢的音乐：大封面 + 超大数字 + 黑色播放圆钮 */}
      <div className="aria-rise mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={() => openCollection("liked")}
          className="block size-[6.25rem] shrink-0 overflow-hidden rounded-[1.4rem] shadow-[0_14px_36px_rgba(47,55,76,0.24)] ring-1 ring-black/5 transition active:scale-[0.98]"
          aria-label="查看我喜欢的音乐"
        >
          {likedTracks[0] ? (
            <TrackCover track={likedTracks[0]} className="size-full" priority />
          ) : (
            <span className="flex size-full items-center justify-center bg-rose-50 text-rose-300">
              <Heart className="size-9 fill-current" />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.95rem] font-bold text-rose-500">我喜欢的音乐</p>
          <p className="mt-1 text-[2.1rem] font-extrabold leading-none tracking-tight text-neutral-950">
            {likedTracks.length} <span className="text-lg font-bold">首</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => likedTracks[0] && chooseTrack(likedTracks[0].id, likedTracks)}
          disabled={!likedTracks.length}
          aria-label="播放我喜欢的音乐"
          className="tap-scale flex size-14 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white shadow-[0_12px_30px_rgba(23,23,23,0.32)] transition active:scale-95 disabled:opacity-40"
        >
          <Play className="size-6 translate-x-[1px]" />
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
          <p className="mt-1 flex items-center text-[1.45rem] font-bold tracking-tight text-neutral-950">
            {recentTracks.length} 首
            <ChevronRight className="ml-1 size-4 text-neutral-400" />
          </p>
        </button>
        <div className="w-px bg-neutral-950/10" aria-hidden />
        <div className="min-w-0 flex-1 pl-6">
          <p className="text-xs text-neutral-500">本周播放次数</p>
          <p className="mt-1 text-[1.45rem] font-bold tracking-tight text-neutral-950">{weekCount} 首</p>
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
            <button onClick={() => openCollection("daily")} className="flex h-16 w-full items-center justify-center rounded-[0.9rem] border border-dashed border-neutral-950/15 text-xs text-neutral-400">
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

type LibrarySection = "liked" | "albums" | "artists" | "playlists" | "history";
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
    () => [...controls.localTracks, ...controls.deviceTracks, ...controls.offlineTracks],
    [controls.localTracks, controls.deviceTracks, controls.offlineTracks],
  );
  const albums = useMemo(
    () => groupTracksByAlbum(localLibraryTracks),
    [localLibraryTracks],
  );
  const artists = useMemo(
    () => createLocalArtistSummaries(localLibraryTracks).sort((left, right) => right.trackCount - left.trackCount),
    [localLibraryTracks],
  );
  const selectedAlbum = selectedAlbumKey ? albums.find((album) => album.key === selectedAlbumKey) ?? null : null;
  const selectedArtist = selectedArtistName
    ? artists.find((artist) => artist.name.toLowerCase() === selectedArtistName.toLowerCase()) ?? null
    : null;

  // Two-layer navigation: the chip row picks a content type, the source row
  // filters it. Membership is id-based so a downloaded netease song reads as
  // 离线, a desktop-synced one as 桌面, a phone scan as 手机.
  const sourceIds = useMemo(() => ({
    offline: new Set(controls.offlineTracks.map((track) => track.id)),
    device: new Set(controls.deviceTracks.map((track) => track.id)),
    local: new Set(controls.localTracks.map((track) => track.id)),
    netease: new Set(controls.likedNeteaseTracks.map((track) => track.id)),
  }), [controls.offlineTracks, controls.deviceTracks, controls.localTracks, controls.likedNeteaseTracks]);

  const trackInSource = useCallback(
    (track: Track) => (source === "all" ? true : sourceIds[source].has(track.id)),
    [source, sourceIds],
  );

  function sourceTagFor(track: Track): string {
    if (sourceIds.offline.has(track.id)) return "离线";
    if (sourceIds.device.has(track.id)) return "手机";
    if (sourceIds.local.has(track.id)) return "桌面";
    if (sourceIds.netease.has(track.id)) return "网易云";
    return "";
  }

  const filteredLiked = useMemo(() => likedTracks.filter(trackInSource), [likedTracks, trackInSource]);
  const filteredAlbums = useMemo(() => albums.filter((album) => album.tracks.some(trackInSource)), [albums, trackInSource]);
  const filteredArtists = useMemo(() => {
    if (source === "netease") return controls.artistSummaries.slice(0, 40);
    return createLocalArtistSummaries(localLibraryTracks.filter(trackInSource))
      .sort((left, right) => right.trackCount - left.trackCount);
  }, [source, controls.artistSummaries, localLibraryTracks, trackInSource]);
  const filteredHistory = useMemo(() => controls.historyTracks.filter(trackInSource), [controls.historyTracks, trackInSource]);

  const sections: Array<{ id: LibrarySection; label: string }> = [
    { id: "liked", label: "我喜欢" },
    { id: "albums", label: "专辑" },
    { id: "artists", label: "歌手" },
    { id: "playlists", label: "歌单" },
    { id: "history", label: "最近播放" },
  ];
  const sourceVisible = section !== "playlists";
  const removeOffline = useCallback((trackId: string) => void controls.deleteOfflineTrack(trackId), [controls]);

  const [scanning, setScanning] = useState(false);
  const [scanHint, setScanHint] = useState("");
  async function scanPhone() {
    setScanning(true);
    setScanHint("");
    try {
      const granted = await requestAudioPermission();
      if (!granted) {
        setScanning(false);
        setScanHint("需要授权访问手机音频,请在系统弹窗中允许。");
        return;
      }
      const raw = await scanDeviceAudio();
      if (!raw.length) {
        controls.addDeviceTracks([]);
        setScanHint("没有在手机里找到音频文件。");
        return;
      }
      controls.addDeviceTracks(
        raw.map((item: { id: string; title: string; artist: string; album: string; durationMs: number; streamUrl: string; coverUrl: string }) => ({
          id: `device:${item.id}`,
          title: item.title,
          artist: item.artist || "未知歌手",
          album: item.album || "未知专辑",
          duration: formatDuration(item.durationMs / 1000),
          quality: "Lossless" as const,
          source: "local" as const,
          streamUrl: item.streamUrl,
          cover: item.coverUrl,
          coverUrl: item.coverUrl,
          accent: "#c9d3f2",
          waveform: [24, 40, 66, 48, 78, 56, 36, 84, 62, 42, 70, 52],
          lyrics: [],
          lyricStatus: "missing" as const,
        })),
      );
    } catch {
      setScanHint("扫描失败，已保留上次的曲库，请重试。");
    } finally {
      setScanning(false);
    }
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
    const tracks = uniqueTracks(localLibraryTracks.filter((track) =>
      splitArtistNames(track.artist).some((name) => name.toLowerCase() === selectedArtist.name.toLowerCase()),
    ));
    return (
      <ArtistDetail
        artist={selectedArtist}
        tracks={tracks}
        controls={controls}
        onBack={() => setSelectedArtistName(null)}
      />
    );
  }

  return (
    <div className="pb-4">
      <PageHeader
        title="音乐库"
        description="喜欢的歌、专辑、手机音乐和桌面曲库都在这里。"
      />

      <div className="mt-4 flex items-stretch">
        {[
          { id: "liked" as const, label: "喜欢", value: likedTracks.length },
          { id: "albums" as const, label: "专辑", value: albums.length },
          { id: "artists" as const, label: "歌手", value: artists.length },
          { id: "playlists" as const, label: "歌单", value: controls.providerPlaylists.length },
        ].map((stat, index) => (
          <button
            key={stat.id}
            type="button"
            onClick={() => {
              setSection(stat.id);
              setSelectedAlbumKey(null);
              setSelectedArtistName(null);
            }}
            className={`tap-scale min-w-0 flex-1 text-left ${index > 0 ? "pl-5" : ""} ${index < 3 ? "" : ""}`}
          >
            <p className="text-xs text-neutral-500">{stat.label}</p>
            <p className="mt-0.5 flex items-center text-[1.35rem] font-bold tracking-tight text-neutral-950">
              {stat.value} 首
              {stat.id === "liked" && <ChevronRight className="ml-1 size-4 text-neutral-400" />}
            </p>
          </button>
        ))}
      </div>
      <div className="mx-0 mt-3 h-px bg-neutral-950/[0.06]" aria-hidden />

      <div className="sticky top-0 z-20 -mx-4 mt-3 px-4 py-2">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSection(id);
                setSelectedAlbumKey(null);
                setSelectedArtistName(null);
              }}
              className={`tap-scale shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                section === id ? "bg-neutral-950 text-white shadow-sm" : "bg-white/75 text-neutral-600 shadow-sm"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {sourceVisible && (
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-medium text-neutral-400">来源</span>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {SOURCES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSource(id)}
                  className={`tap-scale shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    source === id ? "bg-neutral-950/[0.08] text-neutral-950 ring-1 ring-neutral-950/30" : "bg-white/60 text-neutral-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        {source === "device" && controls.deviceTracks.length === 0 && (
          <DeviceScanCard scanning={scanning} hint={scanHint} onScan={() => void scanPhone()} />
        )}
        {section === "albums" && <AlbumSection albums={filteredAlbums} onOpen={setSelectedAlbumKey} />}
        {section === "artists" && <ArtistSection artists={filteredArtists} onOpen={setSelectedArtistName} />}
        {section === "playlists" && <PlaylistsSection {...controls} />}
        {section === "liked" && (
          <LikedSection
            controls={controls}
            tracks={filteredLiked}
            filterLabel={source === "all" ? undefined : SOURCES.find((item) => item.id === source)?.label}
            onRemove={source === "offline" ? removeOffline : undefined}
          />
        )}
        {section === "history" && (
          <HistorySection controls={controls} tracks={filteredHistory} filterLabel={source === "all" ? undefined : SOURCES.find((item) => item.id === source)?.label} />
        )}
      </div>
    </div>
  );
}

function DeviceScanCard({
  scanning,
  hint,
  onScan,
}: {
  scanning: boolean;
  hint: string;
  onScan: () => void;
}) {
  return (
    <div className="rounded-[1rem] border border-neutral-950/[0.07] bg-white p-4">
      <p className="text-xs leading-5 text-neutral-500">
        扫描手机里的音频文件,离线也能听。文件只在手机上播放,不会上传。
      </p>
      {hint && <p className="mt-2 text-xs text-amber-600">{hint}</p>}
      <button
        type="button"
        onClick={onScan}
        disabled={scanning}
        className="tap-scale mt-3 flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
      >
        {scanning ? <Loader2 className="size-3.5 animate-spin" /> : <ListMusic className="size-3.5" />}
        {scanning ? "扫描中…" : "扫描手机音乐"}
      </button>
    </div>
  );
}

/** Source-filtered track rows (liked / history under a specific origin). */
function SourceTrackList({
  controls,
  tracks,
  filterLabel,
  emptyHint,
  showLike = true,
  onRemove,
}: {
  controls: MobileControls;
  tracks: Track[];
  filterLabel?: string;
  emptyHint?: string;
  showLike?: boolean;
  onRemove?: (trackId: string) => void;
}) {
  const { chooseTrack, toggleLikeTrack, likedTrackIds, neteaseLikedIds } = controls;
  if (!tracks.length) {
    return (
      <EmptyState
        icon={<History className="size-5" />}
        title={filterLabel ? `该来源下还没有歌曲` : "还没有歌曲"}
        description={emptyHint ?? "换个来源，或先播放一些歌曲。"}
      />
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-neutral-500">{filterLabel ?? "全部"} · {tracks.length} 首</p>
        <PlayAllButton onPlay={() => tracks[0] && chooseTrack(tracks[0].id, tracks)} count={tracks.length} />
      </div>
      <div className="mt-2 space-y-0.5">
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            active={controls.activeTrackId === track.id}
            liked={showLike ? Boolean(neteaseLikedIds[track.id] || likedTrackIds[track.id] || track.likedAt) : undefined}
            onPlay={() => chooseTrack(track.id, tracks)}
            onLike={showLike ? () => toggleLikeTrack(track.id) : undefined}
            onRemove={onRemove ? () => onRemove(track.id) : undefined}
          />
        ))}
      </div>
    </>
  );
}

function AlbumCard({ album, onOpen }: { album: AlbumGroup; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="tap-scale min-w-0 text-left">
      <div className="overflow-hidden rounded-[0.95rem] bg-white/70 shadow-sm ring-1 ring-black/5">
        <TrackCover track={album.coverTrack} className="aspect-square w-full" />
      </div>
      <p className="mt-1.5 truncate text-xs font-semibold">{album.title}</p>
      <p className="mt-0.5 truncate text-[11px] text-neutral-500">{album.artist} · {album.tracks.length} 首</p>
    </button>
  );
}

function AlbumSection({ albums, onOpen }: { albums: AlbumGroup[]; onOpen: (key: string) => void }) {
  const [query, setQuery] = useState("");
  // Input-as-you-type with a small debounce; the 搜索 button applies instantly.
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
        className="mb-3 flex items-center gap-2 rounded-[0.9rem] border border-neutral-950/[0.08] bg-white px-3 py-2 text-xs text-neutral-500"
      >
        <Search className="size-4 shrink-0" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索专辑或歌手"
          aria-label="搜索专辑或歌手"
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
        />
        {query && (
          <button
            type="submit"
            className="tap-scale shrink-0 rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-medium text-white"
          >
            搜索
          </button>
        )}
      </form>
      <p className="mb-2 text-xs text-neutral-500">{filtered.length} 张专辑</p>
      {filtered.length ? (
        <div className="grid grid-cols-2 gap-3">
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
      <button type="button" onClick={onBack} className="tap-scale mb-3 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
        <ChevronRight className="size-4 rotate-180" />
        {backLabel}
      </button>
      <div className="flex items-start gap-4">
        <div className="size-28 shrink-0 overflow-hidden rounded-[1.4rem] shadow-[0_14px_36px_rgba(47,55,76,0.22)] ring-1 ring-black/5">
          <TrackCover track={cover} className="size-full" priority />
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-xs font-bold text-rose-500">专辑</p>
          <h1 className="mt-1 line-clamp-2 text-[1.55rem] font-bold leading-tight tracking-tight text-neutral-950">{album.title}</h1>
          <p className="mt-1.5 truncate text-xs text-neutral-500">
            {album.artist} · {album.tracks.length} 首 · {formatTotalDuration(album.tracks)}
          </p>
          <div className="mt-3.5 flex items-center gap-2">
            <PlayAllButton onPlay={() => album.tracks[0] && controls.chooseTrack(album.tracks[0].id, album.tracks)} count={album.tracks.length} />
            <RandomPlayButton onPlay={() => controls.playShuffledTracks(album.tracks)} count={album.tracks.length} />
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-0.5">
        {album.tracks.map((track, index) => (
          <TrackRow
            key={track.id}
            track={track}
            index={index}
            active={controls.activeTrackId === track.id}
            onPlay={() => controls.chooseTrack(track.id, album.tracks)}
          />
        ))}
      </div>
    </div>
  );
}



function LikedSection({
  controls,
  tracks,
  filterLabel,
  onRemove,
}: {
  controls: MobileControls;
  tracks?: Track[];
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
        <p className="text-xs text-neutral-500">{filterLabel ?? "全部喜欢"} · {all.length} 首</p>
        <PlayAllButton onPlay={() => all[0] && chooseTrack(all[0].id, all)} count={all.length} />
      </div>
      <div className="mt-2 space-y-0.5">
        {all.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            active={controls.activeTrackId === track.id}
            liked
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
      <p className="px-1 pb-1 text-xs text-neutral-500">共 {artists.length} 位歌手</p>
      {artists.map((artist) => (
        <button
          key={artist.id}
          type="button"
          onClick={() => onOpen(artist.name)}
          className="tap-scale flex w-full items-center gap-3 rounded-[0.9rem] px-2 py-2 text-left transition active:bg-neutral-950/[0.04]"
        >
          <ArtistAvatar name={artist.name} avatarUrl={artist.avatarUrl} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{artist.name}</span>
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
      <button type="button" onClick={onBack} className="tap-scale mb-3 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
        <ChevronRight className="size-4 rotate-180" />
        返回歌手
      </button>
      <div className="flex items-center gap-4">
        <ArtistAvatar name={artist.name} avatarUrl={artist.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">歌手</p>
          <h1 className="mt-1 truncate text-lg font-semibold">{artist.name}</h1>
          <p className="mt-1 text-xs text-neutral-500">{tracks.length} 首 · {albums.length} 张专辑</p>
          <div className="mt-3 flex items-center gap-2">
            <PlayAllButton onPlay={() => tracks[0] && controls.chooseTrack(tracks[0].id, tracks)} count={tracks.length} />
            <RandomPlayButton onPlay={() => controls.playShuffledTracks(tracks)} count={tracks.length} />
          </div>
        </div>
      </div>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">热门歌曲</h2>
          {tracks.length > 5 && (
            <button type="button" onClick={() => setShowAllSongs((value) => !value)} className="text-xs text-neutral-500 transition active:text-neutral-900">
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
              onPlay={() => controls.chooseTrack(track.id, tracks)}
            />
          ))}
        </div>
      </section>

      {albums.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-1 text-sm font-semibold">专辑 · {albums.length}</h2>
          {/* Apple-watch-style honeycomb: circular album covers in offset rows. */}
          <div className="flex flex-col items-center py-2">
            {chunkAlbumRows(albums, 3).map((row, rowIndex) => (
              <div
                key={rowIndex}
                className={`flex gap-2.5 py-1 ${rowIndex % 2 === 1 ? "translate-x-12" : ""}`}
              >
                {row.map((album) => (
                  <button
                    key={album.key}
                    type="button"
                    onClick={() => setOpenedAlbum(album)}
                    className="tap-scale w-24 shrink-0 text-center"
                    aria-label={`打开专辑 ${album.title}`}
                  >
                    {/* Rounded-square content cover: full artwork, no clipped
                        captions - the circle stays reserved for avatars and
                        the spinning disc. */}
                    <span className="block aspect-square w-full overflow-hidden rounded-[0.95rem] bg-white/70 shadow-[0_10px_26px_rgba(47,55,76,0.18)] ring-1 ring-black/5">
                      <TrackCover track={album.coverTrack} className="size-full" />
                    </span>
                    <span className="mt-1.5 block truncate text-[10px] font-medium text-neutral-600">{album.title}</span>
                    <span className="block truncate text-[9px] text-neutral-400">{album.tracks.length} 首</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Splits albums into rows of `size` for the honeycomb layout. */
function chunkAlbumRows(albums: AlbumGroup[], size: number): AlbumGroup[][] {
  const rows: AlbumGroup[][] = [];
  for (let index = 0; index < albums.length; index += size) {
    rows.push(albums.slice(index, index + size));
  }
  return rows;
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
    <div className="space-y-5">
      {error && <InlineError message={error} />}
      {owned.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[1.05rem] font-bold tracking-tight text-neutral-950">我创建的歌单</h2>
            <span className="text-[10px] text-neutral-400">{owned.length} 个</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {owned.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} onOpen={() => loadPlaylist(playlist)} />
            ))}
          </div>
        </section>
      )}
      {saved.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[1.05rem] font-bold tracking-tight text-neutral-950">我收藏的歌单</h2>
            <span className="text-[10px] text-neutral-400">{saved.length} 个</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
      <div className="relative overflow-hidden rounded-[0.9rem] ring-1 ring-black/5">
        <PlaylistCover playlist={playlist} className="aspect-square w-full" />
        {playlist.subscribed && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-medium text-white/85 backdrop-blur">
            收藏
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate text-xs font-medium">{playlist.name}</p>
      <p className="truncate text-[11px] text-neutral-500">
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
        visual={<PlaylistCover playlist={playlist} tracks={playlistTracks} className="size-28 rounded-[1.1rem]" />}
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
  const [coverSrc, setCoverSrc] = useState(() =>
    /^https?:/i.test(playlist.coverUrl ?? "") ? "" : playlist.coverUrl ?? "",
  );
  useEffect(() => {
    let mounted = true;
    setCoverSrc(/^https?:/i.test(playlist.coverUrl ?? "") ? "" : playlist.coverUrl ?? "");
    if (playlist.coverUrl) {
      void cachedCoverUrl(playlist.coverUrl).then((url) => {
        if (mounted && url) setCoverSrc(url);
      });
    }
    return () => { mounted = false; };
  }, [playlist.coverUrl]);
  if (coverSrc) {
    return (
      <div className={`overflow-hidden bg-[linear-gradient(140deg,#c9d3f2,#e7d5ec)] shadow-sm ${className ?? ""}`}>
        <img
          src={coverSrc}
          alt=""
          loading="lazy"
          onError={(event) => {
            if (coverSrc !== playlist.coverUrl) setCoverSrc(playlist.coverUrl ?? "");
            else event.currentTarget.style.display = "none";
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
  filterLabel,
}: {
  controls: MobileControls;
  tracks?: Track[];
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
        <p className="text-xs text-neutral-500">最近 {list.length} 首</p>
        <button
          type="button"
          onClick={() => controls.openCollection("history")}
          className="text-xs text-neutral-500 transition active:text-neutral-900"
        >
          查看全部
        </button>
      </div>
      {list.slice(0, 20).map((track) => (
        <TrackRow
          key={track.id}
          track={track}
          active={controls.activeTrackId === track.id}
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
  // The input keeps a local draft; results only refresh when the user
  // commits a search (Enter key, the search button, or a history chip), so
  // typing one character no longer reshuffles the list mid-word.
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
      <PageHeader title="搜索" description="输入关键词后按回车或点「搜索」开始。" />
      <div className="mt-3 flex items-center gap-2 rounded-[1rem] border border-neutral-950/10 bg-white/80 px-3 py-2 transition focus-within:border-neutral-950/40">
        <Search className="size-4 shrink-0 text-neutral-400" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); submitSearch(); } }}
          enterKeyHint="search"
          aria-label="搜索音乐"
          placeholder="搜索歌曲、歌手、歌单、专辑…"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-neutral-400"
        />
        {draft && (
          <button
            type="button"
            onClick={() => { setDraft(""); setSearchQuery(""); }}
            className="tap-scale flex size-8 shrink-0 items-center justify-center rounded-full"
            aria-label="清空搜索词"
          >
            <X className="size-4 text-neutral-400" />
          </button>
        )}
        {draft.trim() && (
          <button
            type="button"
            onClick={() => submitSearch()}
            className="tap-scale shrink-0 rounded-full bg-neutral-950 px-3.5 py-1.5 text-xs font-medium text-white"
            aria-label="搜索"
          >
            搜索
          </button>
        )}
      </div>

      {!hasQuery && (
        <>
          <div className="mt-5 flex items-center justify-between">
            <h2 className="text-sm font-semibold">最近搜索</h2>
            {history.length > 0 && (
              <button type="button" onClick={() => setHistory([])} className="text-xs text-neutral-400 transition active:text-neutral-700">
                清空
              </button>
            )}
          </div>
          {history.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {history.map((query) => (
                <button
                  key={query}
                  type="button"
                  onClick={() => submitSearch(query)}
                  className="tap-scale max-w-full truncate rounded-full border border-white/75 bg-white/70 px-3.5 py-1.5 text-xs text-neutral-600 shadow-sm"
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
              <div className="mb-2 mt-6 flex items-center justify-between">
                <h2 className="text-sm font-semibold">热门推荐</h2>
                <span className="text-xs text-neutral-500">从今天开始听</span>
              </div>
              <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
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
              <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
                {(expanded.artists ? artistResults : artistResults.slice(0, 5)).map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => setSelectedArtist(artist)}
                    className="tap-scale w-16 shrink-0 text-center"
                  >
                    <ArtistAvatar name={artist.name} avatarUrl={artist.avatarUrl} size="md" className="mx-auto size-16" />
                    <p className="mt-1 truncate text-[11px] text-neutral-600">{artist.name}</p>
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
            <div className="mt-5">
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
    <section className="aria-rise mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[1.05rem] font-bold tracking-tight text-neutral-950">
          {title} <span className="ml-1 text-xs font-normal text-neutral-400">{count}</span>
        </h2>
        {count > 4 && (
          <button type="button" onClick={onToggle} className="text-xs text-neutral-500 transition active:text-neutral-900">
            {expanded ? "收起" : "查看全部"}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export function SettingsScreen(controls: MobileControls) {
  const {
    neteaseAccount,
    connection,
    libraryMeta,
    localTracks,
    refreshNeteaseData,
    disconnect,
  } = controls;
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await refreshNeteaseData();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <PageHeader title="设置" description="账号、缓存、连接与系统设置。" />

      {controls.directMode ? (
        <DirectNeteaseCard controls={controls} />
      ) : (
        <SettingsGroup title="账号" description="网易云账号由桌面端扫码登录，数据自动同步。">
          <SettingsRow
            icon={
              neteaseAccount?.avatarUrl ? (
                <img src={neteaseAccount.avatarUrl} alt="" className="size-9 rounded-full object-cover" />
              ) : (
                <UserRound className="size-4" />
              )
            }
            title={neteaseAccount?.connected ? neteaseAccount.nickname ?? "网易云账号" : "未登录"}
            description={neteaseAccount?.connected ? "扫码登录在桌面端完成，数据自动同步" : "请在桌面端设置里扫码登录"}
            right={
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="tap-scale flex size-9 items-center justify-center rounded-full bg-white shadow-sm disabled:opacity-50"
                aria-label="刷新数据"
              >
                <RefreshCw className={`size-4 text-neutral-600 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            }
          />
        </SettingsGroup>
      )}

      <CacheSettings controls={controls} />

      {!controls.directMode && (
        <SettingsGroup title="连接" description="与桌面端共用曲库（仅限局域网）。">
          <SettingsRow
            icon={<Server className="size-4" />}
            title="桌面端服务器"
            description={connection.serverUrl || "未连接"}
          />
          <SettingsRow
            icon={<Wifi className="size-4" />}
            title="本地曲库"
            description={`${localTracks.length} 首 · ${libraryMeta.roots} 个目录`}
          />
          <button
            type="button"
            onClick={disconnect}
            className="tap-scale mt-2 flex w-full items-center justify-center gap-2 rounded-[0.9rem] bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600"
          >
            <LogOut className="size-4" />
            断开连接
          </button>
        </SettingsGroup>
      )}

      {isNativeApp() && (
        <SettingsGroup title="系统" description="锁屏、后台运行与音频输出。">
          <LockScreenSettings />
          <BackgroundPlaybackSettings />
          <SettingsRow
            icon={<Usb className="size-4" />}
            title="USB 音频焦点"
            description={
              controls.usbExclusive.connected
                ? "已检测到 USB 音频设备，播放时优先占用音频焦点。"
                : "连接 USB 音频设备后可启用（实验），减少其他应用抢占。"
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
        </SettingsGroup>
      )}

      <SettingsGroup title="关于">
        <SettingsRow
          title="Aria Mobile"
          description={`v${APP_VERSION} · ${controls.directMode ? "手机直连网易云" : "桌面伴侣模式"} · 播放凭据只保存在本机`}
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
    <SettingsRow title="后台播放保护" description="允许忽略电池优化并「不限制」后台运行，减少锁屏后系统停止播放。">
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void requestExemption()}
          className="tap-scale flex-1 rounded-[0.8rem] bg-neutral-950 px-3 py-2.5 text-xs font-medium text-white"
        >
          允许后台运行
        </button>
        <button
          type="button"
          onClick={() => void AriaAudio.openLockScreenAppSettings().catch(() => setHint("无法打开应用权限设置"))}
          className="tap-scale flex-1 rounded-[0.8rem] bg-neutral-950/[0.05] px-3 py-2.5 text-xs font-medium text-neutral-700"
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
  const [busy, setBusy] = useState<"cover" | "audio" | null>(null);
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

  return (
    <SettingsGroup
      title="缓存管理"
      description="封面缓存加快加载，音频缓存保留最近播放片段（最多 128 MB）；清理不会删除离线下载。"
    >
      <SettingsRow
        icon={<Disc3 className="size-4" />}
        title="封面缓存"
        description={`${coverStats.entries} 张 · ${formatCacheSize(coverStats.bytes)}${coverStats.memoryEntries ? ` · ${coverStats.memoryEntries} 张内存副本` : ""}`}
        right={
          <button
            type="button"
            onClick={() => void clearCovers()}
            disabled={busy !== null || (coverStats.entries === 0 && coverStats.memoryEntries === 0)}
            className="tap-scale shrink-0 rounded-full bg-neutral-950/[0.05] px-3 py-1.5 text-[11px] font-medium text-neutral-700 disabled:opacity-40"
          >
            {busy === "cover" ? "清理中…" : "清理"}
          </button>
        }
      />
      {native && (
        <SettingsRow
          icon={<Download className="size-4" />}
          title="音频缓存"
          description={audioStats ? `${formatCacheSize(audioStats.bytes)} / 128 MB${audioStats.files > 0 ? ` · ${audioStats.files} 个文件` : ""}` : "读取中…"}
          right={
            <button
              type="button"
              onClick={() => void clearAudio()}
              disabled={busy !== null || !audioStats || audioStats.bytes === 0}
              className="tap-scale shrink-0 rounded-full bg-neutral-950/[0.05] px-3 py-1.5 text-[11px] font-medium text-neutral-700 disabled:opacity-40"
            >
              {busy === "audio" ? "清理中…" : "清空"}
            </button>
          }
        />
      )}
      {message && <p role="status" className="pb-1 pt-2 text-[11px] text-neutral-500">{message}</p>}
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
      title="音乐锁屏"
      description="播放时亮屏，直接显示封面、歌词和控制"
      right={<Toggle checked={settings.enabled} onChange={() => void toggle()} label="音乐锁屏" />}
    >
      {settings.enabled && (
        <div className="mt-3 space-y-2">
          {!settings.permission && (
            <button
              onClick={() => void AriaAudio.openLockScreenPermission().catch(() => setError("无法打开系统设置"))}
              className="w-full rounded-[0.9rem] bg-neutral-950 px-4 py-2.5 text-sm text-white"
            >
              允许锁屏显示
            </button>
          )}
          <button
            onClick={() => void AriaAudio.openLockScreenAppSettings().catch(() => setError("无法打开应用权限设置"))}
            className="w-full rounded-[0.9rem] bg-neutral-950/5 px-4 py-2.5 text-sm"
          >
            设置锁屏与后台权限
          </button>
          <p className="text-[11px] leading-4 text-neutral-500">
            {settings.permission ? "已允许显示。播放歌曲后锁屏，再亮屏即可查看。" : "请在系统页面允许 Aria 显示在其他应用上层。"}{" "}
            部分手机还需在应用权限中允许「锁屏显示」和「后台弹出界面」。上滑仍使用手机原有解锁方式。
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
      const message = friendlyLoginMessage(loginErrorMessage(error, "验证码发送失败,请检查网络后重试"));
      setFormError(message);
      if (isSmsRateLimited(message)) {
        markSmsRateLimited();
        setSmsRateLimited(true);
      }
    }
  }

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!phone.trim() || loggingIn) return;
    if (!captcha.trim()) return;
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
      const message = friendlyLoginMessage(loginErrorMessage(error, "登录失败,请检查网络后重试"));
      setFormError(message);
      if (isSmsRateLimited(message)) {
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
      setMessage("网易云音乐 App → 扫一扫,对准此二维码");
    } catch (error) {
      const message = friendlyLoginMessage(loginErrorMessage(error, "获取二维码失败,请检查网络后重试"));
      setMessage(message);
      setFormError(message);
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
          setMessage("二维码已过期,请重新获取");
        }
        if (result.status === "error") {
          window.clearInterval(timer);
          setQr(null);
          setFormError(friendlyLoginMessage(result.message));
        }
      } catch (error) {
        const message = friendlyLoginMessage(loginErrorMessage(error, "二维码状态检查失败,请保持网络连接后重试"));
        setMessage(message);
        if (/二维码已确认|登录凭据未保存/.test(message)) {
          window.clearInterval(timer);
          setQr(null);
          setFormError(message);
        }
      } finally {
        qrPollInFlightRef.current = false;
      }
    }, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // refreshNeteaseData is an effect-event and stays stable.
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
    <SettingsGroup title="网易云直连" description={connected ? "手机直连网易云，不依赖电脑。" : "登录后无需电脑即可听网易云。"}>
      <SettingsRow
        icon={
          connected && account?.avatarUrl ? (
            <img src={account.avatarUrl} alt="" className="size-9 rounded-full object-cover" />
          ) : (
            <UserRound className="size-4" />
          )
        }
        title={connected ? account?.nickname ?? "网易云账号" : qr ? "扫码后在手机上确认" : "未登录"}
        description={
          connected
            ? account?.cookiePreview || "本机会话 · 直连"
            : qr
              ? "打开网易云 App 扫一扫，对准此码即可"
              : "使用短信验证码或二维码登录"
        }
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              className="tap-scale flex size-9 items-center justify-center rounded-full bg-white shadow-sm"
              aria-label="刷新登录状态"
            >
              <RefreshCw className="size-4 text-neutral-600" />
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
                className="tap-scale rounded-full bg-white px-3 py-1.5 text-xs text-rose-600 shadow-sm"
              >
                退出
              </button>
            )}
          </div>
        }
      />

      {!connected && (
        <div className="mt-3 rounded-[1rem] bg-white/70 p-4">
          {qr ? (
            <div className="flex flex-col items-center gap-2">
              <img src={qr.qrImage} alt="网易云登录二维码" className="size-44 rounded-[0.8rem]" />
              <p className="text-center text-xs text-neutral-500">
                {message || "等待扫描…"}
                <br />
                <span className="text-neutral-400">本机打开网易云 App → 扫一扫,对准此码即可</span>
              </p>
              {formError && <p role="alert" className="text-center text-xs text-rose-600">{formError}</p>}
              <button type="button" onClick={() => setQr(null)} className="text-xs text-neutral-400 underline">
                返回账号密码登录
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
                  className="w-16 rounded-[0.8rem] border border-neutral-950/10 px-2.5 py-2.5 text-sm outline-none focus:border-neutral-950/40"
                />
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="网易云手机号"
                  inputMode="tel"
                  autoComplete="tel"
                  className="min-w-0 flex-1 rounded-[0.8rem] border border-neutral-950/10 px-3 py-2.5 text-sm outline-none focus:border-neutral-950/40"
                />
              </div>
              <div className="flex gap-2">
                <input
                  value={captcha}
                  onChange={(event) => setCaptcha(event.target.value)}
                  placeholder="短信验证码"
                  inputMode="numeric"
                  className="min-w-0 flex-1 rounded-[0.8rem] border border-neutral-950/10 px-3 py-2.5 text-sm outline-none focus:border-neutral-950/40"
                />
                <button
                  type="button"
                  onClick={sendCaptcha}
                  disabled={!phone.trim() || countdown > 0 || smsRateLimited}
                  className="shrink-0 rounded-[0.8rem] bg-neutral-950/[0.06] px-3 text-xs font-medium text-neutral-700 disabled:opacity-50"
                >
                  {smsRateLimited ? "今日已限流" : countdown > 0 ? `${countdown}s` : "发送验证码"}
                </button>
              </div>
              {formError && <p className="text-xs text-rose-600">{formError}</p>}
              <button
                type="submit"
                disabled={loggingIn || !phone.trim() || !captcha.trim()}
                className="tap-scale w-full rounded-[0.9rem] bg-neutral-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {loggingIn ? "登录中…" : "登录"}
              </button>
              <button
                type="button"
                onClick={startQrLogin}
                disabled={busy}
                className="w-full rounded-[0.9rem] bg-neutral-950/[0.04] px-3 py-2.5 text-xs text-neutral-500 transition disabled:opacity-50"
              >
                {busy ? "获取二维码…" : "不方便收短信?改用二维码登录"}
              </button>
            </form>
          )}
        </div>
      )}

      <SettingsRow
        title="切换桌面模式"
        description="直连模式不依赖电脑；桌面模式可串流电脑曲库（仅限局域网）。"
        right={
          <button
            type="button"
            onClick={controls.switchToDesktopMode}
            className="tap-scale shrink-0 rounded-full bg-white px-3 py-1.5 text-xs text-neutral-600 shadow-sm"
          >
            切换
          </button>
        }
      />
    </SettingsGroup>
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
