import type { StageLayout } from '../adapt/design';
import {
  aimToGhost,
  fingerRectFromAim,
  hitTestPiece,
} from './dropResolve';
import { proposalForLifted, type DropProposal, type GameModel } from './game';
import { pieceFillColor, shapeAxis } from './shapes';
import type { Piece } from './types';
import { GRID_SIZE } from './types';
import type { VisualPiece } from './timeline';

export type BoardLayout = {
  originX: number;
  originY: number;
  cell: number;
  size: number;
};

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
  const boardLayout = computeBoardLayout();
  const cell = boardLayout.cell;

  const boardRoot = document.createElement('div');
  boardRoot.id = 'board-root';
  boardRoot.style.cssText = `
    position:absolute; left:${boardLayout.originX}px; top:${boardLayout.originY}px;
    width:${boardLayout.size}px; height:${boardLayout.size}px;
    z-index:1; touch-action:none;
    background: rgba(15,23,42,0.95);
    border: 2px solid rgba(148,163,184,0.35);
    border-radius: 12px;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4);
    overflow: visible;
  `;
  stage.appendChild(boardRoot);

  const gridSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  gridSvg.setAttribute('width', String(boardLayout.size));
  gridSvg.setAttribute('height', String(boardLayout.size));
  gridSvg.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0.25';
  for (let i = 0; i <= GRID_SIZE; i++) {
    const v = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    v.setAttribute('x1', String(i * cell));
    v.setAttribute('x2', String(i * cell));
    v.setAttribute('y1', '0');
    v.setAttribute('y2', String(boardLayout.size));
    v.setAttribute('stroke', '#94a3b8');
    gridSvg.appendChild(v);
    const h = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    h.setAttribute('y1', String(i * cell));
    h.setAttribute('y2', String(i * cell));
    h.setAttribute('x1', '0');
    h.setAttribute('x2', String(boardLayout.size));
    h.setAttribute('stroke', '#94a3b8');
    gridSvg.appendChild(h);
  }
  boardRoot.appendChild(gridSvg);

  const piecesLayer = document.createElement('div');
  piecesLayer.style.cssText = 'position:absolute;inset:0;';
  boardRoot.appendChild(piecesLayer);

  const dragLayer = document.createElement('div');
  dragLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;';
  boardRoot.appendChild(dragLayer);

  /** Apple-style drop proposal shadow (sessionDidUpdate) */
  const proposalEl = document.createElement('div');
  proposalEl.className = 'drop-proposal';
  proposalEl.style.cssText = `
    position:absolute; pointer-events:none; z-index:5; display:none;
    border-radius:8px; box-sizing:border-box;
    border:2px dashed transparent;
    transition: left 40ms linear, top 40ms linear, background 80ms ease, border-color 80ms ease;
  `;
  boardRoot.appendChild(proposalEl);

  const targetRingEl = document.createElement('div');
  targetRingEl.className = 'merge-target-ring';
  targetRingEl.style.cssText = `
    position:absolute; pointer-events:none; z-index:4; display:none;
    border-radius:10px; box-sizing:border-box;
    border:2px solid #38bdf8; box-shadow:0 0 0 3px rgba(56,189,248,0.25);
  `;
  boardRoot.appendChild(targetRingEl);

  /** T* merge result outline */
  const mergeShapeEl = document.createElement('div');
  mergeShapeEl.className = 'merge-shape-preview';
  mergeShapeEl.style.cssText = `
    position:absolute; pointer-events:none; z-index:4; display:none;
    border-radius:10px; box-sizing:border-box;
    border:2px dashed rgba(167,139,250,0.95);
    background:rgba(167,139,250,0.12);
  `;
  boardRoot.appendChild(mergeShapeEl);

  uiRoot.innerHTML = '';
  const header = document.createElement('header');
  header.style.cssText = 'pointer-events:none;';
  header.innerHTML = `
    <p class="eyebrow" style="margin:0;opacity:.7;font-size:11px;">Merge Puzzle · 原型</p>
    <h1 style="margin:4px 0 0;font-size:18px;">合成占位</h1>
    <p id="game-status" class="status" style="margin:6px 0 0;font-size:12px;line-height:1.4;white-space:pre-wrap;"></p>
  `;
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.style.cssText = 'pointer-events:auto;';
  panel.innerHTML = `
    <p class="panel-title" style="margin:0 0 8px;font-size:12px;opacity:.8;">操作</p>
    <div class="row" style="display:flex;flex-wrap:wrap;gap:8px;">
      <button type="button" id="btn-restart">重开</button>
      <button type="button" id="btn-debug">Debug盘</button>
      <button type="button" id="btn-upgrade">升级选中</button>
    </div>
    <p id="game-hint" class="log" style="margin:8px 0 0;font-size:11px;opacity:.75;"></p>
  `;
  uiRoot.appendChild(header);
  uiRoot.appendChild(panel);

  const statusEl = header.querySelector('#game-status') as HTMLElement;
  const hintEl = panel.querySelector('#game-hint') as HTMLElement;
  let selectedId: number | null = null;

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

    // Prefer transform for motion frames (composited)
    if (opts.motionOnly) {
      const left = p.x * cell + 2;
      const top = p.y * cell + 2;
      const pw = p.w * cell - 4;
      const ph = p.h * cell - 4;
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
          el.style.boxShadow = '0 0 0 2px rgba(167,139,250,0.9)';
          el.style.zIndex = '3';
        } else {
          el.style.boxShadow = '0 2px 6px rgba(0,0,0,.35)';
          el.style.zIndex = '1';
        }
      }
      // value/color may change mid-grow / after clip — always refresh fill
      const axis = shapeAxis(p);
      const mark = axis === 'h' ? '横' : axis === 'v' ? '竖' : '';
      const col =
        typeof p.color === 'number' && Number.isFinite(p.color) ? p.color : 0;
      const label = `${p.value}|${col}|${mark}`;
      el.style.background = pieceFillColor(col, p.value);
      if (el.dataset.label !== label) {
        el.dataset.label = label;
        el.innerHTML = mark
          ? `<span>${p.value}</span><span class="piece-axis">${mark}</span>`
          : `<span>${p.value}</span>`;
      }
      return;
    }

    el.style.left = `${p.x * cell + 2}px`;
    el.style.top = `${p.y * cell + 2}px`;
    el.style.width = `${p.w * cell - 4}px`;
    el.style.height = `${p.h * cell - 4}px`;
    el.style.transform = sc !== 1 ? `scale(${sc})` : '';
    el.style.transformOrigin = 'center center';
    {
      const col =
        typeof p.color === 'number' && Number.isFinite(p.color) ? p.color : 0;
      el.style.background = pieceFillColor(col, p.value);
    }
    el.style.borderRadius = '8px';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.fontWeight = '800';
    el.style.fontSize = `${Math.max(12, Math.min(22, cell * 0.4))}px`;
    el.style.color = '#0f172a';
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
    el.style.background = pieceFillColor(col, p.value);
    if (el.dataset.label !== label) {
      el.dataset.label = label;
      el.innerHTML = mark
        ? `<span>${p.value}</span><span class="piece-axis">${mark}</span>`
        : `<span>${p.value}</span>`;
    }
    el.dataset.pieceId = String(p.id);
    el.dataset.mode = '';

    if (opts.lifting) {
      el.style.boxShadow = '0 12px 28px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.2)';
      el.style.zIndex = '10';
    } else if (isGrowing) {
      // Grow only: thin ring, same plane (z just above static for draw order)
      el.style.boxShadow = '0 0 0 2px rgba(167,139,250,0.9)';
      el.style.zIndex = '3';
    } else if (isPushed) {
      // Pushed = normal piece (no float) — feels like ground-level shove
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,.35)';
      el.style.zIndex = '1';
    } else if (selectedId === p.id) {
      el.style.boxShadow = '0 0 0 2px #f8fafc';
      el.style.zIndex = '2';
    } else {
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,.35)';
      el.style.zIndex = '1';
    }

    if (axis === 'h') el.style.outline = '2px solid rgba(56,189,248,0.85)';
    else if (axis === 'v') el.style.outline = '2px solid rgba(251,191,36,0.9)';
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
          'position:absolute;left:0;top:0;touch-action:none;cursor:grab;user-select:none;will-change:transform,width,height,opacity;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;color:#0f172a;box-sizing:border-box;';
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
      statusEl.textContent = `波次 ${g.wave} · ${g.unlockedColors} 色 · ${phase}\n${g.message}`;
    }
    if (!hintEl.dataset.ready) {
      hintEl.dataset.ready = '1';
      hintEl.textContent =
        '绿=可放 · 蓝=可合 · 紫虚线=生长形 · 红=非法。投影=落点，跟手=意图。';
    }
  };

  const unsub = api.subscribe(render);

  panel.querySelector('#btn-restart')!.addEventListener('click', () => {
    selectedId = null;
    api.restart();
  });
  panel.querySelector('#btn-debug')!.addEventListener('click', () => {
    selectedId = null;
    api.loadDebug();
  });
  panel.querySelector('#btn-upgrade')!.addEventListener('click', () => {
    if (selectedId != null) api.upgradeSelected(selectedId);
  });

  // ——— Drag: hit-test lift · continuous proposal · commit same rules ———
  let dragging = false;
  let dragEl: HTMLElement | null = null;
  let pieceStart = { x: 0, y: 0, w: 1, h: 1, value: 1, color: 0, id: 0 };
  let startDesign = { x: 0, y: 0 };
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
    proposalEl.style.left = `${prop.ghost.x * cell + 2}px`;
    proposalEl.style.top = `${prop.ghost.y * cell + 2}px`;
    proposalEl.style.width = `${A.w * cell - 4}px`;
    proposalEl.style.height = `${A.h * cell - 4}px`;
    // Solid border for snap accuracy (FINDINGS: outline > soft shadow)
    proposalEl.style.borderStyle = 'solid';
    if (prop.kind === 'move') {
      proposalEl.style.background = 'rgba(74, 222, 128, 0.22)';
      proposalEl.style.borderColor = 'rgba(74, 222, 128, 0.95)';
    } else if (prop.kind === 'merge') {
      proposalEl.style.background = 'rgba(56, 189, 248, 0.22)';
      proposalEl.style.borderColor = 'rgba(56, 189, 248, 0.95)';
    } else {
      proposalEl.style.background = 'rgba(248, 113, 113, 0.18)';
      proposalEl.style.borderColor = 'rgba(248, 113, 113, 0.9)';
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
      mergeShapeEl.style.left = `${T.x * cell + 1}px`;
      mergeShapeEl.style.top = `${T.y * cell + 1}px`;
      mergeShapeEl.style.width = `${T.w * cell - 2}px`;
      mergeShapeEl.style.height = `${T.h * cell - 2}px`;
      if (prop.bilateral) {
        mergeShapeEl.style.borderStyle = 'dashed';
        mergeShapeEl.style.boxShadow = 'inset 0 0 0 1px rgba(167,139,250,0.5)';
      } else {
        mergeShapeEl.style.borderStyle = 'dashed';
        mergeShapeEl.style.boxShadow = 'none';
      }
    } else {
      mergeShapeEl.style.display = 'none';
    }
  };

  const updateProposalFromDesign = (designX: number, designY: number) => {
    const g = api.get();
    if (!g.lifted) {
      lastProposal = null;
      paintProposal(null, pieceStart);
      return;
    }
    const a = aimBoardLocal(designX, designY);
    const raw = aimToGhost(a.x, a.y, cell, pieceStart.w, pieceStart.h);
    const aimCellX = a.x / cell;
    const aimCellY = a.y / cell;
    const F = fingerRectFromAim(aimCellX, aimCellY, pieceStart.w, pieceStart.h);
    const enterDx = (designX - startDesign.x) / 40;
    const enterDy = (designY - startDesign.y) / 40;
    lastProposal = proposalForLifted(g.board, g.lifted, raw, {
      fingerRect: F,
      enterDx,
      enterDy,
      origin: { x: pieceStart.x, y: pieceStart.y },
    });
    paintProposal(lastProposal, g.lifted);
  };

  const placeDragEl = (designX: number, designY: number, scale: number) => {
    if (!dragEl) return;
    const a = aimBoardLocal(designX, designY);
    // Continuous F — not grid-snapped (intent)
    const left = a.x - (pieceStart.w * cell) / 2;
    const top = a.y - (pieceStart.h * cell) / 2;
    dragEl.style.left = `${left}px`;
    dragEl.style.top = `${top}px`;
    dragEl.style.width = `${pieceStart.w * cell - 4}px`;
    dragEl.style.height = `${pieceStart.h * cell - 4}px`;
    dragEl.style.transform = `scale(${scale})`;
    dragEl.style.boxShadow =
      '0 10px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.12)';
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

    selectedId = hit.id;
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
    startDesign = d;
    lastDesign = d;

    dragEl = document.createElement('div');
    dragEl.className = 'piece piece-dragging';
    dragEl.style.cssText = `
      position:absolute; pointer-events:none; z-index:20;
      border-radius:8px; display:flex; flex-direction:column;
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
    placeDragEl(d.x, d.y, liftScale);
    updateProposalFromDesign(d.x, d.y);
  };

  const finishDrop = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    const d = toDesign(e.clientX, e.clientY) ?? lastDesign;
    updateProposalFromDesign(d.x, d.y);
    const prop = lastProposal;
    const cellPos = prop?.ghost ?? rawGhostFromDesign(d.x, d.y);
    const designDx = d.x - startDesign.x;
    const designDy = d.y - startDesign.y;

    // Snap floating piece to proposal rect, then commit
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
      const commitProp = lastProposal;
      paintProposal(null, pieceStart);
      mergeShapeEl.style.display = 'none';
      lastProposal = null;
      // Commit last preview frame only
      api.dropAt(cellPos, designDx, designDy, commitProp);
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
