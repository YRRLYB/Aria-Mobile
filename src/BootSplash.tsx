import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { H01, P } from "./motion";
import bootLogo from "../assets/icon-only.png";

// Cold-start splash built on Motion Prompt #129 "Text scramble": random
// glyphs shuffle, then lock into "ARIA" from left to right with the kit's
// yellow→white settle, and the bars under each slot track the lock progress.
// Afterwards the letters hand off to the Aria logo. Timing/easing values are
// the reference implementation's; only text, colours and assets are Aria's.

const WORD = "ARIA";
const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&@?";
/** Swap cadence: 76 swaps per 4.7 s cycle ≈ every 0.062 s. */
const SWAP_EVERY = 4.7 / 76;
/** Slot i locks at 0.45 + 0.18·i (spec). */
const lockAt = (index: number) => 0.45 + index * 0.18;
/** Locked letters hand off to the logo here (spec's un-scramble point). */
const HANDOFF = 1.85;
const EXIT_STAGGER = 0.08;
const EXIT_SPAN = 0.32;
/** Logo enters after the last letter has left (letters exit right→left). */
const LOGO_IN = HANDOFF + 0.5;
const FADE_OUT = LOGO_IN + 1.35;

/** Rounded rect without ctx.roundRect (older Android WebViews lack it). */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Palette follows the app's own design language (ink on the light shell
// gradient, amber as the single accent) instead of the kit's dark stage.
const SPLASH_BG = "linear-gradient(170deg, #f7f8fb 0%, #eef1fa 60%, #f4eef8 100%)";
const COLOR_INK = "#171717";
const COLOR_PENDING = "#9ca3af";
const COLOR_ACCENT = "#f59e0b";
const COLOR_BAR_IDLE = "#dcdfea";

type Phase = "scramble" | "logo" | "fade";

export function BootSplash() {
  const [phase, setPhase] = useState<Phase>("scramble");
  const [gone, setGone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<Phase>("scramble");
  const startRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (phase === "fade") {
      const timer = window.setTimeout(() => setGone(true), 480);
      return () => window.clearTimeout(timer);
    }
    if (phase === "logo") {
      const timer = window.setTimeout(() => setPhase("fade"), (FADE_OUT - LOGO_IN) * 1000);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setPhase("logo"), HANDOFF * 1000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Tap anywhere skips straight to the fade-out.
  useEffect(() => {
    if (phase === "fade") return;
    const skip = () => setPhase("fade");
    window.addEventListener("pointerdown", skip, { once: true });
    return () => window.removeEventListener("pointerdown", skip);
  }, [phase]);

  useEffect(() => {
    if (phase !== "scramble" && phase !== "logo") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.scale(dpr, dpr);

    // Geometry mirrors the reference card: 92 px letters on a 539 px stage.
    const scale = cssWidth / 539;
    const font = `700 ${92 * scale}px Menlo, "SF Mono", ui-monospace, monospace`;
    const N = WORD.length;
    let raf = 0;
    // One absolute timeline across phase switches, so the letter exit that
    // plays during the logo phase keeps its original clock.
    if (!startRef.current) startRef.current = performance.now();

    const draw = (now: number) => {
      const t = (now - startRef.current) / 1000;
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cw = ctx.measureText("M").width + 16 * scale;
      const x0 = cssWidth / 2 - (cw * (N - 1)) / 2;
      const y = cssHeight / 2 - 8 * scale;
      const step = Math.floor(t / SWAP_EVERY);
      for (let i = 0; i < N; i++) {
        const exitStart = HANDOFF + (N - 1 - i) * EXIT_STAGGER;
        const exitP = P(t, exitStart, exitStart + EXIT_SPAN);
        const gone = exitP >= 1;
        const tl = lockAt(i);
        const locked = t >= tl;
        const age = t - tl;
        let glyph: string | undefined;
        let color = "";
        let alpha = 1;
        let glyphScale = 1;
        if (locked && !gone) {
          glyph = WORD[i];
          color = age < 0.22 ? COLOR_ACCENT : COLOR_INK;
          glyphScale = 1 + 0.2 * Math.exp(-age * 14);
        } else if (!gone) {
          glyph = GLYPHS[Math.floor(H01(step * 131 + i * 977) * GLYPHS.length)];
          color = COLOR_PENDING;
          alpha = 0.75;
        }
        if (!gone && glyph) {
          ctx.save();
          ctx.translate(x0 + i * cw, y);
          ctx.scale(glyphScale, glyphScale);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = color;
          ctx.fillText(glyph, 0, 0);
          ctx.restore();
        }
        // Slot bar: ink when locked, amber for the next one to lock, light
        // neutral otherwise — and it leaves with its letter.
        if (!gone) {
          const next = !locked && t < tl && (i === 0 || t >= lockAt(i - 1));
          ctx.globalAlpha = 1 - exitP;
          ctx.fillStyle = locked ? COLOR_INK : next ? COLOR_ACCENT : COLOR_BAR_IDLE;
          roundRectPath(ctx, x0 + i * cw - cw / 2 + 8 * scale, y + 58 * scale, cw - 16 * scale, 8 * scale, 4 * scale);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      if (phaseRef.current === "scramble" || phaseRef.current === "logo") {
        raf = window.requestAnimationFrame(draw);
      }
    };
    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, [phase]);

  if (gone) return null;
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === "fade" ? 0 : 1 }}
      transition={{ duration: 0.45, ease: "easeInOut" }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8"
      style={{ background: SPLASH_BG }}
      data-testid="boot-splash"
      aria-hidden={phase === "fade"}
    >
      <div className="relative flex w-full items-center justify-center">
        <canvas
          ref={canvasRef}
          className="h-auto w-full max-w-[440px]"
          style={{ aspectRatio: "539 / 208", visibility: phase === "scramble" || phase === "logo" ? "visible" : "hidden" }}
        />
      </div>
      {phase !== "scramble" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: LOGO_IN - HANDOFF, duration: 0.5, ease: [0.34, 1.4, 0.64, 1] }}
          className="absolute flex flex-col items-center gap-5"
        >
          <img src={bootLogo} alt="" className="size-28 rounded-full shadow-[0_18px_60px_rgba(23,23,23,0.18)] ring-1 ring-black/10" draggable={false} />
          <div className="text-center">
            <p className="text-lg font-semibold tracking-[0.3em] text-neutral-950">ARIA</p>
            <p className="mt-1 text-[11px] font-medium tracking-[0.2em] text-neutral-400">MOBILE</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
