import { GRID_SIZE, type BoardState, type Cell, type Piece } from './types';
import { cellsOfRect } from './shapes';

export function emptyBoard(): BoardState {
  return { pieces: [], nextId: 1 };
}

export function cloneBoard(board: BoardState): BoardState {
  return {
    nextId: board.nextId,
    pieces: board.pieces.map((p) => normalizePiece(p)),
  };
}

/** Ensure color is always a finite index (missing → 0 only as last resort). */
export function normalizePiece(p: Piece): Piece {
  const color =
    typeof p.color === 'number' && Number.isFinite(p.color) ? p.color : 0;
  const value = Number.isFinite(p.value) ? Math.max(1, Math.round(p.value)) : 1;
  return { ...p, color, value };
}

/** How many unit cells of this rect still sit on the 8×8. */
export function countOnBoardCells(
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  let n = 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.ceil(x + w - 1e-9);
  const y1 = Math.ceil(y + h - 1e-9);
  for (let cy = y0; cy < y1; cy++) {
    for (let cx = x0; cx < x1; cx++) {
      if (!inBounds(cx, cy)) continue;
      if (cx + 1 > x && cx < x + w && cy + 1 > y && cy < y + h) n++;
    }
  }
  return n;
}

export function pieceCells(p: Piece): Cell[] {
  return cellsOfRect(p.x, p.y, p.w, p.h);
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE;
}

export function rectInBounds(x: number, y: number, w: number, h: number): boolean {
  return x >= 0 && y >= 0 && x + w <= GRID_SIZE && y + h <= GRID_SIZE;
}

/**
 * Keep only the part of a rect that lies on the 8×8 board.
 * Returns null if fully outside (caller should remove the piece).
 * Value = remaining cell count (N occupies N).
 * e.g. 1×2 half off edge → 1×1 value 1.
 */
export function clipRectToBoard(
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number; value: number } | null {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.max(1, Math.round(w));
  const ih = Math.max(1, Math.round(h));
  const x0 = Math.max(0, ix);
  const y0 = Math.max(0, iy);
  const x1 = Math.min(GRID_SIZE, ix + iw);
  const y1 = Math.min(GRID_SIZE, iy + ih);
  const nw = x1 - x0;
  const nh = y1 - y0;
  if (nw <= 0 || nh <= 0) return null;
  return { x: x0, y: y0, w: nw, h: nh, value: nw * nh };
}

/** Visual clip: keep float geometry, integer remaining-cell value. */
export function clipVisualToBoard(
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number; value: number } | null {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(GRID_SIZE, x + w);
  const y1 = Math.min(GRID_SIZE, y + h);
  const nw = x1 - x0;
  const nh = y1 - y0;
  if (nw <= 1e-6 || nh <= 1e-6) return null;
  return {
    x: x0,
    y: y0,
    w: nw,
    h: nh,
    value: Math.max(1, countOnBoardCells(x, y, w, h)),
  };
}

/** Clip / drop every piece that sits off the 8×8. */
export function settleBoardPieces(board: BoardState): void {
  for (const p of [...board.pieces]) {
    if (rectInBounds(p.x, p.y, p.w, p.h)) continue;
    const clipped = clipPieceToBoard(p);
    if (!clipped) removePiece(board, p.id);
    else upsertPiece(board, clipped);
  }
}

/** Clip a piece to the board; null if fully off. Color is never changed. */
export function clipPieceToBoard(p: Piece): Piece | null {
  const c = clipRectToBoard(p.x, p.y, p.w, p.h);
  if (!c) return null;
  const color =
    typeof p.color === 'number' && Number.isFinite(p.color) ? p.color : 0;
  return {
    id: p.id,
    value: c.value,
    color, // same palette as before clip (green stays green)
    x: c.x,
    y: c.y,
    w: c.w,
    h: c.h,
  };
}

/** Occupancy: cell key → piece id */
export function buildOccupancy(board: BoardState, ignoreIds: Set<number> = new Set()): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of board.pieces) {
    if (ignoreIds.has(p.id)) continue;
    for (const c of pieceCells(p)) {
      map.set(`${c.x},${c.y}`, p.id);
    }
  }
  return map;
}

export function getPiece(board: BoardState, id: number): Piece | undefined {
  return board.pieces.find((p) => p.id === id);
}

export function removePiece(board: BoardState, id: number): void {
  board.pieces = board.pieces.filter((p) => p.id !== id);
}

export function upsertPiece(board: BoardState, piece: Piece): void {
  piece = normalizePiece(piece);
  const i = board.pieces.findIndex((p) => p.id === piece.id);
  if (i >= 0) board.pieces[i] = piece;
  else board.pieces.push(piece);
}

export function allocId(board: BoardState): number {
  return board.nextId++;
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Footprints share a cell or 4-adjacent edge. */
export function footprintsContact(a: Cell[], b: Cell[]): boolean {
  const bset = new Set(b.map((c) => cellKey(c.x, c.y)));
  for (const c of a) {
    if (bset.has(cellKey(c.x, c.y))) return true;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (bset.has(cellKey(c.x + dx, c.y + dy))) return true;
    }
  }
  return false;
}

export function pieceCenter(p: Piece): { x: number; y: number } {
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
}

/** Total occupied cells (value = area). Full board ⇒ 64. */
export function boardArea(board: BoardState): number {
  let n = 0;
  for (const p of board.pieces) {
    n += countOnBoardCells(p.x, p.y, p.w, p.h);
  }
  return n;
}

export function emptyCellCount(board: BoardState): number {
  return GRID_SIZE * GRID_SIZE - boardArea(board);
}

/** Stable state invariant: no empty cells. */
export function isBoardFull(board: BoardState): boolean {
  return boardArea(board) === GRID_SIZE * GRID_SIZE;
}

/** Can place rectangle without overlap (ignore ids). */
export function canPlaceRect(
  board: BoardState,
  x: number,
  y: number,
  w: number,
  h: number,
  ignoreIds: Set<number> = new Set(),
): boolean {
  if (!rectInBounds(x, y, w, h)) return false;
  const occ = buildOccupancy(board, ignoreIds);
  for (const c of cellsOfRect(x, y, w, h)) {
    if (occ.has(cellKey(c.x, c.y))) return false;
  }
  return true;
}
