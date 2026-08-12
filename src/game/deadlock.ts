/**
 * Liveness / deadlock checks.
 *
 * Design (perf budget after merge):
 * - **isPlayable** — O(pieces × grid) or pair contact only; used during spawn & merge scoring
 * - **isDeadlock** — expensive full merge simulation; **only** when declaring game over
 *
 * Never call isDeadlock from inside tryMerge or per-spawn-cell loops.
 */
import { getPiece, pieceCells, footprintsContact, cloneBoard, pieceCenter } from './board';
import { hasAnyMove } from './move';
import { tryMerge, trendFromCenters } from './merge';
import { canMergeByShape } from './shapes';
import type { BoardState, Piece } from './types';

/** Same-value pair that *might* merge (contact/overlap, shape ok) — no simulation. */
export function hasPotentialMerge(board: BoardState): boolean {
  const pieces = board.pieces;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const A = pieces[i]!;
      const B = pieces[j]!;
      if (A.value !== B.value) continue;
      if (!canMergeByShape(A, B)) continue;
      if (footprintsContact(pieceCells(A), pieceCells(B))) return true;
    }
  }
  return false;
}

export function hasLegalMove(board: BoardState): boolean {
  for (const p of board.pieces) {
    if (hasAnyMove(board, p.id)) return true;
  }
  return false;
}

/**
 * Cheap “player can still act” check for mid-pipeline decisions.
 * True if any move OR any same-value contacting pair (potential merge).
 */
export function isPlayable(board: BoardState): boolean {
  if (board.pieces.length === 0) return true;
  if (hasPotentialMerge(board)) return true;
  if (hasLegalMove(board)) return true;
  return false;
}

/**
 * Full legal merge simulation (expensive).
 * Prefer isPlayable for heuristics; use this only for game-over confirmation.
 */
export function hasLegalMerge(board: BoardState): boolean {
  const pieces = board.pieces;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = 0; j < pieces.length; j++) {
      if (i === j) continue;
      const A = pieces[i]!;
      const B = pieces[j]!;
      if (A.value !== B.value) continue;
      if (!canMergeByShape(A, B)) continue;
      if (!footprintsContact(pieceCells(A), pieceCells(B))) continue;
      const base = trendFromCenters(pieceCenter(A), pieceCenter(B));
      const trends = [
        base,
        { ...base, orient: 'h' as const, dirX: 1 as const, dirY: 0 as const, dx: 1, dy: 0 },
        { ...base, orient: 'v' as const, dirX: 0 as const, dirY: 1 as const, dx: 0, dy: 1 },
        { ...base, orient: 'h' as const, dirX: -1 as const, dirY: 0 as const, dx: -1, dy: 0 },
        { ...base, orient: 'v' as const, dirX: 0 as const, dirY: -1 as const, dx: 0, dy: -1 },
      ];
      for (const trend of trends) {
        const r = tryMerge(cloneBoard(board), A.id, B.id, trend);
        if (r.ok) return true;
      }
    }
  }
  return false;
}

/**
 * True game-over: no legal move and no successful merge simulation.
 * Call sparingly (end of settle / after failed relief spawn).
 */
export function isDeadlock(board: BoardState): boolean {
  if (board.pieces.length === 0) return false;
  // Fast path: still can move or has contact pair → almost never terminal
  if (hasLegalMove(board)) return false;
  if (hasPotentialMerge(board)) {
    // Contact exists — confirm at least one merge really works
    return !hasLegalMerge(board);
  }
  return true;
}

export function pieceById(board: BoardState, id: number): Piece | undefined {
  return getPiece(board, id);
}
