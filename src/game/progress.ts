import { MAX_COLORS } from './types';

/**
 * Color unlock by wave（5 关教学阶梯后再加色）:
 * 1–4: 2 色 · 5–6: 3 色 · 7–8: 4 色 · 9+: 5 色
 */
export function unlockedColorsForWave(wave: number): number {
  const w = Math.max(1, Math.floor(wave));
  if (w <= 4) return 2;
  if (w <= 6) return 3;
  if (w <= 8) return 4;
  return MAX_COLORS;
}

/**
 * 开局课题：想清「拿谁合谁、往哪边长」——既合成又推异色。
 */
export function waveIntroMessage(wave: number): string {
  const w = Math.max(1, Math.floor(wave));
  switch (w) {
    case 1:
      return '第1关·推门：想清拿哪枚 16 合哪枚、往哪边长——右推可顺带清异色 4';
    case 2:
      return '第2关·流放：先造第二枚 16；谁当主动、往哪长，决定异色清不干净';
    case 3:
      return '第3关·铁门：先造伙伴 8，再用中间那枚关键 8 向右合出 16 推门——8 撞门推不动';
    case 4:
      return '第4关·借刀：先造第二枚 16，再想清谁叠谁、往哪长才能扫掉顶上门';
    case 5:
      return '第5关·剪枝：先挤掉第 3 色小块，再打黄；别先把黄养成铁门';
    case 6:
      return '第6关·两翼：左右异色窝，先清更碎的一侧';
    case 7:
      return '第7关·无锚铁门：自己合出 16 才能推异色 8';
    case 8:
      return '第8关·四色碎敌：每次剪最挡路的弱色';
    default:
      return `第 ${w} 关 · ${unlockedColorsForWave(w)} 色 · 剪枝顺序与合推方向决定难度`;
  }
}

/**
 * Relative spawn weights per color index (0 = primary palette slot).
 * 1 推门极少副色 · 2 流放低 · 3 铁门低 · 4 选边均衡 · 5+ 新色偏低
 */
export function colorSpawnWeights(wave: number, unlockedColors: number): number[] {
  const u = Math.max(1, Math.min(MAX_COLORS, Math.floor(unlockedColors)));
  const w = Math.max(1, Math.floor(wave));

  if (u === 1) return [1];

  if (u === 2) {
    if (w <= 1) return [0.95, 0.05]; // 推门：几乎不补副色
    if (w === 2) return [0.9, 0.1]; // 流放：副色很少，推光体感清晰
    if (w === 3) return [0.88, 0.12]; // 铁门：专注合大推门
    if (w === 4) return [0.5, 0.5]; // 选边：均衡回流
    return [0.55, 0.45];
  }

  if (u === 3) {
    // 第5–6关：第3色新，权重低
    if (w <= 5) return [0.48, 0.37, 0.15];
    return [0.42, 0.33, 0.25];
  }

  if (u === 4) {
    if (w <= 7) return [0.4, 0.28, 0.2, 0.12];
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
