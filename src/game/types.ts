/** Grid is 8×8; cell origin top-left. */

export const GRID_SIZE = 8;

export type Cell = { x: number; y: number };

export type Orientation = 'h' | 'v';

export type Piece = {
  id: number;
  value: number;
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
