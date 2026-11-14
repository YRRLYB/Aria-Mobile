import { useEffect, useRef } from "react";
import { cachedCoverUrl } from "./coverCache";

// Apple-Watch-Kaleidoscope-style ambient layer for the now-playing screen:
// the album artwork is cut into rotationally symmetric mirrored wedges that
// slowly revolve while the music plays. Rendered on a throttled canvas so a
// mid-range Android WebView stays cool; frozen when paused or backgrounded.

const SEGMENTS = 8;
/** Seconds for one full revolution while playing. */
const REVOLUTION = 60;
/** Gentle scale breathing period. */
const BREATH = 12;
const FRAME_MS = 1000 / 30;

export function Kaleidoscope({ src, playing, className }: { src?: string; playing: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const playingRef = useRef(playing);
  const angleRef = useRef(0);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    if (!src) {
      imageRef.current = null;
      return;
    }
    let mounted = true;
    const image = new Image();
    image.crossOrigin = "anonymous";
    void cachedCoverUrl(src).then((url) => {
      if (!mounted) return;
      image.src = url || src;
    });
    image.onload = () => {
      if (mounted) imageRef.current = image;
    };
    return () => {
      mounted = false;
      imageRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let lastFrame = 0;
    let lastTime = performance.now();
    let raf = 0;

    const resize = () => {
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (now: number) => {
      raf = window.requestAnimationFrame(draw);
      const image = imageRef.current;
      if (!image || document.hidden) {
        lastTime = now;
        return;
      }
      if (now - lastFrame < FRAME_MS) return;
      const delta = (now - lastTime) / 1000;
      lastFrame = now;
      lastTime = now;
      if (playingRef.current) angleRef.current += (delta * 2 * Math.PI) / REVOLUTION;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      const radius = Math.hypot(w, h) / 2 + 2;
      const breathe = 1 + 0.05 * Math.sin((2 * Math.PI * now) / 1000 / BREATH);
      // Sample window: oversized square of the artwork so each wedge sees an
      // interesting crop; a slow orbit makes the pattern keep morphing.
      const side = radius * 1.5 * breathe;
      const orbit = radius * 0.1;
      const ox = Math.cos(angleRef.current * 0.6) * orbit;
      const oy = Math.sin(angleRef.current * 0.4) * orbit;
      const halfWedge = Math.PI / SEGMENTS;

      for (let i = 0; i < SEGMENTS; i++) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(angleRef.current + i * ((2 * Math.PI) / SEGMENTS));
        if (i % 2 === 1) ctx.scale(1, -1);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, -halfWedge, halfWedge);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(image, ox - side / 2, oy - side / 2, side, side);
        ctx.restore();
      }
      ctx.restore();
    };
    raf = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
