import { useState, type ReactNode } from "react";
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
      className={`tap-scale flex items-center gap-3 rounded-[0.9rem] px-2 py-2 transition ${active ? "bg-neutral-950/[0.06]" : "active:bg-neutral-950/[0.04]"}`}
    >
      <button type="button" onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {typeof index === "number" ? (
          <span className="w-6 shrink-0 text-center text-xs text-neutral-400">{index + 1}</span>
        ) : null}
        <TrackCover track={track} className="size-10 shrink-0 rounded-[0.6rem]" />
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
    <div className="mb-2 mt-5 flex items-center justify-between first:mt-0">
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
      className="tap-scale w-28 shrink-0 text-left"
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
          {[...likedNeteaseTracks, ...likedLocalTracks].slice(0, 10).map((track) => (
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
            {topHistory.map((track) => (
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

type LibrarySection = "local" | "liked" | "playlists" | "history";

export function LibraryScreen(controls: MobileControls) {
  const [section, setSection] = useState<LibrarySection>("local");
  const sections: Array<{ id: LibrarySection; label: string }> = [
    { id: "local", label: "本地曲库" },
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
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
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

      <p className="pb-2 text-center text-[11px] text-neutral-400">
        Aria Mobile · 与桌面端共用曲库与账号 · 仅限局域网使用
      </p>
    </div>
  );
}
