/**
 * FREE / LOCKED drag phase machine (pure). Design: docs/DESIGN_DRAG_MERGE.md
 */
import {
  centerDistCells,
  lockEnterDist,
  lockExitDist,
  rectOverlapCells,
  LOCK_OVERLAP_ENTER,
  LOCK_OVERLAP_EXIT,
  LOCK_STEAL_OVERLAP,
  LOCK_ARM_DIST,
  LOCK_SEED_EXTRA,
} from './intent';
import { canMergePair } from './shapes';
import type { BoardState, Piece } from './types';

export type DragPhase = 'free' | 'locked';

export type LockB = { x: number; y: number; w: number; h: number };

export type DragPhaseState = {
  phase: DragPhase;
  lockedTargetId: number | null;
  /** Design-space finger when entering LOCKED */
  lockFingerDesign: { x: number; y: number };
  lockB: LockB | null;
  /** Design-space finger at lift — lock stays off until we move away. */
  liftDesign: { x: number; y: number } | null;
  lockArmed: boolean;
  /** Overlap at lift vs neighbors already in range (don't snap instantly). */
  seedOverlap: Record<number, number>;
};

export type HapticCue = 'attach' | 'detach' | null;

export function initialDragPhase(): DragPhaseState {
  return {
    phase: 'free',
    lockedTargetId: null,
    lockFingerDesign: { x: 0, y: 0 },
    lockB: null,
    liftDesign: null,
    lockArmed: false,
    seedOverlap: {},
  };
}

export function resetDragPhase(): DragPhaseState {
  return initialDragPhase();
}

/** Call on pointerdown after lift — records neighbors already in range. */
export function beginLiftPhase(
  designX: number,
  designY: number,
  board: BoardState,
  A: Piece,
  fingerRect: { x: number; y: number; w: number; h: number },
): DragPhaseState {
  const seedOverlap: Record<number, number> = {};
  for (const p of board.pieces) {
    if (p.id === A.id) continue;
    if (!canMergePair(A, p)) continue;
    const ov = rectOverlapCells(fingerRect, p);
    const dist = centerDistCells({ x: fingerRect.x, y: fingerRect.y }, A, p);
    if (ov >= LOCK_OVERLAP_ENTER * 0.5 || dist <= lockEnterDist(A, p) + 0.15) {
      seedOverlap[p.id] = ov;
    }
  }
  return {
    ...initialDragPhase(),
    liftDesign: { x: designX, y: designY },
    seedOverlap,
  };
}

export type NearestMerge = {
  target: Piece;
  dist: number;
  overlap: number;
};

/**
 * Advance FREE↔LOCKED given finger ghost + nearest mergeable.
 * Returns next state and optional haptic cue.
 */
export function stepDragPhase(
  state: DragPhaseState,
  opts: {
    A: Piece;
    rawGhost: { x: number; y: number };
    /** Continuous finger rect (preferred for lock). */
    fingerRect?: { x: number; y: number; w: number; h: number };
    designX: number;
    designY: number;
    board: BoardState;
    nearest: NearestMerge | null;
  },
): { state: DragPhaseState; haptic: HapticCue } {
  const { A, rawGhost, designX, designY, board, nearest } = opts;
  const probe = opts.fingerRect ?? {
    x: rawGhost.x,
    y: rawGhost.y,
    w: A.w,
    h: A.h,
  };

  if (state.phase === 'free') {
    let lockArmed = state.lockArmed;
    if (!lockArmed && state.liftDesign) {
      const moved =
        Math.hypot(designX - state.liftDesign.x, designY - state.liftDesign.y) /
        40;
      if (moved >= LOCK_ARM_DIST) lockArmed = true;
    } else if (!lockArmed && !state.liftDesign) {
      lockArmed = true;
    }

    const armedState = lockArmed === state.lockArmed ? state : { ...state, lockArmed };

    if (lockArmed && nearest) {
      const seed = state.seedOverlap[nearest.target.id];
      const inRange =
        nearest.overlap >= LOCK_OVERLAP_ENTER ||
        nearest.dist <= lockEnterDist(A, nearest.target);
      const freshTarget = seed == null;
      const committedOnSeed =
        seed != null && nearest.overlap >= seed + LOCK_SEED_EXTRA;
      if (inRange && (freshTarget || committedOnSeed)) {
        return {
          state: {
            ...armedState,
            phase: 'locked',
            lockedTargetId: nearest.target.id,
            lockFingerDesign: { x: designX, y: designY },
            lockB: {
              x: nearest.target.x,
              y: nearest.target.y,
              w: nearest.target.w,
              h: nearest.target.h,
            },
          },
          haptic: 'attach',
        };
      }
    }
    return { state: armedState, haptic: null };
  }

  // LOCKED
  if (state.lockedTargetId == null) {
    return { state: resetDragPhase(), haptic: null };
  }
  const B = board.pieces.find((p) => p.id === state.lockedTargetId) ?? null;
  if (!B) {
    return { state: resetDragPhase(), haptic: 'detach' };
  }

  const dist = centerDistCells({ x: probe.x, y: probe.y }, A, B);
  const ov = rectOverlapCells(probe, B);

  const C = nearest?.target;
  if (C && C.id !== B.id) {
    const ovC = nearest.overlap;
    const fcx = probe.x + probe.w / 2;
    const fcy = probe.y + probe.h / 2;
    const heartInC =
      fcx >= C.x && fcy >= C.y && fcx < C.x + C.w && fcy < C.y + C.h;
    const moreOnC = ovC >= ov + LOCK_STEAL_OVERLAP;
    if (
      (heartInC || moreOnC) &&
      (heartInC || ovC >= LOCK_OVERLAP_ENTER)
    ) {
      return {
        state: {
          ...state,
          phase: 'locked',
          lockedTargetId: C.id,
          lockFingerDesign: { x: designX, y: designY },
          lockB: { x: C.x, y: C.y, w: C.w, h: C.h },
        },
        haptic: 'attach',
      };
    }
  }

  if (dist > lockExitDist(A, B) && ov < LOCK_OVERLAP_EXIT) {
    return { state: resetDragPhase(), haptic: 'detach' };
  }

  return {
    state: {
      ...state,
      phase: 'locked',
      lockB: { x: B.x, y: B.y, w: B.w, h: B.h },
    },
    haptic: null,
  };
}
