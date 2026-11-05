import { Home, Library, Pause, Play, Search, Settings, SkipBack, SkipForward } from "./icons";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { idleTrack } from "@/lib/trackMappers";
import type { MobileControls, TabId } from "./MobileApp";
import { cachedCoverUrl } from "./coverCache";

const tabs: Array<{ id: TabId; label: string; Icon: typeof Home }> = [
  { id: "home", label: "首页", Icon: Home },
  { id: "library", label: "音乐库", Icon: Library },
  { id: "search", label: "搜索", Icon: Search },
  { id: "settings", label: "设置", Icon: Settings },
];

export function TabBar({ activeTab, onSelect }: { activeTab: TabId; onSelect: (tab: TabId) => void }) {
  return (
    <nav className="tab-bar safe-bottom z-20 flex shrink-0 items-stretch justify-around border-t border-white/70 bg-white/80 pt-1.5 backdrop-blur-xl">
      {tabs.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className="tap-scale flex min-w-16 flex-col items-center gap-0.5 px-3 pb-1.5 pt-0.5"
            aria-label={label}
            aria-current={active ? "page" : undefined}
          >
            <Icon className={active ? "size-5 text-neutral-950" : "size-5 text-neutral-400"} />
            <span className={active ? "text-[10px] font-semibold text-neutral-950" : "text-[10px] text-neutral-400"}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function MiniPlayer(controls: MobileControls) {
  const { activeTrack, playing, togglePlayback, playPrevious, playNext, openNowPlaying } = controls;
  if (activeTrack.id === idleTrack.id) return null;
  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="z-20 mx-3 mb-2 flex shrink-0 items-center gap-3 overflow-hidden rounded-[1.1rem] border border-white/80 bg-white/85 p-2 text-left shadow-[0_10px_36px_rgba(47,55,76,0.16)] backdrop-blur-xl"
      data-testid="mini-player"
    >
      <button type="button" onClick={openNowPlaying} aria-label="打开播放页" className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <TrackCover track={activeTrack} priority className="size-11 shrink-0 rounded-[0.7rem]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{activeTrack.title}</p>
        <p className="mt-0.5 truncate text-xs text-neutral-500">{activeTrack.artist}</p>
      </div>
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          playPrevious();
        }}
        className="tap-scale flex size-9 items-center justify-center rounded-full bg-neutral-950/[0.05] text-neutral-700"
        aria-label="上一首"
      >
        <SkipBack className="size-4" />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          togglePlayback();
        }}
        className="tap-scale flex size-9 items-center justify-center rounded-full bg-neutral-950 text-white"
        aria-label={playing ? "暂停" : "播放"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-[1px]" />}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          playNext();
        }}
        className="tap-scale flex size-9 items-center justify-center rounded-full bg-neutral-950/[0.05] text-neutral-700"
        aria-label="下一首"
      >
        <SkipForward className="size-4" />
      </button>
    </motion.div>
  );
}

export function TrackCover({
  track,
  className = "",
  priority = false,
}: {
  track: { cover?: string; coverUrl?: string; title: string };
  className?: string;
  priority?: boolean;
}) {
  // Netease tracks carry a hex palette in `cover` and the real artwork in
  // `coverUrl`; local tracks put the server cover URL in `cover`.
  const src = [track.coverUrl, track.cover].find(
    (value) => value && /^(https?:|data:|content:)/.test(value),
  );
  const tint = track.cover && isHexTint(track.cover) ? track.cover : undefined;
  // The tile renders underneath the image so covers fade in over a letter
  // placeholder instead of popping in late on tab switches.
  return (
    <div className={`relative overflow-hidden ${className}`} aria-hidden="true">
      <div
        className={`absolute inset-0 flex items-center justify-center text-neutral-600 ${className}`}
        style={tint ? { background: `linear-gradient(140deg, ${tint}73, #ece7f2)` } : undefined}
      >
        <span className="text-lg font-bold opacity-70">{track.title.slice(0, 1) || "♪"}</span>
      </div>
      {src && <CoverImage key={src} src={src} priority={priority} />}
    </div>
  );
}

export function CoverCollage({
  tracks,
  className = "",
  priority = false,
}: {
  tracks: Array<{ id: string; cover?: string; coverUrl?: string; title: string }>;
  className?: string;
  priority?: boolean;
}) {
  const covers = tracks.slice(0, 4);
  if (!covers.length) return null;
  if (covers.length === 1) {
    return <TrackCover track={covers[0]} className={className} priority={priority} />;
  }
  return (
    <div className={`grid grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden bg-white/70 shadow-sm ${className}`}>
      {Array.from({ length: 4 }).map((_, index) => {
        const track = covers[index % covers.length];
        return (
          <TrackCover
            key={`${track.id}-${index}`}
            track={track}
            className="aspect-square w-full"
            priority={priority}
          />
        );
      })}
    </div>
  );
}

function CoverImage({ src, priority }: { src: string; priority: boolean }) {
  const holderRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(priority);
  const [resolved, setResolved] = useState(() => (/^https?:/i.test(src) ? "" : src));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (priority) {
      setVisible(true);
      return;
    }
    const element = holderRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
    let mounted = true;
    const remote = /^https?:/i.test(src);
    setResolved(remote ? "" : src);
    setFailed(false);
    if (!visible) return () => { mounted = false; };
    void cachedCoverUrl(src).then((next) => {
      if (mounted && next) setResolved(next);
    });
    return () => { mounted = false; };
  }, [src, visible, attempt]);

  useEffect(() => {
    if (!failed || attempt >= 2) return;
    const retry = () => {
      setAttempt((value) => value + 1);
      setFailed(false);
    };
    const timer = window.setTimeout(retry, (attempt + 1) * 1500);
    window.addEventListener("online", retry, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", retry);
    };
  }, [failed, attempt]);

  return (
    <span ref={holderRef} className="absolute inset-0">
      {visible && !failed && resolved && (
        <img
          key={`${resolved}-${attempt}`}
          src={resolved}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onError={() => {
            if (resolved !== src) setResolved(src);
            else setFailed(true);
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}

function isHexTint(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}
