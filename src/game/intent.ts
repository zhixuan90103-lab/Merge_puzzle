/**
 * Intent constants + pure helpers for two-phase drag and T* scoring.
 * Design: docs/DESIGN_DRAG_MERGE.md
 */
import { cellsOfRect } from './shapes';
import type { BoardState, Piece } from './types';
import { GRID_SIZE } from './types';

export type Rect = { x: number; y: number; w: number; h: number };

/** Snap / aim thresholds (cell units). */
export const SNAP_ENTER_DIST = 1.15;
export const SNAP_EXIT_DIST = 1.65;
export const AIM_DEADZONE = 0.25;
export const AIM_COMMIT = 0.4;
/** Logic ghost soft-pull toward B when locked (0–1). */
export const SOFT_PULL_LOGIC = 0.32;
/** Dragging piece visual soft-pull (0–1). */
export const SOFT_PULL_VISUAL = 0.22;

export type ExpAmount = {
  left: number;
  right: number;
  up: number;
  down: number;
  bilateralH: boolean;
  bilateralV: boolean;
};

export type SideClass = {
  axis: 'h' | 'v';
  dirX: number;
  dirY: number;
  confidence: number;
  bilateralHint: boolean;
};

export type OccupancyCount = {
  empty: number;
  pushable: number;
  cells: number;
};

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function rectOverlapCells(a: Rect, b: Rect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

export function centerDistCells(
  ghost: { x: number; y: number },
  A: Pick<Piece, 'w' | 'h'>,
  B: Pick<Piece, 'x' | 'y' | 'w' | 'h'>,
): number {
  const gcx = ghost.x + A.w / 2;
  const gcy = ghost.y + A.h / 2;
  const bcx = B.x + B.w / 2;
  const bcy = B.y + B.h / 2;
  return Math.hypot(gcx - bcx, gcy - bcy);
}

/** Soft magnet: pull ghost partway toward B seat (not flush). */
export function softPullGhostTowardB(
  ghost: { x: number; y: number },
  A: Pick<Piece, 'w' | 'h'>,
  B: Pick<Piece, 'x' | 'y' | 'w' | 'h'>,
  pull: number = SOFT_PULL_LOGIC,
): { x: number; y: number } {
  const sx = Math.max(0, Math.min(GRID_SIZE - A.w, B.x));
  const sy = Math.max(0, Math.min(GRID_SIZE - A.h, B.y));
  return {
    x: Math.max(
      0,
      Math.min(GRID_SIZE - A.w, Math.round(ghost.x + (sx - ghost.x) * pull)),
    ),
    y: Math.max(
      0,
      Math.min(GRID_SIZE - A.h, Math.round(ghost.y + (sy - ghost.y) * pull)),
    ),
  };
}

/**
 * Post-lock micro-aim from finger delta in cell units.
 * Only samples motion after lock attach (caller passes delta from lock origin).
 */
export function lockAimFromDelta(
  ddx: number,
  ddy: number,
  commit: number = AIM_COMMIT,
): { enterDx: number; enterDy: number; playerAim: boolean } {
  const mag = Math.hypot(ddx, ddy);
  if (mag < AIM_DEADZONE) {
    return { enterDx: 0, enterDy: 0, playerAim: false };
  }
  if (mag < commit) {
    return { enterDx: ddx, enterDy: ddy, playerAim: false };
  }
  // Dominant axis suppresses diagonal noise
  if (Math.abs(ddx) >= Math.abs(ddy) * 1.15) {
    return { enterDx: Math.sign(ddx) * mag, enterDy: 0, playerAim: true };
  }
  if (Math.abs(ddy) >= Math.abs(ddx) * 1.15) {
    return { enterDx: 0, enterDy: Math.sign(ddy) * mag, playerAim: true };
  }
  return { enterDx: ddx, enterDy: ddy, playerAim: true };
}

/**
 * Combine post-lock slide with where the finger sits on B.
 * Sitting clearly on the upper half of B counts as aim even without a long swipe
 * (fixes T* still sprawling into empty below while finger is high on the piece).
 */
export function lockAimCombined(
  slideDdx: number,
  slideDdy: number,
  /** Finger center − B center (cell units) */
  placeDdx: number,
  placeDdy: number,
): { enterDx: number; enterDy: number; playerAim: boolean } {
  const slide = lockAimFromDelta(slideDdx, slideDdy, AIM_COMMIT);
  // Placement on B: slightly lower commit so “靠上/靠右” is easy to register
  const place = lockAimFromDelta(placeDdx, placeDdy, 0.32);

  if (slide.playerAim && place.playerAim) {
    const sm = Math.hypot(slide.enterDx, slide.enterDy);
    const pm = Math.hypot(place.enterDx, place.enterDy);
    // Prefer the clearer axis signal; blend if similar
    if (sm >= pm * 1.15) return slide;
    if (pm >= sm * 1.15) return place;
    return {
      enterDx: slide.enterDx * 0.45 + place.enterDx * 0.55,
      enterDy: slide.enterDy * 0.45 + place.enterDy * 0.55,
      playerAim: true,
    };
  }
  if (place.playerAim) return place;
  if (slide.playerAim) return slide;
  // Soft cues for scoring even without full commit
  if (Math.hypot(place.enterDx, place.enterDy) >= AIM_DEADZONE) return place;
  return slide;
}

export function expandDirs(from: Rect, to: Rect): ExpAmount {
  const left = Math.max(0, from.x - to.x);
  const right = Math.max(0, to.x + to.w - (from.x + from.w));
  const up = Math.max(0, from.y - to.y);
  const down = Math.max(0, to.y + to.h - (from.y + from.h));
  return {
    left,
    right,
    up,
    down,
    bilateralH: left > 0 && right > 0,
    bilateralV: up > 0 && down > 0,
  };
}

export function expansionOccupancy(
  board: BoardState,
  B: Piece,
  T: Rect,
): OccupancyCount {
  const bset = new Set(
    cellsOfRect(B.x, B.y, B.w, B.h).map((c) => cellKey(c.x, c.y)),
  );
  const cellValue = new Map<string, number>();
  for (const p of board.pieces) {
    if (p.id === B.id) continue;
    for (const c of cellsOfRect(p.x, p.y, p.w, p.h)) {
      cellValue.set(cellKey(c.x, c.y), p.value);
    }
  }
  let empty = 0;
  let pushable = 0;
  let cells = 0;
  const newValue = B.value * 2;
  for (const c of cellsOfRect(T.x, T.y, T.w, T.h)) {
    const k = cellKey(c.x, c.y);
    if (bset.has(k)) continue;
    cells++;
    const v = cellValue.get(k);
    if (v === undefined) empty++;
    else if (v <= newValue) pushable++;
  }
  return { empty, pushable, cells };
}

/** Enemy pieces in T expansion — default aim prefers pushing them. */
export function expansionEnemyScore(
  board: BoardState,
  B: Piece,
  T: Rect,
  mergeColor: number,
): number {
  const bset = new Set(
    cellsOfRect(B.x, B.y, B.w, B.h).map((c) => cellKey(c.x, c.y)),
  );
  const newValue = B.value * 2;
  let score = 0;
  const seen = new Set<number>();
  for (const p of board.pieces) {
    if (p.id === B.id || p.color === mergeColor) continue;
    if (p.value > newValue) continue;
    if (seen.has(p.id)) continue;
    let hit = false;
    for (const c of cellsOfRect(p.x, p.y, p.w, p.h)) {
      if (bset.has(cellKey(c.x, c.y))) continue;
      if (
        c.x >= T.x &&
        c.y >= T.y &&
        c.x < T.x + T.w &&
        c.y < T.y + T.h
      ) {
        hit = true;
        break;
      }
    }
    if (hit) {
      seen.add(p.id);
      score += 40 + p.value * 8;
    }
  }
  return score;
}

/**
 * Prefer one-sided grow into empty — but keep magnitude modest so
 * expansionEnemyScore can win when 异色 is on another axis.
 */
export function scoreEmptyEdge(
  bilateral: boolean,
  exp: ExpAmount,
  occ: OccupancyCount,
): number {
  let s = 0;
  if (occ.cells <= 0) return 0;
  const emptyRatio = occ.empty / occ.cells;
  if (!bilateral && emptyRatio >= 0.75) s += 90 + occ.empty * 4;
  else if (!bilateral && emptyRatio >= 0.4) s += 35;
  if (bilateral) {
    if (exp.bilateralH || exp.bilateralV) s -= 200;
    if (emptyRatio < 0.5) s -= 80;
  }
  return s;
}

export function bilateralServesIntent(side: SideClass, exp: ExpAmount): boolean {
  if (side.dirY < 0 && exp.up > 0) return true;
  if (side.dirY > 0 && exp.down > 0) return true;
  if (side.dirX < 0 && exp.left > 0) return true;
  if (side.dirX > 0 && exp.right > 0) return true;
  return false;
}

export function primaryDirFromExp(
  exp: ExpAmount,
  bilateral: boolean,
  side: SideClass,
): { dirX: number; dirY: number } {
  if (bilateral) {
    if (side.dirY < 0 && exp.up > 0) return { dirX: 0, dirY: -1 };
    if (side.dirY > 0 && exp.down > 0) return { dirX: 0, dirY: 1 };
    if (side.dirX < 0 && exp.left > 0) return { dirX: -1, dirY: 0 };
    if (side.dirX > 0 && exp.right > 0) return { dirX: 1, dirY: 0 };
    if (exp.up + exp.down >= exp.left + exp.right) {
      return { dirX: 0, dirY: exp.up >= exp.down ? -1 : 1 };
    }
    return { dirX: exp.left >= exp.right ? -1 : 1, dirY: 0 };
  }
  let dirX = 0;
  let dirY = 0;
  if (exp.right > 0) dirX = 1;
  else if (exp.left > 0) dirX = -1;
  if (exp.down > 0) dirY = 1;
  else if (exp.up > 0) dirY = -1;
  if (exp.left + exp.right >= exp.up + exp.down) dirY = 0;
  else dirX = 0;
  return { dirX, dirY };
}

/**
 * Score candidate T* under design priority:
 * player aim > enemy push > empty edge (no aimless centered bilateral).
 */
export function scoreMergeCandidate(opts: {
  playerAim: boolean;
  denseBoard: boolean;
  side: SideClass;
  bilateral: boolean;
  exp: ExpAmount;
  dirX: number;
  dirY: number;
  occ: OccupancyCount;
  enemy: number;
  coverG: number;
  intentScore: number;
}): number {
  const {
    playerAim,
    denseBoard,
    side,
    bilateral,
    exp,
    occ,
    enemy,
    coverG,
    intentScore,
  } = opts;
  let score = 10 + coverG * 8 + scoreEmptyEdge(bilateral, exp, occ);

  const trueEmptySlot =
    bilateral &&
    occ.cells > 0 &&
    occ.empty >= occ.cells * 0.75 &&
    occ.pushable <= Math.max(1, Math.floor(occ.cells * 0.25));
  const intentBilat = bilateral && bilateralServesIntent(side, exp);

  if (playerAim) {
    const pushPen = denseBoard ? 8 : 25;
    // Empty must not override placement aim (finger high ≠ grow into empty below).
    const emptyBon = denseBoard ? 1 : 2;
    score -= occ.pushable * pushPen;
    score += occ.empty * emptyBon;
    score += intentScore;
    // Mild prefer clearing enemies when aim is ambiguous on axis
    score += enemy * 1.2;
    if (bilateral) {
      if (trueEmptySlot) score += 40;
      else if (intentBilat) score -= 40;
      else score -= denseBoard ? 80 : 120;
      if (side.confidence >= 0.7 && !side.bilateralHint && !intentBilat) {
        score -= 200;
      }
    }
  } else {
    // Default: 异色可推 >> 空地 (empty must not beat enemy-clearing shapes)
    if (enemy > 0) {
      score += 900 + enemy * 12;
      score += occ.empty * 3;
      score -= occ.pushable * 2;
      if (bilateral) score -= 120;
    } else {
      score += occ.empty * (denseBoard ? 14 : 24);
      score -= occ.pushable * (denseBoard ? 4 : 10);
      if (!bilateral && occ.empty >= occ.cells * 0.75) score += 120;
      else if (bilateral) score -= 180;
      else if (occ.empty >= occ.cells * 0.5) score += 50;
    }
  }
  return score;
}
