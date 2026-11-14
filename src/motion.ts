// Shared helpers for the Motion Prompt recreations (#125 Pulse heart,
// #129 Text scramble boot). Numbers are kept identical to the reference kit
// (https://showheyohtaki.github.io/motion-prompt/, pack "motion2", MIT) —
// only colours and assets are adapted to Aria.

/** Clamp x into [0, 1]. */
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Normalized progress of t between a and b (the kit's P). */
export const P = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/** Cubic ease-out (the kit's eOut). */
export const eOut = (x: number) => 1 - Math.pow(1 - x, 3);

/** Gaussian bump centred at c with width s — the "G" of the pulse spec. */
export const G = (t: number, c: number, s: number) => Math.exp(-Math.pow((t - c) / s, 2));

/** Deterministic 0..1 hash from an integer, so scramble frames are stable (the kit's H01). */
export function H01(n: number): number {
  n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Palette lifted from the motion2 kit, adjusted where Aria has its own accent. */
export const MOTION_COLORS = {
  navy: "#0F1A3D",
  navy2: "#1B2A5E",
  navy3: "#2A3D80",
  blue: "#3B7BFF",
  coral: "#FF6B5C",
  yel: "#FFC83D",
  mint: "#2EDBA8",
} as const;

/**
 * Heart outline path in the kit's 44-unit space (heartPath with s = 44):
 * spans x ∈ [-77, 77], y ∈ [-52.8, 40.5]. Used by the pulse rings.
 */
export const HEART_OUTLINE_PATH =
  "M 0 40.48 C -77 -5.28 -37.4 -52.8 0 -18.48 C 37.4 -52.8 77 -5.28 0 40.48 Z";
