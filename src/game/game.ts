import { cloneBoard, getPiece } from './board';
import { dealAfterClear, dealDebugNear64, dealOpening } from './deal';
import { isDeadlock, isForcedLoss, isPlayable, isSafeToContinue } from './deadlock';
import { proposeDrop, type DropProposal } from './dropResolve';
import { tryMerge, trendFromApproachDelta } from './merge';
import { sizeForValue } from './shapes';
import { trySpawnAfterMerge } from './spawn';
import { playMergePlan, type VisualPiece } from './timeline';
import { unlockedColorsForWave, waveIntroMessage } from './progress';
import type { BoardState, Orientation, Piece } from './types';
import { GRID_SIZE } from './types';

export type GameStatus = 'playing' | 'dead';

export type GameModel = {
  board: BoardState;
  status: GameStatus;
  message: string;
  wave: number;
  /** How many colors may appear (1..MAX_COLORS). Grows after each full-board clear. */
  unlockedColors: number;
  lifted: Piece | null;
  lastSpawn: boolean;
  spawnFlashIds: number[];
  /** Piece ids to blink after an illegal drop returns home. */
  rejectFlashIds: number[];
  /** Bumps every bounce so the same piece can blink again. */
  rejectNonce: number;
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
    board: dealOpening(2, 1),
    status: 'playing',
    message: waveIntroMessage(1),
    wave: 1,
    unlockedColors: 2,
    lifted: null,
    lastSpawn: false,
    spawnFlashIds: [],
    rejectFlashIds: [],
    rejectNonce: 0,
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
        message: `${message} · 无法再合并，点重开`,
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
      rejectFlashIds: [A.id],
      rejectNonce: model.rejectNonce + 1,
      visualPieces: null,
    });
  };

  /**
   * Settle after merge animation (design):
   * 1) Unlock input immediately (animating=false) so player never waits on AI search
   * 2) Cheap spawn (isPlayable only)
   * 3) Full isDeadlock **only** if not playable — rare terminal confirm
   */
  const afterMerge = (
    board: BoardState,
    createdValue: number,
    piecesBefore: number,
    mergeColor = 0,
  ) => {
    if (createdValue === 64) {
      // Full screen clear → next wave; color count follows wave schedule (not +1 always).
      const wave = model.wave + 1;
      const unlocked = unlockedColorsForWave(wave);
      const next = dealAfterClear(unlocked, wave);
      const intro = waveIntroMessage(wave);
      const msg =
        unlocked > model.unlockedColors
          ? `满屏消除 · 解锁第 ${unlocked} 色 · ${intro}`
          : `满屏消除 · ${intro}`;
      set({
        board: next,
        status: 'playing',
        message: msg,
        wave,
        unlockedColors: unlocked,
        lifted: null,
        lastSpawn: false,
        spawnFlashIds: [],
        animating: false,
        visualPieces: null,
      });
      return;
    }

    // Closed board: only refill cells freed by push/clip; pack to 64
    // Prefer the color just merged so we don't feed enemy equal-volume walls.
    const spawn = trySpawnAfterMerge(
      board,
      model.unlockedColors,
      model.wave,
      piecesBefore,
      { color: mergeColor, value: createdValue },
    );
    const spawned = spawn.spawnedIds.length > 0;
    const note = `合并 → ${createdValue} · ${spawn.label}`;

    // Terminal: no pairs, or only one-move death (32+32→64 counts as live win path)
    const forced = isForcedLoss(spawn.board);
    const dead = !isPlayable(spawn.board) || forced || isDeadlock(spawn.board);
    if (dead) {
      set({
        board: spawn.board,
        status: 'dead',
        message: forced
          ? `${note} · 死局：唯一的合会把自己走死，点重开`
          : `${note} · 无法再合并，点重开`,
        lifted: null,
        lastSpawn: spawned,
        spawnFlashIds: spawn.spawnedIds,
        animating: false,
        visualPieces: null,
      });
      return;
    }

    set({
      board: spawn.board,
      status: 'playing',
      message: isSafeToContinue(spawn.board)
        ? note
        : `${note} · 局面危险`,
      lifted: null,
      lastSpawn: spawned,
      spawnFlashIds: spawn.spawnedIds,
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
        board: dealOpening(2, 1),
        status: 'playing',
        message: `重新开局 · ${waveIntroMessage(1)}`,
        wave: 1,
        unlockedColors: 2,
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
        board: dealDebugNear64(model.unlockedColors),
        status: 'playing',
        message: `Debug 盘 · ${model.unlockedColors} 色`,
        lifted: null,
        lastSpawn: false,
        spawnFlashIds: [],
        animating: false,
        visualPieces: null,
      });
    },
    /** 试玩用：跳过满屏，直接进下一关开局剧本 */
    debugNextWave: () => {
      cancelAnim?.();
      cancelAnim = null;
      const wave = model.wave + 1;
      const unlocked = unlockedColorsForWave(wave);
      set({
        board: dealAfterClear(unlocked, wave),
        status: 'playing',
        message: `Debug 跳关 · ${waveIntroMessage(wave)}`,
        wave,
        unlockedColors: unlocked,
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
        // Soft magnet during drag may leave G off-flush; on commit seat A on B
        // so tryMerge still has contact (preview stay weakly attracted only).
        const seatX = proposal.locked
          ? Math.max(0, Math.min(GRID_SIZE - A.w, target.x))
          : gx;
        const seatY = proposal.locked
          ? Math.max(0, Math.min(GRID_SIZE - A.h, target.y))
          : gy;
        const aPiece: Piece = { ...A, x: seatX, y: seatY };
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
              // startBoard = after absorb A; +1 ≈ A so lost ≈ pushed off + absorbed
              const piecesBefore = result.startBoard.pieces.length + 1;
              afterMerge(finalBoard, result.createdValue, piecesBefore, A.color);
            },
          }).cancel;
          return;
        }

        bounceBack(
          A,
          result.reason === 'color'
            ? '异色不能合成'
            : result.reason === 'orient'
              ? '朝向不同：横只能合横，竖只能合竖'
              : result.reason === 'place'
                ? '合失败：预览方向推不开（或挡路）'
                : `合失败（${result.reason}）`,
        );
        return;
      }

      // kind `move` = return home only (free place disabled)
      if (proposal.kind === 'move') {
        const board = cloneBoard(model.board);
        board.pieces.push({ ...A, x: A.x, y: A.y });
        checkDead(board, '放回原位');
        return;
      }

      bounceBack(A, proposal.reason || '只能拖去合并，弹回');
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
      if (nv === 64) afterMerge(board, 64, board.pieces.length);
      else set({ board, message: `Debug 升级 → ${nv}`, visualPieces: null });
    },
  };
}
