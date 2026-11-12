import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";import {
  Compass,
  Disc3,
  Download,
  Heart,
  HeartFill,
  History,
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
import { AriaAudio, isNativeApp } from "./native/ariaAudio";
import { DetailHeader, EmptyState, InlineError, LoadingState, PageHeader, Surface } from "./ui";
import { groupTracksByAlbum, formatTotalDuration, type AlbumGroup } from "./libraryView";
import { ArtistAvatar } from "./ArtistAvatar";
import { cachedCoverUrl } from "./coverCache";

export function TrackRow({
  track,
  index,
  active,
  liked,
  onPlay,
  onLike,
  onRemove,
}: {
  track: { id: string; title: string; artist: string; album: string; duration: string; cover: string; vip?: boolean };
  index?: number;
  active?: boolean;
  liked?: boolean;
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
        <span className="shrink-0 text-xs text-neutral-400">{track.duration}</span>
      </button>
      {onLike && (
        <button
          type="button"
          onClick={onLike}
          className="tap-scale flex size-8 shrink-0 items-center justify-center rounded-full"
          aria-label={liked ? "取消喜欢" : "喜欢"}
        >
          {liked
            ? <HeartFill className="size-4 text-rose-500" />
            : <Heart className="size-4 text-neutral-400" />}
        </button>
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
    <div className="mb-2.5 mt-6 flex items-center justify-between first:mt-1">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {Icon && <Icon className="size-4 text-neutral-400" />}
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
      className="tap-scale w-32 shrink-0 text-left"
    >
      <div className={`overflow-hidden rounded-[0.9rem] shadow-sm ${active ? "ring-2 ring-neutral-950" : ""}`}>
        <TrackCover track={track} className="aspect-square w-full" />
      </div>
      <p className="mt-1.5 truncate text-xs font-medium">{track.title}</p>
      <p className="truncate text-[11px] text-neutral-500">{track.artist}</p>
    </button>
  );
}

export function PlayAllButton({ onPlay, count }: { onPlay: () => void; count: number }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onPlay}
      className="tap-scale flex items-center gap-1.5 whitespace-nowrap rounded-full bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white"
    >
      <Play className="size-3" />
      播放全部 {count}
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

function LikedHero({ tracks, onOpen, onPlayAll }: { tracks: Track[]; onOpen: () => void; onPlayAll: () => void }) {
  const first = tracks[0];
  return (
    <div className="relative mt-5 overflow-hidden rounded-[1.35rem] border border-white/15 bg-[linear-gradient(135deg,#1d1b24_0%,#352d3c_58%,#57303e_100%)] p-4 text-white shadow-[0_18px_50px_rgba(40,35,55,0.28)]">
      <div className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-rose-400/20 blur-2xl" aria-hidden />
      <div className="relative flex items-center gap-3.5">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
          <span className="flex size-18 shrink-0 items-center justify-center overflow-hidden rounded-[1rem] bg-white/10 shadow-lg ring-1 ring-white/15">
            {first ? <TrackCover track={first} priority className="size-full" /> : <Heart className="size-7 text-white/55" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">Your favorites</span>
            <span className="mt-1 block truncate text-lg font-semibold">我喜欢的音乐</span>
            <span className="mt-0.5 block truncate text-xs text-white/55">
              {tracks.length ? `${tracks.length} 首 · 按收藏时间排序` : "播放时点 ♡ 收藏喜欢的歌"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onPlayAll}
          disabled={!tracks.length}
          className="tap-scale flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-neutral-950 shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition active:scale-95 disabled:opacity-40"
          aria-label="播放我喜欢的音乐"
        >
          <Play className="size-5 translate-x-[1px] fill-current" />
        </button>
      </div>
    </div>
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
  return (
    <div className="pb-4">
      <PageHeader
        eyebrow="Aria Music"
        title={neteaseAccount?.connected ? `你好，${neteaseAccount.nickname ?? "听众"}` : "音乐从这里开始"}
        description={neteaseAccount?.connected ? "继续听你喜欢的音乐吧。" : "连接桌面端或登录网易云，开始你的音乐空间。"}
        action={neteaseAccount?.avatarUrl
          ? <img src={neteaseAccount.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover shadow-sm" />
          : <span className="flex size-10 items-center justify-center rounded-full bg-white/70 text-neutral-400 shadow-sm"><UserRound className="size-5" /></span>}
      />

      <LikedHero
        tracks={likedTracks}
        onOpen={() => openCollection("liked")}
        onPlayAll={() => likedTracks[0] && chooseTrack(likedTracks[0].id, likedTracks)}
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => openCollection("history")}
          className="tap-scale flex min-w-0 flex-col rounded-[1rem] border border-white/75 bg-white/70 p-3 text-left shadow-sm backdrop-blur"
        >
          <span className="flex size-8 items-center justify-center rounded-[0.7rem] bg-emerald-50 text-emerald-600">
            <History className="size-4" />
          </span>
          <span className="mt-2 block text-sm font-semibold">最近播放</span>
          <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
            {recentTracks.length ? `${recentTracks.length} 首 · ${recentTracks[0]?.title ?? ""}` : "还没有播放记录"}
          </span>
        </button>
        <div className="flex min-w-0 flex-col rounded-[1rem] border border-white/75 bg-white/70 p-3 shadow-sm backdrop-blur">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400">今日聆听</span>
          <span className="mt-1 text-lg font-semibold tabular-nums tracking-tight">{weekCount} 首</span>
          <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
            本周 · 今日 {todayListening.count} 首
          </span>
        </div>
      </div>

      {([
        { id: "daily" as const, title: "每日推荐", tracks: dailyTracks, Icon: Compass },
        { id: "roam" as const, title: "私人漫游", tracks: roamTracks, Icon: Radar },
      ]).map(({ id, title, tracks, Icon }) => (
        <section key={id}>
          <SectionHeader title={title} Icon={Icon} action={
            <button onClick={() => openCollection(id)} aria-label={`查看全部${title}`} title={`查看全部${title}`} className="flex size-9 items-center justify-center"><ChevronRight className="size-5" /></button>
          } />
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {tracks.slice(0, 5).map((track) => <HorizontalTrackCard key={track.id} track={track} active={controls.activeTrackId === track.id} onPlay={() => chooseTrack(track.id, tracks)} />)}
            <button onClick={() => openCollection(id)} className="flex w-28 shrink-0 flex-col items-center justify-center gap-2 rounded-lg bg-white/50 text-xs text-neutral-500">
              <ChevronRight className="size-6" />{tracks.length ? "查看全部" : "加载音乐"}
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}

type LibrarySection = "albums" | "artists" | "device" | "local" | "offline" | "liked" | "playlists" | "history";

export function LibraryScreen({ initialSection = "liked", ...controls }: MobileControls & { initialSection?: LibrarySection }) {
  const [section, setSection] = useState<LibrarySection>(initialSection);
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
  const sections: Array<{ id: LibrarySection; label: string }> = [
    { id: "liked", label: "我喜欢" },
    { id: "albums", label: "专辑" },
    { id: "artists", label: "歌手" },
    { id: "offline", label: "离线音乐" },
    { id: "device", label: "手机音乐" },
    { id: "local", label: "桌面曲库" },
    { id: "playlists", label: "歌单" },
    { id: "history", label: "最近播放" },
  ];

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
        eyebrow="Your library"
        title="音乐库"
        description="喜欢的歌、专辑、手机音乐和桌面曲库都在这里。"
      />

      <Surface className="mt-3 p-2">
        <div className="grid grid-cols-4 divide-x divide-neutral-950/[0.06]">
          {[
            { id: "liked" as const, label: "喜欢", value: likedTracks.length, accent: "text-rose-500" },
            { id: "albums" as const, label: "专辑", value: albums.length, accent: "text-neutral-950" },
            { id: "artists" as const, label: "歌手", value: artists.length, accent: "text-neutral-950" },
            { id: "playlists" as const, label: "歌单", value: controls.providerPlaylists.length, accent: "text-neutral-950" },
          ].map((stat) => (
            <button
              key={stat.id}
              type="button"
              onClick={() => {
                setSection(stat.id);
                setSelectedAlbumKey(null);
                setSelectedArtistName(null);
              }}
              className="tap-scale min-w-0 py-2 text-center"
            >
              <p className={`text-lg font-semibold tabular-nums tracking-tight ${stat.accent}`}>{stat.value}</p>
              <p className="mt-0.5 text-[10px] text-neutral-400">{stat.label}</p>
            </button>
          ))}
        </div>
      </Surface>

      <div className="no-scrollbar sticky top-0 z-20 -mx-4 mt-4 flex gap-2 overflow-x-auto border-b border-white/40 bg-[#f4f2f8]/92 px-4 py-2 backdrop-blur-xl">
        {sections.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setSection(id);
              setSelectedAlbumKey(null);
              setSelectedArtistName(null);
            }}
            className={`tap-scale shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              section === id ? "bg-neutral-950 text-white shadow-sm" : "bg-white/75 text-neutral-600 shadow-sm"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {section === "albums" && (
          <AlbumSection albums={albums} onOpen={setSelectedAlbumKey} />
        )}
        {section === "artists" && (
          <ArtistSection artists={artists} onOpen={setSelectedArtistName} />
        )}
        {section === "offline" && <OfflineSection {...controls} />}
        {section === "device" && <DeviceSection {...controls} />}
        {section === "local" && <LocalSection {...controls} />}
        {section === "liked" && <LikedSection {...controls} />}
        {section === "playlists" && <PlaylistsSection {...controls} />}
        {section === "history" && <HistorySection {...controls} />}
      </div>
    </div>
  );
}

function AlbumCard({ album, onOpen }: { album: AlbumGroup; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="tap-scale min-w-0 text-left">
      <div className="overflow-hidden rounded-[0.95rem] bg-white/70 shadow-sm">
        <TrackCover track={album.coverTrack} className="aspect-square w-full" />
      </div>
      <p className="mt-1.5 truncate text-xs font-semibold">{album.title}</p>
      <p className="mt-0.5 truncate text-[11px] text-neutral-500">{album.artist} · {album.tracks.length} 首</p>
    </button>
  );
}

function AlbumSection({ albums, onOpen }: { albums: AlbumGroup[]; onOpen: (key: string) => void }) {
  const [query, setQuery] = useState("");
  if (!albums.length) {
    return (
      <EmptyState
        icon={<Disc3 className="size-5" />}
        title="还没有专辑"
        description="扫描桌面曲库或手机音乐后，会在这里按专辑自动归类。"
      />
    );
  }
  const filtered = albums.filter((album) =>
    `${album.title} ${album.artist}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <label className="mb-3 flex items-center gap-2 rounded-[0.9rem] border border-white/70 bg-white/65 px-3 py-2 text-xs text-neutral-500 shadow-sm">
        <Search className="size-4 shrink-0" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索专辑或歌手"
          aria-label="搜索专辑或歌手"
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
        />
      </label>
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

export function AlbumDetail({ album, controls, onBack }: { album: AlbumGroup; controls: MobileControls; onBack: () => void }) {
  const cover = album.coverTrack;
  return (
    <div className="pb-4">
      <button type="button" onClick={onBack} className="tap-scale mb-3 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
        <ChevronRight className="size-4 rotate-180" />
        返回专辑
      </button>
      <div className="flex items-center gap-4 rounded-[1.35rem] border border-white/75 bg-white/62 p-4 shadow-sm">
        <div className="size-32 shrink-0 overflow-hidden rounded-[1.1rem] shadow-sm">
          <TrackCover track={cover} className="size-full" priority />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Album</p>
          <h1 className="mt-1 line-clamp-2 text-lg font-semibold leading-snug">{album.title}</h1>
          <p className="mt-1 truncate text-xs text-neutral-500">
            {album.artist} · {album.tracks.length} 首 · {formatTotalDuration(album.tracks)}
          </p>
          <div className="mt-3 flex items-center gap-2">
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

function OfflineSection(controls: MobileControls) {
  const { offlineTracks, downloadingTrackIds, deleteOfflineTrack, chooseTrack } = controls;
  if (!offlineTracks.length && !downloadingTrackIds.length) {
    return (
      <EmptyState
        icon={<Download className="size-5" />}
        title="还没有离线音乐"
        description="在播放页点下载按钮，歌曲会保存到手机，断网也能播放。"
      />
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-neutral-500">
          已下载 · {offlineTracks.length} 首
          {downloadingTrackIds.length > 0 && ` · 正在下载 ${downloadingTrackIds.length} 首`}
        </p>
        {downloadingTrackIds.length > 0 && <Loader2 className="size-3.5 animate-spin text-neutral-400" />}
      </div>
      <div className="mt-2 space-y-0.5">
        {offlineTracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            active={controls.activeTrackId === track.id}
            onPlay={() => chooseTrack(track.id, offlineTracks)}
            onRemove={() => void deleteOfflineTrack(track.id)}
          />
        ))}
      </div>
    </>
  );
}

function LocalSection(controls: MobileControls) {
  const { localTracks, chooseTrack, toggleLikeTrack, likedTrackIds } = controls;
  if (!localTracks.length) {
    return (
      <EmptyState
        icon={<ListMusic className="size-5" />}
        title="桌面曲库还是空的"
        description="在 Aria 桌面端扫描音乐文件夹后，手机会自动同步曲库。"
      />
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-neutral-500">桌面曲库 · {localTracks.length} 首</p>
        <PlayAllButton onPlay={() => localTracks[0] && chooseTrack(localTracks[0].id, localTracks)} count={localTracks.length} />
      </div>
      <div className="mt-2 space-y-0.5">
        {localTracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            active={controls.activeTrackId === track.id}
            liked={Boolean(likedTrackIds[track.id])}
            onPlay={() => chooseTrack(track.id, localTracks)}
            onLike={() => toggleLikeTrack(track.id)}
          />
        ))}
      </div>
    </>
  );
}

function LikedSection(controls: MobileControls) {
  const { likedNeteaseTracks, likedLocalTracks, chooseTrack, toggleLikeTrack, neteaseAccount } = controls;
  const all = newestLiked([...likedNeteaseTracks, ...likedLocalTracks]);
  if (!all.length) {
    return (
      <EmptyState
        icon={<Heart className="size-5" />}
        title={neteaseAccount?.connected ? "还没有喜欢的音乐" : "先登录网易云"}
        description={neteaseAccount?.connected
          ? "播放歌曲时点一下 ♡，它就会出现在这里。"
          : "在设置里登录网易云后，会自动同步「我喜欢的音乐」。"}
      />
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-neutral-500">全部喜欢 · {all.length} 首</p>
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
  const albums = useMemo(() => groupTracksByAlbum(tracks), [tracks]);
  const visibleTracks = showAllSongs ? tracks : tracks.slice(0, 5);
  return (
    <div className="pb-4">
      <button type="button" onClick={onBack} className="tap-scale mb-3 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
        <ChevronRight className="size-4 rotate-180" />
        返回歌手
      </button>
      <div className="flex items-center gap-4 rounded-[1.35rem] border border-white/75 bg-white/62 p-4 shadow-sm">
        <ArtistAvatar name={artist.name} avatarUrl={artist.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Artist</p>
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
          <h2 className="mb-2 text-sm font-semibold">专辑</h2>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {albums.map((album) => (
              <div key={album.key} className="w-36 shrink-0">
                <AlbumCard
                  album={album}
                  onOpen={() => album.tracks[0] && controls.chooseTrack(album.tracks[0].id, album.tracks)}
                />
              </div>
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
    <div className="space-y-5">
      {error && <InlineError message={error} />}
      {owned.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold text-neutral-600">我创建的歌单</h2>
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
            <h2 className="text-xs font-semibold text-neutral-600">我收藏的歌单</h2>
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
      <div className="relative overflow-hidden rounded-[0.9rem]">
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
    chooseTrack,
    toggleLikeTrack,
    likedTrackIds,
    neteaseLikedIds,
    playShuffledTracks,
  } = controls;
  return (
    <div>
      <DetailHeader
        backLabel={backLabel}
        onBack={onBack}
        label={playlist.subscribed ? "Collected" : "Playlist"}
        title={playlist.name}
        meta={
          <>
            {playlistTracks.length} 首
            {playlistTracks.length ? ` · ${formatTotalDuration(playlistTracks)}` : ""}
            {playlist.creatorName && !playlist.owned
              ? ` · ${playlist.subscribed ? "收藏自 " : ""}${playlist.creatorName}`
              : ""}
          </>
        }
        visual={<PlaylistCover playlist={playlist} tracks={playlistTracks} className="size-28 rounded-[1.1rem]" />}
        actions={
          <>
            <PlayAllButton onPlay={() => playlistTracks[0] && chooseTrack(playlistTracks[0].id, playlistTracks)} count={playlistTracks.length} />
            <RandomPlayButton onPlay={() => playShuffledTracks(playlistTracks)} count={playlistTracks.length} />
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
              onPlay={() => chooseTrack(track.id, playlistTracks)}
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

function HistorySection(controls: MobileControls) {
  const { historyTracks, chooseTrack, playCounts } = controls;
  if (!historyTracks.length) {
    return <EmptyState icon={<History className="size-5" />} title="还没有播放记录" description="播放过的歌曲会按时间倒序出现在这里。" />;
  }
  return (
    <div className="space-y-0.5">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs text-neutral-500">最近 {historyTracks.length} 首</p>
        <button
          type="button"
          onClick={() => controls.openCollection("history")}
          className="text-xs text-neutral-500 transition active:text-neutral-900"
        >
          查看全部
        </button>
      </div>
      {historyTracks.slice(0, 20).map((track) => (
        <TrackRow
          key={track.id}
          track={track}
          active={controls.activeTrackId === track.id}
          onPlay={() => chooseTrack(track.id, historyTracks)}
        />
      ))}
      <p className="pt-2 text-center text-[11px] text-neutral-400">
        共 {Object.keys(playCounts).length} 首听过
      </p>
    </div>
  );
}

function DeviceSection(controls: MobileControls) {
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(controls.deviceTracks.length > 0);
  const [hint, setHint] = useState("");

  async function scan() {
    setScanning(true);
    setHint("");
    try {
    const granted = await requestAudioPermission();
    if (!granted) {
      setScanning(false);
      setHint("需要授权访问手机音频,请在系统弹窗中允许。");
      return;
    }
    const raw = await scanDeviceAudio();
    if (!raw.length) {
      controls.addDeviceTracks([]);
      setScanned(true);
      setScanning(false);
      setHint("没有在手机里找到音频文件。");
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
    setScanned(true);
    } catch {
      setHint("扫描失败，已保留上次的曲库，请重试。");
    } finally { setScanning(false); }
  }

  const deviceTracks = controls.deviceTracks;
  return (
    <>
      {scanned && hint && <p role="status" className="my-2 text-xs text-amber-700">{hint}</p>}
      {!scanned || deviceTracks.length === 0 ? (
        <div className="rounded-[1rem] bg-white/60 p-4">
          <p className="text-xs leading-5 text-neutral-500">
            扫描手机里的音频文件,离线也能听。文件只在手机上播放,不会上传。
          </p>
          {hint && <p className="mt-2 text-xs text-amber-600">{hint}</p>}
          <button
            type="button"
            onClick={scan}
            disabled={scanning}
            className="tap-scale mt-3 flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {scanning ? <Loader2 className="size-3.5 animate-spin" /> : <ListMusic className="size-3.5" />}
            {scanning ? "扫描中…" : deviceTracks.length ? "重新扫描" : "扫描手机音乐"}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-neutral-500">手机音乐 · {deviceTracks.length} 首</p>
            <div className="flex items-center gap-2">
              <PlayAllButton onPlay={() => deviceTracks[0] && controls.chooseTrack(deviceTracks[0].id, deviceTracks)} count={deviceTracks.length} />
              <button
                type="button"
                onClick={scan}
                disabled={scanning}
                className="tap-scale flex size-8 items-center justify-center rounded-full bg-white shadow-sm disabled:opacity-50"
                aria-label="重新扫描"
              >
                <RefreshCw className={`size-3.5 text-neutral-500 ${scanning ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          <div className="mt-2 space-y-0.5">
            {deviceTracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                active={controls.activeTrackId === track.id}
                onPlay={() => controls.chooseTrack(track.id, deviceTracks)}
              />
            ))}
          </div>
        </>
      )}
    </>
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
  useEffect(() => { localStorage.setItem("aria-search-history", JSON.stringify(history)); }, [history]);
  const remember = () => setHistory((current) => rememberSearch(current, controls.searchQuery));
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
      <PageHeader eyebrow="Discover" title="搜索" description="搜索歌曲、歌手、歌单、专辑，或从历史记录继续。" />
      <input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { remember(); event.currentTarget.blur(); } }}
        onBlur={remember}
        enterKeyHint="search"
        aria-label="搜索音乐"
        placeholder="搜索歌曲、歌手、歌单、专辑…"
        className="mt-3 w-full rounded-[1rem] border border-neutral-950/10 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-neutral-950/40"
      />

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
                  onClick={() => { setSearchQuery(query); setHistory((current) => rememberSearch(current, query)); }}
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
                <span className="text-[10px] text-neutral-400">从今天开始听</span>
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
                  <AlbumCard
                    key={album.key}
                    album={album}
                    onOpen={() => album.tracks[0] && chooseTrack(album.tracks[0].id, album.tracks)}
                  />
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
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
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
      <PageHeader eyebrow="Settings" title="设置" description="账号、播放、后台运行与连接。" />

      {controls.directMode ? (
        <DirectNeteaseCard controls={controls} />
      ) : (
      <section className="rounded-[1.2rem] border border-white/75 bg-white/62 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Account</p>
            <h3 className="mt-1 text-base font-semibold">网易云账号</h3>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="tap-scale flex size-9 items-center justify-center rounded-full bg-white shadow-sm disabled:opacity-50"
            aria-label="刷新数据"
          >
            <RefreshCw className={`size-4 text-neutral-600 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-[1rem] bg-neutral-950/[0.03] p-3">
          {neteaseAccount?.avatarUrl ? (
            <img src={neteaseAccount.avatarUrl} alt="" className="size-11 rounded-full object-cover" />
          ) : (
            <div className="flex size-11 items-center justify-center rounded-full bg-white shadow-sm">
              <UserRound className="size-5 text-neutral-400" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {neteaseAccount?.connected ? neteaseAccount.nickname ?? "网易云账号" : "未登录"}
            </p>
            <p className="mt-0.5 truncate text-xs text-neutral-500">
              {neteaseAccount?.connected ? "扫码登录在桌面端完成,数据自动同步" : "请在桌面端设置里扫码登录"}
            </p>
          </div>
        </div>
      </section>
      )}

      {isNativeApp() && <LockScreenSettings />}
      {isNativeApp() && <BackgroundPlaybackSettings />}

      {isNativeApp() && (
        <section className="rounded-[1.2rem] border border-white/75 bg-white/62 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Usb className="mt-0.5 size-4 text-neutral-500" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Output</p>
              <h3 className="mt-1 text-base font-semibold">USB 音频焦点（实验）</h3>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                {controls.usbExclusive.connected ? "已检测到 USB 音频设备，播放时优先占用音频焦点。" : "连接 USB 音频设备后可启用，减少其他应用抢占。"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={controls.usbExclusive.enabled}
              disabled={!controls.usbExclusive.supported || !controls.usbExclusive.connected}
              onClick={() => void controls.setUsbExclusiveEnabled(!controls.usbExclusive.enabled)}
              className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition disabled:opacity-40 ${controls.usbExclusive.enabled ? "bg-neutral-950" : "bg-neutral-200"}`}
              aria-label="USB 独占"
            >
              <span className={`size-5 rounded-full bg-white shadow-sm transition ${controls.usbExclusive.enabled ? "translate-x-5" : ""}`} />
            </button>
          </div>
        </section>
      )}

      {!controls.directMode && (
      <section className="rounded-[1.2rem] border border-white/75 bg-white/62 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Connection</p>
        <h3 className="mt-1 text-base font-semibold">桌面端连接</h3>
        <div className="mt-3 space-y-2 text-xs text-neutral-600">
          <p className="flex items-center gap-2 break-all font-mono">
            <Server className="size-3.5 shrink-0 text-neutral-400" />
            {connection.serverUrl || "未连接"}
          </p>
          <p className="flex items-center gap-2">
            <Wifi className="size-3.5 shrink-0 text-neutral-400" />
            本地曲库 {localTracks.length} 首 · {libraryMeta.roots} 个目录
          </p>
        </div>
        <button
          type="button"
          onClick={disconnect}
          className="tap-scale mt-3 flex w-full items-center justify-center gap-2 rounded-[1rem] bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600"
        >
          <LogOut className="size-4" />
          断开连接
        </button>
      </section>
      )}

      <Surface className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">About</p>
        <p className="mt-1 text-sm font-semibold">Aria Mobile</p>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          v{APP_VERSION} · {controls.directMode ? "手机直连网易云" : "桌面伴侣模式"}
        </p>
        <p className="mt-2 text-[10px] leading-4 text-neutral-400">
          播放凭据只保存在本机，不上传服务器。
        </p>
        <a
          href="https://github.com/YRRLYB/Aria-Mobile"
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            event.preventDefault();
            void openExternal("https://github.com/YRRLYB/Aria-Mobile");
          }}
          className="tap-scale mt-3 inline-flex items-center gap-1.5 rounded-full bg-neutral-950/[0.05] px-3 py-1.5 text-[11px] font-medium text-neutral-600"
        >
          <ExternalLink className="size-3.5" />
          GitHub 仓库
        </a>
      </Surface>
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
    <section className="rounded-[1.2rem] border border-white/75 bg-white/62 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Background</p>
      <h3 className="mt-1 text-base font-semibold">后台播放保护</h3>
      <p className="mt-1 text-xs leading-5 text-neutral-500">
        允许 Aria 忽略电池优化，并给它「不限制」后台运行权限，可减少锁屏后系统停止播放。
      </p>
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
    </section>
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
  return <section className="rounded-[1.2rem] border border-white/75 bg-white/62 p-4 shadow-sm">
    <button role="switch" aria-checked={settings.enabled} onClick={() => void toggle()} className="flex w-full items-center justify-between gap-4 text-left">
      <span><span className="block text-base font-semibold">音乐锁屏</span><span className="mt-1 block text-xs text-neutral-500">播放时亮屏，直接显示封面、歌词和控制</span></span>
      <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${settings.enabled ? "bg-neutral-950" : "bg-neutral-200"}`}><span className={`size-5 rounded-full bg-white transition ${settings.enabled ? "translate-x-5" : ""}`} /></span>
    </button>
    {settings.enabled && !settings.permission && <button onClick={() => void AriaAudio.openLockScreenPermission().catch(() => setError("无法打开系统设置"))} className="mt-4 w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm text-white">允许锁屏显示</button>}
    {settings.enabled && <button onClick={() => void AriaAudio.openLockScreenAppSettings().catch(() => setError("无法打开应用权限设置"))} className="mt-3 w-full rounded-xl bg-neutral-950/5 px-4 py-3 text-sm">设置锁屏与后台权限</button>}
    {settings.enabled && <p className="mt-3 text-xs leading-relaxed text-neutral-500">{settings.permission ? "已允许显示。播放歌曲后锁屏，再亮屏即可查看。" : "请在系统页面允许 Aria 显示在其他应用上层。"} 部分手机还需在应用权限中允许「锁屏显示」和「后台弹出界面」。上滑仍使用手机原有解锁方式。</p>}
    {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
  </section>;
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
    <section className="rounded-[1.2rem] border border-white/75 bg-white/62 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Account</p>
          <h3 className="mt-1 text-base font-semibold">网易云直连</h3>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="tap-scale flex size-9 items-center justify-center rounded-full bg-white shadow-sm"
          aria-label="刷新登录状态"
        >
          <RefreshCw className="size-4 text-neutral-600" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-[1rem] bg-neutral-950/[0.03] p-3">
        {connected && account?.avatarUrl ? (
          <img src={account.avatarUrl} alt="" className="size-11 rounded-full object-cover" />
        ) : (
          <div className="flex size-11 items-center justify-center rounded-full bg-white shadow-sm">
            <UserRound className="size-5 text-neutral-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {connected ? account?.nickname ?? "网易云账号" : "未登录"}
          </p>
          <p className="mt-0.5 truncate text-xs text-neutral-500">
            {connected ? "手机直连网易云,不依赖电脑" : qr ? "扫码后在手机上确认" : "登录后无需电脑即可听网易云"}
          </p>
        </div>
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

      <div className="mt-3 flex items-center justify-between gap-3 rounded-[1rem] bg-neutral-950/[0.03] p-3">
        <p className="text-xs leading-5 text-neutral-500">当前为直连模式(不依赖电脑)。桌面模式可串流电脑曲库。</p>
        <button
          type="button"
          onClick={controls.switchToDesktopMode}
          className="tap-scale shrink-0 rounded-full bg-white px-3 py-1.5 text-xs text-neutral-600 shadow-sm"
        >
          切换桌面模式
        </button>
      </div>
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
