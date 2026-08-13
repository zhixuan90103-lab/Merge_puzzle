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
  computePushPreview,
  nearestMergeable,
  placementAxisStrength,
  placementGrowthDir,
} from './dropResolve';
import { lockAimCombined } from './intent';
import { proposalForLifted, type DropProposal, type GameModel } from './game';
import { pieceDepthColor, pieceFillColor, pieceShadowColor, shapeAxis } from './shapes';
import type { Piece } from './types';
import { GRID_SIZE } from './types';
import { CELL_MS, type VisualPiece } from './timeline';

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

  /** T* — same plastic body as the piece, translucent. */
  const mergeShapeEl = document.createElement('div');
  mergeShapeEl.className = 'piece merge-shape-preview';
  mergeShapeEl.style.cssText = `
    position:absolute; pointer-events:none; z-index:3; display:none;
    border-radius:15px; box-sizing:border-box; opacity:0.5;
  `;
  mergeShapeEl.innerHTML = `<span class="piece-depth"></span><span class="piece-face"></span>`;
  boardRoot.appendChild(mergeShapeEl);

  let tStarAnimRaf = 0;
  let tStarKey = '';

  const stopTStarAnim = () => {
    if (tStarAnimRaf) cancelAnimationFrame(tStarAnimRaf);
    tStarAnimRaf = 0;
    tStarKey = '';
  };

  const applyTStarBox = (r: { x: number; y: number; w: number; h: number }) => {
    mergeShapeEl.style.left = `${r.x * cell + CELL_INSET}px`;
    mergeShapeEl.style.top = `${r.y * cell + CELL_INSET}px`;
    mergeShapeEl.style.width = `${r.w * cell - CELL_INSET * 2}px`;
    mergeShapeEl.style.height = `${r.h * cell - CELL_INSET * 2}px`;
  };

  type PushPrev = {
    id: number;
    rest: { x: number; y: number; w: number; h: number };
    dest: { x: number; y: number; w: number; h: number };
    off: boolean;
    flyFrom?: { x: number; y: number; w: number; h: number };
    flyTo?: { x: number; y: number; w: number; h: number };
    startOp?: number;
  };
  let pushItems: PushPrev[] = [];
  let pushKey = '';
  let pushU = 0;
  let pushFromU = 0;
  let pushToU = 0;
  let pushT0 = 0;
  let pushDur = CELL_MS;
  let lastGrowCells = 1;
  let pushRaf = 0;
  let pushFrozen = false;
  let pushFly = false;
  let pendingMergeCommit = false;
  let pushPinned = new Map<
    number,
    { x: number; y: number; w: number; h: number }
  >();

  const easeOutCubic = (t: number) => {
    const u = 1 - Math.max(0, Math.min(1, t));
    return 1 - u * u * u;
  };

  const lerpRectPx = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
    t: number,
  ) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  });

  const stillOnBoard = (r: { x: number; y: number; w: number; h: number }) =>
    r.x < 8 && r.x + r.w > 0 && r.y < 8 && r.y + r.h > 0;

  /** How far the inner edge is past the board. 0 if any part still on the grid. */
  const innerOutDepth = (r: { x: number; y: number; w: number; h: number }) => {
    if (stillOnBoard(r)) return 0;
    let d = Infinity;
    if (r.x >= 8) d = Math.min(d, r.x - 8);
    if (r.x + r.w <= 0) d = Math.min(d, -(r.x + r.w));
    if (r.y >= 8) d = Math.min(d, r.y - 8);
    if (r.y + r.h <= 0) d = Math.min(d, -(r.y + r.h));
    return Number.isFinite(d) ? d : 0;
  };

  const opacityForRect = (r: { x: number; y: number; w: number; h: number }) => {
    const d = innerOutDepth(r);
    if (d <= 0) return 0.8;
    return Math.max(0.38, 0.68 - d * 0.1);
  };

  const pushAxis = (items: PushPrev[]) => {
    let sx = 0;
    let sy = 0;
    for (const it of items) {
      sx += it.dest.x - it.rest.x;
      sy += it.dest.y - it.rest.y;
    }
    const horiz = Math.abs(sx) >= Math.abs(sy);
    const sign = horiz ? Math.sign(sx) || 1 : Math.sign(sy) || 1;
    return { horiz, sign };
  };

  /** Keep board layout: translate the whole leaving group just past the rim. */
  const spreadPushChain = (items: PushPrev[]) => {
    const leaving = items.filter((it) => it.off || !stillOnBoard(it.dest));
    if (leaving.length === 0) return;
    const { horiz, sign } = pushAxis(leaving);
    const pad = 0.35;
    let dx = 0;
    let dy = 0;
    if (!horiz && sign < 0) {
      const maxB = Math.max(...leaving.map((i) => i.rest.y + i.rest.h));
      dy = -maxB - pad;
    } else if (!horiz && sign > 0) {
      const minY = Math.min(...leaving.map((i) => i.rest.y));
      dy = 8 - minY + pad;
    } else if (horiz && sign > 0) {
      const minX = Math.min(...leaving.map((i) => i.rest.x));
      dx = 8 - minX + pad;
    } else {
      const maxR = Math.max(...leaving.map((i) => i.rest.x + i.rest.w));
      dx = -maxR - pad;
    }
    for (const item of leaving) {
      item.dest = {
        x: item.rest.x + dx,
        y: item.rest.y + dy,
        w: item.dest.w,
        h: item.dest.h,
      };
    }
  };

  const plantPieceRest = (item: PushPrev) => {
    const el = pieceEls.get(item.id);
    if (!el) return;
    el.style.left = `${item.rest.x * cell + CELL_INSET}px`;
    el.style.top = `${item.rest.y * cell + CELL_INSET}px`;
    el.style.width = `${item.rest.w * cell - CELL_INSET * 2}px`;
    el.style.height = `${item.rest.h * cell - CELL_INSET * 2}px`;
    el.style.transform = '';
    el.style.opacity = '1';
  };

  const applyPushPreview = (u: number, solid: boolean) => {
    for (const item of pushItems) {
      const el = pieceEls.get(item.id);
      if (!el) continue;
      if (pushFly && item.flyFrom && item.flyTo) {
        const r = lerpRectPx(item.flyFrom, item.flyTo, u);
        el.style.left = `${r.x * cell + CELL_INSET}px`;
        el.style.top = `${r.y * cell + CELL_INSET}px`;
        el.style.width = `${r.w * cell - CELL_INSET * 2}px`;
        el.style.height = `${r.h * cell - CELL_INSET * 2}px`;
        el.style.transform = '';
        const fade = Math.min(1, u / 0.78);
        el.style.opacity = String((item.startOp ?? 0.7) * (1 - fade));
        continue;
      }
      const r = lerpRectPx(item.rest, item.dest, u);
      el.style.left = `${r.x * cell + CELL_INSET}px`;
      el.style.top = `${r.y * cell + CELL_INSET}px`;
      el.style.width = `${r.w * cell - CELL_INSET * 2}px`;
      el.style.height = `${r.h * cell - CELL_INSET * 2}px`;
      el.style.transform = '';
      el.style.opacity = String(solid ? 1 : opacityForRect(r));
    }
  };

  const tickPushPreview = (now: number) => {
    pushRaf = 0;
    const raw = Math.min(1, (now - pushT0) / Math.max(1, pushDur));
    const e = pushToU === 0 && !pushFly ? raw : easeOutCubic(raw);
    pushU = pushFromU + (pushToU - pushFromU) * e;
    applyPushPreview(pushU, pushFrozen);
    if (raw < 1) {
      pushRaf = requestAnimationFrame(tickPushPreview);
      return;
    }
    if (pushToU === 0 && !pushFly) {
      for (const item of pushItems) plantPieceRest(item);
      pushItems = [];
      pushKey = '';
      pushU = 0;
    }
    if (pushFly && raw >= 1 && !api.get().animating) {
      finishPushFly(api.get());
    }
  };

  const finishPushFly = (g: GameModel) => {
    pushFly = false;
    pushFrozen = false;
    pendingMergeCommit = false;
    for (const item of pushItems) {
      const still = g.board.pieces.find((p) => p.id === item.id);
      const el = pieceEls.get(item.id);
      if (!still) {
        el?.remove();
        pieceEls.delete(item.id);
      } else if (el) {
        el.style.left = `${still.x * cell + CELL_INSET}px`;
        el.style.top = `${still.y * cell + CELL_INSET}px`;
        el.style.width = `${still.w * cell - CELL_INSET * 2}px`;
        el.style.height = `${still.h * cell - CELL_INSET * 2}px`;
        el.style.opacity = '1';
      }
    }
    pushItems = [];
    pushKey = '';
    pushU = 0;
  };

  const startPushFlyOut = () => {
    if (pushFly || pushItems.length === 0) return;
    const stay: PushPrev[] = [];
    const leave: PushPrev[] = [];
    for (const item of pushItems) {
      if (item.off || !stillOnBoard(item.dest)) leave.push(item);
      else stay.push(item);
    }
    for (const item of stay) {
      pushPinned.set(item.id, item.dest);
      const el = pieceEls.get(item.id);
      if (!el) continue;
      el.style.left = `${item.dest.x * cell + CELL_INSET}px`;
      el.style.top = `${item.dest.y * cell + CELL_INSET}px`;
      el.style.width = `${item.dest.w * cell - CELL_INSET * 2}px`;
      el.style.height = `${item.dest.h * cell - CELL_INSET * 2}px`;
      el.style.transform = '';
      el.style.opacity = '1';
    }
    if (leave.length === 0) {
      pushItems = [];
      pushKey = '';
      pushU = 0;
      return;
    }
    pushItems = leave;
    pushFly = true;
    const { horiz, sign } = pushAxis(leave);
    const extra = lastGrowCells;
    for (const item of leave) {
      const cur = lerpRectPx(item.rest, item.dest, pushU);
      item.flyFrom = cur;
      item.flyTo = {
        x: item.dest.x + (horiz ? sign * extra : 0),
        y: item.dest.y + (horiz ? 0 : sign * extra),
        w: item.dest.w,
        h: item.dest.h,
      };
      item.startOp = opacityForRect(cur);
    }
    pushFromU = 0;
    pushToU = 1;
    pushDur = lastGrowCells * CELL_MS;
    pushT0 = performance.now();
    if (pushRaf) cancelAnimationFrame(pushRaf);
    pushRaf = requestAnimationFrame(tickPushPreview);
  };

  const startPushToward = (
    items: PushPrev[],
    key: string,
    t0?: number,
    dur?: number,
  ) => {
    if (key === pushKey && pushToU === 1) return;
    const keep = new Set(items.map((it) => it.id));
    for (const old of pushItems) {
      if (!keep.has(old.id)) plantPieceRest(old);
    }
    const sameKey = key === pushKey;
    spreadPushChain(items);
    pushItems = items;
    pushKey = key;
    pushFromU = sameKey ? pushU : 0;
    pushToU = 1;
    pushDur = dur ?? lastGrowCells * CELL_MS;
    pushT0 = t0 ?? performance.now();
    if (pushRaf) cancelAnimationFrame(pushRaf);
    pushRaf = requestAnimationFrame(tickPushPreview);
  };

  const startPushBack = () => {
    if (pendingMergeCommit || pushFly) return;
    if (pushItems.length === 0) {
      pushU = 0;
      pushKey = '';
      return;
    }
    pushFromU = pushU;
    pushToU = 0;
    pushDur = 48;
    pushT0 = performance.now();
    pushKey = '';
    if (pushRaf) cancelAnimationFrame(pushRaf);
    pushRaf = requestAnimationFrame(tickPushPreview);
  };

  /**
   * Goo overlay on top of everything. Pieces stay as-is.
   * No mask/clip — those were eating the waist.
   */
  /** Smaller than piece 15px — blur adds extra corner rounding. */
  const FUSION_RX = 7;
  const fusionSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  fusionSvg.setAttribute('class', 'fusion-goo');
  fusionSvg.setAttribute('width', String(boardLayout.size));
  fusionSvg.setAttribute('height', String(boardLayout.size));
  fusionSvg.style.cssText = `
    position:absolute;left:0;top:0;width:100%;height:100%;
    overflow:visible;pointer-events:none;z-index:9999;display:none;
  `;
  fusionSvg.innerHTML = `
    <defs>
      <filter id="piece-goo" color-interpolation-filters="sRGB"
        filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
        x="-80" y="-80" width="${boardLayout.size + 160}" height="${boardLayout.size + 160}">
        <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur"/>
        <feColorMatrix in="blur" type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 54 -32" result="goo"/>
      </filter>
      <filter id="goo-shade" color-interpolation-filters="sRGB"
        filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
        x="-80" y="-80" width="${boardLayout.size + 160}" height="${boardLayout.size + 160}">
        <feOffset in="SourceAlpha" dx="1.2" dy="3.2" result="off"/>
        <feGaussianBlur in="off" stdDeviation="2.4" result="shBlur"/>
        <feColorMatrix in="shBlur" type="matrix"
          values="0 0 0 0 0.16  0 0 0 0 0.17  0 0 0 0 0.20  0 0 0 0.28 0" result="shadow"/>
        <feMerge>
          <feMergeNode in="shadow"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <g filter="url(#goo-shade)">
      <g filter="url(#piece-goo)">
        <rect id="fusion-b-depth" rx="${FUSION_RX}" ry="${FUSION_RX}"/>
        <rect id="fusion-a-depth" rx="${FUSION_RX}" ry="${FUSION_RX}"/>
      </g>
      <g filter="url(#piece-goo)">
        <rect id="fusion-b-blob" rx="${FUSION_RX}" ry="${FUSION_RX}"/>
        <rect id="fusion-a-blob" rx="${FUSION_RX}" ry="${FUSION_RX}"/>
      </g>
    </g>
  `;
  boardRoot.appendChild(fusionSvg);

  const fusionDecor = document.createElement('div');
  fusionDecor.className = 'fusion-decor';
  fusionDecor.style.cssText = `
    position:absolute;left:0;top:0;width:100%;height:100%;
    pointer-events:none;z-index:10001;display:none;
  `;
  const fusionShineA = document.createElement('div');
  fusionShineA.className = 'fusion-decor-item';
  fusionShineA.innerHTML = PIECE_SHINE;
  const makeNum = () => {
    const el = document.createElement('span');
    el.className = 'fusion-num piece-value';
    fusionDecor.appendChild(el);
    return el;
  };
  fusionDecor.appendChild(fusionShineA);
  const fusionNumA = makeNum();
  const fusionNumB = makeNum();
  const fusionNumSum = makeNum();
  fusionNumSum.classList.add('fusion-num-sum');
  boardRoot.appendChild(fusionDecor);

  const placeBox = (
    el: HTMLElement,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  };

  const placeNum = (
    el: HTMLElement,
    cx: number,
    cy: number,
    text: string,
    opacity: number,
    scale: number,
  ) => {
    el.textContent = text;
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.style.opacity = String(opacity);
    el.style.transform = `translate(-50%,-50%) scale(${scale})`;
  };

  const fusionABlob = fusionSvg.querySelector('#fusion-a-blob') as SVGRectElement;
  const fusionBBlob = fusionSvg.querySelector('#fusion-b-blob') as SVGRectElement;
  const fusionADepth = fusionSvg.querySelector('#fusion-a-depth') as SVGRectElement;
  const fusionBDepth = fusionSvg.querySelector('#fusion-b-depth') as SVGRectElement;

  const setSvgRect = (
    el: SVGRectElement,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
  ) => {
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    el.setAttribute('width', String(Math.max(0, w)));
    el.setAttribute('height', String(Math.max(0, h)));
    el.setAttribute('fill', fill);
  };

  let fusionOn = false;
  let fusionNumPhase: 'off' | 'adding' | 'sum' = 'off';
  let fusionNumT0 = 0;
  let fusionNumRaf = 0;
  let fusionNumValue = 1;
  const fusionNumFromA = { x: 0, y: 0 };
  const fusionNumFromB = { x: 0, y: 0 };
  const fusionNumMid = { x: 0, y: 0 };

  const easeOut = (t: number) => {
    const u = 1 - Math.max(0, Math.min(1, t));
    return 1 - u * u * u;
  };

  const tickFusionNums = (now: number) => {
    fusionNumRaf = 0;
    const mx = fusionNumMid.x;
    const my = fusionNumMid.y;
    if (fusionNumPhase === 'adding') {
      const t = Math.min(1, (now - fusionNumT0) / 240);
      const u = easeOut(t);
      placeNum(
        fusionNumA,
        fusionNumFromA.x + (mx - fusionNumFromA.x) * u,
        fusionNumFromA.y + (my - fusionNumFromA.y) * u,
        String(fusionNumValue),
        1 - u,
        1 - 0.22 * u,
      );
      placeNum(
        fusionNumB,
        fusionNumFromB.x + (mx - fusionNumFromB.x) * u,
        fusionNumFromB.y + (my - fusionNumFromB.y) * u,
        String(fusionNumValue),
        1 - u,
        1 - 0.22 * u,
      );
      placeNum(
        fusionNumSum,
        mx,
        my,
        String(fusionNumValue * 2),
        u,
        0.78 + 0.32 * u,
      );
      if (t >= 1) {
        fusionNumPhase = 'sum';
        placeNum(fusionNumA, mx, my, '', 0, 1);
        placeNum(fusionNumB, mx, my, '', 0, 1);
        placeNum(fusionNumSum, mx, my, String(fusionNumValue * 2), 1, 1);
        return;
      }
      fusionNumRaf = requestAnimationFrame(tickFusionNums);
      return;
    }
    if (fusionNumPhase === 'sum') {
      placeNum(fusionNumA, mx, my, '', 0, 1);
      placeNum(fusionNumB, mx, my, '', 0, 1);
      placeNum(fusionNumSum, mx, my, String(fusionNumValue * 2), 1, 1);
    }
  };

  const hideFusion = () => {
    fusionOn = false;
    fusionNumPhase = 'off';
    if (fusionNumRaf) cancelAnimationFrame(fusionNumRaf);
    fusionNumRaf = 0;
    fusionSvg.style.display = 'none';
    fusionDecor.style.display = 'none';
  };

  const paintFusion = (
    aLeft: number,
    aTop: number,
    aW: number,
    aH: number,
    B: { x: number; y: number; w: number; h: number },
    color: number,
    value: number,
    aScale: number,
  ) => {
    const fill = pieceFillColor(color, value);
    const depth = pieceDepthColor(color, value);
    const bLeft = B.x * cell + CELL_INSET;
    const bTop = B.y * cell + CELL_INSET;
    const bW = B.w * cell - CELL_INSET * 2;
    const bH = B.h * cell - CELL_INSET * 2;
    const aw = aW * aScale;
    const ah = aH * aScale;
    const ax = aLeft + aW / 2 - aw / 2;
    const ay = aTop + aH / 2 - ah / 2;
    const grow = 3;
    setSvgRect(fusionBDepth, bLeft - grow + 1, bTop - grow + 3, bW + grow * 2, bH + grow * 2 + 2, depth);
    setSvgRect(fusionADepth, ax - grow + 1, ay - grow + 3, aw + grow * 2, ah + grow * 2 + 2, depth);
    setSvgRect(fusionBBlob, bLeft - grow, bTop - grow, bW + grow * 2, bH + grow * 2, fill);
    setSvgRect(fusionABlob, ax - grow, ay - grow, aw + grow * 2, ah + grow * 2, fill);

    placeBox(fusionShineA, ax, ay, aw, ah);
    fusionShineA.style.setProperty(
      '--shine-scale',
      aw >= cell * 2 - 4 && ah >= cell * 2 - 4 ? '1' : '0.72',
    );

    const acx = ax + aw / 2;
    const acy = ay + ah / 2;
    const bcx = bLeft + bW / 2;
    const bcy = bTop + bH / 2;
    fusionNumMid.x = (acx + bcx) / 2;
    fusionNumMid.y = (acy + bcy) / 2;
    fusionNumValue = value;

    if (!fusionOn) {
      fusionNumFromA.x = acx;
      fusionNumFromA.y = acy;
      fusionNumFromB.x = bcx;
      fusionNumFromB.y = bcy;
      fusionNumPhase = 'adding';
      fusionNumT0 = performance.now();
      if (fusionNumRaf) cancelAnimationFrame(fusionNumRaf);
      fusionNumRaf = requestAnimationFrame(tickFusionNums);
    } else if (fusionNumPhase === 'sum') {
      tickFusionNums(performance.now());
    }

    fusionSvg.style.display = 'block';
    fusionDecor.style.display = 'block';
    fusionOn = true;
  };

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
    const hold =
      pushFly || pendingMergeCommit || pushPinned.size
        ? new Set([
            ...pushItems.map((it) => it.id),
            ...pushPinned.keys(),
          ])
        : null;
    for (const [id, el] of pieceEls) {
      if (!live.has(id)) {
        if (hold?.has(id)) continue;
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
      if (hold?.has(p.id)) continue;
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
  let lastRejectNonce = -1;

  const playRejectBlink = (ids: number[]) => {
    const want = new Set(ids);
    for (const [id, el] of pieceEls) {
      if (!want.has(id)) {
        el.classList.remove('piece-reject');
        continue;
      }
      if (el.style.display === 'none') el.style.display = 'flex';
      el.classList.remove('piece-reject');
      void el.offsetWidth;
      el.classList.add('piece-reject');
    }
  };

  const render = (g: GameModel) => {
    // Keep left/top (not transform) during merge — switching to
    // translate3d for one clip makes the whole board twitch.
    const motionOnly = !!(g.visualPieces && g.animating);
    if (g.visualPieces) {
      syncPieces(g.visualPieces, g.spawnFlashIds, motionOnly);
    } else {
      syncPieces(g.board.pieces, g.spawnFlashIds, false);
    }
    // Unhide before blink — animation on display:none is skipped
    if (g.lifted) {
      const el = pieceEls.get(g.lifted.id);
      if (el) el.style.display = 'none';
    } else {
      for (const el of pieceEls.values()) {
        if (el.style.display === 'none') el.style.display = 'flex';
      }
    }
    if (g.rejectNonce !== lastRejectNonce) {
      lastRejectNonce = g.rejectNonce;
      playRejectBlink(g.rejectFlashIds);
    }
    if (g.animating && pushItems.length && !pushFly) {
      pushFrozen = true;
      startPushFlyOut();
    } else if (pushFly) {
      applyPushPreview(pushU, false);
      if (!g.animating && pushU >= 1) finishPushFly(g);
    } else if (pushItems.length) {
      applyPushPreview(pushU, false);
    }
    for (const [id, dest] of pushPinned) {
      const el = pieceEls.get(id);
      if (!el) continue;
      el.style.left = `${dest.x * cell + CELL_INSET}px`;
      el.style.top = `${dest.y * cell + CELL_INSET}px`;
      el.style.width = `${dest.w * cell - CELL_INSET * 2}px`;
      el.style.height = `${dest.h * cell - CELL_INSET * 2}px`;
      el.style.transform = '';
      el.style.opacity = '1';
    }
    if (!g.animating && !pushFly) {
      pushPinned.clear();
      if (!pushItems.length) {
        pushFrozen = false;
        pendingMergeCommit = false;
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

  const paintProposal = (prop: DropProposal | null, _A: { w: number; h: number }) => {
    if (!prop) {
      proposalEl.style.display = 'none';
      targetRingEl.style.display = 'none';
      mergeShapeEl.style.display = 'none';
      stopTStarAnim();
      startPushBack();
      return;
    }
    proposalEl.style.display = 'none';

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
      const fill = pieceFillColor(pieceStart.color, pieceStart.value * 2);
      const depth = pieceDepthColor(pieceStart.color, pieceStart.value * 2);
      mergeShapeEl.style.display = 'block';
      mergeShapeEl.style.setProperty('--piece-fill', fill);
      mergeShapeEl.style.setProperty('--piece-depth', depth);
      mergeShapeEl.style.setProperty('--piece-shadow', pieceShadowColor(pieceStart.color));
      mergeShapeEl.style.border = 'none';
      const key = `${T.x},${T.y},${T.w},${T.h}`;
      if (key !== tStarKey) {
        tStarKey = key;
        if (tStarAnimRaf) cancelAnimationFrame(tStarAnimRaf);
        const g = api.get();
        const seed =
          (prop.targetId != null
            ? g.board.pieces.find((p) => p.id === prop.targetId)
            : null) ?? phaseState.lockB;
        const from = seed
          ? { x: seed.x, y: seed.y, w: seed.w, h: seed.h }
          : { ...T };
        const growCells = Math.max(
          1,
          Math.abs(T.x - from.x),
          Math.abs(T.y - from.y),
          Math.abs(T.x + T.w - (from.x + from.w)),
          Math.abs(T.y + T.h - (from.y + from.h)),
        );
        lastGrowCells = growCells;
        const growMs = growCells * CELL_MS;
        const t0 = performance.now();
        const tick = (now: number) => {
          const u = Math.min(1, (now - t0) / growMs);
          const e = easeOutCubic(u);
          applyTStarBox({
            x: from.x + (T.x - from.x) * e,
            y: from.y + (T.y - from.y) * e,
            w: from.w + (T.w - from.w) * e,
            h: from.h + (T.h - from.h) * e,
          });
          if (u < 1) tStarAnimRaf = requestAnimationFrame(tick);
          else tStarAnimRaf = 0;
        };
        tStarAnimRaf = requestAnimationFrame(tick);
        const B =
          prop.targetId != null
            ? g.board.pieces.find((p) => p.id === prop.targetId)
            : undefined;
        if (B && g.lifted) {
          const ghost = prop.ghost ?? { x: pieceStart.x, y: pieceStart.y };
          const items = computePushPreview(
            g.board,
            g.lifted,
            B,
            { x: ghost.x, y: ghost.y, w: pieceStart.w, h: pieceStart.h },
            T,
            prop.growDirX ?? 0,
            prop.growDirY ?? 0,
          );
          if (items.length) startPushToward(items, key, t0, growMs);
          else startPushBack();
        }
      }
    } else {
      mergeShapeEl.style.display = 'none';
      stopTStarAnim();
      startPushBack();
    }
  };

  /** FREE = pick B; LOCKED = weak magnet + micro-aim (docs/DESIGN_DRAG_MERGE.md) */
  let phaseState: DragPhaseState = initialDragPhase();
  let stickyMerge: {
    targetId: number;
    T: { x: number; y: number; w: number; h: number };
    bilateral: boolean;
    dirX: number;
    dirY: number;
  } | null = null;
  let pendingSwitch: {
    dirX: number;
    dirY: number;
    since: number;
  } | null = null;

  const DIR_SWITCH_MARGIN = 0.4;
  const DIR_SWITCH_DWELL_MS = 100;

  const resetDragPhase = () => {
    phaseState = resetPhaseState();
    stickyMerge = null;
    pendingSwitch = null;
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

    const nearest = nearestMergeable(g.board, A, { x: F.x, y: F.y });
    const stepped = stepDragPhase(phaseState, {
      A,
      rawGhost: raw,
      fingerRect: F,
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
      const aim = lockAimCombined(slideDdx, slideDdy, placeDdx, placeDdy);
      enterDx = aim.enterDx;
      enterDy = aim.enterDy;
      playerAim = aim.playerAim;
    }

    if (
      phase !== 'locked' ||
      phaseState.lockedTargetId == null ||
      (stickyMerge != null && stickyMerge.targetId !== phaseState.lockedTargetId)
    ) {
      stickyMerge = null;
      pendingSwitch = null;
    }

    let releaseSticky = false;
    if (phase === 'locked' && stickyMerge && phaseState.lockB) {
      const wish = placementGrowthDir(F, phaseState.lockB);
      const sameDir =
        wish.dirX === stickyMerge.dirX && wish.dirY === stickyMerge.dirY;
      if (!sameDir && wish.confidence >= 0.22) {
        const cur = placementAxisStrength(
          F,
          phaseState.lockB,
          stickyMerge.dirX,
          stickyMerge.dirY,
        );
        const nxt = placementAxisStrength(F, phaseState.lockB, wish.dirX, wish.dirY);
        if (nxt >= cur + DIR_SWITCH_MARGIN) {
          const now = performance.now();
          if (
            !pendingSwitch ||
            pendingSwitch.dirX !== wish.dirX ||
            pendingSwitch.dirY !== wish.dirY
          ) {
            pendingSwitch = { dirX: wish.dirX, dirY: wish.dirY, since: now };
          } else if (now - pendingSwitch.since >= DIR_SWITCH_DWELL_MS) {
            releaseSticky = true;
          }
        } else {
          pendingSwitch = null;
        }
      } else {
        pendingSwitch = null;
      }
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
      stickyT:
        phase === 'locked' &&
        stickyMerge?.targetId === phaseState.lockedTargetId &&
        !releaseSticky
          ? stickyMerge.T
          : null,
    });

    if (phase === 'locked' && phaseState.lockedTargetId != null) {
      if (
        lastProposal.kind === 'merge' &&
        lastProposal.mergeTarget &&
        lastProposal.targetId === phaseState.lockedTargetId
      ) {
        if (!stickyMerge || releaseSticky) {
          stickyMerge = {
            targetId: lastProposal.targetId,
            T: lastProposal.mergeTarget,
            bilateral: lastProposal.bilateral ?? false,
            dirX: lastProposal.growDirX ?? 0,
            dirY: lastProposal.growDirY ?? 0,
          };
          pendingSwitch = null;
        }
      }
      if (stickyMerge) {
        lastProposal = {
          ...lastProposal,
          kind: 'merge',
          targetId: stickyMerge.targetId,
          mergeTarget: stickyMerge.T,
          mergeUniqueWays: lastProposal.mergeUniqueWays ?? 1,
          bilateral: stickyMerge.bilateral,
          growDirX: stickyMerge.dirX,
          growDirY: stickyMerge.dirY,
          locked: true,
          reason: lastProposal.reason || '可合',
        };
      }
    } else {
      stickyMerge = null;
      pendingSwitch = null;
    }
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
    const aW = pieceStart.w * cell - CELL_INSET * 2;
    const aH = pieceStart.h * cell - CELL_INSET * 2;
    const left = a.x - (pieceStart.w * cell) / 2;
    const top = a.y - (pieceStart.h * cell) / 2;
    dragEl.style.left = `${left}px`;
    dragEl.style.top = `${top}px`;
    dragEl.style.width = `${aW}px`;
    dragEl.style.height = `${aH}px`;
    dragEl.style.transform = `scale(${scale})`;
    dragEl.style.boxShadow =
      '0 16px 28px rgba(var(--piece-shadow),0.26), 0 0 0 1px rgba(255,255,255,0.32)';

    const canFuse = phaseState.phase === 'locked' && phaseState.lockB != null;
    if (canFuse && phaseState.lockB) {
      paintFusion(
        left,
        top,
        aW,
        aH,
        phaseState.lockB,
        pieceStart.color,
        pieceStart.value,
        scale,
      );
    } else if (fusionOn) {
      hideFusion();
    }
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
  let liftDesign = { x: 0, y: 0 };
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
    liftDesign = d;
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
    const illegalHome =
      frozenProp?.kind === 'illegal' || frozenProp?.kind === 'move';
    const cellPos = illegalHome
      ? { x: pieceStart.x, y: pieceStart.y }
      : frozenProp?.ghost ?? rawGhostFromDesign(d.x, d.y);
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
    if (frozenProp?.kind === 'merge' && pushItems.length) {
      pendingMergeCommit = true;
    }
    resetDragPhase();
    hideFusion();

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
      if (pendingMergeCommit && !api.get().animating) {
        pendingMergeCommit = false;
        startPushBack();
      }
      const travelled =
        Math.hypot(d.x - liftDesign.x, d.y - liftDesign.y) > 18;
      if (frozenProp?.kind === 'move' && travelled) {
        playRejectBlink([pieceStart.id]);
      }
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
      stopTStarAnim();
      if (pushRaf) cancelAnimationFrame(pushRaf);
      boardRoot.remove();
      uiRoot.innerHTML = '';
    },
  };
}
