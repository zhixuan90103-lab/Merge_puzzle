import { canPlaceRect, getPiece } from './board';
import type { BoardState } from './types';

export function tryMove(
  board: BoardState,
  pieceId: number,
  x: number,
  y: number,
): BoardState | null {
  const p = getPiece(board, pieceId);
  if (!p) return null;
  if (!canPlaceRect(board, x, y, p.w, p.h, new Set([pieceId]))) return null;
  const next = {
    nextId: board.nextId,
    pieces: board.pieces.map((q) => (q.id === pieceId ? { ...q, x, y } : { ...q })),
  };
  return next;
}

/** Any legal translation for piece (excluding stay). */
export function hasAnyMove(board: BoardState, pieceId: number): boolean {
  const p = getPiece(board, pieceId);
  if (!p) return false;
  for (let y = 0; y <= 8 - p.h; y++) {
    for (let x = 0; x <= 8 - p.w; x++) {
      if (x === p.x && y === p.y) continue;
      if (canPlaceRect(board, x, y, p.w, p.h, new Set([pieceId]))) return true;
    }
  }
  return false;
}
