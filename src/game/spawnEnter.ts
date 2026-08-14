/**
 * Fill enter: from the emptied rim, along a clear lane, as a rigid train.
 * One clock per clip — pieces never overtake.
 */
import { tweaks } from './tweaks';
import type { Piece } from './types';
import { GRID_SIZE } from './types';

export type Side = { sx: number; sy: number };

export type SpawnEnterItem = {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  w: number;
  h: number;
  z: number;
};

export type SpawnEnterPlan = {
  items: SpawnEnterItem[];
  duration: number;
};

const pad = () => tweaks.spawnPad;
const msPerCell = () => tweaks.spawnMsPerCell;
const msMin = () => Math.max(200, tweaks.spawnMsPerCell * 4);

function overlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return !(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay);
}

function probeStart(p: Piece, s: Side): { x: number; y: number } {
  const d = pad();
  if (s.sx < 0) return { x: -p.w - d, y: p.y };
  if (s.sx > 0) return { x: GRID_SIZE + d, y: p.y };
  if (s.sy < 0) return { x: p.x, y: -p.h - d };
  return { x: p.x, y: GRID_SIZE + d };
}

function laneClear(
  fromX: number,
  fromY: number,
  p: Piece,
  blockers: Piece[],
): boolean {
  const x = Math.min(fromX, p.x);
  const y = Math.min(fromY, p.y);
  const w = Math.abs(fromX - p.x) + p.w;
  const h = Math.abs(fromY - p.y) + p.h;
  for (const b of blockers) {
    if (overlap(x, y, w, h, b.x, b.y, b.w, b.h)) return false;
  }
  return true;
}

function sideList(px: number, py: number): Side[] {
  const raw: Side[] = [
    { sx: px, sy: py },
    { sx: 0, sy: -1 },
    { sx: 0, sy: 1 },
    { sx: -1, sy: 0 },
    { sx: 1, sy: 0 },
  ];
  const seen = new Set<string>();
  const out: Side[] = [];
  for (const s of raw) {
    if (s.sx === 0 && s.sy === 0) continue;
    const k = `${s.sx},${s.sy}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function pickSide(p: Piece, sides: Side[], blockers: Piece[]): Side | null {
  for (const s of sides) {
    const from = probeStart(p, s);
    if (laneClear(from.x, from.y, p, blockers)) return s;
  }
  return null;
}

function laneKey(p: Piece, s: Side): string {
  if (s.sy !== 0) return `v:${s.sx},${s.sy}:${p.x}:${p.w}`;
  if (s.sx !== 0) return `h:${s.sx},${s.sy}:${p.y}:${p.h}`;
  return `in:${p.id}`;
}

/** Shift a dest-group so its leading edge sits just outside the rim. */
function groupShift(ps: Piece[], s: Side): { dx: number; dy: number } {
  const d = pad();
  if (s.sy < 0) {
    const minY = Math.min(...ps.map((p) => p.y));
    return { dx: 0, dy: -d - minY };
  }
  if (s.sy > 0) {
    const maxY = Math.max(...ps.map((p) => p.y + p.h));
    return { dx: 0, dy: GRID_SIZE + d - maxY };
  }
  if (s.sx < 0) {
    const minX = Math.min(...ps.map((p) => p.x));
    return { dx: -d - minX, dy: 0 };
  }
  if (s.sx > 0) {
    const maxX = Math.max(...ps.map((p) => p.x + p.w));
    return { dx: GRID_SIZE + d - maxX, dy: 0 };
  }
  return { dx: 0, dy: 0 };
}

export function planSpawnEnter(
  boardPieces: Piece[],
  spawnIds: number[],
  pushDx: number,
  pushDy: number,
): SpawnEnterPlan {
  const spawnSet = new Set(spawnIds);
  const blockers = boardPieces.filter((p) => !spawnSet.has(p.id));
  let px = pushDx || 0;
  let py = pushDy || 0;
  if (px === 0 && py === 0) py = -1;
  const sides = sideList(px, py);
  const preferred: Side = sides[0] ?? { sx: 0, sy: -1 };

  const incoming: { p: Piece; s: Side }[] = [];
  for (const id of spawnIds) {
    const p = boardPieces.find((q) => q.id === id);
    if (!p) continue;
    incoming.push({ p, s: pickSide(p, sides, blockers) ?? { sx: 0, sy: 0 } });
  }

  const groups = new Map<string, Piece[]>();
  const sideOf = new Map<number, Side>();
  for (const { p, s } of incoming) {
    sideOf.set(p.id, s);
    const k = laneKey(p, s);
    const list = groups.get(k);
    if (list) list.push(p);
    else groups.set(k, [p]);
  }

  const items: SpawnEnterItem[] = [];
  let maxTravel = 0;
  for (const list of groups.values()) {
    const s = sideOf.get(list[0]!.id) ?? preferred;
    const { dx, dy } = groupShift(list, s);
    maxTravel = Math.max(maxTravel, Math.abs(dx), Math.abs(dy));
    for (const p of list) {
      items.push({
        id: p.id,
        fromX: p.x + dx,
        fromY: p.y + dy,
        toX: p.x,
        toY: p.y,
        w: p.w,
        h: p.h,
        z: Math.round((p.y + p.h) * 10) + 80,
      });
    }
  }

  return {
    items,
    duration: Math.max(msMin(), maxTravel * msPerCell()),
  };
}

export function spawnEnterKey(
  ids: number[],
  pushDx: number,
  pushDy: number,
): string {
  return `${ids.join(',')}|${pushDx},${pushDy}`;
}
