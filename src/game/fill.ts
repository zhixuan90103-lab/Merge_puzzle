/**
 * Closed full-board fill (I1–I3).
 *
 * Goals:
 * - Fill freed cells with **mergeable** material (pairs, matching orientation)
 * - Prefer **squares** (2×2 等) so 横/竖 strip 不会互锁
 * - Partner orphans using **same w×h** as the orphan
 * - Avoid “技术上可玩、体验上死盘”（如 8横+8竖 不能合）
 */
import { allocId, boardArea, canPlaceRect, cloneBoard, upsertPiece } from './board';
import {
  hasSustainablePlay,
  isForcedLoss,
  isPlayable,
  isSafeToContinue,
} from './deadlock';
import { colorsPresentOnBoard } from './progress';
import { allRectsForValue, shapeAxis } from './shapes';
import type { BoardState } from './types';
import { GRID_SIZE, MAX_COLORS } from './types';

const FULL = GRID_SIZE * GRID_SIZE;

export type FillHint = {
  color: number;
  value: number;
  unlockedColors: number;
  wave: number;
};

export type FillResult = {
  board: BoardState;
  spawnedIds: number[];
  label: string;
};

function clampUnlocked(n: number): number {
  return Math.max(1, Math.min(MAX_COLORS, Math.floor(n || 1)));
}

function allPlacements(
  board: BoardState,
  w: number,
  h: number,
): { x: number; y: number }[] {
  const list: { x: number; y: number }[] = [];
  for (let y = 0; y <= GRID_SIZE - h; y++) {
    for (let x = 0; x <= GRID_SIZE - w; x++) {
      if (canPlaceRect(board, x, y, w, h)) list.push({ x, y });
    }
  }
  return list;
}

function countKey(board: BoardState): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of board.pieces) {
    if (p.value >= 64) continue;
    const k = `${p.color}:${p.value}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function orphans(board: BoardState): {
  color: number;
  value: number;
  w: number;
  h: number;
}[] {
  const by = new Map<string, { color: number; value: number; pieces: { w: number; h: number }[] }>();
  for (const p of board.pieces) {
    if (p.value >= 64) continue;
    const k = `${p.color}:${p.value}`;
    let g = by.get(k);
    if (!g) {
      g = { color: p.color, value: p.value, pieces: [] };
      by.set(k, g);
    }
    g.pieces.push({ w: p.w, h: p.h });
  }
  const list: { color: number; value: number; w: number; h: number }[] = [];
  for (const g of by.values()) {
    if (g.pieces.length !== 1) continue;
    const sh = g.pieces[0]!;
    list.push({ color: g.color, value: g.value, w: sh.w, h: sh.h });
  }
  list.sort((a, b) => b.value - a.value || a.color - b.color);
  return list;
}

/** Shape order: match templates first, then squares, then rest. */
function shapeOrder(
  value: number,
  templates: { w: number; h: number }[],
): { w: number; h: number }[] {
  const all = allRectsForValue(value);
  if (all.length === 0) return [];
  const key = (s: { w: number; h: number }) => `${s.w}x${s.h}`;
  const seen = new Set<string>();
  const out: { w: number; h: number }[] = [];
  const push = (s: { w: number; h: number }) => {
    const k = key(s);
    if (seen.has(k)) return;
    if (!all.some((a) => a.w === s.w && a.h === s.h)) return;
    seen.add(k);
    out.push(s);
  };
  for (const t of templates) push(t);
  // Squares next (merge-friendly with any axis)
  for (const s of all) {
    if (s.w === s.h) push(s);
  }
  // Prefer flatter aspect mildly
  const rest = [...all].sort(
    (a, b) => Math.abs(a.w - a.h) - Math.abs(b.w - b.h) || a.w - b.w,
  );
  for (const s of rest) push(s);
  return out;
}

function tryPlaceShape(
  board: BoardState,
  value: number,
  color: number,
  w: number,
  h: number,
): { board: BoardState; id: number } | null {
  if (w * h !== value) return null;
  const spots = allPlacements(board, w, h);
  if (spots.length === 0) return null;
  // Prefer edge for exile readability; slight randomness
  spots.sort((a, b) => {
    const edge = (p: { x: number; y: number }) =>
      p.x === 0 ||
      p.y === 0 ||
      p.x + w === GRID_SIZE ||
      p.y + h === GRID_SIZE
        ? 1
        : 0;
    return edge(b) - edge(a) || Math.random() - 0.5;
  });
  const pick = spots[Math.floor(Math.random() * Math.min(6, spots.length))]!;
  const trial = cloneBoard(board);
  const id = allocId(trial);
  upsertPiece(trial, { id, value, color, x: pick.x, y: pick.y, w, h });
  return { board: trial, id };
}

function tryPlace(
  board: BoardState,
  value: number,
  color: number,
  templates: { w: number; h: number }[] = [],
): { board: BoardState; id: number } | null {
  for (const s of shapeOrder(value, templates)) {
    const r = tryPlaceShape(board, value, color, s.w, s.h);
    if (r) return r;
  }
  return null;
}

/** Two pieces, **identical** w×h — guaranteed canMergeByShape. */
function tryPlacePair(
  board: BoardState,
  value: number,
  color: number,
  templates: { w: number; h: number }[] = [],
): { board: BoardState; ids: number[] } | null {
  const free = FULL - boardArea(board);
  if (value * 2 > free) return null;
  for (const s of shapeOrder(value, templates)) {
    const first = tryPlaceShape(board, value, color, s.w, s.h);
    if (!first) continue;
    const second = tryPlaceShape(first.board, value, color, s.w, s.h);
    if (!second) continue;
    return { board: second.board, ids: [first.id, second.id] };
  }
  return null;
}

/** Min pair-piece value so that 2V > maxEnemy (strict push). */
function minPairValueToPushEnemy(maxEnemy: number): number {
  if (maxEnemy <= 0) return 1;
  // 2V > maxEnemy → V >= floor(maxEnemy/2)+1, snap up to power-of-two-ish ladder
  const need = Math.floor(maxEnemy / 2) + 1;
  for (const v of [1, 2, 4, 8, 16, 32]) {
    if (v >= need) return v;
  }
  return 32;
}

function maxEnemyValue(board: BoardState, hintColor: number): number {
  let m = 0;
  for (const p of board.pieces) {
    if (p.color !== hintColor && p.value > m) m = p.value;
  }
  return m;
}

function chunkLadder(
  hint: FillHint,
  rem: number,
  board?: BoardState,
): number[] {
  const m = Math.max(2, hint.value || 4);
  const half = Math.max(1, Math.floor(m / 2));
  let cap = Math.min(half, 16);
  // If enemies remain, allow chunks large enough that pairing them can push
  if (board) {
    const maxE = maxEnemyValue(board, hint.color);
    if (maxE > 0) {
      const need = minPairValueToPushEnemy(maxE);
      cap = Math.max(cap, Math.min(need, rem, 16));
    }
  }
  const raw = [cap, 8, 4, 2, 1];
  const out: number[] = [];
  for (const v of raw) {
    if (v >= 1 && v <= rem && v <= cap && !out.includes(v)) out.push(v);
  }
  if (!out.includes(1) && rem >= 1) out.push(1);
  // When enemies exist, prefer values that can form a pushing merge first
  if (board) {
    const maxE = maxEnemyValue(board, hint.color);
    const need = minPairValueToPushEnemy(maxE);
    out.sort((a, b) => {
      const sa = a >= need ? 100 + a : a;
      const sb = b >= need ? 100 + b : b;
      return sb - sa;
    });
  } else {
    out.sort((a, b) => b - a);
  }
  return out;
}

function countPairs(board: BoardState): number {
  let n = 0;
  for (const v of countKey(board).values()) n += Math.floor(v / 2);
  return n;
}

function countOnes(board: BoardState): number {
  return board.pieces.filter((p) => p.value === 1).length;
}

/** Same color+value strips on different axes → cannot merge each other. */
function countOrientLocks(board: BoardState): number {
  const groups = new Map<string, { h: number; v: number; s: number }>();
  for (const p of board.pieces) {
    if (p.value >= 64) continue;
    const k = `${p.color}:${p.value}`;
    let g = groups.get(k);
    if (!g) {
      g = { h: 0, v: 0, s: 0 };
      groups.set(k, g);
    }
    const ax = shapeAxis(p);
    if (ax === 'h') g.h++;
    else if (ax === 'v') g.v++;
    else g.s++;
  }
  let bad = 0;
  for (const g of groups.values()) {
    // No square bridge + both axes present = locked camps
    if (g.s === 0 && g.h > 0 && g.v > 0) bad += Math.min(g.h, g.v);
  }
  return bad;
}

function countProblemOrphans(board: BoardState, minV = 4): number {
  let maxV = 0;
  for (const p of board.pieces) {
    if (p.value < 64 && p.value > maxV) maxV = p.value;
  }
  let n = 0;
  for (const o of orphans(board)) {
    if (o.value < minV || o.value >= 64) continue;
    if (o.value >= maxV) continue;
    n++;
  }
  return n;
}

/**
 * Templates from existing same color+value pieces (for matching partners).
 */
function templatesFor(
  board: BoardState,
  color: number,
  value: number,
): { w: number; h: number }[] {
  return board.pieces
    .filter((p) => p.color === color && p.value === value)
    .map((p) => ({ w: p.w, h: p.h }));
}

/**
 * Max merge-result volume the hint color can currently produce (pair of V → 2V).
 * Used so we never grow enemy pieces to ≥ that wall.
 */
function hintPushCeiling(board: BoardState, hintColor: number): number {
  const ck = countKey(board);
  let best = 0;
  for (const [k, n] of ck) {
    const [cs, vs] = k.split(':');
    if (Number(cs) !== hintColor) continue;
    const v = Number(vs);
    if (n >= 2) best = Math.max(best, v * 2);
    // Single can be paired by fill → allow planning one step
    if (n >= 1) best = Math.max(best, v * 2);
  }
  return best;
}

function fillStep(
  board: BoardState,
  rem: number,
  hint: FillHint,
): { board: BoardState; ids: number[] } | null {
  const present = colorsPresentOnBoard(board.pieces, hint.unlockedColors);
  const hintColor = present.includes(hint.color)
    ? hint.color
    : (present[0] ?? 0);
  const ceiling = Math.max(hint.value * 2, hintPushCeiling(board, hintColor), 4);
  // Enemy pieces must stay strictly below what we can push after a merge
  const enemyMax = Math.max(1, Math.min(2, Math.floor(ceiling / 4)));

  // 1) Partner **hint-color** orphans only (same shape).
  //    NEVER partner enemy mid/large — that creates equal-volume iron gates
  //    (e.g. green 16 vs blue 16/32 → 死局).
  const orph = orphans(board).filter((o) => o.color === hintColor);
  for (const o of orph) {
    if (o.value > rem) continue;
    let r = tryPlaceShape(board, o.value, o.color, o.w, o.h);
    if (!r) r = tryPlace(board, o.value, o.color, [{ w: o.w, h: o.h }]);
    if (r) return { board: r.board, ids: [r.id] };
  }

  // Tiny enemy orphan only (≤ enemyMax), never grow them
  for (const o of orphans(board)) {
    if (o.color === hintColor) continue;
    if (o.value > enemyMax || o.value > rem) continue;
    const r = tryPlaceShape(board, o.value, o.color, o.w, o.h);
    if (r) return { board: r.board, ids: [r.id] };
  }

  const maxE = maxEnemyValue(board, hintColor);
  const needPush = maxE > 0 ? minPairValueToPushEnemy(maxE) : 0;

  // 2) Ready pairs — hint color; prefer pairs that can push max enemy (avoid 4+4 vs 8)
  if (rem >= 4) {
    for (const v of chunkLadder(hint, Math.floor(rem / 2), board)) {
      if (v < 2) continue;
      if (needPush > 0 && v < needPush && rem >= needPush * 2) continue;
      const tpls = templatesFor(board, hintColor, v);
      const pair = tryPlacePair(board, v, hintColor, tpls);
      if (pair) return pair;
    }
    for (const v of chunkLadder(hint, Math.floor(rem / 2), board)) {
      if (v < 2) continue;
      const tpls = templatesFor(board, hintColor, v);
      const pair = tryPlacePair(board, v, hintColor, tpls);
      if (pair) return pair;
    }
  }

  // 3) Single progressive chunk — hint color only
  for (const v of chunkLadder(hint, rem, board)) {
    if (v === 1) continue;
    const ck = countKey(board);
    const cnt = ck.get(`${hintColor}:${v}`) ?? 0;
    if (v >= 8 && cnt % 2 === 0 && rem < v * 2) continue;
    const tpls = templatesFor(board, hintColor, v);
    const r = tryPlace(board, v, hintColor, tpls);
    if (r) return { board: r.board, ids: [r.id] };
  }

  // 4) Remainder: 2 / 1 of **hint color only** (do not feed enemy)
  if (rem >= 2) {
    const r2 = tryPlace(board, 2, hintColor, [
      { w: 1, h: 2 },
      { w: 2, h: 1 },
    ]);
    if (r2) return { board: r2.board, ids: [r2.id] };
  }
  const r1 = tryPlaceShape(board, 1, hintColor, 1, 1);
  if (r1) return { board: r1.board, ids: [r1.id] };
  // Absolute last: if hint color can't place (shouldn't), any 1 of present
  for (const c of present) {
    const r = tryPlaceShape(board, 1, c, 1, 1);
    if (r) return { board: r.board, ids: [r.id] };
  }
  return null;
}

function attemptFill(
  start: BoardState,
  hint: FillHint,
): { board: BoardState; ids: number[] } {
  let cur = cloneBoard(start);
  const ids: number[] = [];
  let guard = 0;
  while (boardArea(cur) < FULL && guard++ < FULL + 8) {
    const rem = FULL - boardArea(cur);
    const step = fillStep(cur, rem, hint);
    if (!step) break;
    cur = step.board;
    ids.push(...step.ids);
  }
  return { board: cur, ids };
}

/** Enemy piece ≥ some primary piece of same value → equal wall, often terminal. */
function countEqualColorWalls(board: BoardState, hintColor: number): number {
  const primaryMax = new Map<number, number>(); // value → count
  const enemyMax = new Map<number, number>();
  for (const p of board.pieces) {
    if (p.value >= 64) continue;
    const m = p.color === hintColor ? primaryMax : enemyMax;
    m.set(p.value, (m.get(p.value) ?? 0) + 1);
  }
  let n = 0;
  for (const [v, en] of enemyMax) {
    if (en <= 0) continue;
    const pr = primaryMax.get(v) ?? 0;
    // Enemy shares a value tier with primary → cannot push each other
    if (pr > 0) n += en;
    // Enemy alone at high tier with no primary pair path
    if (v >= 8 && pr === 0) n += en;
  }
  return n;
}

function scoreFilled(board: BoardState, ids: number[], hint: FillHint): number {
  if (boardArea(board) !== FULL) return -10_000;
  let s = 200;
  if (isPlayable(board)) s += 500;
  else s -= 800;
  // One-move death (4+4 vs enemy 8) — hard reject
  if (isForcedLoss(board)) s -= 5000;
  else if (isSafeToContinue(board)) s += 400;
  if (hasSustainablePlay(board)) s += 600;

  s += countPairs(board) * 55;
  s -= countOrientLocks(board) * 280;
  s -= countProblemOrphans(board, 4) * 180;
  s -= countProblemOrphans(board, 8) * 120;
  // 绿16+蓝16 同体积铁门
  s -= countEqualColorWalls(board, hint.color) * 350;

  // Cannot push max enemy with any current pair product
  const maxE = maxEnemyValue(board, hint.color);
  if (maxE > 0) {
    const need = minPairValueToPushEnemy(maxE);
    const ck = countKey(board);
    let canPush = false;
    for (const [k, n] of ck) {
      const [cs, vs] = k.split(':');
      if (Number(cs) !== hint.color) continue;
      if (n >= 2 && Number(vs) >= need) canPush = true;
    }
    if (!canPush) s -= 800;
  }

  const ones = countOnes(board);
  if (ones > 8) s -= (ones - 8) * 20;

  // Prefer square pieces among mid values
  let squares = 0;
  let strips = 0;
  for (const p of board.pieces) {
    if (p.value < 2 || p.value >= 64) continue;
    if (p.w === p.h) squares++;
    else strips++;
  }
  s += squares * 12;
  s -= Math.max(0, strips - squares) * 8;

  const hintMass = board.pieces
    .filter((p) => p.color === hint.color)
    .reduce((a, p) => a + p.value, 0);
  s += hintMass * 0.12;

  s -= ids.length * 0.3;
  return s;
}

function labelFor(board: BoardState, ids: number[]): string {
  if (ids.length === 0) return '满盘无补';
  if (isForcedLoss(board)) return `补满${ids.length}·危(一步死)`;
  const locks = countOrientLocks(board);
  const lonely = countProblemOrphans(board, 4);
  const pairs = countPairs(board);
  if (locks > 0) return `补满${ids.length}·朝向冲突`;
  if (lonely > 0) return `补满${ids.length}·有孤块待对`;
  if (pairs > 0) return `补满${ids.length}·有对可合`;
  return `补满${ids.length}块`;
}

export function fillToFull(board: BoardState, hint: FillHint): FillResult {
  const area0 = boardArea(board);
  if (area0 > FULL) return { board, spawnedIds: [], label: '占格溢出' };
  if (area0 === FULL) return { board, spawnedIds: [], label: '满盘无补' };

  const h: FillHint = {
    ...hint,
    unlockedColors: clampUnlocked(hint.unlockedColors),
    color: Math.max(0, Math.floor(hint.color)),
    value: Math.max(1, hint.value || 2),
  };

  let best: { board: BoardState; ids: number[]; score: number } | null = null;
  let bestSafe: { board: BoardState; ids: number[]; score: number } | null =
    null;

  for (let t = 0; t < 14; t++) {
    const r = attemptFill(board, h);
    if (boardArea(r.board) !== FULL) continue;
    const score = scoreFilled(r.board, r.ids, h);
    if (!best || score > best.score) best = { ...r, score };
    if (!isForcedLoss(r.board) && isSafeToContinue(r.board)) {
      if (!bestSafe || score > bestSafe.score) bestSafe = { ...r, score };
    }
    if (
      score >= 1300 &&
      isSafeToContinue(r.board) &&
      !isForcedLoss(r.board) &&
      countOrientLocks(r.board) === 0 &&
      countProblemOrphans(r.board, 8) === 0
    ) {
      return {
        board: r.board,
        spawnedIds: r.ids,
        label: labelFor(r.board, r.ids),
      };
    }
  }

  // Prefer a fill that is not a one-move death trap
  const pick = bestSafe ?? best;
  if (pick) {
    return {
      board: pick.board,
      spawnedIds: pick.ids,
      label: labelFor(pick.board, pick.ids),
    };
  }

  // Last resort: square-ish pairs of 2, then 1s
  let cur = cloneBoard(board);
  const ids: number[] = [];
  while (boardArea(cur) < FULL) {
    const rem = FULL - boardArea(cur);
    const step =
      (rem >= 4
        ? tryPlacePair(cur, 2, h.color, [
            { w: 1, h: 2 },
            { w: 2, h: 1 },
          ])
        : null) ??
      (rem >= 2
        ? (() => {
            const a = tryPlace(cur, 2, h.color);
            return a ? { board: a.board, ids: [a.id] } : null;
          })()
        : null) ??
      (() => {
        const a = tryPlaceShape(cur, 1, h.color, 1, 1);
        return a ? { board: a.board, ids: [a.id] } : null;
      })();
    if (!step) break;
    cur = step.board;
    ids.push(...step.ids);
  }
  return { board: cur, spawnedIds: ids, label: labelFor(cur, ids) };
}

export function trySpawnAfterMerge(
  board: BoardState,
  unlockedColors: number,
  wave: number,
  _piecesBefore: number,
  hint?: { color: number; value: number },
): FillResult {
  return fillToFull(board, {
    color: hint?.color ?? 0,
    value: hint?.value ?? 4,
    unlockedColors,
    wave,
  });
}

export function spawnBudget(board: BoardState, _piecesBefore: number): number {
  return Math.max(0, FULL - boardArea(board));
}
