/**
 * Drag-intent frame: projection G (drop) + continuous F (feel/intent) + merge shape T*.
 * Spec: docs/research/intent/FINDINGS.md
 *
 * - aim = finger - offsetY (board-local cells)
 * - F continuous; G snapped; no soft-snap by default
 * - merge: ≥1 cell overlap; orient first; T* from slot/unilateral
 */
import { canPlaceRect, pieceCenter } from './board';
import { canMergePair, cellsOfRect, sizeCandidates } from './shapes';
import type { BoardState, Orientation, Piece } from './types';
import { GRID_SIZE } from './types';

export type DropKind = 'merge' | 'move' | 'illegal';

export type Rect = { x: number; y: number; w: number; h: number };

export type DropProposal = {
  kind: DropKind;
  ghost: { x: number; y: number };
  targetId: number | null;
  overlapCells: number;
  reason: string;
  /** Continuous finger footprint (cell space, may be fractional) */
  fingerRect?: Rect;
  /** Planned merge result shape (cell-aligned) */
  mergeTarget?: Rect | null;
  bilateral?: boolean;
  /** Unit grow dirs for preview arrows */
  growDirX?: number;
  growDirY?: number;
};

const SIDE_EPS = 0.3;

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

export function mergeOverlapThreshold(_a: Piece, _b: Piece): number {
  return 1;
}

/**
 * Merge only when footprints **overlap ≥ 1 cell**.
 * Edge-adjacent alone = place/move intent (user often just wants to sit next to a twin).
 * Debris-between push: still works if ghost overlaps B and also covers pushables.
 */
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
    // Strict: must stack onto B (overlap), not merely neighbor
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

/** Continuous F centered on aim (cell units, fractional ok). */
export function fingerRectFromAim(
  aimCellX: number,
  aimCellY: number,
  w: number,
  h: number,
): Rect {
  return {
    x: aimCellX - w / 2,
    y: aimCellY - h / 2,
    w,
    h,
  };
}

export type SideClass = {
  axis: Orientation;
  dirX: number;
  dirY: number;
  confidence: number;
  bilateralHint: boolean;
};

function protrusion(a: Rect, b: Rect) {
  return {
    left: Math.max(0, b.x - a.x),
    right: Math.max(0, a.x + a.w - (b.x + b.w)),
    up: Math.max(0, b.y - a.y),
    down: Math.max(0, a.y + a.h - (b.y + b.h)),
  };
}

/**
 * classifySide(F, B) — intent from finger body, not board debris.
 * Uses: F center vs B, protrusion of F past B, enter motion (centered).
 */
export function classifySide(F: Rect, B: Rect, enterDx = 0, enterDy = 0): SideClass {
  const bc = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
  const fc = { x: F.x + F.w / 2, y: F.y + F.h / 2 };

  // Primary: continuous center bias (stable when debris fills exclusive cells)
  let dx = fc.x - bc.x;
  let dy = fc.y - bc.y;

  const pr = protrusion(F, B);
  // Boost with geometric protrusion of F past B (not board free space)
  if (pr.left > pr.right && pr.left > 0.15) dx -= pr.left * 0.85;
  if (pr.right > pr.left && pr.right > 0.15) dx += pr.right * 0.85;
  if (pr.up > pr.down && pr.up > 0.15) dy -= pr.up * 0.85;
  if (pr.down > pr.up && pr.down > 0.15) dy += pr.down * 0.85;

  const centerMag = Math.abs(fc.x - bc.x) + Math.abs(fc.y - bc.y);
  // Nearly stacked on B → enter direction (from below → grow down)
  if (centerMag < 0.35 && pr.left + pr.right + pr.up + pr.down < 0.4) {
    dx = -enterDx;
    dy = -enterDy;
  }

  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  // True bilateral only when F itself straddles B on both sides (not board debris)
  const bilatH = pr.left > 0.35 && pr.right > 0.35;
  const bilatV = pr.up > 0.35 && pr.down > 0.35;

  if (adx > ady + SIDE_EPS) {
    const conf = Math.min(3, adx + Math.max(pr.left, pr.right));
    return {
      axis: 'h',
      dirX: dx >= 0 ? 1 : -1,
      dirY: 0,
      confidence: conf,
      bilateralHint: bilatH && conf < 0.9,
    };
  }
  if (ady > adx + SIDE_EPS) {
    const conf = Math.min(3, ady + Math.max(pr.up, pr.down));
    return {
      axis: 'v',
      dirX: 0,
      dirY: dy >= 0 ? 1 : -1,
      confidence: conf,
      bilateralHint: bilatV && conf < 0.9,
    };
  }
  // Tie / weak: enter motion
  if (Math.abs(enterDx) + Math.abs(enterDy) > 0.08) {
    if (Math.abs(enterDx) >= Math.abs(enterDy)) {
      return {
        axis: 'h',
        dirX: -Math.sign(enterDx) || 1,
        dirY: 0,
        confidence: 0.55,
        bilateralHint: bilatH,
      };
    }
    return {
      axis: 'v',
      dirX: 0,
      dirY: -Math.sign(enterDy) || 1,
      confidence: 0.55,
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

function cellKey(x: number, y: number) {
  return `${x},${y}`;
}

/**
 * Can T be the merge result grow target?
 * Cells may be: empty, B, ghost G, or **pushable** pieces (value < 2V).
 * Equal volume cannot be pushed; value ≥ 2V rejects the shape.
 */
export function canFitMergeTarget(
  board: BoardState,
  B: Piece,
  G: Rect,
  T: Rect,
): boolean {
  if (T.x < 0 || T.y < 0 || T.x + T.w > GRID_SIZE || T.y + T.h > GRID_SIZE) {
    return false;
  }
  // Cover B
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

  // Map cell → piece value (A already lifted out of board)
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
    if (v === undefined) continue; // empty — ok
    // Occupied by another piece: only ok if merge can push it (strictly smaller)
    if (v >= newValue) return false;
  }
  return true;
}

function expandDirs(from: Rect, to: Rect): {
  left: number;
  right: number;
  up: number;
  down: number;
  bilateralH: boolean;
  bilateralV: boolean;
} {
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

export type MergeShapePick = {
  T: Rect;
  score: number;
  bilateral: boolean;
  dirX: number;
  dirY: number;
};

/** Count truly empty vs pushable cells in region of T not in B (expansion / fill). */
function expansionOccupancy(
  board: BoardState,
  B: Piece,
  T: Rect,
): { empty: number; pushable: number; cells: number } {
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
    else if (v < newValue) pushable++;
  }
  return { empty, pushable, cells };
}

function matchesSideIntent(
  side: SideClass,
  dirX: number,
  dirY: number,
  bilateral: boolean,
): boolean {
  if (bilateral) {
    // Only accept bilateral when player also straddles or intent is weak
    if (side.bilateralHint) return true;
    if (side.confidence < 0.45) return true;
    // Strong one-way intent → bilateral is NOT a match
    return false;
  }
  if (side.dirX !== 0 && dirX === side.dirX && dirY === 0) return true;
  if (side.dirY !== 0 && dirY === side.dirY && dirX === 0) return true;
  // Axis match with zero dir on other
  if (side.axis === 'h' && dirX === side.dirX && side.dirX !== 0) return true;
  if (side.axis === 'v' && dirY === side.dirY && side.dirY !== 0) return true;
  return false;
}

/**
 * Find best merge result rectangle T* for A@G onto B with finger F.
 * Intent (F vs B) dominates; debris only affects push cost, not direction.
 */
export function findMergeShape(
  board: BoardState,
  A: Piece,
  B: Piece,
  G: Rect,
  F: Rect,
  enterDx: number,
  enterDy: number,
): MergeShapePick | null {
  if (!canMergePair(A, B)) return null;
  const newValue = A.value * 2;
  if (newValue > 64) return null;

  const side = classifySide(F, B, enterDx, enterDy);
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

  for (const { w, h } of shapes) {
    for (let y = 0; y <= GRID_SIZE - h; y++) {
      for (let x = 0; x <= GRID_SIZE - w; x++) {
        const T = { x, y, w, h };
        if (!canFitMergeTarget(board, B, G, T)) continue;

        const exp = expandDirs(B, T);
        if (exp.bilateralH && exp.bilateralV) continue;

        const bilateral = exp.bilateralH || exp.bilateralV;
        let dirX = 0;
        let dirY = 0;
        if (exp.bilateralH || exp.bilateralV) {
          dirX = 0;
          dirY = 0;
        } else {
          if (exp.right > 0) dirX = 1;
          else if (exp.left > 0) dirX = -1;
          if (exp.down > 0) dirY = 1;
          else if (exp.up > 0) dirY = -1;
          if (exp.left + exp.right >= exp.up + exp.down) dirY = 0;
          else dirX = 0;
        }

        const occ = expansionOccupancy(board, B, T);
        // True empty slot: expansion mostly empty (not "clearable debris everywhere")
        const trueEmptySlot =
          bilateral &&
          occ.cells > 0 &&
          occ.empty >= occ.cells * 0.75 &&
          occ.pushable <= Math.max(1, Math.floor(occ.cells * 0.25));

        let score = 10;

        // Cover ghost footprint lightly (secondary)
        const gCells = cellsOfRect(G.x, G.y, G.w, G.h);
        let coverG = 0;
        for (const c of gCells) {
          if (
            c.x >= T.x &&
            c.y >= T.y &&
            c.x < T.x + T.w &&
            c.y < T.y + T.h
          ) {
            coverG++;
          }
        }
        score += coverG * 15;

        // Prefer fewer pushes (debris cost) — do NOT reward growing into clutter
        score -= occ.pushable * 25;
        score += occ.empty * 8;

        // ——— Intent is primary ———
        if (matchesSideIntent(side, dirX, dirY, bilateral)) {
          score += 400 + side.confidence * 120;
        } else if (!bilateral) {
          // Opposing one-way growth
          if (side.dirX !== 0 && dirX === -side.dirX) score -= 350;
          if (side.dirY !== 0 && dirY === -side.dirY) score -= 350;
          // Wrong axis when intent is strong
          if (side.confidence >= 0.5) {
            if (side.axis === 'h' && dirY !== 0 && dirX === 0) score -= 200;
            if (side.axis === 'v' && dirX !== 0 && dirY === 0) score -= 200;
          }
        }

        // Bilateral: only big bonus for clean empty slot (U6), not debris-filled
        if (bilateral) {
          if (trueEmptySlot) score += 180;
          else score -= 80; // "fake bilateral" through pushable trash
          if (side.bilateralHint && trueEmptySlot) score += 60;
          if (side.confidence >= 0.7 && !side.bilateralHint) score -= 150;
        }

        cands.push({ T, score, bilateral, dirX, dirY });
      }
    }
  }

  if (cands.length === 0) return null;

  // When intent is clear, only keep aligned shapes (unless none)
  const strong = side.confidence >= 0.45 && !side.bilateralHint;
  let pool = cands;
  if (strong) {
    const aligned = cands.filter((c) =>
      matchesSideIntent(side, c.dirX, c.dirY, c.bilateral),
    );
    if (aligned.length > 0) pool = aligned;
  }

  pool.sort((a, b) => b.score - a.score);
  return pool[0]!;
}

/**
 * Continuous drop proposal — no soft-snap.
 * Board is rest-of-board (A lifted out).
 *
 * **Return home**: ghost on lift origin → place (cancel), never merge with neighbor.
 */
export function proposeDrop(
  board: BoardState,
  A: Piece,
  ghostRaw: { x: number; y: number },
  opts?: {
    fingerRect?: Rect;
    enterDx?: number;
    enterDy?: number;
    /** Seat when lifted; ghost here = cancel */
    origin?: { x: number; y: number };
  },
): DropProposal {
  const ghost = {
    x: Math.max(0, Math.min(GRID_SIZE - A.w, Math.round(ghostRaw.x))),
    y: Math.max(0, Math.min(GRID_SIZE - A.h, Math.round(ghostRaw.y))),
  };
  const G: Rect = { x: ghost.x, y: ghost.y, w: A.w, h: A.h };
  const F =
    opts?.fingerRect ??
    ({ x: ghost.x, y: ghost.y, w: A.w, h: A.h } as Rect);
  const enterDx = opts?.enterDx ?? 0;
  const enterDy = opts?.enterDy ?? 0;

  const origin = opts?.origin ?? { x: A.x, y: A.y };
  const atHome = ghost.x === origin.x && ghost.y === origin.y;
  // Also treat "almost home" continuous aim as cancel (snap noise)
  const Fhome =
    opts?.fingerRect != null &&
    Math.abs(opts.fingerRect.x + opts.fingerRect.w / 2 - (origin.x + A.w / 2)) <
      0.45 &&
    Math.abs(opts.fingerRect.y + opts.fingerRect.h / 2 - (origin.y + A.h / 2)) <
      0.45;
  if ((atHome || Fhome) && canPlaceRect(board, origin.x, origin.y, A.w, A.h)) {
    return {
      kind: 'move',
      ghost: { x: origin.x, y: origin.y },
      targetId: null,
      overlapCells: 0,
      reason: '放回原位',
      fingerRect: F,
      mergeTarget: null,
    };
  }

  // Find merge target first (may sit on pushable debris next to B)
  const merge = findMergeTarget(board, A, ghost);
  const newValue = A.value * 2;

  // Footprint occupation: allow B + pushable (value < 2V); equal cannot push equal
  for (const p of board.pieces) {
    const ov = rectOverlapCells(G, p);
    if (ov <= 0) continue;
    if (merge && p.id === merge.target.id) continue;
    // Same-value other piece: ignore if we already chose a target
    if (p.color === A.color && p.value === A.value && canMergePair(A, p)) continue;
    // Pushable debris under ghost OK when merging (will be shoved by grow)
    if (merge && p.value < newValue) continue;
    return {
      kind: 'illegal',
      ghost,
      targetId: null,
      overlapCells: ov,
      reason: '格子被占用',
      fingerRect: F,
      mergeTarget: null,
    };
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
    );
    if (pick) {
      return {
        kind: 'merge',
        ghost,
        targetId: merge.target.id,
        overlapCells: merge.overlap,
        reason: pick.bilateral
          ? `可合 → ${A.value * 2}（双侧）`
          : `可合 → ${A.value * 2}`,
        fingerRect: F,
        mergeTarget: pick.T,
        bilateral: pick.bilateral,
        growDirX: pick.dirX,
        growDirY: pick.dirY,
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
    };
  }

  if (canPlaceRect(board, ghost.x, ghost.y, A.w, A.h)) {
    return {
      kind: 'move',
      ghost,
      targetId: null,
      overlapCells: 0,
      reason: '可放置',
      fingerRect: F,
      mergeTarget: null,
    };
  }

  return {
    kind: 'illegal',
    ghost,
    targetId: null,
    overlapCells: 0,
    reason: '无法放置',
    fingerRect: F,
    mergeTarget: null,
  };
}

export function hitTestPiece(
  board: BoardState,
  boardLocalX: number,
  boardLocalY: number,
  cellSize: number,
  padPx = 6,
): Piece | null {
  if (board.pieces.length === 0) return null;
  const fx = boardLocalX / cellSize;
  const fy = boardLocalY / cellSize;
  const pad = padPx / cellSize;
  let best: { p: Piece; score: number } | null = null;
  for (const p of board.pieces) {
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

/** @deprecated soft-snap off by FINDINGS — kept for debug only */
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
