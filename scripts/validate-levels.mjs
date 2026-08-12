/**
 * 关卡自动校验 + 难度估计
 *
 * 难度（解法越多越简单）：
 *   firstExileMoves = 能减少异色占格的「首手」数量（可合对 × 方向）
 *   - 0 且有异色：可能需要多步，用 BFS 再验能否清异色
 *   - 1–2：hard(3★)
 *   - 3–6：medium(2★)
 *   - 7+：easy(1★)
 *
 * 用法: npm run validate:levels
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

async function load() {
  const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);
  const deal = await imp('src/game/deal.ts');
  const board = await imp('src/game/board.ts');
  const deadlock = await imp('src/game/deadlock.ts');
  const merge = await imp('src/game/merge.ts');
  const shapes = await imp('src/game/shapes.ts');
  const progress = await imp('src/game/progress.ts');
  return { ...deal, ...board, ...deadlock, ...merge, ...shapes, ...progress };
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function enemyMass(b) {
  return b.pieces.filter((p) => p.color !== 0).reduce((s, p) => s + p.value, 0);
}

function layoutOk(b, boardArea) {
  if (boardArea(b) !== 64) return 'area';
  const g = Array.from({ length: 8 }, () => Array(8).fill(-1));
  for (const p of b.pieces) {
    if (p.w * p.h !== p.value) return 'value';
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        if (x < 0 || y < 0 || x >= 8 || y >= 8) return 'oob';
        if (g[y][x] !== -1) return 'overlap';
        g[y][x] = p.id;
      }
    }
  }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (g[y][x] < 0) return 'hole';
  return null;
}

function countFirstExileMoves(b, api) {
  const startE = enemyMass(b);
  if (startE === 0) return { n: -1, startE: 0 };
  let n = 0;
  const pieces = b.pieces;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = 0; j < pieces.length; j++) {
      if (i === j || !api.canMergePair(pieces[i], pieces[j])) continue;
      for (const [dx, dy] of DIRS) {
        const r = api.tryMerge(
          api.cloneBoard(b),
          pieces[i].id,
          pieces[j].id,
          api.trendFromApproachDelta(dx, dy),
        );
        if (r.ok && enemyMass(r.board) < startE) n++;
      }
    }
  }
  return { n, startE };
}

/** Pure-merge BFS (no fill) — faster. Clear = enemy mass 0. */
function canClear(b0, api, maxDepth = 7, maxNodes = 600) {
  const startE = enemyMass(b0);
  if (startE === 0) return { ok: true, depth: 0, nodes: 1, bestE: 0 };

  const q = [{ b: b0, d: 0 }];
  let qi = 0;
  let bestE = startE;
  const seen = new Set();
  const sig = (b) =>
    b.pieces
      .map((p) => `${p.color}${p.value}@${p.x},${p.y},${p.w}x${p.h}`)
      .sort()
      .join(';');
  seen.add(sig(b0));

  while (qi < q.length && q.length < maxNodes) {
    const { b, d } = q[qi++];
    const e = enemyMass(b);
    if (e < bestE) bestE = e;
    if (e === 0) return { ok: true, depth: d, nodes: q.length, bestE: 0 };
    if (d >= maxDepth) continue;

    for (let i = 0; i < b.pieces.length; i++) {
      for (let j = 0; j < b.pieces.length; j++) {
        if (i === j || !api.canMergePair(b.pieces[i], b.pieces[j])) continue;
        for (const [dx, dy] of DIRS) {
          const r = api.tryMerge(
            api.cloneBoard(b),
            b.pieces[i].id,
            b.pieces[j].id,
            api.trendFromApproachDelta(dx, dy),
          );
          if (!r.ok) continue;
          // Prefer branches that reduce enemy or free cells
          const s = sig(r.board);
          if (seen.has(s)) continue;
          seen.add(s);
          q.push({ b: r.board, d: d + 1 });
        }
      }
    }
  }
  return { ok: bestE === 0, depth: -1, nodes: q.length, bestE };
}

function tier(firstMoves, startE) {
  if (startE === 0) return 'mono';
  if (firstMoves <= 0) return 'deep/hard';
  if (firstMoves <= 2) return 'hard★★★';
  if (firstMoves <= 6) return 'medium★★';
  return 'easy★';
}

async function main() {
  const api = await load();
  console.log('=== Level validation (解法越多越简单) ===\n');

  let fail = 0;
  for (let w = 1; w <= 9; w++) {
    const u = api.unlockedColorsForWave(w);
    let b;
    try {
      b = api.dealOpening(u, w);
    } catch (e) {
      console.log(`FAIL W${w} throw ${e.message}`);
      fail++;
      continue;
    }
    const err = layoutOk(b, api.boardArea);
    if (err) {
      console.log(`FAIL W${w} layout ${err}`);
      fail++;
      continue;
    }
    if (!api.isPlayable(b) || api.isDeadlock(b) || api.isForcedLoss(b)) {
      console.log(`FAIL W${w} start unplayable/dead/forced`);
      fail++;
      continue;
    }

    const { n: first, startE } = countFirstExileMoves(b, api);
    const clear = canClear(b, api);
    const ok = startE === 0 || clear.ok || clear.bestE < startE;
    // Require full enemy clear for waves 1-7; later allow partial if progress
    const requireFull = w <= 7;
    const pass = requireFull ? clear.ok : ok;
    if (!pass) fail++;

    console.log(
      `${pass ? 'OK' : 'FAIL'} W${w} enemy=${startE} firstExileMoves=${first} clearable=${clear.ok} bestE=${clear.bestE} depth=${clear.depth} ${tier(first, startE)}`,
    );
  }

  // Regression: two 32s must not be forced loss
  const t = api.emptyBoard();
  const id = () => {
    /* use deal pieces */
  };
  // quick via deal debug
  const d = api.dealDebugNear64(1);
  // manual two 32
  const { emptyBoard, upsertPiece, allocId } = api;
  const two = emptyBoard();
  upsertPiece(two, { id: allocId(two), value: 32, color: 0, x: 0, y: 0, w: 4, h: 8 });
  upsertPiece(two, { id: allocId(two), value: 32, color: 0, x: 4, y: 0, w: 4, h: 8 });
  if (api.isForcedLoss(two)) {
    console.log('FAIL regression: two 32s marked forced loss');
    fail++;
  } else {
    console.log('OK regression: two 32s is live (can merge to 64)');
  }

  console.log(fail === 0 ? '\nAll checks passed.' : `\n${fail} failure(s).`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
