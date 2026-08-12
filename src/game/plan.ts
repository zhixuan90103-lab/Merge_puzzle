/** Merge animation plan — logic discrete steps for timeline interpolation. */

export type Rect = { x: number; y: number; w: number; h: number };

export type CellMove = {
  pieceId: number;
  from: Rect;
  to: Rect;
};

export type GrowDelta = {
  pieceId: number;
  from: Rect;
  to: Rect;
  value: number;
};

/**
 * One beat: blockers shove 1 cell, B grows 1 cell.
 * Timeline interpolates pushes + grow with the **same** t ∈ [0,1].
 */
export type AtomicStep = {
  pushes: CellMove[];
  grow: GrowDelta;
};

export type MergePlan = {
  steps: AtomicStep[];
  createdValue: number;
  /** B's id (stable) */
  anchorId: number;
};

export function rectEq(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function copyRect(r: Rect): Rect {
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}
