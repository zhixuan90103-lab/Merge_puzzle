/**
 * Post-merge spawn.
 *
 * Design:
 * - **Fast path** (normal): few random placements + cheap isPlayable — must finish in ~1 frame
 * - **Relief path** (board not playable): exhaustive but still only isPlayable (no tryMerge)
 * - Never call isDeadlock / hasLegalMerge per cell
 */
import { allocId, canPlaceRect, cloneBoard, upsertPiece } from './board';
import { hasLegalMove, hasSustainablePlay, isPlayable } from './deadlock';
import {
  boardActiveColorWeights,
  colorsPresentOnBoard,
  pickWeightedAmong,
  pickWeightedColor,
} from './progress';
import { sizeForValue } from './shapes';
import type { BoardState, Orientation } from './types';
import { GRID_SIZE, MAX_COLORS } from './types';

type SpawnSpec = { value: number; orient: Orientation; weight: number };

/**
 * Spawn rhythm by unlockedColors (run progression) + board max.
 * Wave 1 (1 color): big pieces 4/8 — push material is also large.
 * Later: more 1/2 debris, multi-color pressure.
 */
const SPAWN_WAVE1: SpawnSpec[] = [
  { value: 16, orient: 'h', weight: 18 },
  { value: 16, orient: 'v', weight: 10 },
  { value: 8, orient: 'h', weight: 24 },
  { value: 8, orient: 'v', weight: 16 },
  { value: 4, orient: 'h', weight: 22 },
  { value: 4, orient: 'v', weight: 6 },
  { value: 2, orient: 'h', weight: 4 },
  // no 1
];

const SPAWN_WAVE2: SpawnSpec[] = [
  { value: 4, orient: 'h', weight: 34 },
  { value: 2, orient: 'h', weight: 24 },
  { value: 2, orient: 'v', weight: 24 },
  { value: 8, orient: 'h', weight: 10 },
  { value: 1, orient: 'h', weight: 8 },
];

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

/** Relief: wave1 prefers 4/8; later 2/4 */
const RELIEF_WAVE1: SpawnSpec[] = [
  { value: 8, orient: 'h', weight: 2 },
  { value: 16, orient: 'h', weight: 1 },
  { value: 4, orient: 'h', weight: 2 },
];

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

function poolForProgress(
  board: BoardState,
  unlockedColors: number,
  wave: number,
): SpawnSpec[] {
  const u = Math.max(1, Math.min(MAX_COLORS, unlockedColors || 1));
  const w = Math.max(1, wave || 1);
  // 第1关：大块池（与 unlocked=2 解耦）
  if (w === 1) return SPAWN_WAVE1;
  if (u <= 2 || w <= 3) return SPAWN_WAVE2;
  const maxV = maxPieceValue(board);
  if (maxV >= 16) return SPAWN_LATE;
  if (maxV >= 8) return SPAWN_MID;
  return SPAWN_EARLY;
}

function reliefForProgress(unlockedColors: number, wave: number): SpawnSpec[] {
  const u = Math.max(1, Math.min(MAX_COLORS, unlockedColors || 1));
  const w = Math.max(1, wave || 1);
  if (w === 1) return RELIEF_WAVE1;
  if (u <= 2) return RELIEF_SPECS.filter((s) => s.value !== 1);
  return RELIEF_SPECS;
}

function pickSpec(board: BoardState, unlockedColors: number, wave: number): SpawnSpec {
  return pickMergeFriendlySpec(
    board,
    unlockedColors,
    poolForProgress(board, unlockedColors, wave),
  );
}

function occupiedCells(board: BoardState): number {
  let n = 0;
  for (const p of board.pieces) n += p.w * p.h;
  return n;
}

function freeCells(board: BoardState): number {
  return GRID_SIZE * GRID_SIZE - occupiedCells(board);
}

/** True if some color+value already has ≥2 pieces (merge material exists). */
function hasMergeMaterial(board: BoardState): boolean {
  const counts = countByColorValue(board);
  for (const n of counts.values()) {
    if (n >= 2) return true;
  }
  return false;
}

/**
 * How many partner pieces to inject after a merge.
 * Always ≥1 when there is free space — never “合完完全不出块”.
 * Dense boards still only get 1; sparse / many pushed → up to 3.
 */
export function spawnBudget(
  board: BoardState,
  piecesBefore: number,
): number {
  const free = freeCells(board);
  if (free <= 0) return 0;
  // Tight board: still try exactly one (partner or small pair elsewhere)
  if (free < 8) return 1;
  if (free < 14) return 1;

  const after = board.pieces.length;
  const lost = Math.max(0, piecesBefore - after);
  let n = 1;
  if (lost >= 2 && free >= 16) n += 1;
  if (lost >= 4 && free >= 28) n += 1;
  if (after <= 2 && free >= 16) n = Math.max(n, 2);
  if (!hasMergeMaterial(board)) n = Math.max(n, 1);
  n = Math.min(n, Math.max(1, Math.floor(free / 6)));
  return Math.min(3, n);
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

function clampUnlocked(n: number): number {
  return Math.max(1, Math.min(MAX_COLORS, Math.floor(n || 1)));
}

/** Count pieces by (color, value) — for merge-friendly spawn. */
function countByColorValue(board: BoardState): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of board.pieces) {
    if (p.value >= 64) continue;
    const k = `${p.color}:${p.value}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/**
 * Pick color for spawn:
 * 1) Only colors **still on the board** (推光 = 该色退出出块池)
 * 2) Prefer completing odd same-value pairs among those colors
 * 3) Else weighted by wave schedule among active colors only
 */
function pickMergeColor(
  board: BoardState,
  value: number,
  unlockedColors: number,
  wave: number,
): number {
  const u = clampUnlocked(unlockedColors);
  if (u === 1) return 0;

  const present = colorsPresentOnBoard(board.pieces, u);
  const weights = boardActiveColorWeights(wave, u, present);

  const counts = countByColorValue(board);
  const odd: number[] = [];
  const evenHas: number[] = [];
  for (const c of present) {
    const n = counts.get(`${c}:${value}`) ?? 0;
    if (n > 0 && n % 2 === 1) odd.push(c);
    else if (n > 0) evenHas.push(c);
  }
  if (odd.length > 0) return pickWeightedAmong(odd, weights);
  if (evenHas.length > 0) return pickWeightedAmong(evenHas, weights);

  // Fresh spawn: only among colors still on board
  if (present.length === 1) return present[0]!;
  return pickWeightedColor(weights);
}

/**
 * Prefer values that can merge with something already on board.
 * Priority: orphan (odd count) → any value present on board → pool default.
 * Avoids dumping a random 4 onto a 16/32-only board.
 */
function pickMergeFriendlySpec(
  board: BoardState,
  _unlockedColors: number,
  pool: SpawnSpec[],
): SpawnSpec {
  const counts = countByColorValue(board);
  const orphans = new Set<number>();
  const present = new Set<number>();
  for (const [k, n] of counts) {
    const value = Number(k.split(':')[1]);
    if (!(value > 0 && value < 64)) continue;
    present.add(value);
    if (n % 2 === 1) orphans.add(value);
  }

  // Also seed partners from live pieces (incl. high tiers like 16/32)
  for (const p of board.pieces) {
    if (p.value >= 64) continue;
    present.add(p.value);
  }

  const orphanPool = pool.filter((s) => orphans.has(s.value));
  if (orphanPool.length > 0 && Math.random() < 0.85) {
    return weightedPickSpec(orphanPool);
  }

  // Extend pool with board-present values not in default pool (e.g. 16/32 on late board)
  const extra: SpawnSpec[] = [];
  for (const v of present) {
    if (pool.some((s) => s.value === v)) continue;
    if (v >= 64) continue;
    extra.push({ value: v, orient: 'h', weight: 40 });
    if (v === 2 || v === 8 || v === 16 || v === 32) {
      extra.push({ value: v, orient: 'v', weight: 28 });
    }
  }
  const presentPool = [...pool.filter((s) => present.has(s.value)), ...extra];
  if (presentPool.length > 0 && Math.random() < 0.8) {
    return weightedPickSpec(presentPool);
  }

  return weightedPickSpec(pool);
}

function weightedPickSpec(pool: SpawnSpec[]): SpawnSpec {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return pool[0]!;
}

/** Orient matching an existing same color+value strip when possible. */
function preferOrientFor(
  board: BoardState,
  value: number,
  color: number,
  fallback: Orientation,
): Orientation {
  for (const p of board.pieces) {
    if (p.value !== value || p.color !== color) continue;
    if (p.w === p.h) return fallback;
    return p.w > p.h ? 'h' : 'v';
  }
  return fallback;
}

function scoreNearSame(
  board: BoardState,
  value: number,
  color: number,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  let s = 0;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const counts = countByColorValue(board);
  const n = counts.get(`${color}:${value}`) ?? 0;
  // Strong bias: completing an odd pair / matching existing color-value
  if (n % 2 === 1) s += 50;
  else if (n > 0) s += 20;

  for (const p of board.pieces) {
    if (p.value !== value || p.color !== color) continue;
    const d =
      Math.abs(p.x + p.w / 2 - cx) + Math.abs(p.y + p.h / 2 - cy);
    if (d < Math.max(p.w, p.h, w, h) + 2) s += 30;
    // Prefer matching strip orientation when value is non-square
    if (w !== h && p.w !== p.h) {
      const sameAxis = (w > h) === (p.w > p.h);
      if (sameAxis) s += 15;
      else s -= 25; // wrong axis = cannot merge with that strip
    }
  }
  return s;
}

function commitPlace(
  board: BoardState,
  value: number,
  orient: Orientation,
  color: number,
  x: number,
  y: number,
  /** When true, allow placement even if still not playable (multi-spawn building). */
  allowUnplayable = false,
): SpawnResult | null {
  const { w, h } = sizeForValue(value, orient);
  if (!canPlaceRect(board, x, y, w, h)) return null;
  const trial = cloneBoard(board);
  const id = allocId(trial);
  upsertPiece(trial, { id, value, color, x, y, w, h });
  // Cheap only — must not call tryMerge
  if (!allowUnplayable && !isPlayable(trial)) return null;
  return {
    board: trial,
    spawnedId: id,
    label: `出块 ${value}·色${color + 1}(${axisLabel(w, h)})`,
  };
}

/**
 * Place one piece; prefers board-present / orphan partners.
 */
export function trySpawnOne(
  board: BoardState,
  unlockedColors = 2,
  wave = 1,
  opts?: { forcePartner?: boolean; allowUnplayable?: boolean },
): SpawnResult {
  const unlocked = clampUnlocked(unlockedColors);
  const needRescue = !isPlayable(board) || !!opts?.forcePartner;
  const allowUnplayable = !!opts?.allowUnplayable;
  const phasePool = poolForProgress(board, unlocked, wave);
  const relief = reliefForProgress(unlocked, wave);

  const fastSpecs: SpawnSpec[] = needRescue
    ? [...relief, ...phasePool]
    : [
        pickSpec(board, unlocked, wave),
        pickSpec(board, unlocked, wave),
        pickSpec(board, unlocked, wave),
        ...relief,
        ...phasePool,
      ];

  let best: SpawnResult | null = null;
  let bestScore = -1;

  for (const raw of fastSpecs) {
    const color = pickMergeColor(board, raw.value, unlocked, wave);
    const orient = preferOrientFor(board, raw.value, color, raw.orient);
    const spec = { ...raw, orient };
    const { w, h } = sizeForValue(spec.value, spec.orient);
    const spots = samplePlacements(board, w, h, FAST_SPOTS_PER_SPEC);
    for (const e of spots) {
      const r = commitPlace(
        board,
        spec.value,
        spec.orient,
        color,
        e.x,
        e.y,
        allowUnplayable,
      );
      if (!r) continue;
      let sc =
        10 +
        (spec.value === 32 ? 36 : 0) +
        (spec.value === 16 ? 28 : 0) +
        (spec.value === 8 ? 24 : 0) +
        (spec.value === 4 ? 18 : 0) +
        (spec.value === 2 ? 12 : 0) +
        (spec.value === 1 ? -8 : 0);
      sc += scoreNearSame(board, spec.value, color, e.x, e.y, w, h);
      // Extra: matching any on-board value
      if (board.pieces.some((p) => p.value === spec.value && p.color === color)) {
        sc += 35;
      }
      if (needRescue) sc += 20;
      if (sc > bestScore) {
        bestScore = sc;
        best = r;
      }
    }
    if (!needRescue && best && bestScore >= 55) {
      return best;
    }
  }

  if (best && !needRescue) return best;

  // ——— Relief: exhaustive spots ———
  for (const raw of relief) {
    const color = pickMergeColor(board, raw.value, unlocked, wave);
    const orient = preferOrientFor(board, raw.value, color, raw.orient);
    const { w, h } = sizeForValue(raw.value, orient);
    const spots = allPlacements(board, w, h);
    shuffleInPlace(spots);
    for (const e of spots) {
      const r = commitPlace(board, raw.value, orient, color, e.x, e.y, true);
      if (!r) continue;
      let sc =
        50 +
        (raw.value === 32 ? 40 : 0) +
        (raw.value === 16 ? 32 : 0) +
        (raw.value === 8 ? 30 : 0) +
        (raw.value === 4 ? 28 : 0) +
        scoreNearSame(board, raw.value, color, e.x, e.y, w, h);
      if (board.pieces.some((p) => p.value === raw.value && p.color === color)) {
        sc += 40;
      }
      if (sc > bestScore) {
        bestScore = sc;
        best = { ...r, label: `救援${r.label}` };
      }
    }
  }

  // Last resort: spawn a direct partner for the highest lonely piece
  if (!best || needRescue) {
    const partner = forcePartnerSpawn(board, unlocked, wave, allowUnplayable || needRescue);
    if (partner && (bestScore < 80 || !best)) return partner;
  }

  if (best) return best;

  return {
    board,
    spawnedId: null,
    label: needRescue ? '无救援出块' : '无安全出块',
  };
}

/** Orphans: (color,value) with odd count, value < 64 — sorted high value first. */
function listOrphans(board: BoardState): { value: number; color: number }[] {
  const counts = countByColorValue(board);
  const list: { value: number; color: number; n: number }[] = [];
  for (const [k, n] of counts) {
    if (n % 2 !== 1) continue;
    const [cs, vs] = k.split(':');
    const value = Number(vs);
    const color = Number(cs);
    if (!(value > 0 && value < 64)) continue;
    list.push({ value, color, n });
  }
  list.sort((a, b) => b.value - a.value);
  return list.map(({ value, color }) => ({ value, color }));
}

/** Place one twin for a specific color+value (matching strip orient). */
function spawnPartnerFor(
  board: BoardState,
  value: number,
  color: number,
): SpawnResult | null {
  const preferred = preferOrientFor(board, value, color, 'h');
  const order: Orientation[] =
    preferred === 'h' ? ['h', 'v'] : ['v', 'h'];

  let bestR: SpawnResult | null = null;
  let bestSc = -1;
  for (const orient of order) {
    const { w, h } = sizeForValue(value, orient);
    if (w * h !== value) continue;
    const spots = allPlacements(board, w, h);
    shuffleInPlace(spots);
    for (const e of spots) {
      const r = commitPlace(board, value, orient, color, e.x, e.y, true);
      if (!r) continue;
      // Prefer sustainable: can move, or merge won't instant-death
      if (!hasSustainablePlay(r.board)) continue;
      let sc = 100 + scoreNearSame(board, value, color, e.x, e.y, w, h);
      if (hasLegalMove(r.board)) sc += 40; // not forced to merge only
      if (freeCells(r.board) >= 4) sc += 15;
      if (sc > bestSc) {
        bestSc = sc;
        bestR = { ...r, label: `配对 ${value}·色${color + 1}` };
      }
    }
  }
  return bestR;
}

function forcePartnerSpawn(
  board: BoardState,
  _unlocked: number,
  _wave: number,
  _allowUnplayable: boolean,
): SpawnResult | null {
  for (const o of listOrphans(board)) {
    const r = spawnPartnerFor(board, o.value, o.color);
    if (r) return r;
  }
  // Double highest under 64 if no odd orphan
  let top: { value: number; color: number } | null = null;
  for (const p of board.pieces) {
    if (p.value >= 64) continue;
    if (!top || p.value > top.value) top = { value: p.value, color: p.color };
  }
  if (top) return spawnPartnerFor(board, top.value, top.color);
  return null;
}

/**
 * Inject two identical small pieces (same color) so they can merge each other.
 * Accepts if board is playable OR at least has two same color+value (material for later).
 */
function spawnFreshMergePair(
  board: BoardState,
  unlocked: number,
  wave: number,
): { board: BoardState; ids: number[]; label: string } | null {
  const present = colorsPresentOnBoard(board.pieces, unlocked);
  const weights = boardActiveColorWeights(wave, unlocked, present);
  // Prefer colors still on board (exile loop)
  const color = pickWeightedColor(weights);

  const candidates: { value: number; orient: Orientation }[] = [
    { value: 2, orient: 'h' },
    { value: 2, orient: 'v' },
    { value: 4, orient: 'h' },
    { value: 1, orient: 'h' },
  ];

  for (const c of candidates) {
    const { w, h } = sizeForValue(c.value, c.orient);
    if (w * h !== c.value) continue;
    if (freeCells(board) < c.value * 2) continue;
    const spots = allPlacements(board, w, h);
    if (spots.length < 2) continue;
    shuffleInPlace(spots);

    for (let i = 0; i < Math.min(spots.length, 40); i++) {
      const a = spots[i]!;
      const mid = commitPlace(board, c.value, c.orient, color, a.x, a.y, true);
      if (!mid || mid.spawnedId == null) continue;
      const spots2 = allPlacements(mid.board, w, h);
      shuffleInPlace(spots2);
      for (const b of spots2.slice(0, 40)) {
        // Allow unplayable intermediate geometry; accept if material or playable
        const fin = commitPlace(mid.board, c.value, c.orient, color, b.x, b.y, true);
        if (!fin || fin.spawnedId == null) continue;
        // Reject “only merge then die”
        if (!hasSustainablePlay(fin.board)) continue;
        return {
          board: fin.board,
          ids: [mid.spawnedId, fin.spawnedId],
          label: `对刷 ${c.value}·色${color + 1}×2`,
        };
      }
    }
  }
  return null;
}

/** Single small piece that completes a board orphan or seeds material. */
function spawnOneSmall(
  board: BoardState,
  unlocked: number,
  wave: number,
): SpawnResult | null {
  // Prefer partner for any orphan that fits
  for (const o of listOrphans(board)) {
    if (o.value > freeCells(board)) continue;
    const r = spawnPartnerFor(board, o.value, o.color);
    if (r) return r;
  }
  // Place one 2/4/1 matching a color still on board
  const present = colorsPresentOnBoard(board.pieces, unlocked);
  const color = pickWeightedColor(boardActiveColorWeights(wave, unlocked, present));
  for (const value of [2, 4, 1] as const) {
    for (const orient of ['h', 'v'] as Orientation[]) {
      const { w, h } = sizeForValue(value, orient);
      if (w * h !== value) continue;
      const spots = samplePlacements(board, w, h, 20);
      for (const e of spots) {
        const r = commitPlace(board, value, orient, color, e.x, e.y, true);
        if (!r) continue;
        if (hasSustainablePlay(r.board)) {
          return { ...r, label: `出块 ${value}·色${color + 1}` };
        }
      }
    }
  }
  // Absolute last: any free cell 1
  const spots = allPlacements(board, 1, 1);
  if (spots.length === 0) return null;
  shuffleInPlace(spots);
  const e = spots[0]!;
  return commitPlace(board, 1, 'h', color, e.x, e.y, true);
}

export type MultiSpawnResult = {
  board: BoardState;
  spawnedIds: number[];
  label: string;
};

/**
 * Post-merge spawn:
 * - Always inject material when free cells > 0 (禁止“合完完全不出块”)
 * - Prefer same color+value partners; else 对刷 small pair; else one small piece
 * - Do not fill with multi-color junk; do not skip spawn just because board can still move
 */
export function trySpawnAfterMerge(
  board: BoardState,
  unlockedColors: number,
  wave: number,
  piecesBefore: number,
): MultiSpawnResult {
  const unlocked = clampUnlocked(unlockedColors);
  let cur = board;
  const ids: number[] = [];
  const labels: string[] = [];

  if (freeCells(board) <= 0) {
    return { board, spawnedIds: [], label: '盘满无出块' };
  }

  const budget = Math.max(1, spawnBudget(board, piecesBefore));

  // ——— Phase A: complete orphans that fit (high value first) ———
  let placed = 0;
  const tried = new Set<string>();
  while (placed < budget) {
    const orphans = listOrphans(cur).filter((o) => !tried.has(`${o.color}:${o.value}`));
    if (orphans.length === 0) break;
    let did = false;
    for (const o of orphans) {
      tried.add(`${o.color}:${o.value}`);
      if (o.value > freeCells(cur)) continue;
      const r = spawnPartnerFor(cur, o.value, o.color);
      if (!r || r.spawnedId == null) continue;
      cur = r.board;
      ids.push(r.spawnedId);
      labels.push(r.label);
      placed++;
      did = true;
      break;
    }
    if (!did) break;
  }

  // ——— Phase B: still need material (no pair on board) → 对刷 ———
  const needMaterial = !hasMergeMaterial(cur) || ids.length === 0;
  if (needMaterial && freeCells(cur) >= 2) {
    const pair = spawnFreshMergePair(cur, unlocked, wave);
    if (pair) {
      cur = pair.board;
      ids.push(...pair.ids);
      labels.push(pair.label);
    }
  }

  // ——— Phase C: still nothing placed → force one partner or one small ———
  if (ids.length === 0) {
    const r =
      forcePartnerSpawn(cur, unlocked, wave, true) ??
      spawnOneSmall(cur, unlocked, wave);
    if (r?.spawnedId != null) {
      cur = r.board;
      ids.push(r.spawnedId);
      labels.push(r.label);
    }
  }

  // ——— Phase D: budget remainder — optional second partner if room ———
  if (ids.length > 0 && ids.length < budget && freeCells(cur) >= 8) {
    const r = forcePartnerSpawn(cur, unlocked, wave, false);
    if (r?.spawnedId != null && (isPlayable(r.board) || hasMergeMaterial(r.board))) {
      cur = r.board;
      ids.push(r.spawnedId);
      labels.push(r.label);
    }
  }

  // ——— Phase E: if somehow still empty, last-ditch small ———
  if (ids.length === 0 && freeCells(board) > 0) {
    const r = spawnOneSmall(board, unlocked, wave);
    if (r?.spawnedId != null) {
      cur = r.board;
      ids.push(r.spawnedId);
      labels.push(r.label);
    }
  }

  // Reject spawn sets that only allow a merge-then-die
  if (ids.length > 0 && !hasSustainablePlay(cur)) {
    // Prefer a sustainable small pair from the pre-spawn board
    const pair = spawnFreshMergePair(board, unlocked, wave);
    if (pair && hasSustainablePlay(pair.board)) {
      return {
        board: pair.board,
        spawnedIds: pair.ids,
        label: pair.label,
      };
    }
    // One small with move room from original
    const one = spawnOneSmall(board, unlocked, wave);
    if (one?.spawnedId != null && hasSustainablePlay(one.board)) {
      return {
        board: one.board,
        spawnedIds: [one.spawnedId],
        label: one.label,
      };
    }
    // Last resort: keep if at least playable; else no spawn (don't force death)
    if (!isPlayable(cur) && isPlayable(board)) {
      return { board, spawnedIds: [], label: '出块跳过(防秒死)' };
    }
  }

  const label =
    ids.length === 0
      ? '无出块'
      : ids.length === 1
        ? labels[0]!
        : `出${ids.length}块(${labels.join('+')})`;

  return { board: cur, spawnedIds: ids, label };
}
