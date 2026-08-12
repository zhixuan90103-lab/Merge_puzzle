import { allocId, emptyBoard, upsertPiece } from './board';
import type { BoardState } from './types';
import { MAX_COLORS } from './types';

function add(
  board: BoardState,
  value: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
): void {
  upsertPiece(board, {
    id: allocId(board),
    value,
    color,
    x,
    y,
    w,
    h,
  });
}

function clampUnlocked(n: number): number {
  return Math.max(1, Math.min(MAX_COLORS, Math.floor(n)));
}

/**
 * Opening / post-clear deal.
 * @param unlockedColors palette size 1..5（由 wave 表决定，见 progress.ts）
 * @param wave 关卡：1 教学 · 2–3 双色 · 4+ 三色起
 *
 * Wave 1: 主色大块 + **仅一枚** 副色 4（推开才能满屏）
 * Wave 2–3: 双色常规局（出块频率在 spawn 侧区分）
 * Wave 4+: 按 unlocked 多色开局
 */
export function dealOpening(unlockedColors = 2, wave = 1): BoardState {
  const u = clampUnlocked(unlockedColors);
  const board = emptyBoard();

  // ——— 第 1 关：双色教学（主色冲 64；副色只有一枚 4）———
  if (wave === 1) {
    // 主色 0：一枚 16 + 一对 8 + 两对 4
    add(board, 16, 0, 4, 4, 4, 0);
    add(board, 8, 4, 6, 4, 2, 0);
    add(board, 8, 4, 4, 4, 2, 0);
    add(board, 4, 0, 2, 2, 2, 0);
    add(board, 4, 2, 2, 2, 2, 0);
    add(board, 4, 0, 0, 2, 2, 0);
    add(board, 4, 2, 0, 2, 2, 0);
    // 副色 1：唯一一块 4，挡在右上生长带 — 不合主色，满屏前须推走
    add(board, 4, 6, 0, 2, 2, 1);
    return board;
  }

  if (u <= 2) {
    // ——— 2 色常规波：双方都有可合对 ———
    add(board, 4, 0, 6, 2, 2, 0);
    add(board, 4, 2, 6, 2, 2, 0);
    add(board, 4, 4, 6, 2, 2, 1);
    add(board, 4, 6, 6, 2, 2, 1);
    add(board, 2, 0, 4, 2, 1, 0);
    add(board, 2, 2, 4, 2, 1, 0);
    add(board, 2, 4, 4, 2, 1, 1);
    add(board, 2, 6, 4, 2, 1, 1);
    add(board, 2, 0, 2, 1, 2, 0);
    add(board, 2, 1, 2, 1, 2, 0);
    add(board, 2, 6, 2, 1, 2, 1);
    add(board, 2, 7, 2, 1, 2, 1);
    return board;
  }

  // ——— 3+ 色：更碎，多色对 ———
  const c0 = 0;
  const c1 = 1;
  const c2 = u >= 3 ? 2 : 0;
  const c3 = u >= 4 ? 3 : 1;
  const c4 = u >= 5 ? 4 : 0;

  add(board, 4, 0, 6, 2, 2, c0);
  add(board, 4, 2, 6, 2, 2, c0);
  add(board, 2, 4, 7, 2, 1, c1);
  add(board, 2, 6, 7, 2, 1, c1);
  add(board, 2, 4, 5, 1, 2, c2);
  add(board, 2, 5, 5, 1, 2, c2);
  add(board, 1, 6, 5, 1, 1, c3);
  add(board, 1, 7, 5, 1, 1, c3);
  add(board, 2, 0, 4, 2, 1, c4);
  add(board, 2, 2, 4, 2, 1, c4);
  if (u >= 3) {
    add(board, 1, 6, 4, 1, 1, c2);
    add(board, 1, 7, 4, 1, 1, c2);
  }

  return board;
}

/** Dense board to reach 64 faster (debug). */
export function dealDebugNear64(unlockedColors = 2): BoardState {
  const u = clampUnlocked(unlockedColors);
  const board = emptyBoard();
  const c = 0;
  add(board, 16, 0, 0, 4, 4, c);
  add(board, 16, 4, 0, 4, 4, c);
  add(board, 8, 0, 4, 4, 2, c);
  add(board, 8, 4, 4, 4, 2, c);
  add(board, 4, 0, 6, 2, 2, u >= 2 ? 1 : c);
  add(board, 4, 2, 6, 2, 2, u >= 2 ? 1 : c);
  add(board, 2, 4, 6, 2, 1, u >= 3 ? 2 : c);
  add(board, 2, 4, 7, 2, 1, u >= 3 ? 2 : c);
  add(board, 1, 6, 6, 1, 1, c);
  add(board, 1, 7, 6, 1, 1, c);
  add(board, 1, 6, 7, 1, 1, c);
  add(board, 1, 7, 7, 1, 1, c);
  return board;
}

/** Post-64 full clear: re-deal for next wave. */
export function dealAfterClear(unlockedColors: number, wave: number): BoardState {
  return dealOpening(unlockedColors, wave);
}
