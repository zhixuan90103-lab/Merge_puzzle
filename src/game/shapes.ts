import { GRID_SIZE, type Orientation, type Piece } from './types';

/**
 * Axis of a piece on the board.
 * - s: square (1×1, 2×2, …) — can merge with h or v of same value
 * - h / v: strip — only same axis may merge (e.g. 横2 只能合 横2)
 */
export type ShapeAxis = 'h' | 'v' | 's';

export function shapeAxis(p: Pick<Piece, 'w' | 'h'>): ShapeAxis {
  if (p.w === p.h) return 's';
  return p.w > p.h ? 'h' : 'v';
}

/** Same value only; strips must share axis; square is free. (No color check.) */
export function canMergeByShape(a: Pick<Piece, 'w' | 'h' | 'value'>, b: Pick<Piece, 'w' | 'h' | 'value'>): boolean {
  if (a.value !== b.value) return false;
  const oa = shapeAxis(a);
  const ob = shapeAxis(b);
  if (oa === 's' || ob === 's') return true;
  return oa === ob;
}

/** Full merge gate: same color + same value + shape/axis. */
export function canMergePair(
  a: Pick<Piece, 'w' | 'h' | 'value' | 'color'>,
  b: Pick<Piece, 'w' | 'h' | 'value' | 'color'>,
): boolean {
  if (a.color !== b.color) return false;
  return canMergeByShape(a, b);
}

/**
 * All axis-aligned rectangles with area === value that fit on the grid.
 * e.g. 4 → 1×4, 2×2, 4×1；16 → 1×16(no), 2×8, 4×4, 8×2, …
 * Player placement (A∪B solid union) picks which one — not a fixed “next shape”.
 */
export function allRectsForValue(value: number): { w: number; h: number }[] {
  if (value <= 0 || value > GRID_SIZE * GRID_SIZE) return [];
  const list: { w: number; h: number }[] = [];
  for (let w = 1; w <= GRID_SIZE; w++) {
    if (value % w !== 0) continue;
    const h = value / w;
    if (h < 1 || h > GRID_SIZE || !Number.isInteger(h)) continue;
    list.push({ w, h });
  }
  return list;
}

/**
 * Default size for spawn/deal (orient prefers long axis).
 * Merge paths should use sizeCandidates / solid union, not only this.
 */
export function sizeForValue(value: number, orient: Orientation): { w: number; h: number } {
  const all = allRectsForValue(value);
  if (all.length === 0) {
    throw new Error(`unsupported value ${value}`);
  }
  // Prefer strip along orient, else nearest to square
  const scored = all.map((s) => {
    let sc = 0;
    if (orient === 'h') sc += s.w >= s.h ? 10 : 0;
    else sc += s.h >= s.w ? 10 : 0;
    // mild preference for more “classic” mid aspect
    sc -= Math.abs(s.w - s.h) * 0.1;
    return { s, sc };
  });
  scored.sort((a, b) => b.sc - a.sc);
  return scored[0]!.s;
}

/**
 * Merge shape options for 2V: every w×h = value on the board.
 * `orient` only reorders preference (spawn/intent), does not lock shape.
 */
export function sizeCandidates(value: number, orient: Orientation): { w: number; h: number }[] {
  const all = allRectsForValue(value);
  const key = (s: { w: number; h: number }) => `${s.w}x${s.h}`;
  const seen = new Set<string>();
  const ordered: { w: number; h: number }[] = [];

  const prefer = (pred: (s: { w: number; h: number }) => boolean) => {
    for (const s of all) {
      if (!pred(s)) continue;
      const k = key(s);
      if (seen.has(k)) continue;
      seen.add(k);
      ordered.push(s);
    }
  };

  // Orient first: long in that axis
  if (orient === 'h') prefer((s) => s.w >= s.h);
  else prefer((s) => s.h >= s.w);
  prefer(() => true);

  return ordered;
}

export function cellsOfRect(x: number, y: number, w: number, h: number): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      cells.push({ x: x + i, y: y + j });
    }
  }
  return cells;
}

/** Hue per color index (max 5). Value lifts lightness. */
const COLOR_HUES = [210, 145, 32, 300, 0];

/** Fill by palette color + value tier (not value-only). */
export function pieceFillColor(color: number, value: number): string {
  const hue = COLOR_HUES[((color % COLOR_HUES.length) + COLOR_HUES.length) % COLOR_HUES.length]!;
  const tier = Math.max(0, Math.min(6, Math.log2(Math.max(1, value))));
  const sat = 58 + tier * 4;
  const light = 38 + tier * 5;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

/** @deprecated use pieceFillColor — kept for single-color debug */
export function valueColor(value: number): string {
  return pieceFillColor(0, value);
}
