import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { AnimatePresence, motion, Reorder, useDragControls } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  GripVertical,
  ListMusic,
  Loader2,
  Play,
  Playing,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Timer,
  Volume,
  VolumeLow,
  VolumeMute,
  X,
} from "./icons";
import { idleTrack } from "@/lib/trackMappers";
import type { LyricLine, Track } from "@/data/music";
import {
  extractDominantColors,
  getActiveLyricIndex,
  qualityOptions,
  type CoverPalette,
  type QualityLevel,
} from "@/lib/playerPresentation";
import { TrackCover } from "./Chrome";
import { Kaleidoscope } from "./Kaleidoscope";
import { LikeHeart } from "./HeartPulse";
import type { MobileControls } from "./MobileApp";
import { formatPlaybackQuality } from "./playbackQuality";
import { cachedCoverUrl } from "./coverCache";

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
    hifiEnabled,
    qualityLevel,
    qualitySwitching,
    actualQuality,
    sleepTimerRemaining,
    setSleepTimer,
    offlineTracks,
    downloadingTrackIds,
    downloadTrack,
    deleteOfflineTrack,
    kaleidoscopeEnabled,
    onClose,
    togglePlayback,
    playNext,
    playPrevious,
    seekTo,
    setVolume,
    toggleShuffle,
    toggleRepeatMode,
    toggleLikeTrack,
    setHifiEnabled,
    setQualityLevel,
  } = controls;

  const [view, setView] = useState<NowPlayingView>("cover");
  const [qualityOpen, setQualityOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [palette, setPalette] = useState<CoverPalette | null>(null);
  const isIdle = activeTrack.id === idleTrack.id;
  const liked = activeTrack.source === "netease"
    ? Boolean(neteaseLikedIds[activeTrack.id])
    : Boolean(likedTrackIds[activeTrack.id]);
  const coverUrl = activeTrack.coverUrl ?? (activeTrack.cover.startsWith("http") ? activeTrack.cover : undefined);
  const fallbackDominant = isHexColor(activeTrack.cover) ? activeTrack.cover : "#4b4f5e";
  const [displayCoverUrl, setDisplayCoverUrl] = useState<string | undefined>(coverUrl);

  useEffect(() => {
    let mounted = true;
    setDisplayCoverUrl(coverUrl);
    if (coverUrl) {
      void cachedCoverUrl(coverUrl).then((url) => {
        if (mounted && url) setDisplayCoverUrl(url);
      });
    }
    return () => {
      mounted = false;
    };
  }, [coverUrl]);

  useEffect(() => {
    if (!displayCoverUrl) {
      setPalette(null);
      return;
    }
    let mounted = true;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = displayCoverUrl;
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
  }, [displayCoverUrl]);

  const dominant = palette?.primary ?? fallbackDominant;
  const dominantSoft = darkenHex(dominant, 0.38);
  const dominantDeep = darkenHex(dominant, 0.17);
  const progress = durationSeconds > 0 ? Math.min(1, currentTime / durationSeconds) : 0;
  const lyricLines = activeTrack.lyrics ?? [];
  const activeLyricIndex = lyricLines.length ? getActiveLyricIndex(lyricLines, currentTime) : -1;
  const activeLyric = activeLyricIndex >= 0 ? lyricLines[activeLyricIndex]?.text : "";
  const previewLyric = activeLyric || lyricLines[0]?.text || "";
  const nextLyric = activeLyricIndex >= 0
    ? lyricLines[activeLyricIndex + 1]?.text ?? ""
    : lyricLines[1]?.text ?? "";
  const isDownloading = downloadingTrackIds.includes(activeTrack.id);
  const isOffline = Boolean(activeTrack.offline) || offlineTracks.some((track) => track.id === activeTrack.id);
  const canDownload = !isIdle && (isOffline || activeTrack.source === "netease" || Boolean(activeTrack.streamUrl?.startsWith("http")));

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
           dominant color, then to near-black (NetEase-style gradient).
           With the kaleidoscope look enabled, the artwork becomes a slowly
           revolving mirrored-wedge pattern instead of the plain image. ---- */}
      <div className="absolute inset-0" aria-hidden>
        {kaleidoscopeEnabled && displayCoverUrl ? (
          <Kaleidoscope src={displayCoverUrl} playing={playing} className="absolute inset-0 h-full w-full" />
        ) : (
          <AnimatePresence>
            {displayCoverUrl && (
              <motion.img
                key={coverUrl}
                src={displayCoverUrl}
                alt=""
                initial={{ opacity: 0 }}
                animate={{ opacity: view === "lyrics" ? 0.72 : 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                onError={(event) => {
                  if (coverUrl && event.currentTarget.src !== coverUrl) {
                    event.currentTarget.src = coverUrl;
                  } else {
                    event.currentTarget.style.display = "none";
                  }
                }}
                className="absolute inset-x-0 top-0 h-[64%] w-full object-cover"
                draggable={false}
              />
            )}
          </AnimatePresence>
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
        {/* right-side scrim keeps the floating lyrics legible on artwork */}
        <AnimatePresence>
          {view === "lyrics" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
              className="absolute inset-x-0 top-0 h-[64%]"
              style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.30) 48%, rgba(0,0,0,0.74) 100%)" }}
            />
          )}
        </AnimatePresence>
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
            <AnimatePresence initial={false} mode="wait">
              {view === "lyrics" ? (
                <motion.div
                  key="lyrics"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 18 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <LyricsView controls={controls} onClose={() => setView("cover")} />
                </motion.div>
              ) : (
                <motion.div
                  key="cover"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="relative flex min-h-0 flex-1 flex-col justify-end px-6 pb-6"
                >
                  <button
                    type="button"
                    onClick={() => setView("lyrics")}
                    className="absolute inset-0"
                    aria-label="显示歌词"
                  />
                  <div className="pointer-events-none relative z-10 flex flex-col items-end gap-1.5 text-right">
                    {previewLyric ? (
                      <>
                        <motion.p
                          layoutId="active-lyric-line"
                          transition={{ type: "spring", stiffness: 260, damping: 30 }}
                          className="line-clamp-2 max-w-[86%] text-right text-[1.05rem] font-semibold leading-7 text-white/90 [text-shadow:0_2px_18px_rgba(0,0,0,0.85)]"
                        >
                          {previewLyric}
                        </motion.p>
                        {nextLyric && (
                          <p className="line-clamp-1 max-w-[80%] text-right text-xs leading-5 text-white/45 [text-shadow:0_2px_12px_rgba(0,0,0,0.8)]">
                            {nextLyric}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-white/35">点按封面显示歌词</span>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {view !== "queue" && (
          <div className="px-6 pb-1 pt-3">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-[1.35rem] font-semibold leading-snug">{activeTrack.title}</h2>
                <p className="mt-1 truncate text-sm text-white/55">{activeTrack.artist}</p>
              </div>
              <div className="shrink-0">
                <LikeHeart
                  liked={liked}
                  onToggle={() => toggleLikeTrack(activeTrack.id)}
                  disabled={isIdle}
                  iconPx={24}
                  buttonClass="size-11"
                  iconClass="size-6"
                  inactiveIconClass="text-white/70"
                  activeLabel="取消喜欢"
                  inactiveLabel="喜欢"
                />
              </div>
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
            <span className="min-w-10 text-right">{formatClock(durationSeconds)}</span>
          </div>

          <div className="mt-5 flex items-center justify-between px-1">
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
              className="tap-scale flex size-17 items-center justify-center rounded-full bg-white text-neutral-950 shadow-[0_16px_44px_rgba(0,0,0,0.45)] transition active:scale-95"
              aria-label={playing ? "暂停" : "播放"}
            >
              {/* While playing, the static pause bars give way to the aria-icons
                  "playing" equalizer — the animated mark from the desktop kit. */}
              {playing ? <Playing className="size-8" /> : <Play className="size-8 translate-x-[2px]" />}
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

          <div className="mt-5 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => {
                setSleepOpen(false);
                setQualityOpen(true);
              }}
              className="tap-scale flex h-10 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 text-[11px] font-medium text-white/80 transition active:bg-white/15"
              aria-label="切换音质"
            >
              {qualitySwitching ? <Loader2 className="size-3.5 animate-spin" /> : <SlidersHorizontal className="size-3.5" />}
              <span className="whitespace-nowrap">
                {qualitySwitching
                  ? "切换中…"
                  : `${hifiEnabled ? "HiFi" : qualityOptions.find((option) => option.value === qualityLevel)?.label ?? qualityLevel}${actualQuality?.bitrate ? ` · ${Math.round(actualQuality.bitrate / 1000)}k` : ""}`}
              </span>
              <ChevronUp className="size-3 text-white/45" />
            </button>
            {canDownload && (
              <button
                type="button"
                onClick={() => {
                  if (isOffline) void deleteOfflineTrack(activeTrack.id);
                  else void downloadTrack(activeTrack.id);
                }}
                disabled={isDownloading}
                className={`tap-scale flex size-10 items-center justify-center rounded-full transition disabled:opacity-50 ${
                  isOffline ? "text-emerald-300" : "text-white/55"
                }`}
                aria-label={isOffline ? "删除离线文件" : "下载到离线音乐"}
              >
                {isDownloading ? <Loader2 className="size-4.5 animate-spin" /> : isOffline ? <Check className="size-4.5" /> : <Download className="size-4.5" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setQualityOpen(false);
                setSleepOpen(true);
              }}
              className={`tap-scale relative flex size-10 items-center justify-center rounded-full transition ${sleepTimerRemaining != null ? "bg-white/15 text-emerald-300" : "text-white/55"}`}
              aria-label="睡眠定时"
            >
              <Timer className="size-4.5" />
              {sleepTimerRemaining != null && (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-400 ring-2 ring-[#08080a]" />
              )}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3 px-1">
            {volume <= 0
              ? <VolumeMute className="size-4 shrink-0 text-white/40" aria-hidden />
              : volume < 50
                ? <VolumeLow className="size-4 shrink-0 text-white/40" aria-hidden />
                : <Volume className="size-4 shrink-0 text-white/40" aria-hidden />}
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

      {/* Overlays live at the root of the player. Keeping them inside the
          middle z-10 stacking context let the controls dock paint above the
          bottom sheet, which blocked the quality/queue buttons. */}
      <AnimatePresence>{view === "queue" && <QueueSheet controls={controls} onClose={() => setView("cover")} />}</AnimatePresence>
      <AnimatePresence>
        {qualityOpen && <QualitySheet controls={controls} onClose={() => setQualityOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {sleepOpen && (
          <SleepTimerSheet
            remaining={sleepTimerRemaining}
            onSelect={setSleepTimer}
            onClose={() => setSleepOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function lyricSeconds(time: string): number {
  const [minutes, rest] = time.split(":");
  const seconds = Number(minutes) * 60 + Number.parseFloat(rest ?? "0");
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

function LyricsView({ controls, onClose }: { controls: MobileControls; onClose: () => void }) {
  const { activeTrack, currentTime, seekTo } = controls;
  const lyrics = activeTrack.lyrics ?? [];
  const activeIndex = useMemo(() => getActiveLyricIndex(lyrics, currentTime), [lyrics, currentTime]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const programmaticScroll = useRef(false);
  const programmaticTimer = useRef<number | null>(null);
  const lastUserScroll = useRef(0);
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !following) return;
    const activeLine = container.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`);
    if (!activeLine) return;
    const target = activeLine.offsetTop - container.clientHeight / 2 + activeLine.clientHeight / 2;
    programmaticScroll.current = true;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    if (programmaticTimer.current) window.clearTimeout(programmaticTimer.current);
    programmaticTimer.current = window.setTimeout(() => {
      programmaticScroll.current = false;
    }, 450);
  }, [activeIndex, following]);

  useEffect(() => () => {
    if (programmaticTimer.current) window.clearTimeout(programmaticTimer.current);
  }, []);

  function handleScroll() {
    if (programmaticScroll.current) return;
    lastUserScroll.current = performance.now();
    setFollowing(false);
  }

  function jumpToLine(line: LyricLine) {
    seekTo(lyricSeconds(line.time));
    setFollowing(true);
  }

  function handleBlankClick(event: MouseEvent<HTMLDivElement>) {
    // A scroll gesture also ends with a click on some Android WebViews.
    if (performance.now() - lastUserScroll.current < 400) return;
    if ((event.target as HTMLElement).closest("button[data-lyric-text]")) return;
    onClose();
  }

  if (!lyrics.length || (lyrics.length <= 3 && lyrics[0]?.text.includes("等待同步"))) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-3 px-7 text-left">
        <p className="text-sm text-white/45">
          {activeTrack.source === "netease" ? "歌词同步中…" : "这首歌曲暂时没有歌词"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="tap-scale rounded-full border border-white/15 bg-white/[0.07] px-3.5 py-1.5 text-xs text-white/65"
        >
          返回封面
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative z-10 flex items-center justify-between px-6 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Lyrics</span>
        <button
          type="button"
          onClick={onClose}
          className="tap-scale flex size-9 items-center justify-center rounded-full text-white/65 transition active:bg-white/10"
          aria-label="收起歌词"
        >
          <ChevronDown className="size-5" />
        </button>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        onClick={handleBlankClick}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-20 pl-20 pr-7 pt-[30%] text-right [text-shadow:0_2px_14px_rgba(0,0,0,0.7)]"
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 86%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 86%, transparent 100%)",
        }}
        aria-label="歌词，点击空白返回封面，点击歌词跳转播放"
      >
        {lyrics.map((line, index) => {
          const active = index === activeIndex;
          return (
            <div key={`${line.time}-${index}`} data-line={index} className="py-2 text-right">
              <button
                type="button"
                data-lyric-text
                aria-current={active ? "true" : undefined}
                aria-label={`跳转到歌词：${line.text}`}
                onClick={(event) => {
                  event.stopPropagation();
                  jumpToLine(line);
                }}
                className={`inline-block max-w-full text-right transition-all duration-500 ${
                  active
                    ? "scale-[1.01] text-[1.35rem] font-semibold leading-9 text-white"
                    : "text-[15px] leading-7 text-white/40 hover:text-white/65"
                }`}
              >
                {active ? <KaraokeText line={line} currentTime={currentTime} /> : line.text}
                {line.translation && (
                  <span className={`mt-1 block font-normal ${active ? "text-white/55" : "text-white/30"} text-[11px]`}>
                    {line.translation}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {!following && (
        <button
          type="button"
          onClick={() => setFollowing(true)}
          className="tap-scale absolute bottom-2 right-6 z-10 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[11px] text-white/75 backdrop-blur"
        >
          <ArrowDown className="size-3.5" />
          回到当前
        </button>
      )}
    </div>
  );
}

function KaraokeText({ line, currentTime }: { line: LyricLine; currentTime: number }) {
  if (!line.words?.length) return <>{line.text}</>;
  return (
    <span className="whitespace-pre-wrap">
      {line.words.map((word, index) => {
        const sung = currentTime >= word.start;
        return (
          <span
            key={`${word.start}-${index}`}
            className={`transition-colors duration-150 ${sung ? "text-white" : "text-white/35"}`}
          >
            {word.text}
          </span>
        );
      })}
    </span>
  );
}

function SleepTimerSheet({
  remaining,
  onSelect,
  onClose,
}: {
  remaining: number | null;
  onSelect: (minutes: number | null) => void;
  onClose: () => void;
}) {
  const options = [15, 30, 45, 60, 90];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        initial={{ y: "12%" }}
        animate={{ y: 0 }}
        exit={{ y: "12%" }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        onClick={(event) => event.stopPropagation()}
        className="safe-bottom absolute inset-x-0 bottom-0 rounded-t-[1.35rem] border-t border-white/10 bg-[#101014]/98 px-5 pb-5 pt-4 text-white shadow-[0_-20px_60px_rgba(0,0,0,0.5)]"
        role="dialog"
        aria-label="睡眠定时"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Sleep timer</p>
            <h3 className="mt-0.5 text-base font-semibold">睡眠定时</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-scale flex size-9 items-center justify-center rounded-full text-white/60 transition active:bg-white/10"
            aria-label="关闭睡眠定时设置"
          >
            <ChevronDown className="size-5" />
          </button>
        </div>
        <p className="mb-3 min-h-4 text-center text-[11px] text-white/50">
          {remaining != null ? `还有 ${formatClock(remaining)} 自动暂停播放` : "到时间后自动暂停播放"}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {options.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => {
                onSelect(minutes);
                onClose();
              }}
              className="tap-scale rounded-[0.8rem] bg-white/[0.06] px-2 py-3 text-xs font-medium text-white/70 transition active:bg-white/[0.12]"
            >
              {minutes} 分钟
            </button>
          ))}
        </div>
        {remaining != null && (
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            className="tap-scale mt-3 w-full rounded-[0.8rem] bg-rose-500/15 px-3 py-2.5 text-xs font-medium text-rose-300"
          >
            关闭定时
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

function QualitySheet({ controls, onClose }: { controls: MobileControls; onClose: () => void }) {
  const {
    hifiEnabled,
    qualityLevel,
    qualitySwitching,
    setHifiEnabled,
    setQualityLevel,
    activeTrack,
    actualQuality,
    playbackSpeed,
    setPlaybackSpeed,
    equalizerSupported,
    equalizerPresets,
    equalizerPreset,
    setEqualizerPreset,
  } = controls;
  const actual = formatPlaybackQuality(actualQuality);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        initial={{ y: "12%" }}
        animate={{ y: 0 }}
        exit={{ y: "12%" }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        onClick={(event) => event.stopPropagation()}
        className="safe-bottom absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto no-scrollbar rounded-t-[1.35rem] border-t border-white/10 bg-[#101014]/98 px-5 pb-5 pt-4 text-white shadow-[0_-20px_60px_rgba(0,0,0,0.5)]"
        role="dialog"
        aria-label="播放设置"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Audio</p>
            <h3 className="mt-0.5 text-base font-semibold">播放设置</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-scale flex size-9 items-center justify-center rounded-full text-white/60 transition active:bg-white/10"
            aria-label="关闭播放设置"
          >
            <ChevronDown className="size-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setHifiEnabled(!hifiEnabled)}
          className="flex w-full items-center justify-between gap-3 rounded-[0.9rem] bg-white/[0.06] px-3.5 py-3 text-left"
          role="switch"
          aria-checked={hifiEnabled}
        >
          <span>
            <span className="block text-sm font-medium">HiFi 优先</span>
            <span className="mt-0.5 block text-[11px] text-white/45">自动请求歌曲可用的最高音质</span>
          </span>
          <span className={`flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${hifiEnabled ? "bg-emerald-500" : "bg-white/20"}`}>
            <span className={`size-4 rounded-full bg-white shadow transition ${hifiEnabled ? "translate-x-5" : ""}`} />
          </span>
        </button>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {qualityOptions.map((option) => {
            const active = !hifiEnabled && qualityLevel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setQualityLevel(option.value as QualityLevel)}
                className={`tap-scale relative flex items-center justify-center gap-1 rounded-[0.8rem] px-2 py-2.5 text-xs font-medium transition ${
                  active ? "bg-white text-neutral-950" : "bg-white/[0.06] text-white/65 active:bg-white/[0.12]"
                }`}
                aria-pressed={active}
              >
                {active && <Check className="size-3.5" />}
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Playback speed</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {[0.75, 1, 1.25, 1.5, 2].map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => setPlaybackSpeed(speed)}
                className={`tap-scale rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  Math.abs(playbackSpeed - speed) < 0.01 ? "bg-white text-neutral-950" : "bg-white/[0.06] text-white/65 active:bg-white/[0.12]"
                }`}
                aria-pressed={Math.abs(playbackSpeed - speed) < 0.01}
              >
                {speed === 1 ? "1×" : `${speed}×`}
              </button>
            ))}
          </div>
        </div>

        {equalizerSupported && (
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Equalizer</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEqualizerPreset(-1)}
                className={`tap-scale rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  equalizerPreset < 0 ? "bg-white text-neutral-950" : "bg-white/[0.06] text-white/65 active:bg-white/[0.12]"
                }`}
                aria-pressed={equalizerPreset < 0}
              >
                关闭
              </button>
              {equalizerPresets.map((name, index) => (
                <button
                  key={`${index}-${name}`}
                  type="button"
                  onClick={() => setEqualizerPreset(index)}
                  className={`tap-scale rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    equalizerPreset === index ? "bg-white text-neutral-950" : "bg-white/[0.06] text-white/65 active:bg-white/[0.12]"
                  }`}
                  aria-pressed={equalizerPreset === index}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-3 min-h-4 text-center text-[11px] leading-4 text-white/50">
          {qualitySwitching ? "正在从当前进度切换音质…" : actual}
        </p>
        <p className="mt-1 text-center text-[10px] leading-4 text-white/30">
          {activeTrack.source === "netease"
            ? "切换会重新获取该档位音频，并从当前播放位置继续。"
            : "当前是本地文件；音质设置会在播放网易云歌曲时生效。"}
        </p>
      </motion.div>
    </motion.div>
  );
}

function QueueSheet({ controls, onClose }: { controls: MobileControls; onClose: () => void }) {
  const { activeTrack, playQueueTracks } = controls;
  const visibleTracks = playQueueTracks.slice(0, 300);
  const visibleIds = visibleTracks.map((track) => track.id);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="fixed inset-0 z-20 bg-black/20"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "7%" }}
        animate={{ y: 0 }}
        exit={{ y: "7%" }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        onClick={(event) => event.stopPropagation()}
        className="safe-bottom absolute inset-x-0 bottom-0 top-[11%] flex min-h-0 flex-col rounded-t-[1.35rem] border-t border-white/10 bg-[#0c0c0f]/97 px-4 pt-4 text-white backdrop-blur-xl"
      >
        <div className="flex items-center justify-between pb-3">
          <p className="text-sm font-semibold text-white/80">当前队列 · {playQueueTracks.length} 首</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={controls.clearQueue}
              disabled={playQueueTracks.length <= 1}
              className="text-xs text-white/45 transition active:text-white/80 disabled:opacity-30"
            >
              清空
            </button>
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              {controls.repeatMode === "one" ? <Repeat1 className="size-3.5" /> : <Repeat className="size-3.5" />}
              {controls.repeatMode === "one" ? "单曲循环" : "列表循环"}
            </span>
          </div>
        </div>

        <Reorder.Group
          axis="y"
          values={visibleIds}
          onReorder={(next) => controls.reorderQueue(next as string[])}
          className="no-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto pb-4"
        >
          {visibleTracks.map((track) => (
            <QueueRow
              key={track.id}
              track={track}
              active={track.id === activeTrack.id}
              controls={controls}
              onClose={onClose}
            />
          ))}
        </Reorder.Group>

        {playQueueTracks.length > visibleTracks.length && (
          <p className="pb-1 text-center text-[10px] text-white/25">
            队列较长，仅显示前 {visibleTracks.length} 首
          </p>
        )}
        <p className="pb-1 text-center text-[10px] text-white/25">拖动左侧手柄排序 · 点击歌曲立即播放</p>
      </motion.div>
    </motion.div>
  );
}

function QueueRow({
  track,
  active,
  controls,
  onClose,
}: {
  track: Track;
  active: boolean;
  controls: MobileControls;
  onClose: () => void;
}) {
  const dragControls = useDragControls();
  return (
    <Reorder.Item
      value={track.id}
      drag="y"
      dragListener={false}
      dragControls={dragControls}
      dragElastic={0.03}
      dragMomentum={false}
      className={`flex items-center gap-2 rounded-[0.9rem] px-2 py-2 ${
        active ? "bg-white/10" : "bg-white/[0.02]"
      }`}
    >
      <button
        type="button"
        onPointerDown={(event) => dragControls.start(event)}
        className="touch-none flex size-8 shrink-0 items-center justify-center rounded-full text-white/25 transition active:bg-white/10 active:text-white/60"
        aria-label="拖动排序"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => {
          void controls.chooseTrack(track.id, controls.playQueueTracks);
          onClose();
        }}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <TrackCover track={track} className="size-10 shrink-0 rounded-[0.6rem]" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${active ? "font-semibold text-white" : "text-white/85"}`}>
            {track.title}
          </span>
          <span className="mt-0.5 block truncate text-xs text-white/45">{track.artist}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => controls.playNextInQueue(track.id)}
        disabled={active}
        className="tap-scale flex size-8 shrink-0 items-center justify-center rounded-full text-white/40 transition active:bg-white/10 active:text-white disabled:opacity-20"
        aria-label="下一首播放"
      >
        <ArrowUp className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => controls.removeFromQueue(track.id)}
        disabled={active}
        className="tap-scale flex size-8 shrink-0 items-center justify-center rounded-full text-white/35 transition active:bg-white/10 active:text-rose-300 disabled:opacity-20"
        aria-label="从队列移除"
      >
        <X className="size-4" />
      </button>
    </Reorder.Item>
  );
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
