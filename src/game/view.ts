import type { StageLayout } from '../adapt/design';
import { haptics } from '../utils/haptics';
import {
  initialDragPhase,
  resetDragPhase as resetPhaseState,
  stepDragPhase,
  type DragPhaseState,
} from './dragPhase';
import {
  aimToGhost,
  fingerRectFromAim,
  hitTestPiece,
  nearestMergeable,
} from './dropResolve';
import { lockAimCombined, SOFT_PULL_VISUAL } from './intent';
import { proposalForLifted, type DropProposal, type GameModel } from './game';
import { pieceDepthColor, pieceFillColor, pieceShadowColor, shapeAxis } from './shapes';
import type { Piece } from './types';
import { GRID_SIZE } from './types';
import type { VisualPiece } from './timeline';

export type BoardLayout = {
  originX: number;
  originY: number;
  cell: number;
  size: number;
};

const CELL_INSET = 1.5;
const PIECE_SHINE =
  '<svg class="piece-shine" viewBox="0 0 22 30" aria-hidden="true"><path d="M4.2 3.8C12.3 3.8 18.1 9.7 18.1 17.8V25.5" /></svg>';

export function computeBoardLayout(): BoardLayout {
  const size = 360;
  const cell = size / GRID_SIZE;
  const originX = (390 - size) / 2;
  const originY = 120;
  return { originX, originY, cell, size };
}

export function mountGameView(
  stage: HTMLElement,
  uiRoot: HTMLElement,
  api: ReturnType<typeof import('./game').createGame>,
  getStageLayout: () => StageLayout | null,
): { destroy: () => void } {
  const debugUi = new URLSearchParams(window.location.search).has('debug');
  document.body.classList.toggle('debug-game-labels', debugUi);
  const boardLayout = computeBoardLayout();
  const cell = boardLayout.cell;

  const boardRoot = document.createElement('div');
  boardRoot.id = 'board-root';
  boardRoot.style.cssText = `
    position:absolute; left:${boardLayout.originX}px; top:${boardLayout.originY}px;
    width:${boardLayout.size}px; height:${boardLayout.size}px;
    z-index:1; touch-action:none;
    background: #eef2f5;
    border: 0;
    border-radius: 11px;
    box-shadow:
      0 0 0 9px #f7f8f8,
      0 0 0 13px #c5cdd2,
      inset 0 2px 7px rgba(95,104,112,0.16),
      inset 0 1px 0 rgba(255,255,255,0.9),
      0 16px 24px rgba(55,98,132,0.24);
    overflow: visible;
  `;
  stage.appendChild(boardRoot);

  const gridLayer = document.createElement('div');
  gridLayer.className = 'board-grid-cells';
  gridLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const c = document.createElement('div');
      c.className = 'board-cell';
      c.style.left = `${x * cell + CELL_INSET}px`;
      c.style.top = `${y * cell + CELL_INSET}px`;
      c.style.width = `${cell - CELL_INSET * 2}px`;
      c.style.height = `${cell - CELL_INSET * 2}px`;
      gridLayer.appendChild(c);
    }
  }
  boardRoot.appendChild(gridLayer);

  const piecesLayer = document.createElement('div');
  piecesLayer.style.cssText = 'position:absolute;inset:0;';
  boardRoot.appendChild(piecesLayer);

  const dragLayer = document.createElement('div');
  dragLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2000;';
  boardRoot.appendChild(dragLayer);

  /** Apple-style drop proposal shadow (sessionDidUpdate) */
  const proposalEl = document.createElement('div');
  proposalEl.className = 'drop-proposal';
  proposalEl.style.cssText = `
    position:absolute; pointer-events:none; z-index:5; display:none;
    border-radius:14px; box-sizing:border-box;
    border:2px dashed transparent;
    transition: left 40ms linear, top 40ms linear, background 80ms ease, border-color 80ms ease;
  `;
  boardRoot.appendChild(proposalEl);

  const targetRingEl = document.createElement('div');
  targetRingEl.className = 'merge-target-ring';
  targetRingEl.style.cssText = `
    position:absolute; pointer-events:none; z-index:4; display:none;
    border-radius:16px; box-sizing:border-box;
    border:2px solid #5ec8ff; box-shadow:0 0 0 3px rgba(94,200,255,0.22);
    transition: border-color 80ms ease, box-shadow 80ms ease;
  `;
  boardRoot.appendChild(targetRingEl);

  /** T* merge result outline */
  const mergeShapeEl = document.createElement('div');
  mergeShapeEl.className = 'merge-shape-preview';
  mergeShapeEl.style.cssText = `
    position:absolute; pointer-events:none; z-index:4; display:none;
    border-radius:16px; box-sizing:border-box;
    border:2px dashed rgba(183,148,246,0.92);
    background:rgba(183,148,246,0.1);
  `;
  boardRoot.appendChild(mergeShapeEl);

  uiRoot.innerHTML = '';
  const header = document.createElement('header');
  header.style.cssText = 'pointer-events:none;';
  header.innerHTML = `
    <p class="eyebrow" style="margin:0;font-size:11px;">Merge Puzzle · 原型</p>
    <h1 style="margin:4px 0 0;font-size:18px;">合成占位</h1>
    <p id="game-status" class="status"></p>
  `;
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.style.cssText = 'pointer-events:auto;';
  panel.innerHTML = `
    <p class="panel-title" style="margin:0 0 8px;font-size:12px;opacity:.8;">操作</p>
    <div class="row" style="display:flex;flex-wrap:wrap;gap:8px;">
      <button type="button" id="btn-restart">重开</button>
      <button type="button" id="btn-next-wave">下一关</button>
      <button type="button" id="btn-debug">Debug盘</button>
    </div>
    <p id="game-hint" class="log" style="margin:8px 0 0;font-size:11px;opacity:.75;">
      大拖选合谁 → 吸住后小滑定方向；不滑则优先推异色，否则空地。
    </p>
  `;
  uiRoot.appendChild(header);
  uiRoot.appendChild(panel);
  if (!debugUi) {
    panel.querySelector('#btn-debug')?.remove();
  }

  const statusEl = header.querySelector('#game-status') as HTMLElement;
  const hintEl = panel.querySelector('#game-hint') as HTMLElement;
  const pieceEls = new Map<number, HTMLElement>();

  /** Full style paint (lift / idle). */
  const paintPiece = (
    el: HTMLElement,
    p: {
      id: number;
      value: number;
      color?: number;
      x: number;
      y: number;
      w: number;
      h: number;
      opacity?: number;
      pushed?: boolean;
      growing?: boolean;
    },
    opts: {
      flash?: boolean;
      lifting?: boolean;
      scale?: number;
      pushed?: boolean;
      growing?: boolean;
      /** Geometry-only updates during timeline (GPU-friendlier, less thrash) */
      motionOnly?: boolean;
    },
  ) => {
    const isPushed = opts.pushed ?? p.pushed;
    const isGrowing = opts.growing ?? p.growing;
    const sc = opts.scale ?? 1;
    const baseZ = Math.max(1, Math.round((p.y + p.h) * 10));

    // Prefer transform for motion frames (composited)
    if (opts.motionOnly) {
      const left = p.x * cell + CELL_INSET;
      const top = p.y * cell + CELL_INSET;
      const pw = p.w * cell - CELL_INSET * 2;
      const ph = p.h * cell - CELL_INSET * 2;
      el.style.transform = `translate3d(${left}px,${top}px,0) scale(${sc})`;
      el.style.width = `${pw}px`;
      el.style.height = `${ph}px`;
      el.style.opacity = String(p.opacity ?? 1);
      el.style.left = '0';
      el.style.top = '0';
      // No float/lift for pushed pieces — same plane as board (can be shoved under grow)
      const mode = isGrowing ? 'g' : 'n';
      if (el.dataset.mode !== mode) {
        el.dataset.mode = mode;
        if (isGrowing) {
          // Growing body: slight outline only, no big elevation shadow
          el.style.boxShadow = '0 0 0 2px rgba(183,148,246,0.62), 0 3px 6px rgba(var(--piece-shadow),0.14)';
          el.style.zIndex = String(baseZ + 300);
        } else {
          el.style.boxShadow = '0 3px 6px rgba(var(--piece-shadow),0.12)';
          el.style.zIndex = String(baseZ);
        }
      }
      // value/color may change mid-grow / after clip — always refresh fill
      const axis = shapeAxis(p);
      const mark = axis === 'h' ? '横' : axis === 'v' ? '竖' : '';
      const col =
        typeof p.color === 'number' && Number.isFinite(p.color) ? p.color : 0;
      const label = `${p.value}|${col}|${mark}`;
      el.style.background = 'transparent';
      el.style.setProperty('--piece-fill', pieceFillColor(col, p.value));
      el.style.setProperty('--piece-depth', pieceDepthColor(col, p.value));
      el.style.setProperty('--piece-shadow', pieceShadowColor(col));
      el.style.setProperty('--shine-scale', p.w >= 2 && p.h >= 2 ? '1' : '0.72');
      if (el.dataset.label !== label) {
        el.dataset.label = label;
        el.innerHTML = mark
          ? `<span class="piece-depth"></span><span class="piece-face">${PIECE_SHINE}<span class="piece-value">${p.value}</span><span class="piece-axis">${mark}</span></span>`
          : `<span class="piece-depth"></span><span class="piece-face">${PIECE_SHINE}<span class="piece-value">${p.value}</span></span>`;
      }
      return;
    }

    el.style.left = `${p.x * cell + CELL_INSET}px`;
    el.style.top = `${p.y * cell + CELL_INSET}px`;
    el.style.width = `${p.w * cell - CELL_INSET * 2}px`;
    el.style.height = `${p.h * cell - CELL_INSET * 2}px`;
    el.style.transform = sc !== 1 ? `scale(${sc})` : '';
    el.style.transformOrigin = 'center center';
    {
      const col =
        typeof p.color === 'number' && Number.isFinite(p.color) ? p.color : 0;
      el.style.background = 'transparent';
      el.style.setProperty('--piece-fill', pieceFillColor(col, p.value));
      el.style.setProperty('--piece-depth', pieceDepthColor(col, p.value));
      el.style.setProperty('--piece-shadow', pieceShadowColor(col));
      el.style.setProperty('--shine-scale', p.w >= 2 && p.h >= 2 ? '1' : '0.72');
    }
    el.style.borderRadius = '15px';
    el.style.display = 'block';
    el.style.fontWeight = '800';
    el.style.fontSize = `${Math.max(12, Math.min(22, cell * 0.4))}px`;
    el.style.color = 'rgba(107,101,120,0.62)';
    el.style.opacity = String(p.opacity ?? 1);
    el.style.boxSizing = 'border-box';
    el.style.transition = 'none';
    el.style.willChange = 'transform, width, height, opacity';

    const axis = shapeAxis(p);
    const mark = axis === 'h' ? '横' : axis === 'v' ? '竖' : '';
    const col =
      typeof p.color === 'number' && Number.isFinite(p.color) ? p.color : 0;
    const label = `${p.value}|${col}|${mark}`;
    // Always re-apply fill so clip 2→1 never sticks on wrong palette
    el.style.background = 'transparent';
    el.style.setProperty('--piece-fill', pieceFillColor(col, p.value));
    el.style.setProperty('--piece-depth', pieceDepthColor(col, p.value));
    el.style.setProperty('--piece-shadow', pieceShadowColor(col));
    el.style.setProperty('--shine-scale', p.w >= 2 && p.h >= 2 ? '1' : '0.72');
    if (el.dataset.label !== label) {
      el.dataset.label = label;
      el.innerHTML = mark
        ? `<span class="piece-depth"></span><span class="piece-face">${PIECE_SHINE}<span class="piece-value">${p.value}</span><span class="piece-axis">${mark}</span></span>`
        : `<span class="piece-depth"></span><span class="piece-face">${PIECE_SHINE}<span class="piece-value">${p.value}</span></span>`;
    }
    el.dataset.pieceId = String(p.id);
    el.dataset.mode = '';

    if (opts.lifting) {
      el.style.boxShadow = '0 12px 20px rgba(var(--piece-shadow),0.22), 0 0 0 1px rgba(255,255,255,0.24)';
      el.style.zIndex = String(baseZ + 1000);
    } else if (isGrowing) {
      // Grow only: thin ring, same plane (z just above static for draw order)
      el.style.boxShadow = '0 0 0 2px rgba(183,148,246,0.62), 0 3px 6px rgba(var(--piece-shadow),0.14)';
      el.style.zIndex = String(baseZ + 300);
    } else if (isPushed) {
      // Pushed = normal piece (no float) — feels like ground-level shove
      el.style.boxShadow = '0 2px 5px rgba(var(--piece-shadow),0.1)';
      el.style.zIndex = String(baseZ + 100);
    } else {
      el.style.boxShadow = '0 3px 6px rgba(var(--piece-shadow),0.12)';
      el.style.zIndex = String(baseZ);
    }

    if (debugUi && axis === 'h') el.style.outline = '2px solid rgba(94,200,255,0.78)';
    else if (debugUi && axis === 'v') el.style.outline = '2px solid rgba(255,213,74,0.82)';
    else el.style.outline = 'none';

    el.classList.toggle('piece-spawn', !!opts.flash);
  };

  const syncPieces = (
    list: VisualPiece[] | Piece[],
    flashIds: number[],
    motionOnly: boolean,
  ) => {
    const flash = new Set(flashIds);
    const live = new Set(list.map((p) => p.id));
    for (const [id, el] of pieceEls) {
      if (!live.has(id)) {
        el.remove();
        pieceEls.delete(id);
      }
    }
    for (const p of list) {
      let el = pieceEls.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'piece';
        el.style.cssText =
          'position:absolute;left:0;top:0;touch-action:none;cursor:grab;user-select:none;will-change:transform,width,height,opacity;border-radius:15px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;color:rgba(107,101,120,0.62);box-sizing:border-box;';
        piecesLayer.appendChild(el);
        pieceEls.set(p.id, el);
        // first paint full
        paintPiece(el, p, {
          flash: flash.has(p.id),
          pushed: (p as VisualPiece).pushed,
          growing: (p as VisualPiece).growing,
          motionOnly: false,
        });
        continue;
      }
      const vp = p as VisualPiece;
      paintPiece(el, p, {
        flash: !motionOnly && flash.has(p.id),
        pushed: vp.pushed,
        growing: vp.growing,
        motionOnly,
      });
    }
  };

  let lastStatusKey = '';

  const render = (g: GameModel) => {
    const motionOnly = !!(g.visualPieces && g.animating);
    if (g.visualPieces) {
      syncPieces(g.visualPieces, g.spawnFlashIds, motionOnly);
    } else {
      syncPieces(g.board.pieces, g.spawnFlashIds, false);
    }
    // Hide board piece if lifted (shown in drag layer)
    if (g.lifted) {
      const el = pieceEls.get(g.lifted.id);
      if (el) el.style.display = 'none';
    } else {
      for (const el of pieceEls.values()) {
        if (el.style.display === 'none') el.style.display = 'flex';
      }
    }

    // Avoid layout thrash: status text only when changed
    const phase =
      g.status === 'dead' ? '失败' : g.animating ? '动画中' : '进行中';
    const statusKey = `${g.wave}|${g.unlockedColors}|${phase}|${g.message}`;
    if (statusKey !== lastStatusKey) {
      lastStatusKey = statusKey;
      statusEl.textContent = `波次 ${g.wave} · ${g.unlockedColors} 色 · ${phase}`;
    }
    if (debugUi) {
      if (!hintEl.dataset.ready) {
        hintEl.dataset.ready = '1';
        hintEl.textContent =
          '蓝=可合 · 紫虚线=生长方向 · 红=非法。叠在对子上时，用最后一小段滑动控制生长。';
      }
    } else {
      hintEl.textContent = g.message;
    }
  };

  const unsub = api.subscribe(render);

  panel.querySelector('#btn-restart')!.addEventListener('click', () => {
    api.restart();
  });
  panel.querySelector('#btn-next-wave')?.addEventListener('click', () => {
    api.debugNextWave();
  });
  panel.querySelector('#btn-debug')?.addEventListener('click', () => {
    api.loadDebug();
  });

  // ——— Drag: hit-test lift · continuous proposal · commit same rules ———
  let dragging = false;
  let dragEl: HTMLElement | null = null;
  let pieceStart = { x: 0, y: 0, w: 1, h: 1, value: 1, color: 0, id: 0 };
  let liftScale = 1;
  let liftRaf = 0;
  let dropSnapRaf = 0;
  let lastProposal: DropProposal | null = null;

  /** Finger offset so block sits above touch (design px). FINDINGS 12–20 */
  const FINGER_OFFSET_Y = 16;

  const toDesign = (clientX: number, clientY: number) => {
    const layout = getStageLayout();
    if (!layout) return null;
    const stageRect = stage.getBoundingClientRect();
    return {
      x: (clientX - stageRect.left) / layout.scale,
      y: (clientY - stageRect.top) / layout.scale,
    };
  };

  /** Aim point in board-local pixels. */
  const aimBoardLocal = (designX: number, designY: number) => ({
    x: designX - boardLayout.originX,
    y: designY - boardLayout.originY - FINGER_OFFSET_Y,
  });

  const rawGhostFromDesign = (designX: number, designY: number) => {
    const a = aimBoardLocal(designX, designY);
    return aimToGhost(a.x, a.y, cell, pieceStart.w, pieceStart.h);
  };

  const paintProposal = (prop: DropProposal | null, A: { w: number; h: number }) => {
    if (!prop) {
      proposalEl.style.display = 'none';
      targetRingEl.style.display = 'none';
      mergeShapeEl.style.display = 'none';
      return;
    }
    proposalEl.style.display = 'block';
    proposalEl.style.left = `${prop.ghost.x * cell + CELL_INSET}px`;
    proposalEl.style.top = `${prop.ghost.y * cell + CELL_INSET}px`;
    proposalEl.style.width = `${A.w * cell - CELL_INSET * 2}px`;
    proposalEl.style.height = `${A.h * cell - CELL_INSET * 2}px`;
    // Solid border for snap accuracy (FINDINGS: outline > soft shadow)
    proposalEl.style.borderStyle = 'solid';
    // kind `move` = return home (cancel); free place is disabled
    if (prop.kind === 'move') {
      proposalEl.style.background = 'rgba(132, 136, 150, 0.12)';
      proposalEl.style.borderColor = 'rgba(120, 125, 140, 0.45)';
    } else if (prop.kind === 'merge') {
      proposalEl.style.background = 'rgba(94, 200, 255, 0.18)';
      proposalEl.style.borderColor = 'rgba(94, 200, 255, 0.92)';
    } else {
      proposalEl.style.background = 'rgba(255, 139, 122, 0.14)';
      proposalEl.style.borderColor = 'rgba(255, 139, 122, 0.68)';
    }

    if (prop.kind === 'merge' && prop.targetId != null) {
      const g = api.get();
      const t = g.board.pieces.find((p) => p.id === prop.targetId);
      if (t) {
        targetRingEl.style.display = 'block';
        targetRingEl.style.left = `${t.x * cell}px`;
        targetRingEl.style.top = `${t.y * cell}px`;
        targetRingEl.style.width = `${t.w * cell}px`;
        targetRingEl.style.height = `${t.h * cell}px`;
        if (prop.locked) {
          targetRingEl.style.borderColor = prop.playerAim ? '#b794f6' : '#5ec8ff';
          targetRingEl.style.boxShadow = prop.playerAim
            ? '0 0 0 3px rgba(183,148,246,0.22)'
            : '0 0 0 2px rgba(94,200,255,0.24)';
        } else {
          targetRingEl.style.borderColor = '#5ec8ff';
          targetRingEl.style.boxShadow = '0 0 0 2px rgba(94,200,255,0.18)';
        }
      } else {
        targetRingEl.style.display = 'none';
      }
    } else {
      targetRingEl.style.display = 'none';
    }

    // T* growth shape preview
    if (prop.kind === 'merge' && prop.mergeTarget) {
      const T = prop.mergeTarget;
      mergeShapeEl.style.display = 'block';
      mergeShapeEl.style.left = `${T.x * cell + CELL_INSET}px`;
      mergeShapeEl.style.top = `${T.y * cell + CELL_INSET}px`;
      mergeShapeEl.style.width = `${T.w * cell - CELL_INSET * 2}px`;
      mergeShapeEl.style.height = `${T.h * cell - CELL_INSET * 2}px`;
      if (prop.bilateral) {
        mergeShapeEl.style.borderStyle = 'dashed';
        mergeShapeEl.style.boxShadow = 'inset 0 0 0 1px rgba(183,148,246,0.36)';
      } else {
        mergeShapeEl.style.borderStyle = 'dashed';
        mergeShapeEl.style.boxShadow = 'none';
      }
    } else {
      mergeShapeEl.style.display = 'none';
    }
  };

  /** FREE = pick B; LOCKED = weak magnet + micro-aim (docs/DESIGN_DRAG_MERGE.md) */
  let phaseState: DragPhaseState = initialDragPhase();

  const resetDragPhase = () => {
    phaseState = resetPhaseState();
  };

  const updateProposalFromDesign = (designX: number, designY: number) => {
    const g = api.get();
    if (!g.lifted) {
      lastProposal = null;
      paintProposal(null, pieceStart);
      return;
    }
    const A = g.lifted;
    const a = aimBoardLocal(designX, designY);
    const raw = aimToGhost(a.x, a.y, cell, pieceStart.w, pieceStart.h);
    const aimCellX = a.x / cell;
    const aimCellY = a.y / cell;
    const F = fingerRectFromAim(aimCellX, aimCellY, pieceStart.w, pieceStart.h);

    const nearest = nearestMergeable(g.board, A, raw);
    const stepped = stepDragPhase(phaseState, {
      A,
      rawGhost: raw,
      designX,
      designY,
      board: g.board,
      nearest,
    });
    phaseState = stepped.state;
    if (stepped.haptic) void haptics.selection();

    let enterDx = 0;
    let enterDy = 0;
    let playerAim = false;
    const phase = phaseState.phase;

    if (phase === 'locked' && phaseState.lockedTargetId != null && phaseState.lockB) {
      const B = phaseState.lockB;
      // (1) swipe after attach
      const slideDdx = (designX - phaseState.lockFingerDesign.x) / cell;
      const slideDdy = (designY - phaseState.lockFingerDesign.y) / cell;
      // (2) where finger sits on B — map to grow that side after classifySide invert
      //     finger above B center → grow up, not empty-down
      const fcx = F.x + F.w / 2;
      const fcy = F.y + F.h / 2;
      const placeDdx = fcx - (B.x + B.w / 2);
      const placeDdy = fcy - (B.y + B.h / 2);
      const aim = lockAimCombined(
        slideDdx,
        slideDdy,
        -placeDdx,
        -placeDdy,
      );
      enterDx = aim.enterDx;
      enterDy = aim.enterDy;
      playerAim = aim.playerAim;
    }

    lastProposal = proposalForLifted(g.board, A, raw, {
      fingerRect: F,
      enterDx,
      enterDy,
      origin: { x: pieceStart.x, y: pieceStart.y },
      phase,
      lockedTargetId:
        phase === 'locked' ? phaseState.lockedTargetId ?? undefined : undefined,
      playerAim: phase === 'locked' && playerAim,
    });
    paintProposal(lastProposal, A);
  };

  const placeDragEl = (
    designX: number,
    designY: number,
    scale: number,
    _snapGhost?: { x: number; y: number } | null,
  ) => {
    if (!dragEl) return;
    const a = aimBoardLocal(designX, designY);
    let left = a.x - (pieceStart.w * cell) / 2;
    let top = a.y - (pieceStart.h * cell) / 2;
    if (phaseState.phase === 'locked' && phaseState.lockB) {
      const bx = phaseState.lockB.x * cell + CELL_INSET;
      const by = phaseState.lockB.y * cell + CELL_INSET;
      left = left + (bx - left) * SOFT_PULL_VISUAL;
      top = top + (by - top) * SOFT_PULL_VISUAL;
    }
    dragEl.style.left = `${left}px`;
    dragEl.style.top = `${top}px`;
    dragEl.style.width = `${pieceStart.w * cell - CELL_INSET * 2}px`;
    dragEl.style.height = `${pieceStart.h * cell - CELL_INSET * 2}px`;
    dragEl.style.transform = `scale(${scale})`;
    dragEl.style.boxShadow =
      phaseState.phase === 'locked'
        ? '0 14px 24px rgba(var(--piece-shadow),0.28), 0 0 0 2px rgba(94,200,255,0.24)'
        : '0 16px 28px rgba(var(--piece-shadow),0.26), 0 0 0 1px rgba(255,255,255,0.32)';
  };

  const animateLift = (from: number, to: number, ms: number, onDone?: () => void) => {
    const t0 = performance.now();
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / ms);
      const e = 1 - (1 - u) * (1 - u);
      liftScale = from + (to - from) * e;
      const d = lastDesign;
      if (d) placeDragEl(d.x, d.y, liftScale);
      if (u < 1) liftRaf = requestAnimationFrame(tick);
      else onDone?.();
    };
    cancelAnimationFrame(liftRaf);
    liftRaf = requestAnimationFrame(tick);
  };

  let lastDesign = { x: 0, y: 0 };
  let pointerId = -1;

  const onPointerDown = (e: PointerEvent) => {
    const g = api.get();
    if (g.status === 'dead' || g.animating || g.lifted) return;

    const d = toDesign(e.clientX, e.clientY);
    if (!d) return;
    // Hit-test in board space (UIKit hitTest analog) — not DOM target only
    const localX = d.x - boardLayout.originX;
    const localY = d.y - boardLayout.originY;
    if (
      localX < -6 ||
      localY < -6 ||
      localX > boardLayout.size + 6 ||
      localY > boardLayout.size + 6
    ) {
      return;
    }
    const hit = hitTestPiece(g.board, localX, localY, cell, 8);
    if (!hit) return;

    if (!api.beginLift(hit.id)) return;

    dragging = true;
    pointerId = e.pointerId;
    pieceStart = {
      x: hit.x,
      y: hit.y,
      w: hit.w,
      h: hit.h,
      value: hit.value,
      color: hit.color,
      id: hit.id,
    };
    lastDesign = d;
    resetDragPhase();

    dragEl = document.createElement('div');
    dragEl.className = 'piece piece-dragging';
    dragEl.style.cssText = `
      position:absolute; pointer-events:none; z-index:3000;
      border-radius:15px; display:flex; flex-direction:column;
      align-items:center; justify-content:center;
      font-weight:800; color:#0f172a; box-sizing:border-box;
      will-change:left,top,transform;
    `;
    paintPiece(
      dragEl,
      {
        id: hit.id,
        value: hit.value,
        color: hit.color,
        x: 0,
        y: 0,
        w: hit.w,
        h: hit.h,
      },
      { lifting: true, scale: 1 },
    );
    dragLayer.appendChild(dragEl);
    liftScale = 1;
    placeDragEl(d.x, d.y, 1);
    updateProposalFromDesign(d.x, d.y);
    animateLift(1, 1.08, 100);

    boardRoot.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging || !dragEl) return;
    const d = toDesign(e.clientX, e.clientY);
    if (!d) return;
    lastDesign = d;
    updateProposalFromDesign(d.x, d.y);
    const snap =
      phaseState.phase === 'locked' && lastProposal?.kind === 'merge'
        ? lastProposal.ghost
        : null;
    placeDragEl(d.x, d.y, liftScale, snap);
  };

  const finishDrop = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    const d = toDesign(e.clientX, e.clientY) ?? lastDesign;
    // CRITICAL: 松手只认最后一帧预览，禁止再 proposeDrop
    const frozenProp = lastProposal;
    const cellPos =
      frozenProp?.ghost ?? rawGhostFromDesign(d.x, d.y);
    let designDx = (frozenProp?.growDirX ?? 0) * 40;
    let designDy = (frozenProp?.growDirY ?? 0) * 40;
    if (
      designDx === 0 &&
      designDy === 0 &&
      phaseState.phase === 'locked'
    ) {
      designDx = d.x - phaseState.lockFingerDesign.x;
      designDy = d.y - phaseState.lockFingerDesign.y;
    }
    resetDragPhase();

    // Snap floating piece to proposal rect, then commit frozen frame
    const t0 = performance.now();
    const startScale = liftScale;
    const fromLeft = dragEl
      ? parseFloat(dragEl.style.left) || 0
      : cellPos.x * cell;
    const fromTop = dragEl
      ? parseFloat(dragEl.style.top) || 0
      : cellPos.y * cell;
    const toLeft = cellPos.x * cell + 2;
    const toTop = cellPos.y * cell + 2;

    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / 120);
      const ease = 1 - (1 - u) * (1 - u);
      liftScale = startScale + (1 - startScale) * ease;
      if (dragEl) {
        dragEl.style.left = `${fromLeft + (toLeft - fromLeft) * ease}px`;
        dragEl.style.top = `${fromTop + (toTop - fromTop) * ease}px`;
        dragEl.style.transform = `scale(${liftScale})`;
      }
      if (u < 1) {
        dropSnapRaf = requestAnimationFrame(tick);
        return;
      }
      dragEl?.remove();
      dragEl = null;
      paintProposal(null, pieceStart);
      mergeShapeEl.style.display = 'none';
      lastProposal = null;
      // Commit the frozen preview frame only (not a recomputed one)
      api.dropAt(cellPos, designDx, designDy, frozenProp);
    };
    cancelAnimationFrame(dropSnapRaf);
    dropSnapRaf = requestAnimationFrame(tick);

    try {
      boardRoot.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  };

  boardRoot.addEventListener('pointerdown', onPointerDown);
  boardRoot.addEventListener('pointermove', onPointerMove);
  boardRoot.addEventListener('pointerup', finishDrop);
  boardRoot.addEventListener('pointercancel', finishDrop);

  return {
    destroy: () => {
      unsub();
      cancelAnimationFrame(liftRaf);
      cancelAnimationFrame(dropSnapRaf);
      boardRoot.remove();
      uiRoot.innerHTML = '';
    },
  };
}
