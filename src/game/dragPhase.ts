/**
 * FREE / LOCKED drag phase machine (pure). Design: docs/DESIGN_DRAG_MERGE.md
 */
import {
  centerDistCells,
  rectOverlapCells,
  SNAP_ENTER_DIST,
  SNAP_EXIT_DIST,
} from './intent';
import type { BoardState, Piece } from './types';

export type DragPhase = 'free' | 'locked';

export type LockB = { x: number; y: number; w: number; h: number };

export type DragPhaseState = {
  phase: DragPhase;
  lockedTargetId: number | null;
  /** Design-space finger when entering LOCKED */
  lockFingerDesign: { x: number; y: number };
  lockB: LockB | null;
};

export type HapticCue = 'attach' | 'detach' | null;

export function initialDragPhase(): DragPhaseState {
  return {
    phase: 'free',
    lockedTargetId: null,
    lockFingerDesign: { x: 0, y: 0 },
    lockB: null,
  };
}

export function resetDragPhase(): DragPhaseState {
  return initialDragPhase();
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
    designX: number;
    designY: number;
    board: BoardState;
    nearest: NearestMerge | null;
  },
): { state: DragPhaseState; haptic: HapticCue } {
  const { A, rawGhost, designX, designY, board, nearest } = opts;

  if (state.phase === 'free') {
    if (
      nearest &&
      (nearest.overlap >= 1 || nearest.dist <= SNAP_ENTER_DIST)
    ) {
      return {
        state: {
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
    return { state, haptic: null };
  }

  // LOCKED
  if (state.lockedTargetId == null) {
    return { state: resetDragPhase(), haptic: null };
  }
  const B = board.pieces.find((p) => p.id === state.lockedTargetId) ?? null;
  if (!B) {
    return { state: resetDragPhase(), haptic: 'detach' };
  }

  const dist = centerDistCells(rawGhost, A, B);
  const ov = rectOverlapCells(
    { x: rawGhost.x, y: rawGhost.y, w: A.w, h: A.h },
    B,
  );
  if (dist > SNAP_EXIT_DIST && ov < 1) {
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
