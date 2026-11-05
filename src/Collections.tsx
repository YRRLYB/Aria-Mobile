import { useEffect, useMemo, useState } from "react";
import { Compass, History, Plus, Radar, RefreshCw, Search } from "./icons";
import type { CollectionId, MobileControls } from "./MobileApp";
import { PlayAllButton, RandomPlayButton, TrackRow } from "./screens";
import { CoverCollage, TrackCover } from "./Chrome";
import { newestLiked } from "./libraryStorage";
import { DetailHeader, EmptyState, InlineError, LoadingState } from "./ui";
import { formatTotalDuration } from "./libraryView";

const names = { liked: "我喜欢的音乐", history: "最近播放", daily: "每日推荐", roam: "私人漫游" };

export function CollectionScreen({ collection, controls, onBack }: { collection: CollectionId; controls: MobileControls; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(80);
  const tracks = collection === "liked" ? newestLiked([...controls.likedNeteaseTracks, ...controls.likedLocalTracks])
    : collection === "history" ? controls.historyTracks : collection === "daily" ? controls.dailyTracks : controls.roamTracks;
  const filtered = tracks.filter((track) => [track.title, track.artist, track.album].join(" ").toLowerCase().includes(query.toLowerCase()));
  const historyGroups = useMemo(() => {
    if (collection !== "history") return null;
    const playedAtById = new Map(controls.playHistory.map((entry) => [entry.track.id, entry.playedAt]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const yesterdayStart = todayStart - 86_400_000;
    const groups = {
      today: [] as typeof filtered,
      yesterday: [] as typeof filtered,
      earlier: [] as typeof filtered,
    };
    for (const track of filtered) {
      const playedAt = playedAtById.get(track.id) ?? 0;
      if (playedAt >= todayStart) groups.today.push(track);
      else if (playedAt >= yesterdayStart) groups.yesterday.push(track);
      else groups.earlier.push(track);
    }
    return groups;
  }, [collection, filtered, controls.playHistory]);
  const isHistory = collection === "history";
  const visibleTracks = isHistory ? filtered : filtered.slice(0, limit);
  const visual = collection === "liked" ? (
    <div className="size-28 shrink-0 overflow-hidden rounded-[1.1rem] shadow-sm">
      {tracks[0] ? <TrackCover track={tracks[0]} className="size-full" priority /> : <div className="flex size-full items-center justify-center rounded-[1.1rem] bg-rose-50 text-rose-400">♡</div>}
    </div>
  ) : collection === "daily" ? (
    tracks.length ? (
      <CoverCollage tracks={tracks} className="size-28 shrink-0 rounded-[1.1rem]" priority />
    ) : (
      <div className="flex size-28 shrink-0 items-center justify-center rounded-[1.1rem] bg-[linear-gradient(140deg,#e3ddd0,#bba98b)] text-[#5d4a34] shadow-sm">
        <Compass className="size-10" />
      </div>
    )
  ) : collection === "roam" ? (
    <div className="flex size-28 shrink-0 items-center justify-center rounded-[1.1rem] bg-[linear-gradient(140deg,#d9def0,#9aa7cc)] text-[#3d4b70] shadow-sm">
      <Radar className="size-10" />
    </div>
  ) : (
    <div className="flex size-28 shrink-0 items-center justify-center rounded-[1.1rem] bg-[linear-gradient(140deg,#dce8e2,#a8c5b9)] text-[#3b5a4f] shadow-sm">
      <History className="size-10" />
    </div>
  );
  const meta = collection === "history"
    ? `${tracks.length} 首 · 按播放时间记录`
    : `${tracks.length} 首 · ${formatTotalDuration(tracks)}`;
  const label = collection === "daily" ? "Daily Mix" : collection === "roam" ? "Radio" : collection === "history" ? "History" : "Playlist";
  const description = collection === "daily"
    ? "每天根据你的听歌记录更新"
    : collection === "roam"
      ? "根据你的口味连续推荐新的歌曲"
      : collection === "history"
        ? "按今天、昨天和更早的时间查看"
        : "按收藏时间从新到旧排列";

  async function refresh(append = false) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (collection === "liked") await controls.refreshLikedData();
      if (collection === "daily") await controls.refreshDailyData();
      if (collection === "roam") {
        await (append ? controls.loadMoreRoam() : controls.refreshRoamData());
      }
    } catch {
      setError("加载失败，已保留现有音乐，请重试。");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { if (!tracks.length && collection !== "history") void refresh(); }, []);

  return (
    <div>
      <DetailHeader
        backLabel="返回首页"
        onBack={onBack}
        label={label}
        title={names[collection]}
        meta={meta}
        visual={visual}
        actions={
          <>
            <PlayAllButton onPlay={() => filtered[0] && controls.chooseTrack(filtered[0].id, filtered)} count={filtered.length} />
            <RandomPlayButton onPlay={() => controls.playShuffledTracks(filtered)} count={filtered.length} />
          </>
        }
      />
      <p className="mb-3 -mt-1 text-xs text-neutral-500">{description}</p>

      <div className="mb-3 flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 border-b border-black/10 px-2 py-2">
          <Search className="size-4 shrink-0 text-neutral-400" />
          <input
            aria-label="筛选音乐"
            placeholder="筛选歌曲、歌手"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setLimit(80); }}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        {!isHistory && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            aria-label="刷新"
            className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-neutral-500 shadow-sm disabled:opacity-40"
          >
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {error && <div className="my-3"><InlineError message={error} /></div>}
      {busy && <LoadingState label="正在加载…" />}

      {!busy && !filtered.length && (
        <EmptyState
          icon={<History className="size-5" />}
          title={query ? "没有匹配的音乐" : collection === "liked" ? "还没有喜欢的音乐" : "这里暂时没有内容"}
          description={query ? "换个关键词试试。" : "播放歌曲时点一下 ♡，或者去首页看看推荐。"}
          action={
            <button
              type="button"
              onClick={onBack}
              className="tap-scale rounded-full bg-neutral-950 px-4 py-2 text-xs font-medium text-white"
            >
              去听点什么
            </button>
          }
        />
      )}

      {isHistory && historyGroups && filtered.length > 0 && (
        <div className="space-y-5">
          {([
            ["今天", historyGroups.today],
            ["昨天", historyGroups.yesterday],
            ["更早", historyGroups.earlier],
          ] as const).map(([title, group]) => group.length > 0 && (
            <section key={title}>
              <h2 className="mb-2 text-xs font-semibold text-neutral-500">{title}</h2>
              <div className="space-y-0.5">
                {group.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    active={controls.activeTrackId === track.id}
                    liked={Boolean(controls.neteaseLikedIds[track.id] || controls.likedTrackIds[track.id])}
                    onPlay={() => controls.chooseTrack(track.id, filtered)}
                    onLike={() => controls.toggleLikeTrack(track.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {!isHistory && visibleTracks.length > 0 && (
        <div className="space-y-0.5">
          {visibleTracks.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              index={index}
              active={controls.activeTrackId === track.id}
              liked={Boolean(controls.neteaseLikedIds[track.id] || controls.likedTrackIds[track.id])}
              onPlay={() => controls.chooseTrack(track.id, filtered)}
              onLike={() => controls.toggleLikeTrack(track.id)}
            />
          ))}
        </div>
      )}

      {limit < filtered.length && (
        <button onClick={() => setLimit((value) => value + 80)} className="mx-auto my-4 flex items-center gap-2 py-3 text-sm">
          <Plus className="size-4" />
          显示更多
        </button>
      )}
      {collection === "roam" && filtered.length > 0 && (
        <button disabled={busy} onClick={() => void refresh(true)} className="mx-auto my-4 flex items-center gap-2 py-3 text-sm disabled:opacity-40">
          <Plus className="size-4" />
          更多漫游
        </button>
      )}
    </div>
  );
}
