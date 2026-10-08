import type { Sim } from '../sim.ts';
import { newDepotPass, newFarmProgress, newGameState } from '../sim.ts';
import type { BiomeId, CropId, FarmBlueprint, FarmProgress, FarmStamp, FieldSnapshot, GameState, Journey, ModifierId, SizeClass } from '../types.ts';
import { isStarterFarm } from '../types.ts';
import { SAVE_VERSION, newMeta, type SaveData, type SaveMeta } from './schema.ts';
import { MOVE } from '../config.ts';
import { BIOMES } from '../world/biomes.ts';
import { checkMap } from '../world/generate.ts';
import { RECENT_STAMPS, makeWorldSeed, newJourney, planForKey, worldUnlocked } from '../world/journey.ts';
import { FARMS_PER_TOUR, STARTER_COUNT, planFarm } from '../world/plan.ts';
import { CROP_IDS } from '../crops.ts';

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

const isInt = (x: unknown, lo: number, hi = Number.MAX_SAFE_INTEGER): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const SIZES: readonly SizeClass[] = ['quick', 'standard', 'grand'];
const MODS: readonly ModifierId[] = ['golden', 'bumper', 'fasttrack', 'giant', 'rich'];

/** A stored World Tour blueprint, or undefined when anything about it is off (the farm is then rebuilt from its key). */
export function validateBlueprint(b: unknown): FarmBlueprint | undefined {
  if (!b || typeof b !== 'object') return undefined;
  const o = b as Partial<FarmBlueprint>;
  if (typeof o.key !== 'string' || !isInt(o.ordinal, STARTER_COUNT + 1) || !isInt(o.tour, 1) || !isInt(o.slot, 0, FARMS_PER_TOUR - 1)) return undefined;
  if (typeof o.biome !== 'string' || !BIOMES[o.biome as BiomeId] || !isInt(o.seed, 0, 0xffffffff) || !isInt(o.name, -1) || !isInt(o.variant, 0) || !isInt(o.gen, 1)) return undefined;
  if (!SIZES.includes(o.size as SizeClass) || (o.modifier !== null && !MODS.includes(o.modifier as ModifierId)) || typeof o.showcase !== 'boolean') return undefined;
  if (!Array.isArray(o.crops) || o.crops.length !== 4 || !o.crops.every((c) => CROP_IDS.includes(c as CropId))) return undefined;
  if (!Array.isArray(o.map) || o.map.length < 4 || o.map.length > 40 || !o.map.every((l) => typeof l === 'string' && l.length === o.map![0].length && /^[.o#~SD0-3]+$/.test(l))) return undefined;
  if (!checkMap(o.map).ok) return undefined;
  return {
    gen: o.gen,
    key: o.key,
    ordinal: o.ordinal,
    tour: o.tour,
    slot: o.slot,
    biome: o.biome as BiomeId,
    seed: o.seed,
    archetype: typeof o.archetype === 'string' ? o.archetype : 'bowl',
    size: o.size as SizeClass,
    modifier: (o.modifier ?? null) as ModifierId | null,
    showcase: o.showcase,
    name: o.name,
    crops: [...o.crops] as FarmBlueprint['crops'],
    map: [...o.map],
    variant: o.variant,
  };
}

function validateJourney(j: Partial<Journey> | undefined, rng: number): Journey {
  const d = newJourney();
  if (!j || typeof j !== 'object') return d;
  const stamp = (s: unknown): FarmStamp | null => {
    if (!s || typeof s !== 'object') return null;
    const o = s as Partial<FarmStamp>;
    if (typeof o.key !== 'string' || !isInt(o.ordinal, 1) || typeof o.biome !== 'string' || !BIOMES[o.biome as BiomeId]) return null;
    return { key: o.key, ordinal: o.ordinal, biome: o.biome as BiomeId, name: isInt(o.name, -1) ? o.name : -1, seconds: isNum(o.seconds) && o.seconds >= 0 ? o.seconds : 0, ...(o.showcase === true ? { showcase: true } : {}) };
  };
  const out: Journey = {
    seed: isInt(j.seed, 0, 0xffffffff) ? j.seed : 0,
    ordinal: isInt(j.ordinal, 1, 1e7) ? j.ordinal : 1,
    tours: isInt(j.tours, 0, 1e6) ? j.tours : 0,
    completed: isInt(j.completed, 0, 1e7) ? j.completed : 0,
    biomes: Array.isArray(j.biomes) ? [...new Set(j.biomes.filter((b) => typeof b === 'string' && BIOMES[b as BiomeId]))] : d.biomes,
    recent: Array.isArray(j.recent) ? j.recent.map(stamp).filter((s): s is FarmStamp => !!s).slice(-RECENT_STAMPS) : [],
    best: { fastestS: isNum(j.best?.fastestS) && j.best.fastestS >= 0 ? j.best.fastestS : 0 },
  };
  if (!out.biomes.length) out.biomes = d.biomes;
  // A World Tour needs a seed; a seed means the Starter Tour is done.
  if (out.tours >= 1 && !out.seed) out.seed = makeWorldSeed(rng, out.completed);
  if (out.seed && out.tours < 1) out.tours = 1;
  if (worldUnlocked(out) && out.ordinal <= STARTER_COUNT) out.ordinal = STARTER_COUNT + 1;
  return out;
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
  // Missing on saves from before the bonus milestones: the Sim fills it in from the cleared share.
  if (!isNum(out.bonusClaimed) || out.bonusClaimed < 0) delete out.bonusClaimed;
  else out.bonusClaimed = Math.min(3, Math.floor(out.bonusClaimed));
  if (!isNum(out.tornadoesBought) || out.tornadoesBought < 0) out.tornadoesBought = 0;
  out.field = validateField(p.field);
  if (!out.field) delete out.field;
  const bp = validateBlueprint(p.bp);
  if (bp) out.bp = bp;
  else delete out.bp;
  if (!isNum(out.arrivedAt) || out.arrivedAt < 0) delete out.arrivedAt;
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
  out.journey = validateJourney(g.journey, out.rng);
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
  out.charges = { ...d.charges };
  for (const k of Object.keys(d.charges) as (keyof typeof d.charges)[]) {
    const v = g.charges?.[k];
    if (isNum(v) && v > 0) out.charges[k] = Math.min(99, Math.floor(v));
  }
  // Passive income: finished farms of the current Tour only (≤ a Tour's worth of entries, finite values).
  const passive: GameState['economy']['passive'] = {};
  for (const [k, v] of Object.entries(g.economy?.passive ?? {}).slice(-FARMS_PER_TOUR)) if (isNum(v) && v >= 0) passive[k] = v;
  out.economy = { ...d.economy, ...(g.economy ?? {}), passive };
  out.gift = { ...d.gift, ...(g.gift ?? {}) };
  out.stats = { ...d.stats, ...(g.stats ?? {}) };
  out.unlockedFarms = Array.isArray(g.unlockedFarms) && g.unlockedFarms.length ? [...new Set(g.unlockedFarms.filter((f) => isStarterFarm(f)))] : ['meadow'];
  if (!out.unlockedFarms.includes('meadow')) out.unlockedFarms.unshift('meadow');
  out.completedFarms = Array.isArray(g.completedFarms) ? [...new Set(g.completedFarms.filter((f) => isStarterFarm(f)))] : [];
  // The farm you are on: an unlocked starter farm, or a World Tour farm whose blueprint is stored or can be rebuilt
  // from its key. Anything else lands on the journey's frontier (or Sunny Meadow).
  const j = out.journey;
  let here = typeof g.farmId === 'string' ? g.farmId : 'meadow';
  if (isStarterFarm(here)) {
    if (!out.unlockedFarms.includes(here)) here = 'meadow';
  } else if (!(out.progress.bp && out.progress.bp.key === here) && !planForKey(here, j.seed)) {
    if (worldUnlocked(j)) {
      here = planFarm(j.seed, Math.max(STARTER_COUNT + 1, j.ordinal)).key;
      out.progress = newFarmProgress(out.nextSegId);
    } else here = 'meadow';
  }
  out.farmId = here;
  if (!isStarterFarm(here) && out.progress.bp && out.progress.bp.key !== here) delete out.progress.bp;
  // Live farms you are not on: the Starter Tour's (while you are still in it) — never an unbounded archive.
  const fp: GameState['farmsProgress'] = {};
  if (g.farmsProgress && typeof g.farmsProgress === 'object' && isStarterFarm(here))
    for (const [k, v] of Object.entries(g.farmsProgress)) if (isStarterFarm(k) && k !== out.farmId) fp[k] = validateProgress(v);
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
