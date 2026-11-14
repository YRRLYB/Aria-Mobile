import { useEffect, useRef, useState } from "react";
import { Heart, HeartFill } from "./icons";
import { G, HEART_OUTLINE_PATH, P, eOut } from "./motion";

// Motion Prompt #125 "Pulse", recreated for the like button: the heart
// throbs like a heartbeat ("lub-dub") and two heart-shaped rings spread out.
// All shapes/timing/easing values follow the reference implementation; only
// the colour is adapted to Aria's rose "liked" accent.

/** Beat period of the reference loop: 4 beats per 4.7 s. */
const BEAT = 4.7 / 4;
/** Ring layout: [start time, opacity strength] — straight from the spec. */
const RINGS: Array<[number, number]> = [
  [0.16, 1],
  [0.4, 0.6],
];
/** Total animation length: rings finish at 0.4 + 0.8 s, the scale settles before that. */
const DURATION = 1.25;

type PulsePhase = {
  /** Scale of the filled heart at time t. */
  scale: number;
  /** Per-ring state at time t. */
  rings: Array<{ scale: number; opacity: number; lineWidth: number }>;
};

function pulseAt(t: number): PulsePhase | null {
  if (t < 0 || t >= DURATION) return null;
  // Scale = 1 + 0.26·G(0.2, 0.065) + 0.15·G(0.44, 0.07) + the wrapped "lub"
  // of the next beat (identical to the reference loop formula).
  const scale =
    1 +
    0.26 * G(t, 0.2, 0.065) +
    0.15 * G(t, 0.44, 0.07) +
    0.26 * Math.exp(-Math.pow((t - BEAT - 0.2) / 0.065, 2));
  const rings = RINGS.map(([start, strength]) => {
    const q = P(t, start, start + 0.8);
    const active = q > 0 && q < 1;
    const spread = 1.2 + 1.2 * eOut(Math.max(0, Math.min(1, q)));
    return {
      scale: active ? spread : 0,
      opacity: active ? (1 - q) * 0.75 * strength : 0,
      lineWidth: (7 * (1 - q) + 1.5) / spread,
    };
  });
  return { scale, rings };
}

export function LikeHeart({
  liked,
  onToggle,
  disabled,
  iconPx,
  buttonClass,
  iconClass,
  inactiveIconClass = "text-neutral-400",
  activeLabel,
  inactiveLabel,
}: {
  liked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Rendered icon width in px; rings hug this size. */
  iconPx: number;
  /** Button box classes, e.g. "size-8" or "size-11". */
  buttonClass: string;
  /** Icon classes, e.g. "size-4" or "size-6". */
  iconClass: string;
  /** Inactive heart colour; the liked heart is always rose. */
  inactiveIconClass?: string;
  activeLabel: string;
  inactiveLabel: string;
}) {
  const [runId, setRunId] = useState(0);
  const prevLiked = useRef(liked);
  const iconRef = useRef<HTMLSpanElement | null>(null);
  const ringRefs = useRef<Array<SVGGElement | null>>([]);
  useEffect(() => {
    if (liked && !prevLiked.current) setRunId((value) => value + 1);
    prevLiked.current = liked;
  }, [liked]);

  // Drive the whole pulse from one rAF timeline so the lub-dub Gaussian
  // scale and the spreading rings stay exactly on the reference curve.
  useEffect(() => {
    if (!runId || !liked) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const phase = pulseAt(t);
      if (!phase) {
        if (iconRef.current) iconRef.current.style.transform = "";
        return;
      }
      if (iconRef.current) iconRef.current.style.transform = `scale(${phase.scale})`;
      phase.rings.forEach((ring, index) => {
        const node = ringRefs.current[index];
        if (!node) return;
        if (ring.opacity <= 0) {
          node.style.opacity = "0";
          return;
        }
        node.style.opacity = String(ring.opacity);
        node.setAttribute("transform", `scale(${ring.scale})`);
        node.setAttribute("stroke-width", String(ring.lineWidth));
      });
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [runId, liked]);

  const ringBox = iconPx * 0.92;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`tap-scale relative flex shrink-0 items-center justify-center rounded-full disabled:opacity-40 ${buttonClass}`}
      aria-label={liked ? activeLabel : inactiveLabel}
    >
      {/* Rings live in the kit's 44-unit heart space; the svg box is sized to
          the icon so scale 1.2 starts just outside the glyph and 2.4 spreads
          past the button. */}
      <svg
        viewBox="-85 -62 170 110"
        width={ringBox}
        height={ringBox}
        className="pointer-events-none absolute overflow-visible"
        aria-hidden="true"
      >
        {RINGS.map(([start], index) => (
          <g key={`${runId}-${start}`} ref={(node) => { ringRefs.current[index] = node; }} opacity="0">
            <path d={HEART_OUTLINE_PATH} fill="none" stroke="#f43f5e" strokeLinecap="round" />
          </g>
        ))}
      </svg>
      <span ref={iconRef} className="flex items-center justify-center will-change-transform">
        {liked
          ? <HeartFill className={`${iconClass} text-rose-500`} />
          : <Heart className={`${iconClass} ${inactiveIconClass}`} />}
      </span>
    </button>
  );
}
