import type { Sim } from '../sim.ts';
import { newDepotPass, newFarmProgress, newGameState } from '../sim.ts';
import type { FarmProgress, FieldSnapshot, GameState } from '../types.ts';
import { FARM_ORDER } from '../types.ts';
import { SAVE_VERSION, newMeta, type SaveData, type SaveMeta } from './schema.ts';
import { MOVE } from '../config.ts';

export function serialize(sim: Sim, meta: SaveMeta, settings: Record<string, unknown>, wallNow: number): SaveData {
  sim.syncField();
  return { v: SAVE_VERSION, savedAtWall: wallNow, game: JSON.parse(JSON.stringify(sim.state)) as GameState, meta, settings };
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function validateField(f: unknown): FieldSnapshot | undefined {
  if (!f || typeof f !== 'object') return undefined;
  const o = f as Partial<FieldSnapshot>;
  if (!isNum(o.ver) || typeof o.claimed !== 'string' || typeof o.dead !== 'string') return undefined;
  return {
    ver: o.ver,
    claimed: o.claimed,
    dead: o.dead,
    hp: Array.isArray(o.hp) ? o.hp.filter(isNum) : [],
    ready: Array.isArray(o.ready) ? o.ready.filter(isNum) : [],
  };
}

function validateProgress(p: Partial<FarmProgress> | undefined): FarmProgress {
  const d = newFarmProgress(1);
  if (!p || typeof p !== 'object') return d;
  const out: FarmProgress = { ...d, ...p };
  if (!Array.isArray(out.segments) || out.segments.length === 0) out.segments = d.segments;
  out.segments = out.segments.filter((s) => s && isNum(s.id) && isNum(s.level) && s.level >= 1);
  if (out.segments.length === 0) out.segments = d.segments;
  out.zone = Math.max(0, Math.min(3, Math.floor(isNum(out.zone) ? out.zone : 0)));
  for (const k of ['addCount', 'mergeCount'] as const) if (!isNum(out[k]) || out[k] < 0) out[k] = 0;
  for (const k of ['speedLevel', 'capacityLevel'] as const) if (!isNum(out[k]) || out[k] < 1) out[k] = 1;
  // Older builds went up to SPEED Lv 25 on a flatter curve.
  out.speedLevel = Math.min(MOVE.MAX_LVL, Math.floor(out.speedLevel));
  out.finished = out.finished === true;
  out.field = validateField(p.field);
  if (!out.field) delete out.field;
  return out;
}

/** Fill any missing/invalid fields from a fresh state so older or partially corrupt saves still load. */
export function validateGame(g: Partial<GameState> | undefined): GameState {
  const d = newGameState();
  if (!g || typeof g !== 'object') return d;
  const out = { ...d, ...g } as GameState;
  for (const k of ['simTime', 'rng', 'coins', 'lifetimeCoins', 'nextSegId', 'v', 'odometer', 'tornadoes', 'maxLevelReached', 'lastFullAt', 'heat'] as const) {
    if (!isNum(out[k])) (out as unknown as Record<string, number>)[k] = d[k] as number;
  }
  if (!FARM_ORDER.includes(out.farmId)) out.farmId = 'meadow';
  out.progress = validateProgress(g.progress);
  out.basket = { ...d.basket, ...(g.basket ?? {}) };
  if (!isNum(out.basket.mass) || out.basket.mass < 0) out.basket.mass = 0;
  if (!isNum(out.basket.value) || out.basket.value < 0) out.basket.value = 0;
  if (!Array.isArray(out.basket.massByTier) || out.basket.massByTier.length !== 5 || !out.basket.massByTier.every(isNum)) out.basket.massByTier = [out.basket.mass, 0, 0, 0, 0];
  // Known fields only (older builds stored the pass by distance: a pass in flight resumes its wave from the start).
  const dp = newDepotPass();
  for (const k of Object.keys(dp) as (keyof typeof dp)[]) if (g.depot && k in g.depot) (dp as unknown as Record<string, unknown>)[k] = (g.depot as unknown as Record<string, unknown>)[k];
  out.depot = Object.values(dp).every((x) => typeof x === 'boolean' || isNum(x)) && (!dp.active || dp.segs >= 1) ? dp : newDepotPass();
  out.boosts = { ...d.boosts, ...(g.boosts ?? {}) };
  out.economy = { ...d.economy, ...(g.economy ?? {}), passive: { ...(g.economy?.passive ?? {}) } };
  out.gift = { ...d.gift, ...(g.gift ?? {}) };
  out.stats = { ...d.stats, ...(g.stats ?? {}) };
  out.unlockedFarms = Array.isArray(g.unlockedFarms) && g.unlockedFarms.length ? g.unlockedFarms.filter((f) => FARM_ORDER.includes(f)) : ['meadow'];
  if (!out.unlockedFarms.includes('meadow')) out.unlockedFarms.unshift('meadow');
  if (!out.unlockedFarms.includes(out.farmId)) out.farmId = 'meadow';
  out.completedFarms = Array.isArray(g.completedFarms) ? g.completedFarms.filter((f) => FARM_ORDER.includes(f)) : [];
  const fp: GameState['farmsProgress'] = {};
  if (g.farmsProgress && typeof g.farmsProgress === 'object')
    for (const [k, v] of Object.entries(g.farmsProgress)) if (FARM_ORDER.includes(k as never) && k !== out.farmId) fp[k as keyof typeof fp] = validateProgress(v);
  out.farmsProgress = fp;
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
