/**
 * Post-merge spawn.
 *
 * Design:
 * - **Fast path** (normal): few random placements + cheap isPlayable — must finish in ~1 frame
 * - **Relief path** (board not playable): exhaustive but still only isPlayable (no tryMerge)
 * - Never call isDeadlock / hasLegalMerge per cell
 */
import { allocId, canPlaceRect, cloneBoard, upsertPiece } from './board';
import { isPlayable } from './deadlock';
import { sizeForValue } from './shapes';
import type { BoardState, Orientation } from './types';
import { GRID_SIZE } from './types';

type SpawnSpec = { value: number; orient: Orientation; weight: number };

/**
 * Phase pools — mid/late less 1, more 2/4 so growth often pushes mid-tier blocks.
 * maxValue on board selects phase.
 */
const SPAWN_EARLY: SpawnSpec[] = [
  { value: 1, orient: 'h', weight: 22 },
  { value: 2, orient: 'h', weight: 28 },
  { value: 2, orient: 'v', weight: 28 },
  { value: 4, orient: 'h', weight: 22 },
];

const SPAWN_MID: SpawnSpec[] = [
  { value: 1, orient: 'h', weight: 10 },
  { value: 2, orient: 'h', weight: 30 },
  { value: 2, orient: 'v', weight: 30 },
  { value: 4, orient: 'h', weight: 30 },
];

/** Late: almost no 1 — 2/4 block growth paths and get pushed */
const SPAWN_LATE: SpawnSpec[] = [
  { value: 1, orient: 'h', weight: 4 },
  { value: 2, orient: 'h', weight: 28 },
  { value: 2, orient: 'v', weight: 28 },
  { value: 4, orient: 'h', weight: 40 },
];

/** Relief: prefer 2 (esp. 竖) then 4; 1 last */
const RELIEF_SPECS: SpawnSpec[] = [
  { value: 2, orient: 'v', weight: 1 },
  { value: 2, orient: 'h', weight: 1 },
  { value: 4, orient: 'h', weight: 1 },
  { value: 1, orient: 'h', weight: 1 },
];

const FAST_SPOTS_PER_SPEC = 12;

function maxPieceValue(board: BoardState): number {
  let m = 1;
  for (const p of board.pieces) if (p.value > m) m = p.value;
  return m;
}

function poolForBoard(board: BoardState): SpawnSpec[] {
  const maxV = maxPieceValue(board);
  if (maxV >= 16) return SPAWN_LATE;
  if (maxV >= 8) return SPAWN_MID;
  return SPAWN_EARLY;
}

function pickSpec(board: BoardState): SpawnSpec {
  const pool = poolForBoard(board);
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return pool[0]!;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

function allPlacements(board: BoardState, w: number, h: number): { x: number; y: number }[] {
  const list: { x: number; y: number }[] = [];
  for (let y = 0; y <= GRID_SIZE - h; y++) {
    for (let x = 0; x <= GRID_SIZE - w; x++) {
      if (canPlaceRect(board, x, y, w, h)) list.push({ x, y });
    }
  }
  return list;
}

function samplePlacements(
  board: BoardState,
  w: number,
  h: number,
  limit: number,
): { x: number; y: number }[] {
  const list = allPlacements(board, w, h);
  shuffleInPlace(list);
  return list.slice(0, limit);
}

function axisLabel(w: number, h: number): string {
  return w === h ? '方' : w > h ? '横' : '竖';
}

export type SpawnResult = {
  board: BoardState;
  spawnedId: number | null;
  label: string;
};

function scoreNearSame(board: BoardState, value: number, x: number, y: number, w: number, h: number): number {
  let s = 0;
  const cx = x + w / 2;
  const cy = y + h / 2;
  for (const p of board.pieces) {
    if (p.value !== value) continue;
    const d =
      Math.abs(p.x + p.w / 2 - cx) + Math.abs(p.y + p.h / 2 - cy);
    if (d < Math.max(p.w, p.h, w, h) + 2) s += 30;
  }
  return s;
}

function commitPlace(
  board: BoardState,
  value: number,
  orient: Orientation,
  x: number,
  y: number,
): SpawnResult | null {
  const { w, h } = sizeForValue(value, orient);
  if (!canPlaceRect(board, x, y, w, h)) return null;
  const trial = cloneBoard(board);
  const id = allocId(trial);
  upsertPiece(trial, { id, value, x, y, w, h });
  // Cheap only — must not call tryMerge
  if (!isPlayable(trial)) return null;
  return {
    board: trial,
    spawnedId: id,
    label: `出块 ${value}(${axisLabel(w, h)})`,
  };
}

/**
 * After successful merge: place one piece without freezing the main thread.
 */
export function trySpawnOne(board: BoardState): SpawnResult {
  const needRescue = !isPlayable(board);
  const phasePool = poolForBoard(board);

  // ——— Fast path: phase-weighted specs (less 1 mid/late) ———
  const fastSpecs: SpawnSpec[] = needRescue
    ? [...RELIEF_SPECS]
    : [pickSpec(board), pickSpec(board), pickSpec(board), ...RELIEF_SPECS, ...phasePool];

  let best: SpawnResult | null = null;
  let bestScore = -1;

  for (const spec of fastSpecs) {
    const { w, h } = sizeForValue(spec.value, spec.orient);
    const spots = samplePlacements(board, w, h, FAST_SPOTS_PER_SPEC);
    for (const e of spots) {
      const r = commitPlace(board, spec.value, spec.orient, e.x, e.y);
      if (!r) continue;
      // Prefer mid-tier (2/4) so later merges push more than just 1s
      let sc =
        10 +
        (spec.value === 2 ? 18 : 0) +
        (spec.value === 4 ? 22 : 0) +
        (spec.value === 1 ? -8 : 0) +
        (spec.orient === 'v' && spec.value === 2 ? 8 : 0);
      sc += scoreNearSame(board, spec.value, e.x, e.y, w, h);
      if (needRescue) sc += 20;
      if (sc > bestScore) {
        bestScore = sc;
        best = r;
      }
    }
    // Early out: good enough for normal play
    if (!needRescue && best && bestScore >= 28) {
      return best;
    }
  }

  if (best && !needRescue) return best;

  // ——— Relief: exhaustive spots, still cheap isPlayable only ———
  for (const spec of RELIEF_SPECS) {
    const { w, h } = sizeForValue(spec.value, spec.orient);
    const spots = allPlacements(board, w, h);
    shuffleInPlace(spots);
    for (const e of spots) {
      const r = commitPlace(board, spec.value, spec.orient, e.x, e.y);
      if (!r) continue;
      let sc =
        50 +
        (spec.value === 2 ? 24 : 0) +
        (spec.value === 4 ? 28 : 0) +
        (spec.orient === 'v' ? 10 : 0) +
        scoreNearSame(board, spec.value, e.x, e.y, w, h);
      if (sc > bestScore) {
        bestScore = sc;
        best = {
          ...r,
          label: `救援${r.label}`,
        };
      }
    }
  }

  if (best) return best;

  return {
    board,
    spawnedId: null,
    label: needRescue ? '无救援出块' : '无安全出块',
  };
}
