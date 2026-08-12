import { allocId, emptyBoard, upsertPiece } from './board';
import type { BoardState, Piece } from './types';

function add(
  board: BoardState,
  value: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const p: Piece = { id: allocId(board), value, x, y, w, h };
  upsertPiece(board, p);
}

/**
 * Opening deal v0.4 — neat, **bottom-anchored**, low debris.
 *
 * Design:
 * - Top ~half empty (room to grow / push upward)
 * - Floor of 2s / 4s along bottom — merge-ready pairs, few 1s
 * - Immediate readable goals: 4+4, 横2+横2, 竖2+竖2
 */
export function dealOpening(): BoardState {
  const board = emptyBoard();

  // ——— y=6..7 底排：大方块并排（可合 4→8）———
  add(board, 4, 0, 6, 2, 2);
  add(board, 4, 2, 6, 2, 2);

  // ——— y=7 底边横 2 对（可合 2→4）———
  add(board, 2, 4, 7, 2, 1);
  add(board, 2, 6, 7, 2, 1);

  // ——— y=5..6 竖 2 对（可合 2→4 竖）———
  add(board, 2, 4, 5, 1, 2);
  add(board, 2, 5, 5, 1, 2);

  // ——— y=5 右侧少量 1（仅一对可合，不碎盘）———
  add(board, 1, 6, 5, 1, 1);
  add(board, 1, 7, 5, 1, 1);

  // ——— y=4 中带：再一对横 2，贴「建筑」上方 ———
  add(board, 2, 0, 4, 2, 1);
  add(board, 2, 2, 4, 2, 1);

  // 上半 y=0..3 留空 — 生长 / 推挤空间

  return board;
}

/** Dense mid-game-ish board to reach higher values faster (debug). */
export function dealDebugNear64(): BoardState {
  const board = emptyBoard();
  add(board, 16, 0, 0, 4, 4);
  add(board, 16, 4, 0, 4, 4);
  add(board, 8, 0, 4, 4, 2);
  add(board, 8, 4, 4, 4, 2);
  add(board, 4, 0, 6, 2, 2);
  add(board, 4, 2, 6, 2, 2);
  add(board, 2, 4, 6, 2, 1);
  add(board, 2, 4, 7, 2, 1);
  add(board, 1, 6, 6, 1, 1);
  add(board, 1, 7, 6, 1, 1);
  add(board, 1, 6, 7, 1, 1);
  add(board, 1, 7, 7, 1, 1);
  return board;
}

/** Same deal for post-64 wave. */
export function dealAfterClear(): BoardState {
  return dealOpening();
}
