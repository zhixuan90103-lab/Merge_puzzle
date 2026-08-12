import {
  buildOccupancy,
  cellKey,
  clipPieceToBoard,
  cloneBoard,
  footprintsContact,
  getPiece,
  inBounds,
  pieceCells,
  pieceCenter,
  removePiece,
  upsertPiece,
} from './board';
import { canMergePair, cellsOfRect, shapeAxis, sizeCandidates } from './shapes';
import type { AtomicStep, MergePlan, Rect } from './plan';
import { copyRect } from './plan';
import type { BoardState, Cell, DragTrend, Orientation, Piece } from './types';
import { GRID_SIZE } from './types';
// Cheap liveness only — never isDeadlock/hasLegalMerge here (re-enters tryMerge → freeze).
import { isPlayable } from './deadlock';

export function trendFromCenters(
  from: { x: number; y: number },
  to: { x: number; y: number },
): DragTrend {
  // Vector from `to` toward `from` — positive dy means `from` is below `to`
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  return trendFromApproachDelta(dx, dy);
}

/** Build DragTrend from approach delta (positive dy = approach / grow downward). */
export function trendFromApproachDelta(dx: number, dy: number): DragTrend {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  let orient: Orientation;
  if (adx > ady + 0.01) orient = 'h';
  else if (ady > adx + 0.01) orient = 'v';
  else orient = adx >= ady ? 'h' : 'v';
  const dirX = orient === 'h' ? (dx >= 0 ? 1 : -1) : 0;
  const dirY = orient === 'v' ? (dy >= 0 ? 1 : -1) : 0;
  return { dx, dy, orient, dirX, dirY };
}

type MiniRect = { x: number; y: number; w: number; h: number };

/** How far `a` sticks past `b` on each side (cell units, ≥0). */
function protrusionPast(a: MiniRect, b: MiniRect) {
  return {
    left: Math.max(0, b.x - a.x),
    right: Math.max(0, a.x + a.w - (b.x + b.w)),
    up: Math.max(0, b.y - a.y),
    down: Math.max(0, a.y + a.h - (b.y + b.h)),
  };
}

/**
 * Approach from cells of A that are **not** occupied by B.
 * This matches "放下的本体偏在 B 的哪一侧" even when centers nearly overlap.
 */
function approachFromExclusiveCells(
  a: MiniRect,
  b: MiniRect,
): { dx: number; dy: number } | null {
  const bset = new Set(
    cellsOfRect(b.x, b.y, b.w, b.h).map((c) => cellKey(c.x, c.y)),
  );
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const c of cellsOfRect(a.x, a.y, a.w, a.h)) {
    if (bset.has(cellKey(c.x, c.y))) continue;
    sx += c.x + 0.5;
    sy += c.y + 0.5;
    n++;
  }
  if (n === 0) return null;
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return { dx: sx / n - bc.x, dy: sy / n - bc.y };
}

/**
 * Resolve merge growth from **drop body** (green projection / ghost).
 *
 * Priority (player intent):
 * 1. Exclusive cells of ghost not on B → which side the drop body sticks out
 * 2. Geometric protrusion of ghost past B (left/right/up/down)
 * 3. Ghost center − B center
 * 4. Origin seat − B (fallback when fully stacked on B)
 * 5. Inverted drag (last resort)
 */
export function resolveMergeApproachTrend(opts: {
  ghostA: MiniRect;
  originA: MiniRect;
  B: MiniRect;
  designDx: number;
  designDy: number;
}): DragTrend {
  const { ghostA, originA, B, designDx, designDy } = opts;
  const bc = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
  const gc = { x: ghostA.x + ghostA.w / 2, y: ghostA.y + ghostA.h / 2 };
  const oc = { x: originA.x + originA.w / 2, y: originA.y + originA.h / 2 };

  let approachDx = 0;
  let approachDy = 0;
  let resolved = false;

  // 1) Cells of drop body outside B
  const excl = approachFromExclusiveCells(ghostA, B);
  if (excl && Math.abs(excl.dx) + Math.abs(excl.dy) >= 0.2) {
    approachDx = excl.dx;
    approachDy = excl.dy;
    resolved = true;
  }

  // 2) Protrusion past B edges (clear "sticks out below/above/…")
  if (!resolved) {
    const pr = protrusionPast(ghostA, B);
    const sides: { dx: number; dy: number; v: number }[] = [
      { dx: -1, dy: 0, v: pr.left },
      { dx: 1, dy: 0, v: pr.right },
      { dx: 0, dy: -1, v: pr.up },
      { dx: 0, dy: 1, v: pr.down },
    ];
    sides.sort((a, b) => b.v - a.v);
    const top = sides[0]!;
    const second = sides[1]!;
    if (top.v > 0 && (top.v > second.v || top.v >= 1)) {
      // Use continuous strength on that axis for axis pick
      approachDx = top.dx * top.v;
      approachDy = top.dy * top.v;
      resolved = true;
    }
  }

  // 3) Center offset of drop body
  if (!resolved) {
    approachDx = gc.x - bc.x;
    approachDy = gc.y - bc.y;
    if (Math.abs(approachDx) + Math.abs(approachDy) >= 0.2) {
      resolved = true;
    }
  }

  // 4) Origin seat relative to B
  if (!resolved) {
    approachDx = oc.x - bc.x;
    approachDy = oc.y - bc.y;
    if (Math.abs(approachDx) + Math.abs(approachDy) >= 0.2) {
      resolved = true;
    }
  }

  // 5) Inverted full drag (finger up ⇒ entered from below)
  if (!resolved || Math.abs(approachDx) + Math.abs(approachDy) < 0.05) {
    const dragMag = Math.abs(designDx) + Math.abs(designDy);
    if (dragMag > 8) {
      approachDx = -designDx;
      approachDy = -designDy;
    }
  }

  // Near-diagonal: bias with protrusion / exclusive if they agree on one axis
  const adx = Math.abs(approachDx);
  const ady = Math.abs(approachDy);
  if (adx > 0.01 && ady > 0.01 && Math.abs(adx - ady) / Math.max(adx, ady) < 0.25) {
    const pr = protrusionPast(ghostA, B);
    const hDom = Math.max(pr.left, pr.right);
    const vDom = Math.max(pr.up, pr.down);
    if (hDom > vDom + 0.1) approachDy *= 0.25;
    else if (vDom > hDom + 0.1) approachDx *= 0.25;
  }

  return trendFromApproachDelta(approachDx, approachDy);
}

function orientCandidates(
  trend: DragTrend,
  lock?: Orientation | null,
): Orientation[] {
  if (lock === 'h') return ['h'];
  if (lock === 'v') return ['v'];
  // Prefer primary; on near-tie try both
  const adx = Math.abs(trend.dx);
  const ady = Math.abs(trend.dy);
  if (Math.abs(adx - ady) < 0.35) return ['h', 'v'];
  return trend.orient === 'h' ? ['h', 'v'] : ['v', 'h'];
}

/** When both strips share an axis, lock growth to that axis; square → free (drag). */
function orientLockFromPieces(A: Piece, B: Piece): Orientation | null {
  const oa = shapeAxis(A);
  const ob = shapeAxis(B);
  if (oa === 'h' || ob === 'h') {
    if (oa === 'v' || ob === 'v') return null; // should not merge
    if (oa === 'h' && ob === 'h') return 'h';
    return 'h'; // square + h
  }
  if (oa === 'v' || ob === 'v') {
    if (oa === 'v' && ob === 'v') return 'v';
    return 'v'; // square + v
  }
  return null; // both square
}

function dirForOrient(orient: Orientation, trend: DragTrend): { dirX: number; dirY: number } {
  if (orient === 'h') {
    return { dirX: trend.dx >= 0 ? 1 : -1, dirY: 0 };
  }
  return { dirX: 0, dirY: trend.dy >= 0 ? 1 : -1 };
}

function overlapCount(cells: Cell[], set: Set<string>): number {
  let n = 0;
  for (const c of cells) if (set.has(cellKey(c.x, c.y))) n++;
  return n;
}

/** Cells of rect that still lie on the 8×8 board. */
function onBoardCells(x: number, y: number, w: number, h: number): Cell[] {
  return cellsOfRect(x, y, w, h).filter((c) => inBounds(c.x, c.y));
}

function fullyOffBoard(x: number, y: number, w: number, h: number): boolean {
  return onBoardCells(x, y, w, h).length === 0;
}

/** Depth along push axis (larger = further outward in dir). */
function outwardKey(p: Piece, dirX: number, dirY: number): number {
  if (dirX > 0) return p.x + p.w;
  if (dirX < 0) return -(p.x);
  if (dirY > 0) return p.y + p.h;
  if (dirY < 0) return -(p.y);
  return 0;
}

type PushRecord = { pieceId: number; from: Rect; to: Rect };

/**
 * Collect every piece that must move 1 cell together with `rootIds`
 * (sokoban chain: only pieces with value < merge newValue can be pushed;
 * equal or larger volume blocks — same number cannot push same number).
 * Returns null if a non-pushable piece blocks the path.
 */
function collectMoverIds(
  board: BoardState,
  rootIds: number[],
  dirX: number,
  dirY: number,
  newValue: number,
  ignoreIds: Set<number>,
): number[] | null {
  const movers = new Set<number>();
  const stack = [...rootIds];
  let guard = 0;
  while (stack.length && guard++ < 64) {
    const id = stack.pop()!;
    if (movers.has(id) || ignoreIds.has(id)) continue;
    const p = getPiece(board, id);
    if (!p) continue;
    // Strictly larger than obstacle: equal volume cannot push equal
    if (p.value >= newValue) return null;
    movers.add(id);

    const nx = p.x + dirX;
    const ny = p.y + dirY;
    if (fullyOffBoard(nx, ny, p.w, p.h)) continue;

    // Look through current board (movers not yet moved) for anything in the way
    const occ = buildOccupancy(board, ignoreIds);
    for (const c of onBoardCells(nx, ny, p.w, p.h)) {
      const oid = occ.get(cellKey(c.x, c.y));
      if (oid === undefined || movers.has(oid) || ignoreIds.has(oid)) continue;
      const other = getPiece(board, oid);
      if (!other) continue;
      if (other.value >= newValue) return null;
      stack.push(oid);
    }
  }

  return [...movers];
}

/**
 * Simultaneous 1-cell shove for a whole chain.
 * Outer pieces move first; all from→to recorded for timeline.
 *
 * Mid-push: **whole body translates** (no clip, no value/color change).
 * Fully off → remove after the move (animates off as one piece).
 * Partial clip → only after the entire merge settles (tryGrowInPlace end).
 */
function shoveChainOneCell(
  board: BoardState,
  rootIds: number[],
  dirX: number,
  dirY: number,
  newValue: number,
  ignoreIds: Set<number>,
): PushRecord[] | null {
  if (rootIds.length === 0) return [];

  const moverIds = collectMoverIds(board, rootIds, dirX, dirY, newValue, ignoreIds);
  if (!moverIds) return null;
  if (moverIds.length === 0) return [];

  const moverSet = new Set(moverIds);
  // Static occupancy: grow body + non-movers
  const staticIgnore = new Set(ignoreIds);
  for (const id of moverIds) staticIgnore.add(id);
  const staticOcc = buildOccupancy(board, staticIgnore);

  // Validate destinations (simultaneous: landing on another mover's old cell is OK)
  for (const id of moverIds) {
    const p = getPiece(board, id)!;
    const nx = p.x + dirX;
    const ny = p.y + dirY;
    if (fullyOffBoard(nx, ny, p.w, p.h)) continue;
    for (const c of onBoardCells(nx, ny, p.w, p.h)) {
      const oid = staticOcc.get(cellKey(c.x, c.y));
      if (oid !== undefined && !moverSet.has(oid)) {
        return null; // wall of non-mover
      }
    }
  }

  // Apply outer-first so intermediate occupancy stays coherent if anything re-reads
  const ordered = moverIds
    .map((id) => getPiece(board, id)!)
    .filter(Boolean)
    .sort((a, b) => outwardKey(b, dirX, dirY) - outwardKey(a, dirX, dirY));

  const records: PushRecord[] = [];
  for (const p of ordered) {
    const from = copyRect(p);
    const to = { x: p.x + dirX, y: p.y + dirY, w: p.w, h: p.h };
    if (fullyOffBoard(to.x, to.y, to.w, to.h)) {
      removePiece(board, p.id);
      records.push({ pieceId: p.id, from, to });
      continue;
    }
    // Keep original value & full size even if partially off — slide as one body
    upsertPiece(board, { ...p, x: to.x, y: to.y });
    records.push({ pieceId: p.id, from, to });
  }
  return records;
}

/**
 * Place A flush against B based on approach (for merge geometry).
 * Avoids ghost overlapping B so solid union can form 2×4 / 4×2 etc.
 */
function stackAgainstB(A: Piece, B: Piece, trend: DragTrend): Piece {
  const useTrend = Math.abs(trend.dx) + Math.abs(trend.dy) > 0.2;
  const dx = useTrend ? trend.dx : pieceCenter(A).x - pieceCenter(B).x;
  const dy = useTrend ? trend.dy : pieceCenter(A).y - pieceCenter(B).y;

  if (Math.abs(dy) >= Math.abs(dx)) {
    // Vertical stack: align X with B
    if (dy >= 0) {
      // A approached from below / is below → sit under B
      return { ...A, x: B.x, y: B.y + B.h };
    }
    return { ...A, x: B.x, y: B.y - A.h };
  }
  if (dx >= 0) {
    return { ...A, x: B.x + B.w, y: B.y };
  }
  return { ...A, x: B.x - A.w, y: B.y };
}

function pieceOverlapsRect(
  p: Piece,
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  return !(
    p.x + p.w <= rect.x ||
    rect.x + rect.w <= p.x ||
    p.y + p.h <= rect.y ||
    rect.y + rect.h <= p.y
  );
}

/** Unit step of this grow (from cur → next). */
function stepDir(
  cur: { x: number; y: number; w: number; h: number },
  next: { x: number; y: number; w: number; h: number },
): { dx: number; dy: number } {
  if (next.x < cur.x) return { dx: -1, dy: 0 };
  if (next.x + next.w > cur.x + cur.w) return { dx: 1, dy: 0 };
  if (next.y < cur.y) return { dx: 0, dy: -1 };
  if (next.y + next.h > cur.y + cur.h) return { dx: 0, dy: 1 };
  return { dx: 0, dy: 0 };
}

/**
 * Grow one cell toward target, **only from a fixed edge** (never both sides on one axis).
 * Primary axis follows dirX/dirY; residual orthogonal growth is also one-sided.
 */
function stepGrowUnilateral(
  cur: { x: number; y: number; w: number; h: number },
  target: { x: number; y: number; w: number; h: number },
  dirX: number,
  dirY: number,
): { x: number; y: number; w: number; h: number } {
  const n = { ...cur };
  const needLeft = target.x < n.x;
  const needRight = target.x + target.w > n.x + n.w;
  const needUp = target.y < n.y;
  const needDown = target.y + target.h > n.y + n.h;

  // Primary direction first (one side only)
  if (dirX > 0 && needRight) {
    n.w += 1;
    return n;
  }
  if (dirX < 0 && needLeft) {
    n.x -= 1;
    n.w += 1;
    return n;
  }
  if (dirY > 0 && needDown) {
    n.h += 1;
    return n;
  }
  if (dirY < 0 && needUp) {
    n.y -= 1;
    n.h += 1;
    return n;
  }

  // Orthogonal residual: still only one side (never left+right or up+down together)
  if (needRight && !needLeft) {
    n.w += 1;
    return n;
  }
  if (needLeft && !needRight) {
    n.x -= 1;
    n.w += 1;
    return n;
  }
  if (needDown && !needUp) {
    n.h += 1;
    return n;
  }
  if (needUp && !needDown) {
    n.y -= 1;
    n.h += 1;
    return n;
  }

  return n;
}

function rectInBounds(x: number, y: number, w: number, h: number): boolean {
  return x >= 0 && y >= 0 && x + w <= GRID_SIZE && y + h <= GRID_SIZE;
}

/** Validate candidate body for merge growth — fully on 8×8, never past edges. */
function isValidGrowTarget(
  from: { x: number; y: number; w: number; h: number },
  to: { x: number; y: number; w: number; h: number },
): boolean {
  if (!rectInBounds(to.x, to.y, to.w, to.h)) return false;
  if (!rectInBounds(from.x, from.y, from.w, from.h)) return false;
  // Must cover anchor
  if (to.x > from.x || to.y > from.y) return false;
  if (to.x + to.w < from.x + from.w || to.y + to.h < from.y + from.h) return false;
  // Allow one-axis bilateral (fill slot L+R or U+D); forbid both axes bilateral / L-corner mess
  const expandL = to.x < from.x;
  const expandR = to.x + to.w > from.x + from.w;
  const expandU = to.y < from.y;
  const expandD = to.y + to.h > from.y + from.h;
  const biH = expandL && expandR;
  const biV = expandU && expandD;
  if (biH && biV) return false;
  if (biH && (expandU || expandD)) return false;
  if (biV && (expandL || expandR)) return false;
  return true;
}

/**
 * Target rect must cover `from` and only extend outward from **one edge**
 * on each axis (no bilateral growth). Primary edge locked by dir.
 * **Never places the result outside the board** — if preferred side is OOB,
 * try the opposite single side when the primary axis is free.
 */
function unilateralTargetFrom(
  from: { x: number; y: number; w: number; h: number },
  tw: number,
  th: number,
  dirX: number,
  dirY: number,
  preferToward: { x: number; y: number },
): { x: number; y: number; w: number; h: number } | null {
  if (tw < from.w || th < from.h) return null;
  if (tw > GRID_SIZE || th > GRID_SIZE) return null;
  if (!rectInBounds(from.x, from.y, from.w, from.h)) return null;

  // Candidate X placements (one-sided only)
  const xOpts: number[] = [];
  if (dirX > 0) {
    xOpts.push(from.x); // fix left, grow right
  } else if (dirX < 0) {
    xOpts.push(from.x + from.w - tw); // fix right, grow left
  } else if (tw === from.w) {
    xOpts.push(from.x);
  } else {
    // Orthogonal width growth: prefer toward A, else other side (stay on board)
    const fcx = from.x + from.w / 2;
    const preferRight = preferToward.x >= fcx;
    const a = preferRight ? from.x : from.x + from.w - tw;
    const b = preferRight ? from.x + from.w - tw : from.x;
    xOpts.push(a, b);
  }

  // Candidate Y placements
  const yOpts: number[] = [];
  if (dirY > 0) {
    yOpts.push(from.y);
  } else if (dirY < 0) {
    yOpts.push(from.y + from.h - th);
  } else if (th === from.h) {
    yOpts.push(from.y);
  } else {
    const fcy = from.y + from.h / 2;
    const preferDown = preferToward.y >= fcy;
    const a = preferDown ? from.y : from.y + from.h - th;
    const b = preferDown ? from.y + from.h - th : from.y;
    yOpts.push(a, b);
  }

  for (const x of xOpts) {
    for (const y of yOpts) {
      const cand = { x, y, w: tw, h: th };
      if (!isValidGrowTarget(from, cand)) continue;
      // If primary dir was forced, expansion must respect it when room exists
      if (dirX > 0 && cand.x !== from.x) continue;
      if (dirX < 0 && cand.x + cand.w !== from.x + from.w) continue;
      if (dirY > 0 && cand.y !== from.y) continue;
      if (dirY < 0 && cand.y + cand.h !== from.y + from.h) continue;
      return cand;
    }
  }
  return null;
}

/**
 * How many cells of room exist to grow in a cardinal direction from `from`
 * before hitting the board edge (not occupancy).
 */
function edgeRoom(
  from: { x: number; y: number; w: number; h: number },
  dirX: number,
  dirY: number,
): number {
  if (dirX > 0) return GRID_SIZE - (from.x + from.w);
  if (dirX < 0) return from.x;
  if (dirY > 0) return GRID_SIZE - (from.y + from.h);
  if (dirY < 0) return from.y;
  return 0;
}

/** Dominant expand direction from `from` rect to `to` (one axis preferred). */
function expandDirs(
  from: { x: number; y: number; w: number; h: number },
  to: { x: number; y: number; w: number; h: number },
): { dirX: number; dirY: number; growX: number; growY: number } {
  const growLeft = Math.max(0, from.x - to.x);
  const growRight = Math.max(0, to.x + to.w - (from.x + from.w));
  const growUp = Math.max(0, from.y - to.y);
  const growDown = Math.max(0, to.y + to.h - (from.y + from.h));
  const growX = growLeft + growRight;
  const growY = growUp + growDown;
  let dirX = 0;
  let dirY = 0;
  if (growRight > 0) dirX = 1;
  else if (growLeft > 0) dirX = -1;
  if (growDown > 0) dirY = 1;
  else if (growUp > 0) dirY = -1;
  // Prefer axis with more new cells for push
  if (growY > growX) dirX = 0;
  else if (growX > growY) dirY = 0;
  return { dirX, dirY, growX, growY };
}

/**
 * Sokoban interleaved grow → AtomicStep[] for timeline.
 * Each step: all blockers move 1 cell (same dir) + B grows 1 cell (same t in player).
 */
function tryGrowInPlace(
  board: BoardState,
  bId: number,
  from: Piece,
  to: Piece,
  stepsOut: AtomicStep[],
): boolean {
  // Growing body must stay fully on the board (pushed blockers may leave; B may not)
  if (!isValidGrowTarget(from, to)) return false;
  if (!rectInBounds(to.x, to.y, to.w, to.h)) return false;

  const newValue = to.value;
  const ignoreIds = new Set<number>([bId]);
  const { dirX, dirY } = expandDirs(from, to);
  const gdx = dirX;
  const gdy = dirY;

  let cur: Rect = { x: from.x, y: from.y, w: from.w, h: from.h };
  const growColor = from.color;
  upsertPiece(board, {
    id: bId,
    value: newValue,
    color: growColor,
    x: cur.x,
    y: cur.y,
    w: cur.w,
    h: cur.h,
  });

  let guard = 0;
  while (
    (cur.x !== to.x || cur.y !== to.y || cur.w !== to.w || cur.h !== to.h) &&
    guard++ < 40
  ) {
    const next = stepGrowUnilateral(cur, to, gdx, gdy);
    if (next.x === cur.x && next.y === cur.y && next.w === cur.w && next.h === cur.h) {
      return false;
    }
    // Hard rule: every intermediate body stays on 8×8
    if (!rectInBounds(next.x, next.y, next.w, next.h)) {
      return false;
    }

    const { dx: stepDx, dy: stepDy } = stepDir(cur, next);
    const sdx = stepDx !== 0 || stepDy !== 0 ? stepDx : gdx || 1;
    const sdy = stepDx !== 0 || stepDy !== 0 ? stepDy : gdy;

    const prevKeys = new Set(
      cellsOfRect(cur.x, cur.y, cur.w, cur.h).map((c) => cellKey(c.x, c.y)),
    );
    const occ = buildOccupancy(board, ignoreIds);
    const blockers: Piece[] = [];
    const seen = new Set<number>();
    for (const c of cellsOfRect(next.x, next.y, next.w, next.h)) {
      const k = cellKey(c.x, c.y);
      if (prevKeys.has(k)) continue;
      const id = occ.get(k);
      if (id === undefined || seen.has(id)) continue;
      const p = getPiece(board, id);
      if (!p) continue;
      if (p.value >= newValue) return false;
      seen.add(id);
      blockers.push(p);
    }

    blockers.sort((a, b) => outwardKey(b, sdx, sdy) - outwardKey(a, sdx, sdy));

    const pushes: AtomicStep['pushes'] = [];

    // Shove whole chain(s) 1 cell per round until grow footprint is clear.
    // Every piece in the chain is recorded (not only the one touching B).
    let clearSafety = 0;
    while (clearSafety++ < GRID_SIZE + 2) {
      // Anything currently overlapping the next grow rect is a root of a push chain
      const stillRoots: number[] = [];
      const seenR = new Set<number>();
      const occNow = buildOccupancy(board, ignoreIds);
      for (const c of cellsOfRect(next.x, next.y, next.w, next.h)) {
        if (prevKeys.has(cellKey(c.x, c.y))) continue;
        const id = occNow.get(cellKey(c.x, c.y));
        if (id === undefined || seenR.has(id)) continue;
        const q = getPiece(board, id);
        if (!q) continue;
        if (q.value >= newValue) return false;
        if (fullyOffBoard(q.x, q.y, q.w, q.h)) continue;
        seenR.add(id);
        stillRoots.push(id);
      }
      // Also re-check known blockers that may still overlap
      for (const p of blockers) {
        const q = getPiece(board, p.id);
        if (!q || seenR.has(q.id)) continue;
        if (pieceOverlapsRect(q, next) && !fullyOffBoard(q.x, q.y, q.w, q.h)) {
          if (q.value >= newValue) return false;
          seenR.add(q.id);
          stillRoots.push(q.id);
        }
      }
      if (stillRoots.length === 0) break;

      const roundPushes = shoveChainOneCell(
        board,
        stillRoots,
        sdx,
        sdy,
        newValue,
        ignoreIds,
      );
      if (!roundPushes || roundPushes.length === 0) return false;

      // Still overlapping after this shove? emit pure-push step (grow holds), else co-time with grow
      const stillNeed = stillRoots.some((id) => {
        const q = getPiece(board, id);
        return q && pieceOverlapsRect(q, next) && !fullyOffBoard(q.x, q.y, q.w, q.h);
      });
      // Also if any chain piece still sits in next (e.g. multi-cell bodies)
      const anyOverlap = (() => {
        const occ2 = buildOccupancy(board, ignoreIds);
        for (const c of cellsOfRect(next.x, next.y, next.w, next.h)) {
          if (prevKeys.has(cellKey(c.x, c.y))) continue;
          if (occ2.has(cellKey(c.x, c.y))) return true;
        }
        return false;
      })();

      if (stillNeed || anyOverlap) {
        stepsOut.push({
          pushes: roundPushes,
          grow: { pieceId: bId, from: copyRect(cur), to: copyRect(cur), value: newValue },
        });
      } else {
        pushes.push(...roundPushes);
      }
    }

    // Final check: new cells of grow must be free of on-board pieces
    {
      const occF = buildOccupancy(board, ignoreIds);
      for (const c of cellsOfRect(next.x, next.y, next.w, next.h)) {
        if (prevKeys.has(cellKey(c.x, c.y))) continue;
        if (occF.has(cellKey(c.x, c.y))) return false;
      }
    }

    const growFrom = copyRect(cur);
    cur = next;
    upsertPiece(board, {
      id: bId,
      value: newValue,
      color: growColor,
      x: cur.x,
      y: cur.y,
      w: cur.w,
      h: cur.h,
    });
    stepsOut.push({
      pushes,
      grow: {
        pieceId: bId,
        from: growFrom,
        to: copyRect(cur),
        value: newValue,
      },
    });
  }

  // Settle: fully off → gone; still half-on → clip once (value = remaining cells)
  for (const p of [...board.pieces]) {
    if (p.id === bId) continue;
    if (fullyOffBoard(p.x, p.y, p.w, p.h)) {
      removePiece(board, p.id);
      continue;
    }
    const clipped = clipPieceToBoard(p);
    if (!clipped) removePiece(board, p.id);
    else if (
      clipped.x !== p.x ||
      clipped.y !== p.y ||
      clipped.w !== p.w ||
      clipped.h !== p.h ||
      clipped.value !== p.value
    ) {
      upsertPiece(board, clipped);
    }
  }

  const final = getPiece(board, bId);
  if (!final || final.w !== to.w || final.h !== to.h || final.x !== to.x || final.y !== to.y) {
    return false;
  }
  return true;
}

/** Bounding box of A∪B if every cell in the box belongs to A or B (solid). */
function solidUnionRect(a: Piece, b: Piece): { x: number; y: number; w: number; h: number } | null {
  const minx = Math.min(a.x, b.x);
  const miny = Math.min(a.y, b.y);
  const maxx = Math.max(a.x + a.w - 1, b.x + b.w - 1);
  const maxy = Math.max(a.y + a.h - 1, b.y + b.h - 1);
  const w = maxx - minx + 1;
  const h = maxy - miny + 1;
  const set = new Set(
    [...pieceCells(a), ...pieceCells(b)].map((c) => cellKey(c.x, c.y)),
  );
  if (set.size !== w * h) return null;
  return { x: minx, y: miny, w, h };
}

function isUnilateralCover(
  from: Piece,
  to: { x: number; y: number; w: number; h: number },
): boolean {
  // Name historical: now allows one-axis bilateral slot fill
  return isValidGrowTarget(from, to);
}

export type MergeResult =
  | {
      ok: true;
      board: BoardState;
      createdValue: number;
      plan: MergePlan;
      /** Board state after A absorbed, before steps (timeline start) */
      startBoard: BoardState;
    }
  | { ok: false; reason: string };

/**
 * Drag A onto B (same value). B is anchor and **keeps its id**.
 * Sequence: absorb A → push blockers cell-by-cell → **grow B cell-by-cell** (no respawn).
 */
export function tryMerge(
  board: BoardState,
  pieceAId: number,
  pieceBId: number,
  trend: DragTrend,
  opts?: {
    /** Force grow-to rect from intent preview (T*) — skip candidate search */
    forcedTarget?: { x: number; y: number; w: number; h: number };
  },
): MergeResult {
  const base = cloneBoard(board);
  const A = getPiece(base, pieceAId);
  const B = getPiece(base, pieceBId);
  if (!A || !B) return { ok: false, reason: 'missing' };
  if (A.id === B.id) return { ok: false, reason: 'same' };
  if (A.color !== B.color) return { ok: false, reason: 'color' };
  if (A.value !== B.value) return { ok: false, reason: 'value' };
  if (!canMergePair(A, B)) return { ok: false, reason: 'orient' };

  // Ghost may heavily overlap B when "dropping on" it — also try stacked geometry
  const A_stack = stackAgainstB(A, B, trend);
  const contactGhost = footprintsContact(pieceCells(A), pieceCells(B));
  const contactStack = footprintsContact(pieceCells(A_stack), pieceCells(B));
  if (!contactGhost && !contactStack) return { ok: false, reason: 'contact' };

  const newValue = A.value * 2;
  if (newValue > 64) return { ok: false, reason: 'cap' };

  // Prefer solid unions that equal newValue (two 2×2 stacked → 2×4 = 8)
  const unions = [solidUnionRect(A_stack, B), solidUnionRect(A, B)].filter(
    (u): u is { x: number; y: number; w: number; h: number } => u != null,
  );

  // Geometry for "toward A": prefer stacked center if ghost overlaps B a lot
  const overlapHeavy =
    pieceCells(A).filter((c) =>
      pieceCells(B).some((bc) => bc.x === c.x && bc.y === c.y),
    ).length >=
    (A.w * A.h) / 2;
  const A_geom = overlapHeavy ? A_stack : A;
  const aCells = pieceCells(A_geom);

  // Absorb A only — B stays as the growing body
  removePiece(base, A.id);

  const lock = orientLockFromPieces(A, B);
  const orients = orientCandidates(trend, lock);

  // Grow preference: **approach side** from trend (A entered → grow that way)
  // Fall back to A_geom vs B if trend is flat
  const ac = pieceCenter(A_geom);
  const bc = pieceCenter(B);
  let primaryTowardX = trend.dirX;
  let primaryTowardY = trend.dirY;
  if (primaryTowardX === 0 && primaryTowardY === 0) {
    const towardAx = ac.x >= bc.x ? 1 : -1;
    const towardAy = ac.y >= bc.y ? 1 : -1;
    if (Math.abs(ac.x - bc.x) >= Math.abs(ac.y - bc.y)) {
      primaryTowardX = towardAx;
      primaryTowardY = 0;
    } else {
      primaryTowardX = 0;
      primaryTowardY = towardAy;
    }
  }
  // Single-axis primary (prefer trend.orient)
  if (trend.orient === 'v' && primaryTowardY !== 0) {
    primaryTowardX = 0;
  } else if (trend.orient === 'h' && primaryTowardX !== 0) {
    primaryTowardY = 0;
  } else if (primaryTowardX !== 0 && primaryTowardY !== 0) {
    if (Math.abs(trend.dx) >= Math.abs(trend.dy)) primaryTowardY = 0;
    else primaryTowardX = 0;
  }

  type Cand = { x: number; y: number; w: number; h: number; score: number };
  const cands: Cand[] = [];

  // Intent preview T*: try this first (and prefer exclusively if grow works)
  if (opts?.forcedTarget) {
    const ft = opts.forcedTarget;
    if (
      ft.w * ft.h === newValue &&
      isValidGrowTarget(B, ft) &&
      rectInBounds(ft.x, ft.y, ft.w, ft.h)
    ) {
      cands.push({ ...ft, score: 1_000_000 });
    }
  }

  /** Strong preference: expand along player approach; oppose = heavy penalty. */
  const approachAlignScore = (target: {
    x: number;
    y: number;
    w: number;
    h: number;
  }): number => {
    const { dirX, dirY } = expandDirs(B, target);
    let s = 0;
    if (primaryTowardX !== 0) {
      if (dirX === primaryTowardX) s += 50_000;
      else if (dirX === -primaryTowardX) s -= 40_000;
      else if (dirX !== 0) s -= 5_000;
    }
    if (primaryTowardY !== 0) {
      if (dirY === primaryTowardY) s += 50_000;
      else if (dirY === -primaryTowardY) s -= 40_000;
      else if (dirY !== 0) s -= 5_000;
    }
    // Prefer matching growth axis of intent
    if (primaryTowardY !== 0 && target.h > B.h) s += 2_000;
    if (primaryTowardX !== 0 && target.w > B.w) s += 2_000;
    if (primaryTowardY !== 0 && target.w > B.w && target.h === B.h) s -= 3_000;
    if (primaryTowardX !== 0 && target.h > B.h && target.w === B.w) s -= 3_000;
    return s;
  };

  const expandsAgainstApproach = (target: {
    x: number;
    y: number;
    w: number;
    h: number;
  }): boolean => {
    const { dirX, dirY } = expandDirs(B, target);
    if (primaryTowardX !== 0 && dirX === -primaryTowardX) return true;
    if (primaryTowardY !== 0 && dirY === -primaryTowardY) return true;
    return false;
  };

  // 1) Solid union of player placement (A∪B) — highest priority.
  // Two 竖2 stacked → 1×4；two 8 side-by-side → long 16, etc.
  for (const union of unions) {
    if (
      union.w * union.h === newValue &&
      isUnilateralCover(B, union) &&
      rectInBounds(union.x, union.y, union.w, union.h) &&
      isValidGrowTarget(B, union)
    ) {
      cands.push({
        ...union,
        score: 500_000 + approachAlignScore(union),
      });
    }
  }

  // 2) Unilateral targets from B covering A, all size options
  const sizeList: { w: number; h: number }[] = [];
  const sk = new Set<string>();
  for (const orient of orients) {
    for (const s of sizeCandidates(newValue, orient)) {
      const k = `${s.w}x${s.h}`;
      if (sk.has(k)) continue;
      sk.add(k);
      sizeList.push(s);
    }
  }
  // Always allow square-ish options for 16 etc.
  for (const s of sizeCandidates(newValue, 'h').concat(sizeCandidates(newValue, 'v'))) {
    const k = `${s.w}x${s.h}`;
    if (sk.has(k)) continue;
    sk.add(k);
    sizeList.push(s);
  }

  const fromSnap = getPiece(base, B.id)!;
  for (const { w, h } of sizeList) {
    const needX = Math.max(0, w - fromSnap.w);
    const needY = Math.max(0, h - fromSnap.h);

    // Prefer growth into free board room; never prioritize an off-board edge
    const dirs: { dx: number; dy: number; pri: number }[] = [];
    const pushDir = (dx: number, dy: number, pri: number) => {
      // Skip dirs that need more cells than edge room allows
      if (dx !== 0 && needX > 0 && edgeRoom(fromSnap, dx, 0) < needX) return;
      if (dy !== 0 && needY > 0 && edgeRoom(fromSnap, 0, dy) < needY) return;
      // Pure-axis grow of zero on that axis is fine
      dirs.push({ dx, dy, pri });
    };

    // Approach direction first (high priority)
    if (primaryTowardY !== 0) pushDir(0, primaryTowardY, 900);
    if (primaryTowardX !== 0) pushDir(primaryTowardX, 0, 900);
    // Opposite only as board-edge fallback
    if (primaryTowardY !== 0) pushDir(0, -primaryTowardY, 50);
    if (primaryTowardX !== 0) pushDir(-primaryTowardX, 0, 50);
    for (const o of orients) {
      const d = dirForOrient(o, trend);
      pushDir(d.dirX, d.dirY, 400);
      pushDir(-d.dirX, -d.dirY, 30);
    }
    // Cardinals ordered by remaining room (more room first)
    const cards: { dx: number; dy: number }[] = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    cards.sort(
      (a, b) =>
        edgeRoom(fromSnap, b.dx, b.dy) - edgeRoom(fromSnap, a.dx, a.dy),
    );
    for (const c of cards) pushDir(c.dx, c.dy, 10 + edgeRoom(fromSnap, c.dx, c.dy));

    const seenDir = new Set<string>();
    for (const d of dirs) {
      const dk = `${d.dx},${d.dy}`;
      if (seenDir.has(dk)) continue;
      seenDir.add(dk);
      const t = unilateralTargetFrom(fromSnap, w, h, d.dx, d.dy, ac);
      if (!t) continue;
      if (!rectInBounds(t.x, t.y, t.w, t.h)) continue;
      if (!isValidGrowTarget(fromSnap, t)) continue;
      // Prefer covering where A was
      const overA = overlapCount(
        cellsOfRect(t.x, t.y, t.w, t.h),
        new Set(aCells.map((c) => cellKey(c.x, c.y))),
      );
      const towardBonus =
        (d.dy === primaryTowardY && primaryTowardY !== 0 ? 400 : 0) +
        (d.dx === primaryTowardX && primaryTowardX !== 0 ? 400 : 0);
      // Extra: reward growth that keeps margin inside board (small weight)
      const margin =
        Math.min(t.x, t.y, GRID_SIZE - (t.x + t.w), GRID_SIZE - (t.y + t.h)) * 2;
      cands.push({
        ...t,
        score:
          overA * 100 +
          towardBonus +
          d.pri +
          margin +
          approachAlignScore(t),
      });
    }
  }

  cands.sort((a, b) => b.score - a.score);

  // Prefer candidates that match approach when any exist (skip opposite unless none work)
  const aligned = cands.filter((c) => !expandsAgainstApproach(c));
  const tryOrder =
    aligned.length > 0
      ? [...aligned, ...cands.filter((c) => expandsAgainstApproach(c))]
      : cands;

  // Collect successful grows; prefer non-deadlock + approach score
  type Ok = {
    board: BoardState;
    score: number;
    createdValue: number;
    steps: AtomicStep[];
    startBoard: BoardState;
    live: boolean;
  };
  const okList: Ok[] = [];
  const seenT = new Set<string>();
  for (const pl of tryOrder) {
    const key = `${pl.x},${pl.y},${pl.w},${pl.h}`;
    if (seenT.has(key)) continue;
    seenT.add(key);

    const trial = cloneBoard(base);
    const startBoard = cloneBoard(trial);
    const fromB = getPiece(trial, B.id);
    if (!fromB) continue;
    const toPiece: Piece = {
      id: B.id,
      value: newValue,
      color: B.color,
      x: pl.x,
      y: pl.y,
      w: pl.w,
      h: pl.h,
    };
    const steps: AtomicStep[] = [];
    if (!tryGrowInPlace(trial, B.id, fromB, toPiece, steps)) continue;
    // isPlayable only (move or potential contact merge) — O(grid), not O(tryMergeⁿ)
    const live = isPlayable(trial);
    const score = pl.score + (live ? 200_000 : -100_000);
    okList.push({
      board: trial,
      score,
      createdValue: newValue,
      steps,
      startBoard,
      live,
    });
    // Early accept: strong approach + playable → stop searching (keep drop snappy)
    if (live && pl.score >= 40_000 && !expandsAgainstApproach(pl)) {
      return {
        ok: true,
        board: trial,
        createdValue: newValue,
        startBoard,
        plan: {
          steps,
          createdValue: newValue,
          anchorId: B.id,
        },
      };
    }
  }

  okList.sort((a, b) => b.score - a.score);
  const liveOk = okList.filter((o) => o.live);
  const pick = (liveOk.length > 0 ? liveOk : okList)[0];
  if (pick) {
    return {
      ok: true,
      board: pick.board,
      createdValue: pick.createdValue,
      startBoard: pick.startBoard,
      plan: {
        steps: pick.steps,
        createdValue: pick.createdValue,
        anchorId: B.id,
      },
    };
  }
  return { ok: false, reason: 'place' };
}

export function mergeTrendFromPieces(A: Piece, B: Piece): DragTrend {
  return trendFromCenters(pieceCenter(A), pieceCenter(B));
}

export function isInBoundsCell(x: number, y: number): boolean {
  return inBounds(x, y);
}
