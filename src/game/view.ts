import type { StageLayout } from '../adapt/design';
import { haptics } from '../utils/haptics';
import {
  initialDragPhase,
  beginLiftPhase,
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
import { createPushPreview } from './previewPush';
import { planSpawnEnter, spawnEnterKey } from './spawnEnter';
import { cellMs, type VisualPiece } from './timeline';
import { tweaks, TWEAK_DEFAULTS } from './tweaks';

export type BoardLayout = {
  originX: number;
  originY: number;
  cell: number;
  size: number;
};

/** Design 390×844: board top. Larger = lower. Live value in tweaks.boardOriginY. */
export const BOARD_ORIGIN_Y = TWEAK_DEFAULTS.boardOriginY;
const CELL_INSET = 1.5;
const BOARD_PADDING = 10;
const PIECE_RADIUS = 15;
const BOARD_RADIUS = PIECE_RADIUS + BOARD_PADDING;
const PIECE_SHINE =
  '<svg class="piece-shine" viewBox="0 0 22 30" aria-hidden="true"><path d="M4.2 3.8C12.3 3.8 18.1 9.7 18.1 17.8V25.5" /></svg>';

export function computeBoardLayout(): BoardLayout {
  const size = 360;
  const cell = size / GRID_SIZE;
  const originX = (390 - size) / 2;
  const originY = tweaks.boardOriginY;
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
    position:absolute; left:${boardLayout.originX - BOARD_PADDING}px; top:${boardLayout.originY - BOARD_PADDING}px;
    width:${boardLayout.size + BOARD_PADDING * 2}px; height:${boardLayout.size + BOARD_PADDING * 2}px;
    z-index:1; touch-action:none;
    background: #f7f8f8;
    border: 0;
    border-radius: ${BOARD_RADIUS}px;
    box-shadow:
      0 0 0 3px #c5cdd2,
      inset 0 2px 7px rgba(95,104,112,0.16),
      inset 0 1px 0 rgba(255,255,255,0.9),
      0 16px 24px rgba(55,98,132,0.24);
    overflow: visible;
  `;
  stage.appendChild(boardRoot);

  const boardInner = document.createElement('div');
  boardInner.className = 'board-inner';
  boardInner.style.cssText = `
    position:absolute; left:${BOARD_PADDING}px; top:${BOARD_PADDING}px;
    width:${boardLayout.size}px; height:${boardLayout.size}px;
    --piece-radius:${PIECE_RADIUS}px;
    background:#eef2f5; border-radius:${PIECE_RADIUS + 2}px;
    overflow:visible;
  `;
  boardRoot.appendChild(boardInner);

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
  boardInner.appendChild(gridLayer);

  const piecesLayer = document.createElement('div');
  piecesLayer.style.cssText = 'position:absolute;inset:0;';
  boardInner.appendChild(piecesLayer);

  const dragLayer = document.createElement('div');
  dragLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2000;';
  boardInner.appendChild(dragLayer);

  /** Apple-style drop proposal shadow (sessionDidUpdate) */
  const proposalEl = document.createElement('div');
  proposalEl.className = 'drop-proposal';
  proposalEl.style.cssText = `
    position:absolute; pointer-events:none; z-index:5; display:none;
    border-radius:${PIECE_RADIUS}px; box-sizing:border-box;
    border:2px dashed transparent;
    transition: left 40ms linear, top 40ms linear, background 80ms ease, border-color 80ms ease;
  `;
  boardInner.appendChild(proposalEl);

  const targetRingEl = document.createElement('div');
  targetRingEl.className = 'merge-target-ring';
  targetRingEl.style.cssText = `
    position:absolute; pointer-events:none; z-index:4; display:none;
    border-radius:${PIECE_RADIUS}px; box-sizing:border-box;
    border:2px solid #5ec8ff; box-shadow:0 0 0 3px rgba(94,200,255,0.22);
    transition: border-color 80ms ease, box-shadow 80ms ease;
  `;
  boardInner.appendChild(targetRingEl);

  /** T* — same plastic body as the piece, translucent. */
  const mergeShapeEl = document.createElement('div');
  mergeShapeEl.className = 'piece merge-shape-preview';
  mergeShapeEl.style.cssText = `
    position:absolute; pointer-events:none; z-index:3; display:none;
    border-radius:${PIECE_RADIUS}px; box-sizing:border-box; opacity:0.5;
  `;
  mergeShapeEl.innerHTML = `<span class="piece-depth"></span><span class="piece-face"></span>`;
  boardInner.appendChild(mergeShapeEl);

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

  const easeOutCubic = (t: number) => {
    const u = 1 - Math.max(0, Math.min(1, t));
    return 1 - u * u * u;
  };

  let lastGrowCells = 1;

  /**
   * Goo overlay. Pieces stay as-is.
   * Filter region is the A∪B box only — full-board SVG blur is what stalled touch.
   */
  const FUSION_RX = Math.round(PIECE_RADIUS * 0.55);
  const GOO_BLUR = 7;
  const GOO_PAD = 28;
  const fusionSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  fusionSvg.setAttribute('class', 'fusion-goo');
  fusionSvg.setAttribute('overflow', 'visible');
  fusionSvg.style.cssText = `
    position:absolute;left:0;top:0;width:80px;height:80px;
    overflow:visible;pointer-events:none;z-index:9999;display:none;
  `;
  fusionSvg.innerHTML = `
    <defs>
      <filter id="piece-goo" color-interpolation-filters="sRGB"
        filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse"
        x="-0.35" y="-0.35" width="1.7" height="1.7">
        <feGaussianBlur in="SourceGraphic" stdDeviation="${GOO_BLUR}" result="blur"/>
        <feColorMatrix in="blur" type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 42 -24" result="goo"/>
      </filter>
    </defs>
    <g filter="url(#piece-goo)">
      <rect id="fusion-b-blob" rx="${FUSION_RX}" ry="${FUSION_RX}"/>
      <rect id="fusion-a-blob" rx="${FUSION_RX}" ry="${FUSION_RX}"/>
    </g>
  `;
  boardInner.appendChild(fusionSvg);

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
  boardInner.appendChild(fusionDecor);

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
  let fusionHostKey = '';

  const setSvgRect = (
    el: SVGRectElement,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
  ) => {
    const ww = Math.max(0, w);
    const hh = Math.max(0, h);
    const key = `${x}|${y}|${ww}|${hh}|${fill}`;
    if (el.dataset.box === key) return;
    el.dataset.box = key;
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    el.setAttribute('width', String(ww));
    el.setAttribute('height', String(hh));
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
    fusionHostKey = '';
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
    const bLeft = B.x * cell + CELL_INSET;
    const bTop = B.y * cell + CELL_INSET;
    const bW = B.w * cell - CELL_INSET * 2;
    const bH = B.h * cell - CELL_INSET * 2;
    const aw = aW * aScale;
    const ah = aH * aScale;
    const ax = aLeft + aW / 2 - aw / 2;
    const ay = aTop + aH / 2 - ah / 2;
    const grow = 3;
    const ax0 = ax - grow;
    const ay0 = ay - grow;
    const aw0 = aw + grow * 2;
    const ah0 = ah + grow * 2;
    const bx0 = bLeft - grow;
    const by0 = bTop - grow;
    const bw0 = bW + grow * 2;
    const bh0 = bH + grow * 2;
    const snap16 = (v: number) => Math.floor(v / 16) * 16;
    const hostX = snap16(Math.min(ax0, bx0) - GOO_PAD);
    const hostY = snap16(Math.min(ay0, by0) - GOO_PAD);
    const hostW = snap16(Math.max(ax0 + aw0, bx0 + bw0) - hostX + GOO_PAD + 16) + 16;
    const hostH = snap16(Math.max(ay0 + ah0, by0 + bh0) - hostY + GOO_PAD + 16) + 16;
    const hostKey = `${hostX | 0},${hostY | 0},${hostW | 0},${hostH | 0}`;
    if (hostKey !== fusionHostKey) {
      fusionHostKey = hostKey;
      fusionSvg.style.left = `${hostX}px`;
      fusionSvg.style.top = `${hostY}px`;
      fusionSvg.style.width = `${hostW}px`;
      fusionSvg.style.height = `${hostH}px`;
      fusionSvg.setAttribute('viewBox', `0 0 ${hostW} ${hostH}`);
    }
    setSvgRect(fusionBBlob, bx0 - hostX, by0 - hostY, bw0, bh0, fill);
    setSvgRect(fusionABlob, ax0 - hostX, ay0 - hostY, aw0, ah0, fill);

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

  const winLayer = document.createElement('div');
  winLayer.id = 'win-layer';
  winLayer.hidden = true;
  winLayer.innerHTML = `
    <div class="win-card">
      <p class="win-kicker">关卡完成</p>
      <h2 class="win-title" id="win-title">第 1 关</h2>
      <p class="win-sub" id="win-sub">单色满屏 64</p>
      <div class="win-actions">
        <button type="button" id="btn-win-next" class="win-primary">下一关</button>
        <button type="button" id="btn-win-retry">重开本关</button>
      </div>
    </div>
  `;
  uiRoot.appendChild(winLayer);
  if (!debugUi) {
    panel.querySelector('#btn-debug')?.remove();
  }

  const statusEl = header.querySelector('#game-status') as HTMLElement;
  const hintEl = panel.querySelector('#game-hint') as HTMLElement;
  const pieceEls = new Map<number, HTMLElement>();
  const piecePool: HTMLElement[] = [];
  const spawning = new Set<number>();
  let spawnSlideRaf = 0;
  let lastSpawnAnimKey = '';

  const makePieceEl = () => {
    const el = document.createElement('div');
    el.className = 'piece';
    el.style.cssText =
      `position:absolute;left:0;top:0;touch-action:none;cursor:grab;user-select:none;will-change:transform,width,height,opacity;border-radius:${PIECE_RADIUS}px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;color:rgba(107,101,120,0.62);box-sizing:border-box;`;
    return el;
  };

  const acquirePieceEl = () => {
    const el = piecePool.pop() ?? makePieceEl();
    el.style.display = 'flex';
    el.className = 'piece';
    return el;
  };

  const releasePieceEl = (el: HTMLElement) => {
    el.classList.remove('piece-reject', 'piece-spawn');
    el.style.display = 'none';
    el.style.transform = '';
    el.style.opacity = '1';
    el.dataset.label = '';
    el.dataset.mode = '';
    piecePool.push(el);
  };
  const push = createPushPreview({
    cell,
    inset: CELL_INSET,
    pieceEls,
    getModel: () => api.get(),
  });

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

    // Same left/top as idle — switching to translate3d on commit twitches the board.
    if (opts.motionOnly) {
      if (!spawning.has(p.id)) {
        const left = p.x * cell + CELL_INSET;
        const top = p.y * cell + CELL_INSET;
        const pw = p.w * cell - CELL_INSET * 2;
        const ph = p.h * cell - CELL_INSET * 2;
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.style.width = `${pw}px`;
        el.style.height = `${ph}px`;
      }
      if (!spawning.has(p.id)) {
        el.style.transform = sc !== 1 ? `scale(${sc})` : '';
        el.style.opacity = String(p.opacity ?? 1);
      }
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

    if (!spawning.has(p.id)) {
      el.style.left = `${p.x * cell + CELL_INSET}px`;
      el.style.top = `${p.y * cell + CELL_INSET}px`;
      el.style.width = `${p.w * cell - CELL_INSET * 2}px`;
      el.style.height = `${p.h * cell - CELL_INSET * 2}px`;
      el.style.transform = sc !== 1 ? `scale(${sc})` : '';
    }
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
    el.style.borderRadius = `${PIECE_RADIUS}px`;
    el.style.display = 'block';
    el.style.fontWeight = '800';
    el.style.fontSize = `${Math.max(12, Math.min(22, cell * 0.4))}px`;
    el.style.color = 'rgba(107,101,120,0.62)';
    if (!spawning.has(p.id)) {
      el.style.opacity = String(p.opacity ?? 1);
    }
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

    if (!spawning.has(p.id)) {
      el.classList.remove('piece-spawn');
    }
  };

  const syncPieces = (
    list: VisualPiece[] | Piece[],
    flashIds: number[],
    motionOnly: boolean,
  ) => {
    void flashIds;
    const live = new Set(list.map((p) => p.id));
    const hold = push.holdIds();
    for (const [id, el] of pieceEls) {
      if (!live.has(id)) {
        if (hold?.has(id)) continue;
        releasePieceEl(el);
        pieceEls.delete(id);
      }
    }
    for (const p of list) {
      let el = pieceEls.get(p.id);
      if (!el) {
        el = acquirePieceEl();
        piecesLayer.appendChild(el);
        pieceEls.set(p.id, el);
        // first paint full
        paintPiece(el, p, {
          pushed: (p as VisualPiece).pushed,
          growing: (p as VisualPiece).growing,
          motionOnly: false,
        });
        continue;
      }
      if (hold?.has(p.id)) continue;
      const vp = p as VisualPiece;
      paintPiece(el, p, {
        pushed: vp.pushed,
        growing: vp.growing,
        motionOnly,
      });
    }
  };

  let lastStatusKey = '';
  let lastRejectNonce = -1;

  const playSpawnSlide = (g: GameModel) => {
    const ids = g.spawnFlashIds;
    if (ids.length === 0) {
      lastSpawnAnimKey = '';
      return;
    }
    const key = spawnEnterKey(ids, g.spawnFromDx, g.spawnFromDy);
    if (key === lastSpawnAnimKey) return;
    lastSpawnAnimKey = key;
    if (spawnSlideRaf) cancelAnimationFrame(spawnSlideRaf);

    const plan = planSpawnEnter(
      g.board.pieces,
      ids,
      g.spawnFromDx,
      g.spawnFromDy,
    );
    const live = plan.items
      .map((it) => {
        const el = pieceEls.get(it.id);
        return el ? { it, el } : null;
      })
      .filter((x): x is { it: (typeof plan.items)[0]; el: HTMLElement } => !!x);

    const easeOut = (t: number) => {
      const u = 1 - Math.min(1, Math.max(0, t));
      return 1 - u * u * u;
    };

    const plant = (
      it: (typeof plan.items)[0],
      el: HTMLElement,
      k: number,
    ) => {
      const x = it.fromX + (it.toX - it.fromX) * k;
      const y = it.fromY + (it.toY - it.fromY) * k;
      el.style.left = `${x * cell + CELL_INSET}px`;
      el.style.top = `${y * cell + CELL_INSET}px`;
      el.style.width = `${it.w * cell - CELL_INSET * 2}px`;
      el.style.height = `${it.h * cell - CELL_INSET * 2}px`;
      el.style.transform = '';
      el.style.opacity = String(0.62 + 0.38 * k);
      el.style.zIndex = String(it.z);
    };

    const t0 = performance.now();
    for (const row of live) {
      spawning.add(row.it.id);
      plant(row.it, row.el, 0);
    }

    const tick = (now: number) => {
      spawnSlideRaf = 0;
      const k = easeOut((now - t0) / plan.duration);
      const u = Math.max(0, Math.min(1, k));
      for (const row of live) plant(row.it, row.el, u);
      if (u < 1) {
        spawnSlideRaf = requestAnimationFrame(tick);
        return;
      }
      for (const row of live) {
        plant(row.it, row.el, 1);
        row.el.style.opacity = '1';
        spawning.delete(row.it.id);
      }
    };
    spawnSlideRaf = requestAnimationFrame(tick);
  };

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
    if (g.spawnFlashIds.length) {
      const peek = `${g.spawnFlashIds.join(',')}|${g.spawnFromDx},${g.spawnFromDy}`;
      if (peek !== lastSpawnAnimKey) {
        for (const id of g.spawnFlashIds) spawning.add(id);
      }
    }
    if (g.visualPieces) {
      const seen = new Set(g.visualPieces.map((p) => p.id));
      const extras = g.board.pieces.filter((p) => !seen.has(p.id));
      syncPieces(
        extras.length ? [...g.visualPieces, ...extras] : g.visualPieces,
        g.spawnFlashIds,
        motionOnly,
      );
    } else {
      syncPieces(g.board.pieces, g.spawnFlashIds, false);
    }
    playSpawnSlide(g);
    if (!g.lifted && dragEl && !dragging) {
      dragEl.style.display = 'none';
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
    push.onRender(g, lastGrowCells);


    // Avoid layout thrash: status text only when changed
    const won = g.status === 'won';
    winLayer.hidden = !won;
    if (won) {
      const title = winLayer.querySelector('#win-title');
      const sub = winLayer.querySelector('#win-sub');
      if (title) title.textContent = `第 ${g.wave} 关`;
      if (sub) {
        sub.textContent =
          g.unlockedColors < 5
            ? '单色满屏 64'
            : '单色满屏 64';
      }
    }
    const phase =
      g.status === 'dead'
        ? '失败'
        : g.status === 'won'
          ? '胜利'
          : g.animating
            ? '动画中'
            : '进行中';
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

  let dragging = false;
  let dragEl: HTMLElement | null = null;

  const unsub = api.subscribe(render);

  panel.querySelector('#btn-restart')!.addEventListener('click', () => {
    api.restart();
  });
  panel.querySelector('#btn-next-wave')?.addEventListener('click', () => {
    api.nextLevel();
  });
  winLayer.querySelector('#btn-win-next')?.addEventListener('click', () => {
    api.nextLevel();
  });
  winLayer.querySelector('#btn-win-retry')?.addEventListener('click', () => {
    api.restart();
  });
  panel.querySelector('#btn-debug')?.addEventListener('click', () => {
    api.loadDebug();
  });

  // ——— Drag: hit-test lift · continuous proposal · commit same rules ———
  let pieceStart = { x: 0, y: 0, w: 1, h: 1, value: 1, color: 0, id: 0 };
  let liftScale = 1;
  let liftRaf = 0;
  let dropSnapRaf = 0;
  let lastProposal: DropProposal | null = null;

  /** Finger offset so block sits above touch (design px). FINDINGS 12–20 */
  const FINGER_OFFSET_Y = 16;

  const designScratch = { x: 0, y: 0 };
  const toDesign = (clientX: number, clientY: number) => {
    const layout = getStageLayout();
    if (!layout) return null;
    const stageRect = stage.getBoundingClientRect();
    designScratch.x = (clientX - stageRect.left) / layout.scale;
    designScratch.y = (clientY - stageRect.top) / layout.scale;
    return designScratch;
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

  let lastPropPaintKey = '';

  const paintProposal = (prop: DropProposal | null, _A: { w: number; h: number }) => {
    if (!prop) {
      lastPropPaintKey = '';
      proposalEl.style.display = 'none';
      targetRingEl.style.display = 'none';
      mergeShapeEl.style.display = 'none';
      stopTStarAnim();
      push.back();
      return;
    }
    const T = prop.mergeTarget;
    const paintKey = `${prop.kind}|${prop.targetId}|${prop.ghost.x},${prop.ghost.y}|${T ? `${T.x},${T.y},${T.w},${T.h}` : ''}|${prop.growDirX ?? 0},${prop.growDirY ?? 0}|${prop.locked ? 1 : 0}`;
    if (paintKey === lastPropPaintKey) return;
    lastPropPaintKey = paintKey;
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
      mergeShapeEl.style.opacity = '0.5';
      mergeShapeEl.style.transition = '';
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
        const growMs = growCells * cellMs();
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
          if (items.length) push.toward(items, key, t0, growMs);
          else push.back();
        }
      }
    } else {
      mergeShapeEl.style.display = 'none';
      stopTStarAnim();
      push.back();
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
    if (stepped.haptic === 'attach') void haptics.impact('light', 12);
    else if (stepped.haptic === 'detach') void haptics.selection(4);

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
      const ways = lastProposal.mergeUniqueWays ?? 0;
      if (
        lastProposal.kind === 'merge' &&
        lastProposal.mergeTarget &&
        lastProposal.targetId === phaseState.lockedTargetId &&
        ways === 1
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
      } else if (ways > 1) {
        stickyMerge = null;
      }
      if (stickyMerge && ways === 1) {
        lastProposal = {
          ...lastProposal,
          kind: 'merge',
          targetId: stickyMerge.targetId,
          mergeTarget: stickyMerge.T,
          mergeUniqueWays: 1,
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
    lastDragLeft = left;
    lastDragTop = top;
    dragEl.style.left = '0';
    dragEl.style.top = '0';
    dragEl.style.width = `${aW}px`;
    dragEl.style.height = `${aH}px`;
    dragEl.style.transform = `translate3d(${left}px,${top}px,0) scale(${scale})`;
    dragEl.style.transformOrigin = 'center center';

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
  let lastDragLeft = 0;
  let lastDragTop = 0;
  let liftDesign = { x: 0, y: 0 };
  let pointerId = -1;
  let dragMoveRaf = 0;

  const onPointerDown = (e: PointerEvent) => {
    const g = api.get();
    if (g.status === 'dead' || g.status === 'won' || g.lifted) return;

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
    const skip = new Set(g.busyIds);
    const hitVis = hitTestPiece(
      g.visualPieces ? { pieces: g.visualPieces } : g.board,
      localX,
      localY,
      cell,
      8,
      skip,
    );
    if (!hitVis) return;
    const hit = g.board.pieces.find((p) => p.id === hitVis.id);
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
    lastDesign = { x: d.x, y: d.y };
    liftDesign = { x: d.x, y: d.y };
    {
      const lifted = api.get().lifted ?? hit;
      const aim = aimBoardLocal(d.x, d.y);
      const F = fingerRectFromAim(
        aim.x / cell,
        aim.y / cell,
        pieceStart.w,
        pieceStart.h,
      );
      phaseState = beginLiftPhase(d.x, d.y, api.get().board, lifted, F);
      stickyMerge = null;
      pendingSwitch = null;
    }

    if (!dragEl) {
      dragEl = document.createElement('div');
      dragEl.className = 'piece piece-dragging';
      dragEl.style.cssText = `
        position:absolute; pointer-events:none; z-index:3000;
        border-radius:${PIECE_RADIUS}px; display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        font-weight:800; color:#0f172a; box-sizing:border-box;
        will-change:transform;
      `;
      dragLayer.appendChild(dragEl);
    }
    dragEl.style.display = 'flex';
    dragEl.style.boxShadow =
      '0 16px 28px rgba(var(--piece-shadow),0.26), 0 0 0 1px rgba(255,255,255,0.32)';
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
    liftScale = 1;
    placeDragEl(d.x, d.y, 1);
    updateProposalFromDesign(d.x, d.y);
    animateLift(1, 1.08, 100);

    boardRoot.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const flushDragMove = () => {
    dragMoveRaf = 0;
    if (!dragging || !dragEl) return;
    const d = lastDesign;
    updateProposalFromDesign(d.x, d.y);
    const snap =
      phaseState.phase === 'locked' && lastProposal?.kind === 'merge'
        ? lastProposal.ghost
        : null;
    placeDragEl(d.x, d.y, liftScale, snap);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging || !dragEl) return;
    const d = toDesign(e.clientX, e.clientY);
    if (!d) return;
    lastDesign.x = d.x;
    lastDesign.y = d.y;
    if (!dragMoveRaf) dragMoveRaf = requestAnimationFrame(flushDragMove);
  };

  const finishDrop = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (dragMoveRaf) {
      cancelAnimationFrame(dragMoveRaf);
      dragMoveRaf = 0;
    }
    const raw = toDesign(e.clientX, e.clientY);
    if (raw) {
      lastDesign.x = raw.x;
      lastDesign.y = raw.y;
    }
    const d = lastDesign;
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
    if (frozenProp?.kind === 'merge' && push.itemCount) {
      push.setPendingCommit(true);
    }
    resetDragPhase();
    hideFusion();

    // Snap floating piece to proposal rect, then commit frozen frame
    const t0 = performance.now();
    const startScale = liftScale;
    const fromLeft = dragEl ? lastDragLeft : cellPos.x * cell;
    const fromTop = dragEl ? lastDragTop : cellPos.y * cell;
    const toLeft = cellPos.x * cell + 2;
    const toTop = cellPos.y * cell + 2;

    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / 120);
      const ease = 1 - (1 - u) * (1 - u);
      liftScale = startScale + (1 - startScale) * ease;
      if (dragEl) {
        const x = fromLeft + (toLeft - fromLeft) * ease;
        const y = fromTop + (toTop - fromTop) * ease;
        dragEl.style.left = '0';
        dragEl.style.top = '0';
        dragEl.style.transform = `translate3d(${x}px,${y}px,0) scale(${liftScale})`;
      }
      if (u < 1) {
        dropSnapRaf = requestAnimationFrame(tick);
        return;
      }
      lastProposal = null;
      api.dropAt(cellPos, designDx, designDy, frozenProp);
      const stillHeld = !!api.get().lifted;
      if (stillHeld && dragEl) {
        dragEl.style.display = 'flex';
      } else if (dragEl) {
        dragEl.style.display = 'none';
      }
      paintProposal(null, pieceStart);
      mergeShapeEl.style.display = 'none';
      mergeShapeEl.style.opacity = '0.5';
      mergeShapeEl.style.transition = '';
      if (push.pendingCommit && !api.get().animating) {
        push.setPendingCommit(false);
        push.back();
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
      if (dragMoveRaf) cancelAnimationFrame(dragMoveRaf);
      if (spawnSlideRaf) cancelAnimationFrame(spawnSlideRaf);
      stopTStarAnim();
      push.destroy();
      boardRoot.remove();
      uiRoot.innerHTML = '';
    },
  };
}
