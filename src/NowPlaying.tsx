import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Heart,
  ListMusic,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { idleTrack } from "@/lib/trackMappers";
import {
  extractDominantColors,
  formatBitrate,
  formatSampleRate,
  getActiveLyricIndex,
  type CoverPalette,
} from "@/lib/playerPresentation";
import { TrackCover } from "./Chrome";
import type { MobileControls } from "./MobileApp";

type NowPlayingView = "cover" | "lyrics" | "queue";

// The NetEase-style palette: artwork fills the top, then melts into a dark
// tint of its own dominant color, ending near-black under the controls.
const BASE_BG = "#08080a";

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function darkenHex(hex: string, keep: number): string {
  if (!isHexColor(hex)) return hex;
  const raw = hex.slice(1);
  const channel = (offset: number) => Math.round(parseInt(raw.slice(offset, offset + 2), 16) * keep)
    .toString(16)
    .padStart(2, "0");
  // Stays hex so callers can append 8-digit alpha (e.g. `${dark}a6`).
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

export function NowPlaying(controls: MobileControls & { onClose: () => void }) {
  const {
    activeTrack,
    playing,
    currentTime,
    durationSeconds,
    volume,
    shuffleEnabled,
    repeatMode,
    playQueueTracks,
    likedTrackIds,
    neteaseLikedIds,
    onClose,
    togglePlayback,
    playNext,
    playPrevious,
    seekTo,
    setVolume,
    toggleShuffle,
    toggleRepeatMode,
    toggleLikeTrack,
  } = controls;

  const [view, setView] = useState<NowPlayingView>("cover");
  const [palette, setPalette] = useState<CoverPalette | null>(null);
  const isIdle = activeTrack.id === idleTrack.id;
  const liked = activeTrack.source === "netease"
    ? Boolean(neteaseLikedIds[activeTrack.id] || activeTrack.likedAt)
    : Boolean(likedTrackIds[activeTrack.id]);
  const coverUrl = activeTrack.coverUrl ?? (activeTrack.cover.startsWith("http") ? activeTrack.cover : undefined);
  const fallbackDominant = isHexColor(activeTrack.cover) ? activeTrack.cover : "#4b4f5e";

  useEffect(() => {
    if (!coverUrl) {
      setPalette(null);
      return;
    }
    let mounted = true;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = coverUrl;
    image.onload = () => {
      if (!mounted) return;
      try {
        setPalette(extractDominantColors(image));
      } catch {
        setPalette(null);
      }
    };
    image.onerror = () => {
      if (mounted) setPalette(null);
    };
    return () => {
      mounted = false;
    };
  }, [coverUrl]);

  const dominant = palette?.primary ?? fallbackDominant;
  const dominantSoft = darkenHex(dominant, 0.38);
  const dominantDeep = darkenHex(dominant, 0.17);
  const progress = durationSeconds > 0 ? Math.min(1, currentTime / durationSeconds) : 0;
  const lyricLines = activeTrack.lyrics ?? [];
  const activeLyricIndex = lyricLines.length ? getActiveLyricIndex(lyricLines, currentTime) : -1;
  const activeLyric = activeLyricIndex >= 0 ? lyricLines[activeLyricIndex]?.text : "";
  const qualityParts = [
    activeTrack.quality,
    formatBitrate(activeTrack.bitrate, true),
    formatSampleRate(activeTrack.sampleRate, true),
  ].filter(Boolean);
  const qualityLabel = qualityParts.join(" · ") || activeTrack.quality;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 34 }}
      className="fixed inset-0 z-30 flex flex-col overflow-hidden text-white"
      style={{ background: BASE_BG }}
    >
      {/* ---- Immersive background: full-bleed artwork melting into its own
           dominant color, then to near-black (NetEase-style gradient) ---- */}
      <div className="absolute inset-0" aria-hidden>
        <AnimatePresence>
          {coverUrl && (
            <motion.img
              key={coverUrl}
              src={coverUrl}
              alt=""
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              className="absolute inset-x-0 top-0 h-[64%] w-full object-cover"
              draggable={false}
            />
          )}
        </AnimatePresence>
        {view === "lyrics" && coverUrl && (
          <motion.img
            key={"blur-" + coverUrl}
            src={coverUrl}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="absolute inset-0 h-full w-full scale-125 object-cover blur-3xl"
            draggable={false}
          />
        )}
        {/* dominant tint over the artwork keeps the whole page in one hue.
            Must reach full opacity before the artwork's bottom edge (64%)
            so the image melts into the background without a hard cut. */}
        <div
          className="absolute inset-0 transition-[background] duration-700"
          style={{
            background: `linear-gradient(180deg, ${dominant}30 0%, ${dominant}12 22%, ${dominantSoft}d9 44%, ${dominantDeep} 58%, ${BASE_BG} 74%, ${BASE_BG} 100%)`,
          }}
        />
        {/* top scrim so the header stays readable on bright artwork */}
        <div
          className="absolute inset-x-0 top-0 h-28"
          style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.42), rgba(0,0,0,0))" }}
        />
      </div>

      {/* ---- Header ---- */}
      <div className="safe-top relative z-10 flex items-center justify-between gap-2 px-4 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="tap-scale -ml-2 flex size-10 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10"
          aria-label="收起播放页"
        >
          <ChevronDown className="size-6" />
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-xs font-medium tracking-wide text-white/60">
            {activeTrack.album || "Aria"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setView(view === "queue" ? "cover" : "queue")}
          className="tap-scale -mr-2 flex size-10 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10"
          aria-label="播放队列"
        >
          <ListMusic className="size-5" />
        </button>
      </div>

      {/* ---- Middle zone: cover breathing room / lyrics / queue ---- */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {view !== "queue" && (
          <div className="relative flex min-h-0 flex-1 flex-col">
            <button
              type="button"
              onClick={() => setView(view === "lyrics" ? "cover" : "lyrics")}
              className="flex min-h-0 flex-1 flex-col justify-end"
              aria-label="切换歌词显示"
            >
              {view === "cover" ? (
                activeLyric ? (
                  <motion.p
                    layoutId="active-lyric-line"
                    className="line-clamp-1 px-2 pb-3 text-center text-sm text-white/60"
                  >
                    {activeLyric}
                  </motion.p>
                ) : (
                  <span className="pb-3 text-center text-xs text-white/30">点按显示歌词</span>
                )
              ) : (
                <span className="flex-1" />
              )}
            </button>
            {view === "lyrics" && <LyricsView controls={controls} />}
          </div>
        )}
        <AnimatePresence>{view === "queue" && <QueueSheet controls={controls} />}</AnimatePresence>

        {view !== "queue" && (
          <div className="px-6 pb-1 pt-3">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-[1.35rem] font-semibold leading-snug">{activeTrack.title}</h2>
                <p className="mt-1 truncate text-sm text-white/55">{activeTrack.artist}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleLikeTrack(activeTrack.id)}
                disabled={isIdle}
                className="tap-scale flex size-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40"
                aria-label={liked ? "取消喜欢" : "喜欢"}
              >
                <Heart className={`size-6 ${liked ? "fill-rose-500 text-rose-500" : "text-white/70"}`} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---- Controls dock ---- */}
      {view !== "queue" && (
        <div className="safe-bottom relative z-10 px-6 pb-5 pt-2">
          <input
            type="range"
            min={0}
            max={Math.max(durationSeconds, 1)}
            step={0.1}
            value={Math.min(currentTime, durationSeconds || 0)}
            onChange={(event) => seekTo(Number(event.target.value))}
            className="mobile-range [--range-color:#ffffff]"
            style={{ "--range-value": progress } as CSSProperties}
            aria-label="播放进度"
            disabled={isIdle}
          />
          <div className="-mx-1 mt-1 flex items-center justify-between text-[11px] tabular-nums text-white/45">
            <span className="min-w-10 text-left">{formatClock(currentTime)}</span>
            <span className="truncate px-2 text-white/35">{qualityLabel}</span>
            <span className="min-w-10 text-right">{formatClock(durationSeconds)}</span>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={toggleShuffle}
              className={`tap-scale flex size-11 items-center justify-center rounded-full transition ${shuffleEnabled ? "text-white" : "text-white/40"}`}
              aria-label="随机播放"
            >
              <Shuffle className="size-5" />
            </button>
            <button
              type="button"
              onClick={playPrevious}
              disabled={isIdle}
              className="tap-scale flex size-13 items-center justify-center rounded-full p-2 text-white/90 transition disabled:opacity-40"
              aria-label="上一首"
            >
              <SkipBack className="size-8" />
            </button>
            <button
              type="button"
              onClick={togglePlayback}
              className="tap-scale mx-2 flex size-17 items-center justify-center rounded-full bg-white text-neutral-950 shadow-[0_16px_44px_rgba(0,0,0,0.45)] transition active:scale-95"
              aria-label={playing ? "暂停" : "播放"}
            >
              {playing ? <Pause className="size-8" /> : <Play className="size-8 translate-x-[2px]" />}
            </button>
            <button
              type="button"
              onClick={playNext}
              disabled={isIdle}
              className="tap-scale flex size-13 items-center justify-center rounded-full p-2 text-white/90 transition disabled:opacity-40"
              aria-label="下一首"
            >
              <SkipForward className="size-8" />
            </button>
            <button
              type="button"
              onClick={toggleRepeatMode}
              className={`tap-scale flex size-11 items-center justify-center rounded-full transition ${repeatMode === "one" ? "text-white" : "text-white/40"}`}
              aria-label={repeatMode === "one" ? "单曲循环" : "列表循环"}
            >
              {repeatMode === "one" ? <Repeat1 className="size-5" /> : <Repeat className="size-5" />}
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setView(view === "lyrics" ? "cover" : "lyrics")}
              className={`tap-scale flex size-10 items-center justify-center rounded-full transition ${view === "lyrics" ? "bg-white/15 text-white" : "text-white/55"}`}
              aria-label="歌词"
            >
              <Mic2 className="size-4.5" />
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="mobile-range min-w-0 flex-1 [--range-color:#ffffffcc]"
              style={{ "--range-value": volume / 100 } as CSSProperties}
              aria-label="音量"
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}

function LyricsView({ controls }: { controls: MobileControls }) {
  const { activeTrack, currentTime } = controls;
  const lyrics = activeTrack.lyrics ?? [];
  const activeIndex = useMemo(() => getActiveLyricIndex(lyrics, currentTime), [lyrics, currentTime]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeLine = container.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`);
    if (activeLine) {
      container.scrollTo({
        top: activeLine.offsetTop - container.clientHeight / 2,
        behavior: "smooth",
      });
    }
  }, [activeIndex]);

  if (!lyrics.length || (lyrics.length <= 3 && lyrics[0]?.text.includes("等待同步"))) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <p className="text-center text-sm text-white/40">
          {activeTrack.source === "netease" ? "歌词同步中…" : "这首歌曲暂时没有歌词"}
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto py-[38%]">
      {lyrics.map((line, index) => (
        <p
          key={`${line.time}-${index}`}
          data-line={index}
          className={`px-8 py-2.5 text-center text-[1.05rem] leading-8 transition-all duration-300 ${
            index === activeIndex ? "font-semibold text-white" : "text-white/35"
          }`}
        >
          {line.text}
          {line.translation && <span className="mt-1 block text-xs text-white/45">{line.translation}</span>}
        </p>
      ))}
    </div>
  );
}

function QueueSheet({ controls }: { controls: MobileControls }) {
  const { activeTrack, playQueueTracks, chooseTrack } = controls;
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="safe-bottom absolute inset-x-0 bottom-0 top-16 z-20 flex min-h-0 flex-col rounded-t-[1.6rem] border-t border-white/10 bg-[#0c0c0f]/97 px-4 pt-4 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between pb-3">
        <p className="text-sm font-semibold text-white/80">当前队列 · {playQueueTracks.length} 首</p>
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
          {controls.repeatMode === "one" ? <Repeat1 className="size-3.5" /> : <Repeat className="size-3.5" />}
          {controls.repeatMode === "one" ? "单曲循环" : "列表循环"}
        </span>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-4">
        {playQueueTracks.map((track) => (
          <button
            key={track.id}
            type="button"
            onClick={() => chooseTrack(track.id, playQueueTracks)}
            className={`tap-scale flex w-full items-center gap-3 rounded-[0.9rem] px-2 py-2.5 text-left transition ${
              track.id === activeTrack.id ? "bg-white/10" : "active:bg-white/[0.06]"
            }`}
          >
            <span className="min-w-0 flex-1">
              <span
                className={`block truncate text-sm ${track.id === activeTrack.id ? "font-semibold text-white" : "text-white/85"}`}
              >
                {track.title}
              </span>
              <span className="mt-0.5 block truncate text-xs text-white/45">{track.artist}</span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-white/35">{track.duration}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
