import type { Rect } from './plan';

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** ease-out cubic */
export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

/** ease-in-out cubic — smooth whole-clip motion without per-cell stops */
export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpRect(from: Rect, to: Rect, t: number): Rect {
  const e = clamp01(t);
  return {
    x: lerp(from.x, to.x, e),
    y: lerp(from.y, to.y, e),
    w: lerp(from.w, to.w, e),
    h: lerp(from.h, to.h, e),
  };
}

/** Soft spring-ish ease for drag drop (slight overshoot feel without full spring solver). */
export function easeOutBack(t: number): number {
  const c = 1.2;
  const u = clamp01(t) - 1;
  return 1 + c * u * u * u + u * u;
}
