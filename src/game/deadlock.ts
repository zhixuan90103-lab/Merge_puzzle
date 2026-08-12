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
import { canMergePair } from './shapes';
import type { BoardState, Piece } from './types';

/** Same color+value pair that *might* merge (contact/overlap, shape ok) — no simulation. */
export function hasPotentialMerge(board: BoardState): boolean {
  const pieces = board.pieces;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const A = pieces[i]!;
      const B = pieces[j]!;
      if (!canMergePair(A, B)) continue;
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
      if (!canMergePair(A, B)) continue;
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

/**
 * Spawn safety: board is ok if player can **move**, or if every obvious contact-merge
 * still leaves a playable board (avoid “spawn pair → only merge → instant death”).
 * Cap simulations for frame budget.
 */
export function hasSustainablePlay(board: BoardState): boolean {
  if (board.pieces.length === 0) return true;
  if (!isPlayable(board)) return false;
  // Can rearrange without merging → not forced into a death merge
  if (hasLegalMove(board)) return true;

  // Only contact merges available — at least one must leave playable aftermath
  const pieces = board.pieces;
  let checked = 0;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = 0; j < pieces.length; j++) {
      if (i === j) continue;
      const A = pieces[i]!;
      const B = pieces[j]!;
      if (!canMergePair(A, B)) continue;
      if (!footprintsContact(pieceCells(A), pieceCells(B))) continue;
      if (++checked > 8) return false;
      const trend = trendFromCenters(pieceCenter(A), pieceCenter(B));
      const r = tryMerge(cloneBoard(board), A.id, B.id, trend);
      if (r.ok && isPlayable(r.board)) return true;
      // try one alternate direction
      const alt = {
        ...trend,
        dirX: -trend.dirX as -1 | 0 | 1,
        dirY: -trend.dirY as -1 | 0 | 1,
        dx: -trend.dx,
        dy: -trend.dy,
      };
      const r2 = tryMerge(cloneBoard(board), A.id, B.id, alt);
      if (r2.ok && isPlayable(r2.board)) return true;
    }
  }
  return false;
}

export function pieceById(board: BoardState, id: number): Piece | undefined {
  return getPiece(board, id);
}
