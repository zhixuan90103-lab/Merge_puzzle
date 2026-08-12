import type { BoardState, Piece } from './types';
import type { AtomicStep, MergePlan, Rect } from './plan';
import { easeInOutCubic, lerpRect } from './visual';
import {
  clipPieceToBoard,
  cloneBoard,
  getPiece,
  upsertPiece,
  removePiece,
} from './board';

export type VisualPiece = {
  id: number;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  /** highlight while being pushed this step */
  pushed?: boolean;
  growing?: boolean;
};

export type TimelineCallbacks = {
  onVisual: (pieces: VisualPiece[], message: string) => void;
  onDone: (finalBoard: BoardState) => void;
  onCancel?: () => void;
};

/** Duration per logical cell (ms). Linear segments → no stop-start between cells. */
const CELL_MS = 95;
/** Soft ease across the whole merge clip (not per cell). */
const USE_GLOBAL_EASE = true;

type PieceTrack = {
  id: number;
  value: number;
  /** Keyframe rects at integer step boundaries [0 .. n] */
  keys: Rect[];
  /** True if this piece moves or resizes during the plan */
  active: boolean;
  pushed: boolean;
  growing: boolean;
};

function isFullyOff(r: { x: number; y: number; w: number; h: number }): boolean {
  return r.x + r.w <= 0 || r.y + r.h <= 0 || r.x >= 8 || r.y >= 8;
}

function rectEq(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function pieceToVisual(
  p: { id: number; value: number; x: number; y: number; w: number; h: number; opacity?: number },
  flags?: { pushed?: boolean; growing?: boolean },
): VisualPiece {
  const off = isFullyOff(p);
  return {
    id: p.id,
    value: p.value,
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    opacity: p.opacity ?? (off ? 0.35 : 1),
    pushed: flags?.pushed,
    growing: flags?.growing,
  };
}

function applyStepLogical(board: BoardState, step: AtomicStep): void {
  for (const mv of step.pushes) {
    const p = getPiece(board, mv.pieceId);
    if (!p) continue;
    const to = mv.to;
    // Whole-body slide; no mid-push clip. Fully off → remove after this step.
    if (isFullyOff(to)) {
      removePiece(board, mv.pieceId);
    } else {
      upsertPiece(board, {
        ...p,
        x: to.x,
        y: to.y,
        w: to.w,
        h: to.h,
        // value unchanged while sliding (incl. partially off)
      });
    }
  }
  const g = step.grow;
  const b = getPiece(board, g.pieceId);
  if (b) {
    upsertPiece(board, {
      ...b,
      value: g.value,
      x: g.to.x,
      y: g.to.y,
      w: g.to.w,
      h: g.to.h,
    });
  }
}

/**
 * Simulate all steps to build continuous keyframe tracks (no per-step easeOut).
 * Progress is continuous across the whole plan → push chains feel like one shove.
 */
function buildTracks(startBoard: BoardState, plan: MergePlan): {
  tracks: PieceTrack[];
  finalBoard: BoardState;
  stepCount: number;
} {
  const board = cloneBoard(startBoard);
  const n = plan.steps.length;
  const byId = new Map<number, PieceTrack>();

  const ensure = (p: Piece): PieceTrack => {
    let t = byId.get(p.id);
    if (!t) {
      t = {
        id: p.id,
        value: p.value,
        keys: [],
        active: false,
        pushed: false,
        growing: false,
      };
      byId.set(p.id, t);
    }
    return t;
  };

  // Keyframe 0 = start
  for (const p of board.pieces) {
    const t = ensure(p);
    t.keys.push({ x: p.x, y: p.y, w: p.w, h: p.h });
  }

  for (let si = 0; si < n; si++) {
    const step = plan.steps[si]!;
    const moved = new Set<number>();

    for (const mv of step.pushes) {
      moved.add(mv.pieceId);
      const t = byId.get(mv.pieceId) ?? ensure({
        id: mv.pieceId,
        value: getPiece(board, mv.pieceId)?.value ?? 1,
        x: mv.from.x,
        y: mv.from.y,
        w: mv.from.w,
        h: mv.from.h,
      });
      t.pushed = true;
      t.active = true;
      // pad keys if piece appeared mid-plan
      while (t.keys.length < si + 1) {
        t.keys.push({ ...mv.from });
      }
    }

    const growId = step.grow.pieceId;
    moved.add(growId);
    {
      const t = byId.get(growId) ?? ensure({
        id: growId,
        value: step.grow.value,
        x: step.grow.from.x,
        y: step.grow.from.y,
        w: step.grow.from.w,
        h: step.grow.from.h,
      });
      t.growing = true;
      t.value = step.grow.value;
      if (!rectEq(step.grow.from, step.grow.to)) t.active = true;
      while (t.keys.length < si + 1) {
        t.keys.push({ ...step.grow.from });
      }
    }

    applyStepLogical(board, step);

    // purge fully off for final key
    for (const p of [...board.pieces]) {
      if (
        p.id !== plan.anchorId &&
        (p.x + p.w <= 0 || p.y + p.h <= 0 || p.x >= 8 || p.y >= 8)
      ) {
        removePiece(board, p.id);
      }
    }

    // Keyframe after step si → index si+1
    for (const [id, t] of byId) {
      const p = getPiece(board, id);
      if (p) {
        t.keys.push({ x: p.x, y: p.y, w: p.w, h: p.h });
        t.value = p.value;
      } else {
        // left board: keep last to slightly off or use last key
        const last = t.keys[t.keys.length - 1]!;
        t.keys.push({ ...last });
      }
    }

    // New pieces shouldn't appear mid-merge; ignore
    void moved;
  }

  // Normalize key lengths to n+1
  for (const t of byId.values()) {
    while (t.keys.length < n + 1) {
      t.keys.push({ ...t.keys[t.keys.length - 1]! });
    }
    if (t.keys.length > n + 1) t.keys.length = n + 1;
  }

  // Settle after animation path: half-off pieces clip once (not mid-push)
  for (const p of [...board.pieces]) {
    if (p.id === plan.anchorId) continue;
    if (isFullyOff(p)) {
      removePiece(board, p.id);
      continue;
    }
    const clipped = clipPieceToBoard(p);
    if (!clipped) removePiece(board, p.id);
    else if (
      clipped.w !== p.w ||
      clipped.h !== p.h ||
      clipped.x !== p.x ||
      clipped.y !== p.y ||
      clipped.value !== p.value
    ) {
      upsertPiece(board, clipped);
    }
  }

  return { tracks: [...byId.values()], finalBoard: board, stepCount: n };
}

function sampleTrack(
  track: PieceTrack,
  globalU: number,
  stepCount: number,
): Rect & { opacity: number } {
  if (stepCount <= 0) {
    const r = track.keys[0]!;
    return { ...r, opacity: 1 };
  }
  const scaled = globalU * stepCount;
  const i = Math.min(stepCount - 1, Math.floor(scaled));
  const local = scaled - i;
  const from = track.keys[i]!;
  const to = track.keys[i + 1]!;
  const r = lerpRect(from, to, local);
  // Soft fade only when this segment ends fully off-board (whole body sliding out)
  let opacity = 1;
  if (isFullyOff(to)) {
    opacity = Math.max(0.2, 1 - local * 0.75);
  }
  return { ...r, opacity };
}

/**
 * Play merge plan as **one continuous clip**:
 * constant cell speed, gentle global ease — no per-cell easeOut hitch.
 */
export function playMergePlan(
  startBoard: BoardState,
  plan: MergePlan,
  cb: TimelineCallbacks,
): { cancel: () => void } {
  let cancelled = false;
  let raf = 0;

  const cancel = () => {
    cancelled = true;
    if (raf) cancelAnimationFrame(raf);
    cb.onCancel?.();
  };

  if (plan.steps.length === 0) {
    cb.onVisual(
      startBoard.pieces.map((p) => pieceToVisual(p)),
      '',
    );
    cb.onDone(cloneBoard(startBoard));
    return { cancel };
  }

  const { tracks, finalBoard, stepCount } = buildTracks(startBoard, plan);
  const duration = Math.max(CELL_MS, stepCount * CELL_MS);
  const t0 = performance.now();

  // Static ids for pieces that never move (sampled once positions)
  const trackMap = new Map(tracks.map((t) => [t.id, t]));

  const run = (now: number) => {
    if (cancelled) return;
    const raw = (now - t0) / duration;
    const u = raw >= 1 ? 1 : USE_GLOBAL_EASE ? easeInOutCubic(raw) : raw;

    const visuals: VisualPiece[] = [];
    for (const track of tracks) {
      const r = sampleTrack(track, u, stepCount);
      // Skip fully off-board at end
      if (u >= 1 && isFullyOff(r) && track.id !== plan.anchorId) continue;
      // During motion, hide fully off; keep clipped-on-board bodies
      if (isFullyOff(r) && track.id !== plan.anchorId && r.opacity < 0.2) continue;
      visuals.push(
        pieceToVisual(
          {
            id: track.id,
            value: track.value,
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
            opacity: r.opacity,
          },
          {
            // Pushed: same layer as board (no “float”); growing can mark lightly
            pushed: false,
            growing: track.growing && u < 1,
          },
        ),
      );
    }

    // Include any start-board pieces missing from tracks (shouldn't happen)
    for (const p of startBoard.pieces) {
      if (trackMap.has(p.id)) continue;
      visuals.push(pieceToVisual(p));
    }

    cb.onVisual(visuals, '推挤生长中…');

    if (raw >= 1) {
      cb.onVisual(
        finalBoard.pieces.map((p) => pieceToVisual(p)),
        '',
      );
      cb.onDone(finalBoard);
      return;
    }
    raf = requestAnimationFrame(run);
  };

  raf = requestAnimationFrame(run);
  return { cancel };
}

export type { Rect };
