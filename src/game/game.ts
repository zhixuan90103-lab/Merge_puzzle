import {
  cloneBoard,
  getPiece,
  removePiece,
  settleBoardPieces,
  upsertPiece,
} from './board';
import { dealAfterClear, dealDebugNear64, dealOpening } from './deal';
import { isDeadlock, isForcedLoss, isPlayable, isSafeToContinue } from './deadlock';
import { proposeDrop, type DropProposal } from './dropResolve';
import { tryMerge, trendFromApproachDelta } from './merge';
import type { MergePlan } from './plan';
import { sizeForValue } from './shapes';
import { trySpawnAfterMerge } from './spawn';
import { playMergePlan, type VisualPiece } from './timeline';
import { unlockedColorsForWave, waveIntroMessage } from './progress';
import type { BoardState, Orientation, Piece } from './types';
import { GRID_SIZE } from './types';

export type GameStatus = 'playing' | 'dead' | 'won';

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
  /** Push/grow dir of the clip that just settled — fill slides in from this side. */
  spawnFromDx: number;
  spawnFromDy: number;
  /** Bumps every bounce so the same piece can blink again. */
  rejectNonce: number;
  animating: boolean;
  /** When set, view renders these instead of board.pieces (timeline) */
  visualPieces: VisualPiece[] | null;
  /** Growing / being shoved this clip — cannot lift. */
  busyIds: number[];
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
    spawnFromDx: 0,
    spawnFromDy: 0,
    rejectNonce: 0,
    animating: false,
    visualPieces: null,
    busyIds: [],
  };

  type PendingDrop = {
    ghost: { x: number; y: number };
    designDx: number;
    designDy: number;
    frame: DropProposal | null;
  };
  let pendingDrop: PendingDrop | null = null;

  const busyFromPlan = (plan: MergePlan): number[] => {
    const ids = new Set<number>([plan.anchorId]);
    for (const step of plan.steps) {
      ids.add(step.grow.pieceId);
      for (const mv of step.pushes) ids.add(mv.pieceId);
    }
    return [...ids];
  };

  const reserveLiftHome = (board: BoardState, lifted: Piece): BoardState => {
    const next = cloneBoard(board);
    upsertPiece(next, {
      ...lifted,
      id: -1,
    });
    return next;
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
        busyIds: [],
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
        busyIds: [],
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
      visualPieces: model.animating ? model.visualPieces : null,
    });
  };

  /**
   * Settle after merge animation (design):
   * 1) Unlock input immediately (animating=false) so player never waits on AI search
   * 2) Cheap spawn (isPlayable only)
   * 3) Full isDeadlock **only** if not playable — rare terminal confirm
   */
  const slideDirFromPlan = (plan: MergePlan): { dx: number; dy: number } => {
    for (const step of plan.steps) {
      const g = step.grow;
      if (g.to.x < g.from.x) return { dx: -1, dy: 0 };
      if (g.to.x + g.to.w > g.from.x + g.from.w) return { dx: 1, dy: 0 };
      if (g.to.y < g.from.y) return { dx: 0, dy: -1 };
      if (g.to.y + g.to.h > g.from.y + g.from.h) return { dx: 0, dy: 1 };
    }
    for (const step of plan.steps) {
      for (const mv of step.pushes) {
        const sx = Math.sign(mv.to.x - mv.from.x);
        const sy = Math.sign(mv.to.y - mv.from.y);
        if (sx || sy) return { dx: sx, dy: sy };
      }
    }
    return { dx: 0, dy: 1 };
  };

  const afterMerge = (
    board: BoardState,
    createdValue: number,
    piecesBefore: number,
    mergeColor = 0,
    slideDir?: { dx: number; dy: number },
    opts?: { alreadyFilled?: boolean },
  ) => {
    const keepLift = model.lifted;
    const pend = pendingDrop;

    if (createdValue === 64) {
      pendingDrop = null;
      set({
        board,
        status: 'won',
        message: `第 ${model.wave} 关完成`,
        lifted: null,
        lastSpawn: false,
        spawnFlashIds: [],
        spawnFromDx: 0,
        spawnFromDy: 0,
        animating: false,
        visualPieces: null,
        busyIds: [],
      });
      return;
    }

    let liveBoard = board;
    settleBoardPieces(liveBoard);
    let spawnedIds = model.spawnFlashIds.filter((id) => id !== -1);
    let spawned = spawnedIds.length > 0;
    let note = `合并 → ${createdValue}`;
    if (!opts?.alreadyFilled) {
      const fillSrc = keepLift ? reserveLiftHome(board, keepLift) : board;
      const spawn = trySpawnAfterMerge(
        fillSrc,
        model.unlockedColors,
        model.wave,
        piecesBefore,
        { color: mergeColor, value: createdValue },
      );
      if (getPiece(spawn.board, -1)) removePiece(spawn.board, -1);
      liveBoard = spawn.board;
      spawnedIds = spawn.spawnedIds.filter((id) => id !== -1);
      spawned = spawnedIds.length > 0;
      note = `合并 → ${createdValue} · ${spawn.label}`;
    } else {
      note = model.message || note;
    }

    const live = keepLift
      ? (() => {
          const b = cloneBoard(liveBoard);
          upsertPiece(b, { ...keepLift });
          return b;
        })()
      : liveBoard;
    const forced = isForcedLoss(live);
    const dead = !isPlayable(live) || forced || isDeadlock(live);
    if (dead) {
      pendingDrop = null;
      set({
        board: liveBoard,
        status: 'dead',
        message: forced
          ? `${note} · 死局：唯一的合会把自己走死，点重开`
          : `${note} · 无法再合并，点重开`,
        lifted: null,
        lastSpawn: spawned,
        spawnFlashIds: spawnedIds,
        spawnFromDx: slideDir?.dx ?? model.spawnFromDx,
        spawnFromDy: slideDir?.dy ?? model.spawnFromDy,
        animating: false,
        visualPieces: null,
        busyIds: [],
      });
      return;
    }

    set({
      board: liveBoard,
      status: 'playing',
      message: isSafeToContinue(liveBoard)
        ? note
        : `${note} · 局面危险`,
      lifted: keepLift,
      lastSpawn: spawned,
      spawnFlashIds: spawnedIds,
      spawnFromDx: slideDir?.dx ?? model.spawnFromDx,
      spawnFromDy: slideDir?.dy ?? model.spawnFromDy,
      animating: false,
      visualPieces: null,
      busyIds: [],
    });

    if (pend && keepLift) {
      pendingDrop = null;
      commitLiftedDrop(
        pend.ghost,
        pend.designDx,
        pend.designDy,
        pend.frame,
      );
    } else {
      pendingDrop = null;
    }
  };

  function commitLiftedDrop(
    ghost: { x: number; y: number },
    designDx: number,
    designDy: number,
    frame?: DropProposal | null,
  ): void {
    const A = model.lifted;
    if (!A) return;

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

    if (gx === A.x && gy === A.y && proposal.kind === 'merge') {
      const board = cloneBoard(model.board);
      board.pieces.push({ ...A, x: A.x, y: A.y });
      if (model.animating) {
        set({
          board,
          lifted: null,
          message: '放回原位',
          visualPieces: model.visualPieces,
        });
        return;
      }
      checkDead(board, '放回原位');
      return;
    }

    if (proposal.kind === 'merge' && proposal.targetId != null) {
      if (model.animating) {
        const target = getPiece(model.board, proposal.targetId);
        if (!target || model.busyIds.includes(target.id)) {
          pendingDrop = { ghost, designDx, designDy, frame: proposal };
          set({ message: '等生长结束后合成' });
          return;
        }
        pendingDrop = { ghost, designDx, designDy, frame: proposal };
        set({ message: '等生长结束后合成' });
        return;
      }

      const target = getPiece(model.board, proposal.targetId);
      if (!target) {
        bounceBack(A, '目标消失');
        return;
      }
      const board = cloneBoard(model.board);
      const seatX = proposal.locked
        ? Math.max(0, Math.min(GRID_SIZE - A.w, target.x))
        : gx;
      const seatY = proposal.locked
        ? Math.max(0, Math.min(GRID_SIZE - A.h, target.y))
        : gy;
      const aPiece: Piece = { ...A, x: seatX, y: seatY };
      board.pieces.push(aPiece);

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
        cancelAnim?.();
        const dir = slideDirFromPlan(result.plan);
        const piecesBefore = result.startBoard.pieces.length + 1;
        let filledBoard = result.board;
        let spawnIds: number[] = [];
        let spawnNote = '推挤生长中…';
        if (result.createdValue !== 64) {
          const spawn = trySpawnAfterMerge(
            result.board,
            model.unlockedColors,
            model.wave,
            piecesBefore,
            { color: A.color, value: result.createdValue },
          );
          filledBoard = spawn.board;
          spawnIds = spawn.spawnedIds.filter((id) => id !== -1);
          spawnNote = `合并 → ${result.createdValue} · ${spawn.label}`;
        }
        model = {
          ...model,
          animating: true,
          lifted: null,
          message: spawnNote,
          spawnFlashIds: spawnIds,
          spawnFromDx: dir.dx,
          spawnFromDy: dir.dy,
          board: filledBoard,
          lastSpawn: spawnIds.length > 0,
          busyIds: busyFromPlan(result.plan),
        };
        emit();
        const extraIds = new Set(spawnIds);
        cancelAnim = playMergePlan(result.startBoard, result.plan, {
          onVisual: (pieces) => {
            const seen = new Set(pieces.map((p) => p.id));
            const extras = filledBoard.pieces
              .filter((p) => extraIds.has(p.id) && !seen.has(p.id))
              .map((p) => ({ ...p, opacity: 1 }));
            model = {
              ...model,
              visualPieces: extras.length ? [...pieces, ...extras] : pieces,
              animating: true,
            };
            emit();
          },
          onDone: () => {
            cancelAnim = null;
            afterMerge(
              filledBoard,
              result.createdValue,
              piecesBefore,
              A.color,
              dir,
              { alreadyFilled: true },
            );
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

    if (proposal.kind === 'move') {
      const board = cloneBoard(model.board);
      board.pieces.push({ ...A, x: A.x, y: A.y });
      if (model.animating) {
        set({
          board,
          lifted: null,
          message: '放回原位',
          visualPieces: model.visualPieces,
        });
        return;
      }
      checkDead(board, '放回原位');
      return;
    }

    bounceBack(A, proposal.reason || '只能拖去合并，弹回');
  }

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
      pendingDrop = null;
      const wave = Math.max(1, model.wave);
      const unlocked = unlockedColorsForWave(wave);
      set({
        board: dealOpening(unlocked, wave),
        status: 'playing',
        message: `重开本关 · ${waveIntroMessage(wave)}`,
        wave,
        unlockedColors: unlocked,
        lifted: null,
        lastSpawn: false,
        spawnFlashIds: [],
        animating: false,
        visualPieces: null,
        busyIds: [],
      });
    },
    nextLevel: () => {
      cancelAnim?.();
      cancelAnim = null;
      pendingDrop = null;
      const wave = model.wave + 1;
      const unlocked = unlockedColorsForWave(wave);
      const intro = waveIntroMessage(wave);
      const msg =
        unlocked > model.unlockedColors
          ? `满屏消除 · 解锁第 ${unlocked} 色 · ${intro}`
          : `下一关 · ${intro}`;
      set({
        board: dealAfterClear(unlocked, wave),
        status: 'playing',
        message: msg,
        wave,
        unlockedColors: unlocked,
        lifted: null,
        lastSpawn: false,
        spawnFlashIds: [],
        animating: false,
        visualPieces: null,
        busyIds: [],
      });
    },
    loadDebug: () => {
      cancelAnim?.();
      cancelAnim = null;
      pendingDrop = null;
      set({
        board: dealDebugNear64(model.unlockedColors),
        status: 'playing',
        message: `Debug 盘 · ${model.unlockedColors} 色`,
        lifted: null,
        lastSpawn: false,
        spawnFlashIds: [],
        animating: false,
        visualPieces: null,
        busyIds: [],
      });
    },
    /** 试玩用：跳过满屏，直接进下一关开局剧本 */
    debugNextWave: () => {
      cancelAnim?.();
      cancelAnim = null;
      pendingDrop = null;
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
        busyIds: [],
      });
    },
    beginLift: (pieceId: number) => {
      if (model.status === 'dead' || model.status === 'won') return false;
      if (model.lifted) return false;
      if (model.busyIds.includes(pieceId)) return false;
      const p = getPiece(model.board, pieceId);
      if (!p) return false;
      const board = cloneBoard(model.board);
      board.pieces = board.pieces.filter((q) => q.id !== pieceId);
      set({
        board,
        lifted: { ...p },
        message: `拖动 ${p.value}`,
        visualPieces: model.animating ? model.visualPieces : null,
        spawnFlashIds: [],
      });
      return true;
    },
    cancelLift: () => {
      if (!model.lifted) return;
      pendingDrop = null;
      const board = cloneBoard(model.board);
      board.pieces.push({ ...model.lifted });
      set({
        board,
        lifted: null,
        message: '取消',
        visualPieces: model.animating ? model.visualPieces : null,
      });
    },
    dropAt: (
      ghost: { x: number; y: number },
      designDx: number,
      designDy: number,
      frame?: DropProposal | null,
    ) => {
      if (!model.lifted) return;
      commitLiftedDrop(ghost, designDx, designDy, frame);
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
