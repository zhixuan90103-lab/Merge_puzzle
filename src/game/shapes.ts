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

/** Target w×h for value + orientation (N occupies N cells). */
export function sizeForValue(value: number, orient: Orientation): { w: number; h: number } {
  switch (value) {
    case 1:
      return { w: 1, h: 1 };
    case 2:
      return orient === 'h' ? { w: 2, h: 1 } : { w: 1, h: 2 };
    case 4:
      return { w: 2, h: 2 };
    case 8:
      return orient === 'h' ? { w: 4, h: 2 } : { w: 2, h: 4 };
    case 16:
      // Prefer square when either; use orient for strip variants
      if (orient === 'h') return { w: 8, h: 2 };
      return { w: 4, h: 4 }; // vertical drag → square 4×4 (also 2 eights stacked)
    case 32:
      return orient === 'h' ? { w: 8, h: 4 } : { w: 4, h: 8 };
    case 64:
      return { w: 8, h: 8 };
    default:
      // Fallback: fill as wide strip then wrap — keep in grid
      if (value <= 0 || value > GRID_SIZE * GRID_SIZE) {
        throw new Error(`unsupported value ${value}`);
      }
      if (orient === 'h') {
        const w = Math.min(GRID_SIZE, value);
        const h = Math.ceil(value / w);
        return { w, h };
      }
      const h = Math.min(GRID_SIZE, value);
      const w = Math.ceil(value / h);
      return { w, h };
  }
}

/** For value 16, also try alternate shapes when primary fails. */
export function sizeCandidates(value: number, orient: Orientation): { w: number; h: number }[] {
  const primary = sizeForValue(value, orient);
  const list = [primary];
  if (value === 16) {
    const alt = orient === 'h' ? { w: 4, h: 4 } : { w: 2, h: 8 };
    if (alt.w !== primary.w || alt.h !== primary.h) list.push(alt);
    list.push({ w: 8, h: 2 }, { w: 2, h: 8 }, { w: 4, h: 4 });
  }
  if (value === 8) {
    list.push(orient === 'h' ? { w: 2, h: 4 } : { w: 4, h: 2 });
  }
  // unique
  const key = (s: { w: number; h: number }) => `${s.w}x${s.h}`;
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = key(s);
    if (seen.has(k)) return false;
    if (s.w * s.h !== value && value !== 16) {
      // allow only exact cell count except we already force exact in sizeForValue
    }
    if (s.w * s.h !== value) return false;
    seen.add(k);
    return s.w <= GRID_SIZE && s.h <= GRID_SIZE;
  });
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
