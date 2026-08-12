/** Grid is 8×8; cell origin top-left. */

export const GRID_SIZE = 8;

/** Max unlocked colors in a run (1 → … → 5). */
export const MAX_COLORS = 5;

export type Cell = { x: number; y: number };

export type Orientation = 'h' | 'v';

/**
 * color: 0-based index into unlocked palette (0 .. unlockedColors-1).
 * Same color + same value may merge; different colors never merge.
 * Push compares volume only.
 */
export type Piece = {
  id: number;
  value: number;
  color: number;
  /** Top-left cell of axis-aligned rectangle */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type BoardState = {
  pieces: Piece[];
  nextId: number;
};

export type DragTrend = {
  dx: number;
  dy: number;
  orient: Orientation;
  /** Unit step along growth: (-1,0)|(1,0)|(0,-1)|(0,1) */
  dirX: number;
  dirY: number;
};
