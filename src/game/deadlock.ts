/**
 * Liveness / deadlock checks.
 *
 * Design (perf budget after merge):
 * - **isPlayable** — has a merge that is not a forced one-move death
 * - **isDeadlock** — no legal merge, or every legal merge leaves no further play
 * - **isForcedLoss** — still has pairs, but every successful merge → terminal
 *
 * Never call isDeadlock from inside tryMerge or per-spawn-cell loops.
 */
import {
  boardArea,
  cloneBoard,
  getPiece,
  pieceCells,
  footprintsContact,
  pieceCenter,
} from './board';
import { tryMerge, trendFromCenters, trendFromApproachDelta } from './merge';
import { canMergePair } from './shapes';
import type { BoardState, Piece } from './types';
import { GRID_SIZE } from './types';

/** Overlap cell count of two axis-aligned rects. */
function rectOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

/**
 * Ghost seats for A that overlap B by ≥1 cell and stay on-board.
 * Used when pieces are not already in contact (player will drag A onto B).
 */
function ghostSeatsOnTarget(A: Piece, B: Piece): { x: number; y: number }[] {
  const seats: { x: number; y: number }[] = [];
  const x0 = Math.max(0, B.x - A.w + 1);
  const x1 = Math.min(GRID_SIZE - A.w, B.x + B.w - 1);
  const y0 = Math.max(0, B.y - A.h + 1);
  const y1 = Math.min(GRID_SIZE - A.h, B.y + B.h - 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (rectOverlap({ x, y, w: A.w, h: A.h }, B) >= 1) seats.push({ x, y });
    }
  }
  return seats;
}

/** Same color+value pair that *might* merge (shape ok) — no contact required. */
export function hasPotentialMerge(board: BoardState): boolean {
  const pieces = board.pieces;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      if (canMergePair(pieces[i]!, pieces[j]!)) return true;
    }
  }
  return false;
}

/**
 * @deprecated Free place disabled — always false. Kept for call-site compatibility.
 */
export function hasLegalMove(_board: BoardState): boolean {
  return false;
}

/**
 * Cheap liveness for tryMerge / spawn hot paths — **only** “has a merge pair”.
 * Does NOT run forced-loss search (would re-enter tryMerge).
 * Use {@link isSafeToContinue} at settle / fill for one-move softlocks.
 */
export function isPlayable(board: BoardState): boolean {
  if (board.pieces.length === 0) return true;
  return hasPotentialMerge(board);
}

/** Settle-time: not a one-move death trap. */
export function isSafeToContinue(board: BoardState): boolean {
  if (board.pieces.length === 0) return true;
  if (!hasPotentialMerge(board)) return false;
  return !isForcedLoss(board);
}

const TRENDS_CARDINAL = [
  trendFromApproachDelta(1, 0),
  trendFromApproachDelta(-1, 0),
  trendFromApproachDelta(0, 1),
  trendFromApproachDelta(0, -1),
];

/** Full-board 64 = clear / win — never treat as death. */
function hasWinPiece(board: BoardState): boolean {
  return board.pieces.some((p) => p.value >= 64);
}

/**
 * After a merge, is the position still "alive" (or won)?
 * - created / left a 64 (过关), or
 * - still has a merge pair, or
 * - freed cells (push/clip) so fill can run, or
 * - empty board
 */
function survivesMergeResult(before: BoardState, after: BoardState): boolean {
  if (after.pieces.length === 0) return true;
  if (hasWinPiece(after)) return true; // 32+32→64 是胜利，不是一步死
  if (boardArea(after) < boardArea(before)) return true; // something left the board
  if (hasPotentialMerge(after)) return true;
  return false;
}

/**
 * Every successful merge leaves a terminal board (no pairs, no free cells).
 * Classic trap: only 4+4 while enemy 8 remains → after merge: 8 vs 8 iron + 16 + 32.
 *
 * Capped for frame budget; used by fill scoring and settle game-over.
 */
export function isForcedLoss(board: BoardState): boolean {
  if (board.pieces.length === 0) return false;
  // Already won
  if (hasWinPiece(board)) return false;
  if (!hasPotentialMerge(board)) return true;

  // Two 32s (or any pair that can make 64) is always a live winning position
  for (let i = 0; i < board.pieces.length; i++) {
    for (let j = i + 1; j < board.pieces.length; j++) {
      const A = board.pieces[i]!;
      const B = board.pieces[j]!;
      if (canMergePair(A, B) && A.value * 2 >= 64) return false;
    }
  }

  let anyLegal = false;
  let checked = 0;
  const pieces = board.pieces;

  for (let i = 0; i < pieces.length; i++) {
    for (let j = 0; j < pieces.length; j++) {
      if (i === j) continue;
      const A = pieces[i]!;
      const B = pieces[j]!;
      if (!canMergePair(A, B)) continue;

      const seats: { x: number; y: number }[] = [{ x: A.x, y: A.y }];
      for (const g of ghostSeatsOnTarget(A, B)) {
        if (seats.length >= 3) break;
        if (!seats.some((s) => s.x === g.x && s.y === g.y)) seats.push(g);
      }

      for (const seat of seats) {
        const trialBase = cloneBoard(board);
        const a = getPiece(trialBase, A.id);
        if (!a) continue;
        a.x = seat.x;
        a.y = seat.y;
        for (const trend of TRENDS_CARDINAL) {
          if (++checked > 40) {
            // Too many branches — not a simple forced trap
            return false;
          }
          const r = tryMerge(cloneBoard(trialBase), A.id, B.id, trend);
          if (!r.ok) continue;
          anyLegal = true;
          // Win or continue → not forced loss
          if (survivesMergeResult(board, r.board)) return false;
        }
      }
    }
  }

  if (!anyLegal) return true;
  return true;
}

function tryMergeAtSeat(
  board: BoardState,
  A: Piece,
  B: Piece,
  seat: { x: number; y: number },
): boolean {
  const trial = cloneBoard(board);
  const a = getPiece(trial, A.id);
  if (!a) return false;
  a.x = seat.x;
  a.y = seat.y;
  const trends = [
    trendFromCenters(pieceCenter(a), pieceCenter(B)),
    trendFromApproachDelta(1, 0),
    trendFromApproachDelta(-1, 0),
    trendFromApproachDelta(0, 1),
    trendFromApproachDelta(0, -1),
  ];
  for (const trend of trends) {
    const r = tryMerge(cloneBoard(trial), A.id, B.id, trend);
    if (r.ok) return true;
  }
  return false;
}

/**
 * Full legal merge simulation (expensive).
 * Includes non-adjacent pairs: seat A on B then tryMerge.
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

      // Fast path: already contact / overlap
      if (footprintsContact(pieceCells(A), pieceCells(B))) {
        const base = trendFromCenters(pieceCenter(A), pieceCenter(B));
        const trends = [
          base,
          trendFromApproachDelta(1, 0),
          trendFromApproachDelta(-1, 0),
          trendFromApproachDelta(0, 1),
          trendFromApproachDelta(0, -1),
        ];
        for (const trend of trends) {
          const r = tryMerge(cloneBoard(board), A.id, B.id, trend);
          if (r.ok) return true;
        }
      }

      // Drag-on path: try a few seats (cap for frame budget)
      const seats = ghostSeatsOnTarget(A, B);
      const step = seats.length > 12 ? Math.ceil(seats.length / 12) : 1;
      for (let s = 0; s < seats.length; s += step) {
        if (tryMergeAtSeat(board, A, B, seats[s]!)) return true;
      }
    }
  }
  return false;
}

/**
 * True game-over: no merge, or only one-move deaths left.
 * Call sparingly (end of settle / after failed relief spawn).
 */
export function isDeadlock(board: BoardState): boolean {
  if (board.pieces.length === 0) return false;
  if (!hasPotentialMerge(board)) return true;
  if (isForcedLoss(board)) return true;
  return !hasLegalMerge(board);
}

/**
 * Spawn safety: at least one merge leaves a non-terminal aftermath
 * (still has pairs, or freed cells for fill / push progress).
 */
export function hasSustainablePlay(board: BoardState): boolean {
  if (board.pieces.length === 0) return true;
  if (!hasPotentialMerge(board)) return false;
  if (isForcedLoss(board)) return false;

  const pieces = board.pieces;
  let checked = 0;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = 0; j < pieces.length; j++) {
      if (i === j) continue;
      const A = pieces[i]!;
      const B = pieces[j]!;
      if (!canMergePair(A, B)) continue;

      const seats: { x: number; y: number }[] = [];
      if (footprintsContact(pieceCells(A), pieceCells(B))) {
        seats.push({ x: A.x, y: A.y });
      }
      for (const g of ghostSeatsOnTarget(A, B)) {
        if (seats.length >= 4) break;
        if (!seats.some((s) => s.x === g.x && s.y === g.y)) seats.push(g);
      }

      for (const seat of seats) {
        if (++checked > 12) return false;
        const trial = cloneBoard(board);
        const a = getPiece(trial, A.id);
        if (!a) continue;
        a.x = seat.x;
        a.y = seat.y;
        for (const trend of [
          trendFromCenters(pieceCenter(a), pieceCenter(B)),
          ...TRENDS_CARDINAL,
        ]) {
          const r = tryMerge(cloneBoard(trial), A.id, B.id, trend);
          if (!r.ok) continue;
          if (survivesMergeResult(board, r.board)) return true;
        }
      }
    }
  }
  return false;
}

export function pieceById(board: BoardState, id: number): Piece | undefined {
  return getPiece(board, id);
}
