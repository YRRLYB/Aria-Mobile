import { useEffect, useRef, useState } from "react";
import { cachedCoverUrl } from "./coverCache";

// Apple-Watch-Kaleidoscope-style album artwork: the cover is redrawn once as
// a 12-fold mirrored mandala and (optionally) revolved with a GPU-only CSS
// rotation, so small cards stay cheap on mid-range Android WebViews. The
// plain cover tile underneath stays visible until the mandala is drawn.

const SEGMENTS = 12;
/** Internal square resolution (CSS pixels) the mandala is rendered at. */
const RENDER_SIZE = 420;
/** Where in the source image the kaleidoscope samples: a centered crop. */
const SAMPLE_ZOOM = 1.85;

export function KaleidoscopeCover({ src, spin = true, className }: { src?: string; spin?: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    void cachedCoverUrl(src)
      .catch(() => undefined)
      .then((url) => {
        if (cancelled) return;
        image.src = url || src;
      });
    image.onload = () => {
      if (cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(RENDER_SIZE * dpr);
      canvas.height = Math.round(RENDER_SIZE * dpr);
      const c = ctx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);
      const center = RENDER_SIZE / 2;
      const radius = center * 1.42;
      const halfWedge = Math.PI / SEGMENTS;
      const side = RENDER_SIZE * SAMPLE_ZOOM;
      // A deterministic nudge per artwork so cards do not all look alike.
      let hash = 0;
      for (let i = 0; i < src.length; i += 1) hash = (hash * 31 + src.charCodeAt(i)) % 9973;
      const ox = ((hash % 7) - 3) * RENDER_SIZE * 0.02;
      const oy = ((hash % 5) - 2) * RENDER_SIZE * 0.02;
      for (let i = 0; i < SEGMENTS; i += 1) {
        c.save();
        c.translate(center, center);
        c.rotate((i * 2 * Math.PI) / SEGMENTS);
        if (i % 2 === 1) c.scale(1, -1);
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, radius, -halfWedge, halfWedge);
        c.closePath();
        c.clip();
        c.drawImage(image, ox - side / 2, oy - side / 2, side, side);
        c.restore();
      }
      setReady(true);
    };
    return () => {
      cancelled = true;
    };
  }, [src]);

  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`${className ?? ""} transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"} ${
        spin && !reduced ? "aria-kaleido-spin" : ""
      }`}
    />
  );
}
