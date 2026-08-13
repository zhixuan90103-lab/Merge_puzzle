/**
 * Push-preview director. Design: docs/DESIGN_PREVIEW.md
 * toward / back / pin-on-board / fly-out-off-board.
 */
import { CELL_MS } from './timeline';
import type { GameModel } from './game';
import type { PushPreviewItem } from './dropResolve';

export type Rect = { x: number; y: number; w: number; h: number };

export type PushPrev = PushPreviewItem & {
  flyFrom?: Rect;
  flyTo?: Rect;
  startOp?: number;
};

export type PushPreviewHost = {
  cell: number;
  inset: number;
  pieceEls: Map<number, HTMLElement>;
  getModel: () => GameModel;
};

const easeOutCubic = (t: number) => {
  const u = 1 - Math.max(0, Math.min(1, t));
  return 1 - u * u * u;
};

const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  w: a.w + (b.w - a.w) * t,
  h: a.h + (b.h - a.h) * t,
});

export function stillOnBoard(r: Rect): boolean {
  return r.x < 8 && r.x + r.w > 0 && r.y < 8 && r.y + r.h > 0;
}

export function innerOutDepth(r: Rect): number {
  if (stillOnBoard(r)) return 0;
  let d = Infinity;
  if (r.x >= 8) d = Math.min(d, r.x - 8);
  if (r.x + r.w <= 0) d = Math.min(d, -(r.x + r.w));
  if (r.y >= 8) d = Math.min(d, r.y - 8);
  if (r.y + r.h <= 0) d = Math.min(d, -(r.y + r.h));
  return Number.isFinite(d) ? d : 0;
}

export function opacityForRect(r: Rect): number {
  const d = innerOutDepth(r);
  if (d <= 0) return 0.8;
  return Math.max(0.38, 0.68 - d * 0.1);
}

export function pushAxis(items: { rest: Rect; dest: Rect }[]) {
  let sx = 0;
  let sy = 0;
  for (const it of items) {
    sx += it.dest.x - it.rest.x;
    sy += it.dest.y - it.rest.y;
  }
  const horiz = Math.abs(sx) >= Math.abs(sy);
  const sign = horiz ? Math.sign(sx) || 1 : Math.sign(sy) || 1;
  return { horiz, sign };
}

/** Rigid-translate leaving pieces; keep on-board relative layout. */
export function spreadPushChain(items: PushPrev[]): void {
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
}

export function createPushPreview(host: PushPreviewHost) {
  const { cell, inset, pieceEls, getModel } = host;

  let items: PushPrev[] = [];
  let key = '';
  let u = 0;
  let fromU = 0;
  let toU = 0;
  let t0 = 0;
  let dur = CELL_MS;
  let raf = 0;
  let frozen = false;
  let fly = false;
  let pendingCommit = false;
  const pinned = new Map<number, Rect>();

  const plant = (item: PushPrev, at: Rect, opacity: number) => {
    const el = pieceEls.get(item.id);
    if (!el) return;
    el.style.left = `${at.x * cell + inset}px`;
    el.style.top = `${at.y * cell + inset}px`;
    el.style.width = `${at.w * cell - inset * 2}px`;
    el.style.height = `${at.h * cell - inset * 2}px`;
    el.style.transform = '';
    el.style.opacity = String(opacity);
  };

  const apply = (uu: number, solid: boolean) => {
    for (const item of items) {
      const el = pieceEls.get(item.id);
      if (!el) continue;
      if (fly && item.flyFrom && item.flyTo) {
        const r = lerpRect(item.flyFrom, item.flyTo, uu);
        plant(item, r, (item.startOp ?? 0.7) * (1 - Math.min(1, uu / 0.78)));
        continue;
      }
      plant(item, lerpRect(item.rest, item.dest, uu), solid ? 1 : opacityForRect(lerpRect(item.rest, item.dest, uu)));
    }
  };

  const finishFly = (g: GameModel) => {
    fly = false;
    frozen = false;
    pendingCommit = false;
    for (const item of items) {
      const still = g.board.pieces.find((p) => p.id === item.id);
      const el = pieceEls.get(item.id);
      if (!still) {
        el?.remove();
        pieceEls.delete(item.id);
      } else if (el) {
        plant(item, { x: still.x, y: still.y, w: still.w, h: still.h }, 1);
      }
    }
    items = [];
    key = '';
    u = 0;
  };

  const tick = (now: number) => {
    raf = 0;
    const raw = Math.min(1, (now - t0) / Math.max(1, dur));
    const e = toU === 0 && !fly ? raw : easeOutCubic(raw);
    u = fromU + (toU - fromU) * e;
    apply(u, frozen);
    if (raw < 1) {
      raf = requestAnimationFrame(tick);
      return;
    }
    if (toU === 0 && !fly) {
      for (const item of items) plant(item, item.rest, 1);
      items = [];
      key = '';
      u = 0;
    }
    if (fly && raw >= 1 && !getModel().animating) {
      finishFly(getModel());
    }
  };

  return {
    get pendingCommit() {
      return pendingCommit;
    },
    setPendingCommit(v: boolean) {
      pendingCommit = v;
    },
    get flying() {
      return fly;
    },
    get itemCount() {
      return items.length;
    },
    holdIds(): Set<number> | null {
      if (!fly && !pendingCommit && pinned.size === 0) return null;
      return new Set([...items.map((it) => it.id), ...pinned.keys()]);
    },
    toward(next: PushPrev[], nextKey: string, startAt?: number, duration?: number) {
      if (nextKey === key && toU === 1) return;
      const keep = new Set(next.map((it) => it.id));
      for (const old of items) {
        if (!keep.has(old.id)) plant(old, old.rest, 1);
      }
      const same = nextKey === key;
      spreadPushChain(next);
      items = next;
      key = nextKey;
      fromU = same ? u : 0;
      toU = 1;
      dur = duration ?? CELL_MS;
      t0 = startAt ?? performance.now();
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    },
    back() {
      if (pendingCommit || fly) return;
      if (items.length === 0) {
        u = 0;
        key = '';
        return;
      }
      fromU = u;
      toU = 0;
      dur = 48;
      t0 = performance.now();
      key = '';
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    },
    flyOut(growCells: number) {
      if (fly || items.length === 0) return;
      const stay: PushPrev[] = [];
      const leave: PushPrev[] = [];
      for (const item of items) {
        if (item.off || !stillOnBoard(item.dest)) leave.push(item);
        else stay.push(item);
      }
      for (const item of stay) {
        pinned.set(item.id, item.dest);
        plant(item, item.dest, 1);
      }
      if (leave.length === 0) {
        items = [];
        key = '';
        u = 0;
        return;
      }
      items = leave;
      fly = true;
      const { horiz, sign } = pushAxis(leave);
      const extra = growCells;
      for (const item of leave) {
        const cur = lerpRect(item.rest, item.dest, u);
        item.flyFrom = cur;
        item.flyTo = {
          x: item.dest.x + (horiz ? sign * extra : 0),
          y: item.dest.y + (horiz ? 0 : sign * extra),
          w: item.dest.w,
          h: item.dest.h,
        };
        item.startOp = opacityForRect(cur);
      }
      fromU = 0;
      toU = 1;
      dur = growCells * CELL_MS;
      t0 = performance.now();
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    },
    onRender(g: GameModel, growCells = 1) {
      if (g.animating && items.length && !fly) {
        frozen = true;
        this.flyOut(Math.max(1, growCells));
      } else if (fly) {
        apply(u, false);
        if (!g.animating && u >= 1) finishFly(g);
      } else if (items.length) {
        apply(u, false);
      }
      for (const [id, dest] of pinned) {
        const el = pieceEls.get(id);
        if (!el) continue;
        el.style.left = `${dest.x * cell + inset}px`;
        el.style.top = `${dest.y * cell + inset}px`;
        el.style.width = `${dest.w * cell - inset * 2}px`;
        el.style.height = `${dest.h * cell - inset * 2}px`;
        el.style.transform = '';
        el.style.opacity = '1';
      }
      if (!g.animating && !fly) {
        pinned.clear();
        if (!items.length) {
          frozen = false;
          pendingCommit = false;
        }
      }
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
    },
  };
}

export type PushPreviewController = ReturnType<typeof createPushPreview>;
