import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Play, Plus, RefreshCw, Search } from "lucide-react";
import type { CollectionId, MobileControls } from "./MobileApp";
import { TrackRow } from "./screens";
import { newestLiked } from "./libraryStorage";

const names = { liked: "我喜欢的音乐", history: "最近播放", daily: "每日推荐", roam: "私人漫游" };

export function CollectionScreen({ collection, controls, onBack }: { collection: CollectionId; controls: MobileControls; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(80);
  const tracks = collection === "liked" ? newestLiked([...controls.likedNeteaseTracks, ...controls.likedLocalTracks])
    : collection === "history" ? controls.historyTracks : collection === "daily" ? controls.dailyTracks : controls.roamTracks;
  const filtered = tracks.filter((track) => [track.title, track.artist, track.album].join(" ").toLowerCase().includes(query.toLowerCase()));
  async function refresh(append = false) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (collection === "liked") await controls.refreshLikedData();
      if (collection === "daily") await controls.refreshDailyData();
      if (collection === "roam") {
        await (append ? controls.loadMoreRoam() : controls.refreshRoamData());
      }
    } catch { setError("加载失败，已保留现有音乐，请重试。"); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (!tracks.length && collection !== "history") void refresh(); }, []);
  return <div>
    <header className="flex items-center gap-2">
      <button onClick={onBack} aria-label="返回" title="返回" className="flex size-10 shrink-0 items-center justify-center"><ArrowLeft className="size-5" /></button>
      <h1 className="min-w-0 flex-1 text-lg font-semibold">{names[collection]}</h1>
      {collection !== "history" && <button disabled={busy} onClick={() => void refresh()} aria-label="刷新" title="刷新" className="flex size-10 items-center justify-center disabled:opacity-40"><RefreshCw className={`size-5 ${busy ? "animate-spin" : ""}`} /></button>}
    </header>
    <div className="my-4 flex items-center justify-between gap-3">
      <p className="text-xs text-neutral-500">{tracks.length} 首{collection === "liked" || collection === "history" ? " · 最新在前" : ""}</p>
      <button disabled={!filtered.length} onClick={() => controls.chooseTrack(filtered[0].id, filtered)} className="flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2 text-xs text-white disabled:opacity-30"><Play className="size-4" />播放全部</button>
    </div>
    <label className="mb-3 flex items-center gap-2 border-b border-black/10 px-2 py-2"><Search className="size-4 text-neutral-400" /><input aria-label="筛选音乐" placeholder="筛选歌曲、歌手" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(80); }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
    {error && <p role="alert" className="my-3 text-sm text-rose-600">{error}</p>}
    {busy && <div role="status" className="my-3 flex items-center gap-2 text-xs text-neutral-500"><Loader2 className="size-4 animate-spin" />正在加载</div>}
    {filtered.slice(0, limit).map((track) => <TrackRow key={track.id} track={track} active={controls.activeTrackId === track.id} liked={Boolean(controls.neteaseLikedIds[track.id] || controls.likedTrackIds[track.id])} onPlay={() => controls.chooseTrack(track.id, filtered)} onLike={() => controls.toggleLikeTrack(track.id)} />)}
    {!busy && !filtered.length && <p className="py-12 text-center text-sm text-neutral-400">{query ? "没有匹配的音乐" : "暂无音乐"}</p>}
    {limit < filtered.length && <button onClick={() => setLimit((n) => n + 80)} className="mx-auto my-4 flex items-center gap-2 py-3 text-sm"><Plus className="size-4" />显示更多</button>}
    {collection === "roam" && <button disabled={busy} onClick={() => void refresh(true)} className="mx-auto my-4 flex items-center gap-2 py-3 text-sm disabled:opacity-40"><Plus className="size-4" />更多漫游</button>}
  </div>;
}
