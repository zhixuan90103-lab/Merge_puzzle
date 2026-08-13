/**
 * Drop proposal + merge shape pick.
 * Design: docs/DESIGN_DRAG_MERGE.md
 */
import { canPlaceRect, cloneBoard, getPiece, pieceCenter, upsertPiece } from './board';
import {
  bilateralServesIntent,
  cellKey,
  centerDistCells,
  expandDirs,
  expansionEnemyScore,
  expansionOccupancy,
  primaryDirFromExp,
  rectOverlapCells,
  scoreEmptyEdge,
  scoreMergeCandidate,
  softPullGhostTowardB,
  type ExpAmount,
  type SideClass,
  SOFT_PULL_LOGIC,
} from './intent';
import { resolveMergeApproachTrend, tryMerge } from './merge';
import { canMergePair, cellsOfRect, sizeCandidates } from './shapes';
import type { BoardState, Orientation, Piece } from './types';
import { GRID_SIZE } from './types';

export type DropKind = 'merge' | 'move' | 'illegal';
export type Rect = { x: number; y: number; w: number; h: number };

export {
  AIM_COMMIT,
  AIM_DEADZONE,
  SNAP_ENTER_DIST,
  SNAP_EXIT_DIST,
  SOFT_PULL_LOGIC,
  centerDistCells,
  rectOverlapCells,
} from './intent';

export type DropProposal = {
  kind: DropKind;
  ghost: { x: number; y: number };
  targetId: number | null;
  overlapCells: number;
  reason: string;
  fingerRect?: Rect;
  mergeTarget?: Rect | null;
  /** Distinct growth ways (shape × direction). 1 = keep T* sticky. */
  mergeUniqueWays?: number;
  bilateral?: boolean;
  growDirX?: number;
  growDirY?: number;
  locked?: boolean;
  playerAim?: boolean;
};

export type ProposeDropOpts = {
  fingerRect?: Rect;
  enterDx?: number;
  enterDy?: number;
  origin?: { x: number; y: number };
  phase?: 'free' | 'locked';
  lockedTargetId?: number;
  playerAim?: boolean;
  stickyT?: Rect | null;
};

export type MergeShapePick = {
  T: Rect;
  score: number;
  bilateral: boolean;
  dirX: number;
  dirY: number;
  uniqueWays?: number;
};

function growthWayKey(c: MergeShapePick): string {
  return `${c.T.w}x${c.T.h}:${Math.sign(c.dirX)}:${Math.sign(c.dirY)}:${c.bilateral ? 1 : 0}`;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

const SIDE_EPS = 0.3;

export function nearestMergeable(
  board: BoardState,
  A: Piece,
  ghost: { x: number; y: number },
): { target: Piece; dist: number; overlap: number } | null {
  const gRect = { x: ghost.x, y: ghost.y, w: A.w, h: A.h };
  let best: { target: Piece; dist: number; overlap: number } | null = null;
  for (const p of board.pieces) {
    if (p.id === A.id) continue;
    if (p.color !== A.color || p.value !== A.value) continue;
    if (!canMergePair(A, p)) continue;
    const dist = centerDistCells(ghost, A, p);
    const overlap = rectOverlapCells(gRect, p);
    if (!best) {
      best = { target: p, dist, overlap };
      continue;
    }
    const bestTouch = best.overlap >= 0.2;
    const touch = overlap >= 0.2;
    // Prefer a piece we are actually overlapping over a closer non-touch.
    if (touch && !bestTouch) {
      best = { target: p, dist, overlap };
      continue;
    }
    if (!touch && bestTouch) continue;
    if (touch && overlap > best.overlap + 0.05) {
      best = { target: p, dist, overlap };
      continue;
    }
    if (dist < best.dist - 0.01) {
      best = { target: p, dist, overlap };
    }
  }
  return best;
}

export function mergeOverlapThreshold(_a: Piece, _b: Piece): number {
  return 1;
}

/** Merge when footprints overlap ≥ 1 cell. */
export function findMergeTarget(
  board: BoardState,
  A: Piece,
  ghost: { x: number; y: number },
): { target: Piece; overlap: number } | null {
  const gRect = { x: ghost.x, y: ghost.y, w: A.w, h: A.h };
  const gCenter = { x: ghost.x + A.w / 2, y: ghost.y + A.h / 2 };
  let best: { target: Piece; overlap: number; dist: number } | null = null;

  for (const p of board.pieces) {
    if (p.id === A.id) continue;
    if (p.color !== A.color) continue;
    if (p.value !== A.value) continue;
    if (!canMergePair(A, p)) continue;
    const overlap = rectOverlapCells(gRect, p);
    if (overlap < 1) continue;
    const pc = pieceCenter(p);
    const dist =
      (gCenter.x - pc.x) * (gCenter.x - pc.x) +
      (gCenter.y - pc.y) * (gCenter.y - pc.y);
    if (
      !best ||
      overlap > best.overlap ||
      (overlap === best.overlap && dist < best.dist)
    ) {
      best = { target: p, overlap, dist };
    }
  }
  return best ? { target: best.target, overlap: best.overlap } : null;
}

export function aimToGhost(
  boardLocalX: number,
  boardLocalY: number,
  cellSize: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const gx = Math.round(boardLocalX / cellSize - w / 2);
  const gy = Math.round(boardLocalY / cellSize - h / 2);
  return {
    x: Math.max(0, Math.min(GRID_SIZE - w, gx)),
    y: Math.max(0, Math.min(GRID_SIZE - h, gy)),
  };
}

export function fingerRectFromAim(
  aimCellX: number,
  aimCellY: number,
  w: number,
  h: number,
): Rect {
  return { x: aimCellX - w / 2, y: aimCellY - h / 2, w, h };
}

function protrusion(a: Rect, b: Rect) {
  return {
    left: Math.max(0, b.x - a.x),
    right: Math.max(0, a.x + a.w - (b.x + b.w)),
    up: Math.max(0, b.y - a.y),
    down: Math.max(0, a.y + a.h - (b.y + b.h)),
  };
}

/** How strongly F sits on the given growth axis (cell units). */
export function placementAxisStrength(
  F: Rect,
  B: Rect,
  dirX: number,
  dirY: number,
): number {
  const pr = protrusion(F, B);
  const cdx = F.x + F.w / 2 - (B.x + B.w / 2);
  const cdy = F.y + F.h / 2 - (B.y + B.h / 2);
  const sx = (pr.right - pr.left) * 1.5 + cdx;
  const sy = (pr.down - pr.up) * 1.5 + cdy;
  if (dirX > 0) return Math.max(0, sx);
  if (dirX < 0) return Math.max(0, -sx);
  if (dirY > 0) return Math.max(0, sy);
  if (dirY < 0) return Math.max(0, -sy);
  return 0;
}

/** A hanging off the right of B → grow right. Ignores empty-space bias. */
export function placementGrowthDir(
  F: Rect,
  B: Rect,
): { dirX: number; dirY: number; confidence: number } {
  const pr = protrusion(F, B);
  const cdx = F.x + F.w / 2 - (B.x + B.w / 2);
  const cdy = F.y + F.h / 2 - (B.y + B.h / 2);
  const sx = (pr.right - pr.left) * 1.5 + cdx;
  const sy = (pr.down - pr.up) * 1.5 + cdy;
  const ax = Math.abs(sx);
  const ay = Math.abs(sy);
  if (ax < 0.16 && ay < 0.16) {
    return { dirX: 0, dirY: 0, confidence: 0 };
  }
  if (ax >= ay * 1.04) {
    return { dirX: Math.sign(sx), dirY: 0, confidence: Math.min(2.4, ax) };
  }
  return { dirX: 0, dirY: Math.sign(sy), confidence: Math.min(2.4, ay) };
}

/** Side / approach intent from finger body + post-lock enter delta. */
export function classifySide(
  F: Rect,
  B: Rect,
  enterDx = 0,
  enterDy = 0,
): SideClass {
  const bc = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
  const fc = { x: F.x + F.w / 2, y: F.y + F.h / 2 };

  let dx = fc.x - bc.x;
  let dy = fc.y - bc.y;

  const pr = protrusion(F, B);
  if (pr.left > pr.right && pr.left > 0.15) dx -= pr.left * 0.85;
  if (pr.right > pr.left && pr.right > 0.15) dx += pr.right * 0.85;
  if (pr.up > pr.down && pr.up > 0.15) dy -= pr.up * 0.85;
  if (pr.down > pr.up && pr.down > 0.15) dy += pr.down * 0.85;

  const centerMag = Math.abs(fc.x - bc.x) + Math.abs(fc.y - bc.y);
  const enterMag = Math.abs(enterDx) + Math.abs(enterDy);
  if (centerMag < 0.45 && pr.left + pr.right + pr.up + pr.down < 0.55) {
    if (enterMag > 0.06) {
      dx = -enterDx;
      dy = -enterDy;
    }
  } else if (enterMag > 0.2 && centerMag < 0.9) {
    dx = dx * 0.45 + -enterDx * 0.55;
    dy = dy * 0.45 + -enterDy * 0.55;
  }

  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const bilatH = pr.left > 0.35 && pr.right > 0.35;
  const bilatV = pr.up > 0.35 && pr.down > 0.35;

  if (adx > ady + SIDE_EPS) {
    const conf = Math.min(3, adx + Math.max(pr.left, pr.right) + enterMag * 0.35);
    return {
      axis: 'h',
      dirX: dx >= 0 ? 1 : -1,
      dirY: 0,
      confidence: Math.max(0.35, conf),
      bilateralHint: bilatH && conf < 0.9,
    };
  }
  if (ady > adx + SIDE_EPS) {
    const conf = Math.min(3, ady + Math.max(pr.up, pr.down) + enterMag * 0.35);
    return {
      axis: 'v',
      dirX: 0,
      dirY: dy >= 0 ? 1 : -1,
      confidence: Math.max(0.35, conf),
      bilateralHint: bilatV && conf < 0.9,
    };
  }
  if (enterMag > 0.06) {
    if (Math.abs(enterDx) >= Math.abs(enterDy)) {
      return {
        axis: 'h',
        dirX: -Math.sign(enterDx) || 1,
        dirY: 0,
        confidence: 0.65,
        bilateralHint: bilatH,
      };
    }
    return {
      axis: 'v',
      dirX: 0,
      dirY: -Math.sign(enterDy) || 1,
      confidence: 0.65,
      bilateralHint: bilatV,
    };
  }
  if (bilatH) {
    return { axis: 'h', dirX: 0, dirY: 0, confidence: 0.35, bilateralHint: true };
  }
  if (bilatV) {
    return { axis: 'v', dirX: 0, dirY: 0, confidence: 0.35, bilateralHint: true };
  }
  return { axis: 'h', dirX: 1, dirY: 0, confidence: 0.15, bilateralHint: false };
}

export function canFitMergeTarget(
  board: BoardState,
  B: Piece,
  G: Rect,
  T: Rect,
): boolean {
  if (T.x < 0 || T.y < 0 || T.x + T.w > GRID_SIZE || T.y + T.h > GRID_SIZE) {
    return false;
  }
  if (T.x > B.x || T.y > B.y || T.x + T.w < B.x + B.w || T.y + T.h < B.y + B.h) {
    return false;
  }
  const newValue = B.value * 2;
  if (T.w * T.h !== newValue) return false;

  const bset = new Set(
    cellsOfRect(B.x, B.y, B.w, B.h).map((c) => cellKey(c.x, c.y)),
  );
  const gset = new Set(
    cellsOfRect(Math.round(G.x), Math.round(G.y), G.w, G.h).map((c) =>
      cellKey(c.x, c.y),
    ),
  );
  const cellValue = new Map<string, number>();
  for (const p of board.pieces) {
    if (p.id === B.id) continue;
    for (const c of cellsOfRect(p.x, p.y, p.w, p.h)) {
      cellValue.set(cellKey(c.x, c.y), p.value);
    }
  }
  for (const c of cellsOfRect(T.x, T.y, T.w, T.h)) {
    const k = cellKey(c.x, c.y);
    if (bset.has(k) || gset.has(k)) continue;
    const v = cellValue.get(k);
    if (v === undefined) continue;
    if (v > newValue) return false;
  }
  return true;
}

function matchesSideIntent(
  side: SideClass,
  dirX: number,
  dirY: number,
  bilateral: boolean,
  exp?: ExpAmount,
): boolean {
  if (bilateral) {
    if (side.bilateralHint) return true;
    if (side.confidence < 0.45) return true;
    if (exp && bilateralServesIntent(side, exp)) return true;
    return false;
  }
  if (side.dirX !== 0 && dirX === side.dirX && dirY === 0) return true;
  if (side.dirY !== 0 && dirY === side.dirY && dirX === 0) return true;
  if (side.axis === 'h' && dirX === side.dirX && side.dirX !== 0) return true;
  if (side.axis === 'v' && dirY === side.dirY && side.dirY !== 0) return true;
  return false;
}

function scoreIntentFn(
  side: SideClass,
  playerAim: boolean,
  denseBoard: boolean,
  dirX: number,
  dirY: number,
  bilateral: boolean,
  exp: ExpAmount,
): number {
  let s = 0;
  if (matchesSideIntent(side, dirX, dirY, bilateral, exp)) {
    s += (denseBoard ? 700 : 420) + side.confidence * 140;
  } else if (!bilateral) {
    if (side.dirX !== 0 && dirX === -side.dirX) s -= denseBoard ? 500 : 350;
    if (side.dirY !== 0 && dirY === -side.dirY) s -= denseBoard ? 500 : 350;
    if (side.confidence >= 0.4) {
      if (side.axis === 'h' && dirY !== 0 && dirX === 0) s -= 220;
      if (side.axis === 'v' && dirX !== 0 && dirY === 0) s -= 220;
    }
  }
  if (playerAim && side.confidence >= 0.35) {
    if (side.dirY < 0 && exp.down > 0) s -= 480 + exp.down * 40;
    if (side.dirY > 0 && exp.up > 0) s -= 480 + exp.up * 40;
    if (side.dirX < 0 && exp.right > 0) s -= 480 + exp.right * 40;
    if (side.dirX > 0 && exp.left > 0) s -= 480 + exp.left * 40;
    if (!bilateral) {
      if (side.dirY < 0 && exp.up > 0 && exp.down === 0) s += 200;
      if (side.dirY > 0 && exp.down > 0 && exp.up === 0) s += 200;
      if (side.dirX < 0 && exp.left > 0 && exp.right === 0) s += 200;
      if (side.dirX > 0 && exp.right > 0 && exp.left === 0) s += 200;
    } else {
      s -= 160;
    }
  }
  return s;
}

/**
 * Best T* for merge: playerAim → intent + one-way empty;
 * else 异色可推 > 空地边 (no centered bilateral default).
 */
export function findMergeShape(
  board: BoardState,
  A: Piece,
  B: Piece,
  G: Rect,
  F: Rect,
  enterDx: number,
  enterDy: number,
  opts?: { playerAim?: boolean; stickyT?: Rect | null },
): MergeShapePick | null {
  if (!canMergePair(A, B)) return null;
  const newValue = A.value * 2;
  if (newValue > 64) return null;

  const playerAim = opts?.playerAim ?? false;
  const side = classifySide(F, B, enterDx, enterDy);

  // Locked sticky: one feasibility check. Full scan is 48× tryMerge — too heavy on move.
  const stickyT = opts?.stickyT ?? null;
  if (stickyT && canFitMergeTarget(board, B, G, stickyT)) {
    if (mergeTargetFeasible(board, A, B, G, stickyT, enterDx, enterDy)) {
      const exp = expandDirs(B, stickyT);
      const bilateral = exp.bilateralH || exp.bilateralV;
      const { dirX, dirY } = primaryDirFromExp(exp, bilateral, side);
      return { T: stickyT, score: 1, bilateral, dirX, dirY, uniqueWays: 1 };
    }
  }

  const shapes: { w: number; h: number }[] = [];
  const sk = new Set<string>();
  for (const o of ['h', 'v'] as Orientation[]) {
    for (const s of sizeCandidates(newValue, o)) {
      const k = `${s.w}x${s.h}`;
      if (sk.has(k)) continue;
      sk.add(k);
      shapes.push(s);
    }
  }

  const cands: MergeShapePick[] = [];
  let freeCells = 0;
  {
    const occ = new Set<string>();
    for (const p of board.pieces) {
      if (p.id === B.id) continue;
      for (const c of cellsOfRect(p.x, p.y, p.w, p.h)) {
        occ.add(cellKey(c.x, c.y));
      }
    }
    for (const c of cellsOfRect(B.x, B.y, B.w, B.h)) occ.add(cellKey(c.x, c.y));
    freeCells = GRID_SIZE * GRID_SIZE - occ.size;
  }
  const denseBoard = freeCells <= 8;

  // Solid union of ghost A@G with B
  {
    const ghostA = { ...A, x: G.x, y: G.y };
    const minx = Math.min(ghostA.x, B.x);
    const miny = Math.min(ghostA.y, B.y);
    const maxx = Math.max(ghostA.x + ghostA.w - 1, B.x + B.w - 1);
    const maxy = Math.max(ghostA.y + ghostA.h - 1, B.y + B.h - 1);
    const uw = maxx - minx + 1;
    const uh = maxy - miny + 1;
    if (uw * uh === newValue && uw <= GRID_SIZE && uh <= GRID_SIZE) {
      const cellSet = new Set<string>();
      for (const c of cellsOfRect(ghostA.x, ghostA.y, ghostA.w, ghostA.h)) {
        cellSet.add(`${c.x},${c.y}`);
      }
      for (const c of cellsOfRect(B.x, B.y, B.w, B.h)) {
        cellSet.add(`${c.x},${c.y}`);
      }
      if (cellSet.size === newValue) {
        const T = { x: minx, y: miny, w: uw, h: uh };
        if (canFitMergeTarget(board, B, G, T)) {
          const exp = expandDirs(B, T);
          const bilateral = exp.bilateralH || exp.bilateralV;
          const { dirX, dirY } = primaryDirFromExp(exp, bilateral, side);
          const occU = expansionOccupancy(board, B, T);
          const enemyU = expansionEnemyScore(board, B, T, A.color);
          let score = 0;
          if (playerAim) {
            score = 280 + side.confidence * 40;
            score += scoreIntentFn(
              side,
              playerAim,
              denseBoard,
              dirX,
              dirY,
              bilateral,
              exp,
            );
            score += scoreEmptyEdge(bilateral, exp, occU);
          } else if (enemyU > 0) {
            score = 900 + enemyU * 12 + occU.empty * 3;
            if (bilateral) score -= 100;
          } else {
            score =
              40 +
              occU.empty * 18 +
              scoreEmptyEdge(bilateral, exp, occU);
          }
          cands.push({ T, score, bilateral, dirX, dirY });
        }
      }
    }
  }

  for (const { w, h } of shapes) {
    for (let y = 0; y <= GRID_SIZE - h; y++) {
      for (let x = 0; x <= GRID_SIZE - w; x++) {
        const T = { x, y, w, h };
        if (!canFitMergeTarget(board, B, G, T)) continue;

        const exp = expandDirs(B, T);
        if (exp.bilateralH && exp.bilateralV) continue;

        const bilateral = exp.bilateralH || exp.bilateralV;
        const { dirX, dirY } = primaryDirFromExp(exp, bilateral, side);
        const occ = expansionOccupancy(board, B, T);
        const enemy = expansionEnemyScore(board, B, T, A.color);

        let coverG = 0;
        for (const c of cellsOfRect(G.x, G.y, G.w, G.h)) {
          if (
            c.x >= T.x &&
            c.y >= T.y &&
            c.x < T.x + T.w &&
            c.y < T.y + T.h
          ) {
            coverG++;
          }
        }

        const intentScore = scoreIntentFn(
          side,
          playerAim,
          denseBoard,
          dirX,
          dirY,
          bilateral,
          exp,
        );
        const score = scoreMergeCandidate({
          playerAim,
          denseBoard,
          side,
          bilateral,
          exp,
          dirX,
          dirY,
          occ,
          enemy,
          coverG,
          intentScore,
        });
        cands.push({ T, score, bilateral, dirX, dirY });
      }
    }
  }

  if (cands.length === 0) return null;

  cands.sort((a, b) => b.score - a.score);
  const feasible: MergeShapePick[] = [];
  const maxCheck = Math.min(cands.length, 48);
  for (let i = 0; i < maxCheck; i++) {
    const c = cands[i]!;
    if (mergeTargetFeasible(board, A, B, G, c.T, enterDx, enterDy)) {
      feasible.push(c);
    }
  }
  if (feasible.length === 0) return null;

  const groups = new Map<string, MergeShapePick[]>();
  for (const c of feasible) {
    const k = growthWayKey(c);
    const list = groups.get(k);
    if (list) list.push(c);
    else groups.set(k, [c]);
  }
  const uniqueWays = groups.size;

  if (stickyT) {
    const kept = feasible.find((c) => sameRect(c.T, stickyT));
    if (kept) return { ...kept, uniqueWays };
  }

  if (uniqueWays === 1) {
    const only = [...groups.values()][0]!;
    only.sort((a, b) => b.score - a.score);
    return { ...only[0]!, uniqueWays };
  }

  const place = placementGrowthDir(F, B);
  if (place.confidence >= 0.22) {
    const aligned = feasible.filter((c) => {
      if (c.bilateral) return false;
      if (place.dirX !== 0) return Math.sign(c.dirX) === place.dirX;
      if (place.dirY !== 0) return Math.sign(c.dirY) === place.dirY;
      return false;
    });
    if (aligned.length > 0) {
      aligned.sort((a, b) => b.score - a.score);
      return { ...aligned[0]!, uniqueWays };
    }
  }

  for (const c of feasible) {
    const exp = expandDirs(B, c.T);
    c.score += scoreIntentFn(
      side,
      true,
      denseBoard,
      c.dirX,
      c.dirY,
      c.bilateral,
      exp,
    );
  }
  if (playerAim) {
    const confNeed = denseBoard ? 0.28 : 0.4;
    const strong = side.confidence >= confNeed && !side.bilateralHint;
    if (strong) {
      const aligned = feasible.filter((c) => {
        const exp = expandDirs(B, c.T);
        return matchesSideIntent(side, c.dirX, c.dirY, c.bilateral, exp);
      });
      if (aligned.length > 0) {
        aligned.sort((a, b) => b.score - a.score);
        return { ...aligned[0]!, uniqueWays };
      }
    }
  }
  feasible.sort((a, b) => b.score - a.score);
  return { ...feasible[0]!, uniqueWays };
}

function mergeTargetFeasible(
  boardWithoutA: BoardState,
  A: Piece,
  B: Piece,
  G: Rect,
  T: Rect,
  enterDx: number,
  enterDy: number,
): boolean {
  const full = cloneBoard(boardWithoutA);
  if (!getPiece(full, A.id)) {
    upsertPiece(full, { ...A });
  }
  if (!getPiece(full, B.id)) return false;

  const trend = resolveMergeApproachTrend({
    ghostA: { x: G.x, y: G.y, w: A.w, h: A.h },
    originA: { x: A.x, y: A.y, w: A.w, h: A.h },
    B: { x: B.x, y: B.y, w: B.w, h: B.h },
    designDx: enterDx * 40,
    designDy: enterDy * 40,
  });
  return tryMerge(full, A.id, B.id, trend, { forcedTarget: T }).ok;
}

export type PushPreviewItem = {
  id: number;
  rest: Rect;
  dest: Rect;
  off: boolean;
};

/** Final shove poses for T* preview (does not change the live board). */
export function computePushPreview(
  boardWithoutA: BoardState,
  A: Piece,
  B: Piece,
  G: Rect,
  T: Rect,
  enterDx: number,
  enterDy: number,
): PushPreviewItem[] {
  const full = cloneBoard(boardWithoutA);
  if (!getPiece(full, A.id)) {
    upsertPiece(full, { ...A, x: G.x, y: G.y });
  }
  if (!getPiece(full, B.id)) return [];
  const trend = resolveMergeApproachTrend({
    ghostA: { x: G.x, y: G.y, w: A.w, h: A.h },
    originA: { x: A.x, y: A.y, w: A.w, h: A.h },
    B: { x: B.x, y: B.y, w: B.w, h: B.h },
    designDx: enterDx * 40,
    designDy: enterDy * 40,
  });
  const result = tryMerge(full, A.id, B.id, trend, { forcedTarget: T });
  if (!result.ok) return [];
  const dest = new Map<number, Rect>();
  for (const step of result.plan.steps) {
    for (const mv of step.pushes) dest.set(mv.pieceId, mv.to);
  }
  const items: PushPreviewItem[] = [];
  for (const p of boardWithoutA.pieces) {
    if (p.id === B.id) continue;
    const to = dest.get(p.id);
    if (!to) continue;
    if (to.x === p.x && to.y === p.y && to.w === p.w && to.h === p.h) continue;
    const off = to.x + to.w <= 0 || to.y + to.h <= 0 || to.x >= 8 || to.y >= 8;
    items.push({
      id: p.id,
      rest: { x: p.x, y: p.y, w: p.w, h: p.h },
      dest: to,
      off,
    });
  }
  return items;
}

export function proposeDrop(
  board: BoardState,
  A: Piece,
  ghostRaw: { x: number; y: number },
  opts?: ProposeDropOpts,
): DropProposal {
  const phase = opts?.phase ?? 'free';
  const playerAim = opts?.playerAim ?? false;
  const enterDx = opts?.enterDx ?? 0;
  const enterDy = opts?.enterDy ?? 0;
  const origin = opts?.origin ?? { x: A.x, y: A.y };

  let ghost = {
    x: Math.max(0, Math.min(GRID_SIZE - A.w, Math.round(ghostRaw.x))),
    y: Math.max(0, Math.min(GRID_SIZE - A.h, Math.round(ghostRaw.y))),
  };

  let merge: { target: Piece; overlap: number } | null = null;
  if (phase === 'locked' && opts?.lockedTargetId != null) {
    const B = getPiece(board, opts.lockedTargetId);
    if (B && canMergePair(A, B) && B.color === A.color && B.value === A.value) {
      ghost = softPullGhostTowardB(ghost, A, B, SOFT_PULL_LOGIC);
      merge = {
        target: B,
        overlap: rectOverlapCells(
          { x: ghost.x, y: ghost.y, w: A.w, h: A.h },
          B,
        ),
      };
    }
  }
  if (!merge) {
    merge = findMergeTarget(board, A, ghost);
  }

  const G: Rect = { x: ghost.x, y: ghost.y, w: A.w, h: A.h };
  // Use real finger rect when provided (placement on B). Do NOT rebuild F from
  // enterDx — that double-applies invert and can flip left/right aim.
  const F: Rect =
    opts?.fingerRect ??
    ({ x: ghost.x, y: ghost.y, w: A.w, h: A.h } as Rect);

  const atHome = ghost.x === origin.x && ghost.y === origin.y;
  const Fhome =
    phase === 'free' &&
    opts?.fingerRect != null &&
    Math.abs(opts.fingerRect.x + opts.fingerRect.w / 2 - (origin.x + A.w / 2)) <
      0.45 &&
    Math.abs(opts.fingerRect.y + opts.fingerRect.h / 2 - (origin.y + A.h / 2)) <
      0.45;
  if (
    phase === 'free' &&
    (atHome || Fhome) &&
    canPlaceRect(board, origin.x, origin.y, A.w, A.h)
  ) {
    return {
      kind: 'move',
      ghost: { x: origin.x, y: origin.y },
      targetId: null,
      overlapCells: 0,
      reason: '放回原位',
      fingerRect: F,
      mergeTarget: null,
      locked: false,
      playerAim: false,
    };
  }

  const newValue = A.value * 2;
  // Locked on a merge pair: occupancy is resolved by tryMerge / T*.
  // Do not drop to illegal here or the purple preview (and commit) flicker off.
  if (!(phase === 'locked' && merge)) {
    for (const p of board.pieces) {
      const ov = rectOverlapCells(G, p);
      if (ov <= 0) continue;
      if (merge && p.id === merge.target.id) continue;
      if (p.color === A.color && p.value === A.value && canMergePair(A, p)) continue;
      if (merge && p.value <= newValue) continue;
      return {
        kind: 'illegal',
        ghost,
        targetId: null,
        overlapCells: ov,
        reason: '格子被占用',
        fingerRect: F,
        mergeTarget: null,
        locked: phase === 'locked',
        playerAim,
      };
    }
  }

  if (merge) {
    const pick = findMergeShape(
      board,
      A,
      merge.target,
      G,
      F,
      enterDx,
      enterDy,
      {
        playerAim: phase === 'locked' && playerAim,
        stickyT: phase === 'locked' ? opts?.stickyT ?? null : null,
      },
    );
    if (pick) {
      const aimTag =
        phase === 'locked' && playerAim
          ? '·瞄准'
          : phase === 'locked'
            ? '·自动'
            : '';
      return {
        kind: 'merge',
        ghost,
        targetId: merge.target.id,
        overlapCells: merge.overlap,
        reason: pick.bilateral
          ? `可合 → ${A.value * 2}（双侧${aimTag}）`
          : `可合 → ${A.value * 2}${aimTag}`,
        fingerRect: F,
        mergeTarget: pick.T,
        mergeUniqueWays: pick.uniqueWays ?? 0,
        bilateral: pick.bilateral,
        growDirX: pick.dirX,
        growDirY: pick.dirY,
        locked: phase === 'locked',
        playerAim: phase === 'locked' && playerAim,
      };
    }
    return {
      kind: 'illegal',
      ghost,
      targetId: merge.target.id,
      overlapCells: merge.overlap,
      reason: '空间放不下合成形',
      fingerRect: F,
      mergeTarget: null,
      locked: phase === 'locked',
      playerAim,
    };
  }

  return {
    kind: 'illegal',
    ghost,
    targetId: null,
    overlapCells: 0,
    reason: canPlaceRect(board, ghost.x, ghost.y, A.w, A.h)
      ? '只能拖到同色同体积上合并'
      : '无法放置',
    fingerRect: F,
    mergeTarget: null,
    locked: phase === 'locked',
    playerAim,
  };
}

export function hitTestPiece(
  board: BoardState | { pieces: Array<Piece> },
  boardLocalX: number,
  boardLocalY: number,
  cellSize: number,
  padPx = 0,
  skipIds?: ReadonlySet<number>,
): Piece | null {
  const fx = boardLocalX / cellSize;
  const fy = boardLocalY / cellSize;
  const pad = padPx / cellSize;
  let best: { p: Piece; score: number } | null = null;
  for (const p of board.pieces) {
    if (skipIds?.has(p.id)) continue;
    const inside =
      fx >= p.x - pad &&
      fy >= p.y - pad &&
      fx < p.x + p.w + pad &&
      fy < p.y + p.h + pad;
    if (!inside) continue;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const dist = (fx - cx) * (fx - cx) + (fy - cy) * (fy - cy);
    const strict =
      fx >= p.x && fy >= p.y && fx < p.x + p.w && fy < p.y + p.h;
    const score = dist - (strict ? 0.01 : 0);
    if (!best || score < best.score) best = { p, score };
  }
  return best?.p ?? null;
}

/** @deprecated soft-snap off — kept for debug only */
export function softSnapPlace(
  board: BoardState,
  w: number,
  h: number,
  preferred: { x: number; y: number },
  _radius = 1,
): { x: number; y: number } | null {
  void _radius;
  if (canPlaceRect(board, preferred.x, preferred.y, w, h)) return preferred;
  return null;
}
