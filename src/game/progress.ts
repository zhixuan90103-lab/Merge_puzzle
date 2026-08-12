import { MAX_COLORS } from './types';

/**
 * Color unlock by wave (not +1 every clear):
 * 1–3: 2 色 · 4–5: 3 色 · 6–7: 4 色 · 8+: 5 色
 */
export function unlockedColorsForWave(wave: number): number {
  const w = Math.max(1, Math.floor(wave));
  if (w <= 3) return 2;
  if (w <= 5) return 3;
  if (w <= 7) return 4;
  return MAX_COLORS;
}

/**
 * Relative spawn weights per color index (0 = primary).
 * - 第2关：副色很低
 * - 第3关：副色升高
 * - 第4关起：最新解锁色偏低
 */
export function colorSpawnWeights(wave: number, unlockedColors: number): number[] {
  const u = Math.max(1, Math.min(MAX_COLORS, Math.floor(unlockedColors)));
  const w = Math.max(1, Math.floor(wave));

  if (u === 1) return [1];

  if (u === 2) {
    if (w <= 1) return [0.9, 0.1]; // 第1关：副色极少出（盘上已有教学块）
    if (w === 2) return [0.88, 0.12]; // 第2关：副色远低于主色
    return [0.6, 0.4]; // 第3关：副色频率上来
  }

  if (u === 3) {
    // 第4–5关：第3色是新色，权重低
    if (w <= 4) return [0.55, 0.32, 0.13];
    return [0.45, 0.33, 0.22];
  }

  if (u === 4) {
    // 最新色最低
    if (w <= 6) return [0.42, 0.28, 0.18, 0.12];
    return [0.35, 0.28, 0.22, 0.15];
  }

  // 5 色
  return [0.3, 0.24, 0.18, 0.15, 0.13];
}

export function pickWeightedColor(weights: number[]): number {
  const total = weights.reduce((s, x) => s + x, 0);
  if (total <= 0) return 0;
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/** Weighted pick among candidate color indices. */
export function pickWeightedAmong(candidates: number[], weights: number[]): number {
  if (candidates.length === 0) return pickWeightedColor(weights);
  if (candidates.length === 1) return candidates[0]!;
  const w = candidates.map((c) => Math.max(0.001, weights[c] ?? 0.001));
  const total = w.reduce((s, x) => s + x, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= w[i]!;
    if (r <= 0) return candidates[i]!;
  }
  return candidates[candidates.length - 1]!;
}

/**
 * Spawn only colors still on the board (exile loop).
 * Push a color fully off → it leaves the spawn pool until next wave deal.
 * Wave `unlocked` is only the cap for deals / max palette.
 */
export function colorsPresentOnBoard(
  pieces: { color: number }[],
  unlockedColors: number,
): number[] {
  const u = Math.max(1, Math.min(MAX_COLORS, Math.floor(unlockedColors)));
  const set = new Set<number>();
  for (const p of pieces) {
    if (p.color >= 0 && p.color < u) set.add(p.color);
  }
  if (set.size === 0) {
    // Empty / post-clear edge: fall back to primary
    return [0];
  }
  return [...set].sort((a, b) => a - b);
}

/** Wave weights masked to colors still on board (zeros out exiled colors). */
export function boardActiveColorWeights(
  wave: number,
  unlockedColors: number,
  presentColors: number[],
): number[] {
  const base = colorSpawnWeights(wave, unlockedColors);
  const u = base.length;
  const weights = new Array(u).fill(0);
  if (presentColors.length === 0) {
    weights[0] = 1;
    return weights;
  }
  for (const c of presentColors) {
    if (c >= 0 && c < u) weights[c] = Math.max(0.001, base[c] ?? 0.2);
  }
  // Mono-color board → 100% that color (main-color clear path)
  if (presentColors.length === 1) {
    const only = presentColors[0]!;
    for (let i = 0; i < u; i++) weights[i] = i === only ? 1 : 0;
  }
  return weights;
}
