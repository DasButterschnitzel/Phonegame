import type { Sim } from '../sim.ts';
import { newGameState } from '../sim.ts';
import type { GameState } from '../types.ts';
import { FARM_ORDER } from '../types.ts';
import { markDirty } from '../field.ts';
import { SAVE_VERSION, newMeta, type CropRecord, type SaveMeta, type SaveV1 } from './schema.ts';

export function serialize(sim: Sim, meta: SaveMeta, settings: Record<string, unknown>, wallNow: number): SaveV1 {
  const f = sim.field;
  const crops: CropRecord[] = [];
  for (let i = 0; i < f.count; i++) {
    const remaining = f.regrowAt[i] !== 0 ? Math.max(0, f.regrowAt[i] - sim.state.simTime) : 0;
    if (f.hp[i] < f.maxHp[i] || remaining > 0 || f.golden[i]) crops.push([f.key[i], Math.round(f.hp[i] * 100) / 100, Math.round(remaining * 10) / 10, f.golden[i]]);
  }
  return { v: SAVE_VERSION, savedAtWall: wallNow, game: JSON.parse(JSON.stringify(sim.state)) as typeof sim.state, crops, meta, settings };
}

/** Restores crop damage/regrowth for the current farm (keys that no longer exist are ignored). */
export function applyCrops(sim: Sim, crops: CropRecord[]): void {
  const f = sim.field;
  const idx = new Map<number, number>();
  for (let i = 0; i < f.count; i++) idx.set(f.key[i], i);
  f.deadCount = 0;
  for (const [key, hp, remaining, golden] of crops) {
    const i = idx.get(key);
    if (i === undefined) continue;
    f.golden[i] = golden ? 1 : 0;
    if (remaining > 0) {
      f.hp[i] = 0;
      f.regrowAt[i] = sim.state.simTime + remaining;
      f.dead[f.deadCount++] = i;
    } else f.hp[i] = Math.min(f.maxHp[i], Math.max(1e-3, hp));
    markDirty(f, i);
  }
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Fill any missing/invalid fields from a fresh state so older or partially corrupt saves still load. */
export function validateGame(g: Partial<GameState> | undefined): GameState {
  const d = newGameState();
  if (!g || typeof g !== 'object') return d;
  const out = { ...d, ...g } as GameState;
  for (const k of ['simTime', 'rng', 'coins', 'lifetimeCoins', 'nextSegId', 'v', 'odometer', 'tornadoes', 'maxLevelReached', 'lastFullAt'] as const) {
    if (!isNum(out[k])) (out as unknown as Record<string, number>)[k] = d[k] as number;
  }
  if (!FARM_ORDER.includes(out.farmId)) out.farmId = 'meadow';
  out.progress = { ...d.progress, ...(g.progress ?? {}) };
  if (!Array.isArray(out.progress.segments) || out.progress.segments.length === 0) out.progress.segments = d.progress.segments;
  out.progress.stage = Math.max(0, Math.min(3, Math.floor(out.progress.stage || 0)));
  out.basket = { ...d.basket, ...(g.basket ?? {}) };
  if (!Array.isArray(out.basket.massByTier) || out.basket.massByTier.length !== 5) out.basket.massByTier = [0, 0, 0, 0, 0];
  out.boosts = { ...d.boosts, ...(g.boosts ?? {}) };
  out.economy = { ...d.economy, ...(g.economy ?? {}), passive: { ...(g.economy?.passive ?? {}) } };
  out.gift = { ...d.gift, ...(g.gift ?? {}) };
  out.stats = { ...d.stats, ...(g.stats ?? {}) };
  out.unlockedFarms = Array.isArray(g.unlockedFarms) && g.unlockedFarms.length ? g.unlockedFarms.filter((f) => FARM_ORDER.includes(f)) : ['meadow'];
  out.completedFarms = Array.isArray(g.completedFarms) ? g.completedFarms.filter((f) => FARM_ORDER.includes(f)) : [];
  out.farmsProgress = g.farmsProgress && typeof g.farmsProgress === 'object' ? g.farmsProgress : {};
  // headS is re-derived on load when invalid (JSON turns NaN into null).
  if (!isNum(out.headS)) out.headS = Number.NaN;
  out.prevHeadS = out.headS;
  return out;
}

export function validateMeta(m: Partial<SaveMeta> | undefined, wallNow: number): SaveMeta {
  const d = newMeta(wallNow);
  if (!m || typeof m !== 'object') return d;
  return {
    ...d,
    ...m,
    daily: { ...d.daily, ...(m.daily ?? {}) },
    tutorial: { ...(m.tutorial ?? {}) },
    adInterstitialWall: Array.isArray(m.adInterstitialWall) ? m.adInterstitialWall.filter(isNum) : [],
    adPlaytimeSec: isNum(m.adPlaytimeSec) ? m.adPlaytimeSec : 0,
  };
}
