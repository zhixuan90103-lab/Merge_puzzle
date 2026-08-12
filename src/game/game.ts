import { cloneBoard, getPiece } from './board';
import { dealAfterClear, dealDebugNear64, dealOpening } from './deal';
import { isDeadlock, isPlayable } from './deadlock';
import { proposeDrop, type DropProposal } from './dropResolve';
import { tryMerge, trendFromApproachDelta } from './merge';
import { sizeForValue } from './shapes';
import { trySpawnOne } from './spawn';
import { playMergePlan, type VisualPiece } from './timeline';
import type { BoardState, Orientation, Piece } from './types';

export type GameStatus = 'playing' | 'dead';

export type GameModel = {
  board: BoardState;
  status: GameStatus;
  message: string;
  wave: number;
  lifted: Piece | null;
  lastSpawn: boolean;
  spawnFlashIds: number[];
  animating: boolean;
  /** When set, view renders these instead of board.pieces (timeline) */
  visualPieces: VisualPiece[] | null;
};

export type GameListener = (g: GameModel) => void;

export type { DropProposal };

function rectsOverlap(a: Piece, b: Piece): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/** Preview + commit share this. Board is rest-of-board without lifted A. */
export function proposalForLifted(
  board: BoardState,
  lifted: Piece,
  ghost: { x: number; y: number },
  opts?: Parameters<typeof proposeDrop>[3],
): DropProposal {
  return proposeDrop(board, lifted, ghost, opts);
}

export function createGame() {
  let model: GameModel = {
    board: dealOpening(),
    status: 'playing',
    message: '拖到空位搬家；相同数字且同朝向可合并',
    wave: 1,
    lifted: null,
    lastSpawn: false,
    spawnFlashIds: [],
    animating: false,
    visualPieces: null,
  };
  const listeners = new Set<GameListener>();
  let cancelAnim: (() => void) | null = null;

  const emit = () => {
    for (const fn of listeners) fn(model);
  };

  const set = (partial: Partial<GameModel>) => {
    model = { ...model, ...partial };
    emit();
  };

  const checkDead = (board: BoardState, message: string) => {
    if (isDeadlock(board)) {
      set({
        board,
        status: 'dead',
        message: `${message} · 走不动了，点重开`,
        lifted: null,
        spawnFlashIds: [],
        animating: false,
        visualPieces: null,
      });
    } else {
      set({
        board,
        status: 'playing',
        message,
        lifted: null,
        spawnFlashIds: [],
        animating: false,
        visualPieces: null,
      });
    }
  };

  const bounceBack = (A: Piece, message: string) => {
    const board = cloneBoard(model.board);
    board.pieces.push({ ...A });
    set({
      board,
      lifted: null,
      message,
      spawnFlashIds: [],
      visualPieces: null,
    });
  };

  /**
   * Settle after merge animation (design):
   * 1) Unlock input immediately (animating=false) so player never waits on AI search
   * 2) Cheap spawn (isPlayable only)
   * 3) Full isDeadlock **only** if not playable — rare terminal confirm
   */
  const afterMerge = (board: BoardState, createdValue: number) => {
    if (createdValue === 64) {
      const next = dealAfterClear();
      const wave = model.wave + 1;
      set({
        board: next,
        status: 'playing',
        message: `合成 64！波次清空 → 第 ${wave} 波`,
        wave,
        lifted: null,
        lastSpawn: false,
        spawnFlashIds: [],
        animating: false,
        visualPieces: null,
      });
      return;
    }

    const spawn = trySpawnOne(board);
    const spawned = spawn.spawnedId != null;
    const note = `合并 → ${createdValue} · ${spawn.label}`;

    // Fast path: playable → resume now (no tryMerge storm)
    if (isPlayable(spawn.board)) {
      set({
        board: spawn.board,
        status: 'playing',
        message: note,
        lifted: null,
        lastSpawn: spawned,
        spawnFlashIds: spawn.spawnedId != null ? [spawn.spawnedId] : [],
        animating: false,
        visualPieces: null,
      });
      return;
    }

    // Terminal confirm once (expensive merge sim) — only when board looks stuck
    const dead = isDeadlock(spawn.board);
    set({
      board: spawn.board,
      status: dead ? 'dead' : 'playing',
      message: dead ? `${note} · 走不动了，点重开` : note,
      lifted: null,
      lastSpawn: spawned,
      spawnFlashIds: spawn.spawnedId != null ? [spawn.spawnedId] : [],
      animating: false,
      visualPieces: null,
    });
  };

  return {
    get: () => model,
    subscribe: (fn: GameListener) => {
      listeners.add(fn);
      fn(model);
      return () => listeners.delete(fn);
    },
    restart: () => {
      cancelAnim?.();
      cancelAnim = null;
      set({
        board: dealOpening(),
        status: 'playing',
        message: '重新开局',
        wave: 1,
        lifted: null,
        lastSpawn: false,
        spawnFlashIds: [],
        animating: false,
        visualPieces: null,
      });
    },
    loadDebug: () => {
      cancelAnim?.();
      cancelAnim = null;
      set({
        board: dealDebugNear64(),
        status: 'playing',
        message: 'Debug 盘：高值半成品',
        lifted: null,
        lastSpawn: false,
        spawnFlashIds: [],
        animating: false,
        visualPieces: null,
      });
    },
    beginLift: (pieceId: number) => {
      if (model.status === 'dead' || model.animating) return false;
      if (model.lifted) return false;
      const p = getPiece(model.board, pieceId);
      if (!p) return false;
      const board = cloneBoard(model.board);
      board.pieces = board.pieces.filter((q) => q.id !== pieceId);
      set({
        board,
        lifted: { ...p },
        message: `拖动 ${p.value}`,
        visualPieces: null,
        spawnFlashIds: [],
      });
      return true;
    },
    cancelLift: () => {
      if (!model.lifted) return;
      const board = cloneBoard(model.board);
      board.pieces.push({ ...model.lifted });
      set({ board, lifted: null, message: '取消', visualPieces: null });
    },
    /**
     * Commit last preview frame only (FINDINGS: no second direction recompute).
     * Pass full DropProposal from view when available.
     */
    dropAt: (
      ghost: { x: number; y: number },
      designDx: number,
      designDy: number,
      frame?: DropProposal | null,
    ) => {
      const A = model.lifted;
      if (!A || model.animating) return;

      const enterDx = designDx / 40;
      const enterDy = designDy / 40;
      const proposal =
        frame ??
        proposeDrop(model.board, A, ghost, {
          enterDx,
          enterDy,
          origin: { x: A.x, y: A.y },
        });
      const gx = proposal.ghost.x;
      const gy = proposal.ghost.y;

      // Double-check home cancel (adjacent same-value must not merge)
      if (
        gx === A.x &&
        gy === A.y &&
        proposal.kind === 'merge'
      ) {
        const board = cloneBoard(model.board);
        board.pieces.push({ ...A, x: A.x, y: A.y });
        checkDead(board, '放回原位');
        return;
      }

      if (proposal.kind === 'merge' && proposal.targetId != null) {
        const target = getPiece(model.board, proposal.targetId);
        if (!target) {
          bounceBack(A, '目标消失');
          return;
        }
        const board = cloneBoard(model.board);
        const aPiece: Piece = { ...A, x: gx, y: gy };
        board.pieces.push(aPiece);

        // Trend from preview grow dirs / finger bias (fallback)
        const useTrend =
          proposal.growDirX !== 0 || proposal.growDirY !== 0
            ? trendFromApproachDelta(
                proposal.growDirX ?? 0,
                proposal.growDirY ?? 0,
              )
            : trendFromApproachDelta(-enterDx, -enterDy);

        const result = tryMerge(board, aPiece.id, target.id, useTrend, {
          forcedTarget: proposal.mergeTarget ?? undefined,
        });
        if (result.ok) {
          set({
            animating: true,
            lifted: null,
            message: '推挤生长中…',
            spawnFlashIds: [],
            board: result.startBoard,
            visualPieces: null,
          });
          cancelAnim?.();
          cancelAnim = playMergePlan(result.startBoard, result.plan, {
            onVisual: (pieces) => {
              model = { ...model, visualPieces: pieces, animating: true };
              emit();
            },
            onDone: (finalBoard) => {
              cancelAnim = null;
              afterMerge(finalBoard, result.createdValue);
            },
          }).cancel;
          return;
        }

        bounceBack(
          A,
          result.reason === 'orient'
            ? '朝向不同：横只能合横，竖只能合竖'
            : result.reason === 'place'
              ? '合失败：挡路推不开'
              : `合失败（${result.reason}）`,
        );
        return;
      }

      if (proposal.kind === 'move') {
        const board = cloneBoard(model.board);
        board.pieces.push({ ...A, x: gx, y: gy });
        checkDead(board, '搬家');
        return;
      }

      bounceBack(A, proposal.reason || '无法放置，弹回');
    },
    upgradeSelected: (pieceId: number) => {
      if (model.animating) return;
      const board = cloneBoard(model.board);
      const p = getPiece(board, pieceId);
      if (!p || p.value >= 64) return;
      const nv = Math.min(64, p.value * 2);
      const orient: Orientation = p.w >= p.h ? 'h' : 'v';
      const s = sizeForValue(nv, orient);
      p.value = nv;
      p.w = s.w;
      p.h = s.h;
      p.x = Math.max(0, Math.min(8 - p.w, p.x));
      p.y = Math.max(0, Math.min(8 - p.h, p.y));
      board.pieces = board.pieces.filter((o) => o.id === p.id || !rectsOverlap(p, o));
      if (nv === 64) afterMerge(board, 64);
      else set({ board, message: `Debug 升级 → ${nv}`, visualPieces: null });
    },
  };
}
