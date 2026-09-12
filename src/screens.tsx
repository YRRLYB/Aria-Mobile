import { useEffect, useState, type ReactNode } from "react";
import {
  Compass,
  Heart,
  History,
  ListMusic,
  Loader2,
  LogOut,
  Play,
  Radar,
  RefreshCw,
  Server,
  UserRound,
  Wifi,
} from "lucide-react";
import { TrackCover } from "./Chrome";
import { qualityOptions, type QualityLevel } from "@/lib/playerPresentation";
import type { NeteaseAccountSummary } from "@/lib/api";
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
  requestAudioPermission,
  scanDeviceAudio,
} from "./native/ariaShell";
import { formatDuration } from "@/lib/playerPresentation";
import { APP_VERSION } from "./version";
import type { MobileControls } from "./MobileApp";

export function TrackRow({
  track,
  index,
  active,
  liked,
  onPlay,
  onLike,
}: {
  track: { id: string; title: string; artist: string; album: string; duration: string; cover: string };
  index?: number;
  active?: boolean;
  liked?: boolean;
  onPlay: () => void;
  onLike?: () => void;
}) {
  return (
    <div
      className={`tap-scale flex items-center gap-3 rounded-[0.9rem] px-2 py-1.5 transition ${active ? "bg-neutral-950/[0.06]" : "active:bg-neutral-950/[0.04]"}`}
    >
      <button type="button" onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {typeof index === "number" ? (
          <span className="w-6 shrink-0 text-center text-xs text-neutral-400">{index + 1}</span>
        ) : null}
        <TrackCover track={track} className="size-9 shrink-0 rounded-[0.55rem]" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${active ? "font-semibold text-neutral-950" : "font-medium"}`}>
            {track.title}
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
          <Heart className={`size-4 ${liked ? "fill-rose-500 text-rose-500" : "text-neutral-400"}`} />
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

function PlayAllButton({ onPlay, count }: { onPlay: () => void; count: number }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onPlay}
      className="tap-scale flex items-center gap-1.5 rounded-full bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white"
    >
      <Play className="size-3" />
      播放全部 {count}
    </button>
  );
}

export function HomeScreen(controls: MobileControls) {
  const {
    dailyTracks,
    roamTracks,
    likedNeteaseTracks,
    likedLocalTracks,
    localTracks,
    historyTracks,
    neteaseAccount,
    chooseTrack,
    toggleLikeTrack,
    likedTrackIds,
    playCounts,
  } = controls;
  const likedCount = likedNeteaseTracks.length + likedLocalTracks.length;
  const topHistory = historyTracks.slice(0, 12);

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">Aria</p>
          <h1 className="mt-0.5 text-xl font-semibold">
            {neteaseAccount?.connected ? `你好,${neteaseAccount.nickname ?? "听众"}` : "晚上好"}
          </h1>
        </div>
        {neteaseAccount?.avatarUrl ? (
          <img
            src={neteaseAccount.avatarUrl}
            alt=""
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            className="size-10 rounded-full bg-white object-cover shadow-sm"
          />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-full bg-white shadow-sm">
            <UserRound className="size-4 text-neutral-400" />
          </div>
        )}
      </div>

      {controls.directMode && !neteaseAccount?.connected && (
        <p className="mt-4 rounded-[1rem] border border-amber-200/70 bg-amber-50/80 p-3 text-xs leading-5 text-amber-700">
          直连模式:到「设置 → 网易云直连」扫码登录后,即可听每日推荐、私人漫游和你的歌单。
        </p>
      )}

      {dailyTracks.length > 0 && (
        <>
          <SectionHeader title="每日推荐" Icon={Compass} />
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {dailyTracks.slice(0, 20).map((track) => (
              <HorizontalTrackCard
                key={track.id}
                track={track}
                active={controls.activeTrackId === track.id}
                onPlay={() => chooseTrack(track.id, dailyTracks)}
              />
            ))}
          </div>
        </>
      )}

      {roamTracks.length > 0 && (
        <>
          <SectionHeader
            title="私人漫游"
            Icon={Radar}
            action={
              <button
                type="button"
                onClick={controls.refreshRoamData}
                className="tap-scale flex size-7 items-center justify-center rounded-full bg-white shadow-sm"
                aria-label="换一批"
              >
                <RefreshCw className="size-3.5 text-neutral-500" />
              </button>
            }
          />
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {roamTracks.slice(0, 20).map((track) => (
              <HorizontalTrackCard
                key={track.id}
                track={track}
                active={controls.activeTrackId === track.id}
                onPlay={() => chooseTrack(track.id, roamTracks)}
              />
            ))}
          </div>
        </>
      )}

      <SectionHeader
        title="我喜欢的音乐"
        Icon={Heart}
        action={<PlayAllButton onPlay={() => likedNeteaseTracks[0] && chooseTrack(likedNeteaseTracks[0].id, likedNeteaseTracks)} count={likedCount} />}
      />
      {likedCount === 0 ? (
        <p className="rounded-[1rem] bg-white/60 p-4 text-xs text-neutral-500">登录网易云或标记本地喜欢后,这里会出现你的音乐。</p>
      ) : (
        <div className="space-y-0.5">
          {[...likedNeteaseTracks, ...likedLocalTracks].slice(0, 6).map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              active={controls.activeTrackId === track.id}
              liked={track.source === "netease" || Boolean(likedTrackIds[track.id])}
              onPlay={() =>
                track.source === "netease"
                  ? chooseTrack(track.id, likedNeteaseTracks)
                  : chooseTrack(track.id, likedLocalTracks)
              }
              onLike={() => toggleLikeTrack(track.id)}
            />
          ))}
        </div>
      )}

      {localTracks.length > 0 && (
        <>
          <SectionHeader
            title="本地曲库(电脑串流)"
            Icon={ListMusic}
            action={<PlayAllButton onPlay={() => localTracks[0] && chooseTrack(localTracks[0].id, localTracks)} count={localTracks.length} />}
          />
          <div className="space-y-0.5">
            {localTracks.slice(0, 8).map((track) => (
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
      )}

      {topHistory.length > 0 && (
        <>
          <SectionHeader title="最近播放" Icon={History} />
          <div className="space-y-0.5">
            {topHistory.slice(0, 6).map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                active={controls.activeTrackId === track.id}
                onPlay={() => chooseTrack(track.id, historyTracks)}
              />
            ))}
          </div>
        </>
      )}
      {Object.keys(playCounts).length === 0 && historyTracks.length === 0 && (
        <p className="mt-4 rounded-[1rem] bg-white/60 p-4 text-xs text-neutral-500">
          还没有播放记录。挑一首歌开始听吧。
        </p>
      )}
    </div>
  );
}

type LibrarySection = "device" | "local" | "liked" | "playlists" | "history";

export function LibraryScreen(controls: MobileControls) {
  const [section, setSection] = useState<LibrarySection>("device");
  const sections: Array<{ id: LibrarySection; label: string }> = [
    { id: "device", label: "手机音乐" },
    { id: "local", label: "桌面曲库" },
    { id: "liked", label: "我喜欢" },
    { id: "playlists", label: "歌单" },
    { id: "history", label: "最近播放" },
  ];
  return (
    <div className="pb-4">
      <h1 className="text-xl font-semibold">音乐库</h1>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {sections.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`tap-scale shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              section === id ? "bg-neutral-950 text-white" : "bg-white/75 text-neutral-600 shadow-sm"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {section === "device" && <DeviceSection {...controls} />}
        {section === "local" && <LocalSection {...controls} />}
        {section === "liked" && <LikedSection {...controls} />}
        {section === "playlists" && <PlaylistsSection {...controls} />}
        {section === "history" && <HistorySection {...controls} />}
      </div>
    </div>
  );
}

function LocalSection(controls: MobileControls) {
  const { localTracks, chooseTrack, toggleLikeTrack, likedTrackIds, libraryMeta } = controls;
  if (!localTracks.length) {
    return (
      <p className="rounded-[1rem] bg-white/60 p-4 text-xs leading-5 text-neutral-500">
        电脑上还没有本地曲库。在 Aria 桌面端扫描音乐文件夹后,手机可以直接串流播放。
        {libraryMeta.roots > 0 ? "" : ""}
      </p>
    );
  }
  return (
    <>
      <PlayAllButton onPlay={() => localTracks[0] && chooseTrack(localTracks[0].id, localTracks)} count={localTracks.length} />
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
  const { likedNeteaseTracks, likedLocalTracks, chooseTrack, toggleLikeTrack, likedTrackIds, neteaseAccount } = controls;
  const all = [...likedNeteaseTracks, ...likedLocalTracks];
  if (!all.length) {
    return (
      <p className="rounded-[1rem] bg-white/60 p-4 text-xs leading-5 text-neutral-500">
        {neteaseAccount?.connected
          ? "还没有喜欢的音乐。播放时点♡即可收藏。"
          : "先在设置里登录网易云账号,同步「我喜欢的音乐」。"}
      </p>
    );
  }
  return (
    <>
      <PlayAllButton onPlay={() => all[0] && chooseTrack(all[0].id, all)} count={all.length} />
      <div className="mt-2 space-y-0.5">
        {all.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            active={controls.activeTrackId === track.id}
            liked={track.source === "netease" || Boolean(likedTrackIds[track.id])}
            onPlay={() => chooseTrack(track.id, all)}
            onLike={() => toggleLikeTrack(track.id)}
          />
        ))}
      </div>
    </>
  );
}

function PlaylistsSection(controls: MobileControls) {
  const {
    providerPlaylists,
    selectedPlaylist,
    playlistTracks,
    playlistLoading,
    openPlaylist,
    chooseTrack,
    toggleLikeTrack,
    likedTrackIds,
  } = controls;
  if (!providerPlaylists.length) {
    return (
      <p className="rounded-[1rem] bg-white/60 p-4 text-xs leading-5 text-neutral-500">
        登录网易云后,这里会显示你的歌单。
      </p>
    );
  }
  if (selectedPlaylist) {
    return (
      <>
        <button
          type="button"
          onClick={controls.closePlaylist}
          className="tap-scale mb-2 text-xs text-neutral-500"
        >
          ← {selectedPlaylist.name}({playlistTracks.length} 首)
        </button>
        {playlistLoading ? (
          <p className="flex items-center gap-2 text-xs text-neutral-400">
            <Loader2 className="size-3.5 animate-spin" /> 加载中…
          </p>
        ) : (
          <div className="space-y-0.5">
            {playlistTracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                active={controls.activeTrackId === track.id}
                liked={track.source === "netease" || Boolean(likedTrackIds[track.id])}
                onPlay={() => chooseTrack(track.id, playlistTracks)}
                onLike={() => toggleLikeTrack(track.id)}
              />
            ))}
          </div>
        )}
      </>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {providerPlaylists.map((playlist, index) => (
        <button
          key={playlist.id}
          type="button"
          onClick={() => openPlaylist(playlist)}
          className="tap-scale text-left"
        >
          <div className="overflow-hidden rounded-[0.9rem] bg-[linear-gradient(140deg,#c9d3f2,#e7d5ec)] shadow-sm">
            {playlist.coverUrl ? (
              <img
                src={playlist.coverUrl}
                alt=""
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="aspect-square w-full bg-[linear-gradient(140deg,#c9d3f2,#e7d5ec)]" />
            )}
          </div>
          <p className="mt-1.5 truncate text-xs font-medium">{playlist.name}</p>
          <p className="truncate text-[11px] text-neutral-500">{playlist.trackCount ?? index} 首</p>
        </button>
      ))}
    </div>
  );
}

function HistorySection(controls: MobileControls) {
  const { historyTracks, chooseTrack, playCounts } = controls;
  if (!historyTracks.length) {
    return <p className="rounded-[1rem] bg-white/60 p-4 text-xs text-neutral-500">还没有播放记录。</p>;
  }
  return (
    <div className="space-y-0.5">
      {historyTracks.map((track) => (
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
    const granted = await requestAudioPermission();
    if (!granted) {
      setScanning(false);
      setHint("需要授权访问手机音频,请在系统弹窗中允许。");
      return;
    }
    const raw = await scanDeviceAudio();
    if (!raw.length) {
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
    setScanning(false);
  }

  const deviceTracks = controls.deviceTracks;
  return (
    <>
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
          <div className="flex items-center justify-between">
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
  const { searchQuery, setSearchQuery, searchBundle, searchLoading, artistTracks, selectedArtist, setSelectedArtist, chooseTrack, toggleLikeTrack, likedTrackIds } = controls;
  const hasQuery = searchQuery.trim().length > 0;
  const list = selectedArtist ? artistTracks : hasQuery ? [...searchBundle.neteaseTracks, ...searchBundle.localTracks] : [];
  return (
    <div className="pb-4">
      <h1 className="text-xl font-semibold">搜索</h1>
      <input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="搜索歌曲、歌手、专辑…"
        className="mt-3 w-full rounded-[1rem] border border-neutral-950/10 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-neutral-950/40"
      />
      {selectedArtist && (
        <button type="button" onClick={() => setSelectedArtist(null)} className="tap-scale mt-3 text-xs text-neutral-500">
          ← {selectedArtist.name} 的热门歌曲
        </button>
      )}
      {!selectedArtist && searchBundle.artists.length > 0 && (
        <>
          <p className="mt-4 text-xs font-medium text-neutral-400">相关歌手</p>
          <div className="no-scrollbar -mx-4 mt-2 flex gap-3 overflow-x-auto px-4">
            {searchBundle.artists.slice(0, 12).map((artist) => (
              <button
                key={artist.id}
                type="button"
                onClick={() => controls.setSelectedArtist(artist)}
                className="tap-scale w-16 shrink-0 text-center"
              >
                {artist.avatarUrl ? (
                  <img
                    src={artist.avatarUrl}
                    alt=""
                    loading="lazy"
                    className="size-16 rounded-full object-cover shadow-sm"
                  />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-full bg-white shadow-sm">
                    <UserRound className="size-6 text-neutral-300" />
                  </div>
                )}
                <p className="mt-1 truncate text-[11px] text-neutral-600">{artist.name}</p>
              </button>
            ))}
          </div>
        </>
      )}
      {searchLoading && (
        <p className="mt-4 flex items-center gap-2 text-xs text-neutral-400">
          <Loader2 className="size-3.5 animate-spin" /> 搜索中…
        </p>
      )}
      {list.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {list.slice(0, 60).map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              active={controls.activeTrackId === track.id}
              liked={track.source === "netease" || Boolean(likedTrackIds[track.id])}
              onPlay={() => chooseTrack(track.id, selectedArtist ? artistTracks : list)}
              onLike={() => toggleLikeTrack(track.id)}
            />
          ))}
        </div>
      )}
      {!hasQuery && !selectedArtist && (
        <p className="mt-4 rounded-[1rem] bg-white/60 p-4 text-xs leading-5 text-neutral-500">
          同时搜索本地曲库和网易云音乐。点击歌手名可查看热门歌曲。
        </p>
      )}
    </div>
  );
}

export function SettingsScreen(controls: MobileControls) {
  const {
    neteaseAccount,
    connection,
    libraryMeta,
    localTracks,
    hifiEnabled,
    setHifiEnabled,
    qualityLevel,
    setQualityLevel,
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
      <h1 className="text-xl font-semibold">设置</h1>

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

      <section className="rounded-[1.2rem] border border-white/75 bg-white/62 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Audio</p>
        <h3 className="mt-1 text-base font-semibold">音质偏好</h3>
        <button
          type="button"
          onClick={() => setHifiEnabled(!hifiEnabled)}
          className="tap-scale mt-3 flex w-full items-center justify-between gap-3 rounded-[1rem] bg-neutral-950/[0.03] p-3"
        >
          <span className="text-left">
            <span className="block text-sm font-medium">HiFi 优先</span>
            <span className="mt-0.5 block text-xs text-neutral-500">自动请求当前歌曲可用的最高音质</span>
          </span>
          <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${hifiEnabled ? "bg-neutral-950" : "bg-neutral-200"}`}>
            <span className={`size-5 rounded-full bg-white shadow-sm transition ${hifiEnabled ? "translate-x-5" : ""}`} />
          </span>
        </button>
        <div className="mt-3 flex flex-wrap gap-2">
          {qualityOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setQualityLevel(option.value as QualityLevel)}
              className={`tap-scale shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                qualityLevel === option.value ? "bg-neutral-950 text-white" : "bg-white/80 text-neutral-600 shadow-sm"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

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

      <p className="pb-2 text-center text-[11px] text-neutral-400">
        Aria Mobile v{APP_VERSION} · {controls.directMode ? "直连模式 · 手机直连网易云音乐" : "伴侣模式 · 与桌面端共用曲库(仅限局域网)"}
      </p>
    </div>
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

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  async function sendCaptcha() {
    if (!phone.trim() || countdown > 0) return;
    const result = await directCaptchaSent(phone.trim(), countryCode.trim() || "86");
    if (result.ok) {
      setCountdown(60);
      setFormError("");
    } else {
      setFormError(result.message || `发送失败(${result.code})`);
    }
  }

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!phone.trim() || loggingIn) return;
    if (!captcha.trim()) return;
    setLoggingIn(true);
    setFormError("");
    const result = await directCellphoneLogin(
      phone.trim(),
      { captcha: captcha.trim() },
      countryCode.trim() || "86",
    );
    setLoggingIn(false);
    if (result.ok) {
      setCaptcha("");
      registerDirectProvider();
      setAccount(await directAccount());
      setMessage("登录成功");
      controls.refreshNeteaseData();
    } else {
      setFormError(result.message || `登录失败(${result.code})`);
    }
  }

  async function startQrLogin() {
    setBusy(true);
    setMessage("");
    try {
      const started = await directQrStart();
      setQr({ key: started.key, qrImage: started.qrImage });
      setMessage("网易云音乐 App → 扫一扫,对准此二维码");
    } catch {
      setMessage("获取二维码失败,请检查网络后重试");
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!qr) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      if (stopped) return;
      try {
        const result = await directQrCheck(qr.key);
        setMessage(result.message);
        if (result.status === "success") {
          window.clearInterval(timer);
          setQr(null);
          setMessage("");
          registerDirectProvider();
          setAccount(await directAccount());
          controls.refreshNeteaseData();
        }
        if (result.status === "expired") {
          window.clearInterval(timer);
          setQr(null);
          setMessage("二维码已过期,请重新获取");
        }
      } catch {
        // transient network error: keep polling
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
    setAccount(await directAccount());
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
              setAccount({ connected: false, nickname: null, userId: null, avatarUrl: null, cookiePreview: null });
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
              <button type="button" onClick={() => setQr(null)} className="text-xs text-neutral-400 underline">
                返回账号密码登录
              </button>
            </div>
          ) : (
            <form onSubmit={submitLogin} className="space-y-2.5">
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
                  disabled={!phone.trim() || countdown > 0}
                  className="shrink-0 rounded-[0.8rem] bg-neutral-950/[0.06] px-3 text-xs font-medium text-neutral-700 disabled:opacity-50"
                >
                  {countdown > 0 ? `${countdown}s` : "发送验证码"}
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
