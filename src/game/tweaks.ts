const STORAGE_KEY = 'merge-puzzle-tweaks';

export type GameTweaks = {
  boardOriginY: number;
  cellMs: number;
  spawnPad: number;
  spawnMsPerCell: number;
};

export const TWEAK_DEFAULTS: GameTweaks = {
  boardOriginY: 200,
  cellMs: 88,
  spawnPad: 1.35,
  spawnMsPerCell: 78,
};

export const TWEAK_RANGES: {
  [K in keyof GameTweaks]: { min: number; max: number; step: number };
} = {
  boardOriginY: { min: 40, max: 280, step: 2 },
  cellMs: { min: 50, max: 160, step: 2 },
  spawnPad: { min: 0.2, max: 3, step: 0.05 },
  spawnMsPerCell: { min: 30, max: 160, step: 2 },
};

const clamp = (k: keyof GameTweaks, n: number) => {
  const r = TWEAK_RANGES[k];
  return Math.min(r.max, Math.max(r.min, n));
};

function readStored(): Partial<GameTweaks> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as Partial<GameTweaks>;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function fromQuery(): Partial<GameTweaks> {
  const q = new URLSearchParams(window.location.search);
  const out: Partial<GameTweaks> = {};
  const y = Number(q.get('boardY'));
  if (Number.isFinite(y)) out.boardOriginY = y;
  return out;
}

export let tweaks: GameTweaks = { ...TWEAK_DEFAULTS };

export function loadTweaks(): GameTweaks {
  const next = { ...TWEAK_DEFAULTS, ...readStored(), ...fromQuery() };
  (Object.keys(TWEAK_DEFAULTS) as (keyof GameTweaks)[]).forEach((k) => {
    const n = Number(next[k]);
    next[k] = Number.isFinite(n) ? clamp(k, n) : TWEAK_DEFAULTS[k];
  });
  next.boardOriginY = TWEAK_DEFAULTS.boardOriginY;
  tweaks = next;
  return tweaks;
}

export function setTweak<K extends keyof GameTweaks>(key: K, value: number): GameTweaks {
  tweaks = { ...tweaks, [key]: clamp(key, value) };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks));
  } catch {
    /* ignore */
  }
  return tweaks;
}

export function resetTweaks(): GameTweaks {
  tweaks = { ...TWEAK_DEFAULTS };
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return tweaks;
}

loadTweaks();
