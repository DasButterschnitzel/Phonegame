import type { BiomeId, FarmBlueprint, FarmKey, FarmStamp, Journey } from '../types.ts';
import { STARTER_FARMS, isStarterFarm } from '../types.ts';
import { hash32 } from '../../shared/hash.ts';
import { BIOMES } from './biomes.ts';
import { generateBlueprint } from './generate.ts';
import { FARMS_PER_TOUR, STARTER_COUNT, parseWorldKey, planFarm, tourOf, type FarmPlan } from './plan.ts';

/** How many completed farms the journey remembers individually (the map shows a few behind you). */
export const RECENT_STAMPS = 6;

export const newJourney = (): Journey => ({ seed: 0, ordinal: 1, tours: 0, completed: 0, biomes: ['meadow'], recent: [], best: { fastestS: 0 } });

/** True once the Starter Tour is complete (the World Tour is open). */
export const worldUnlocked = (j: Journey): boolean => j.tours >= 1 && j.seed !== 0;

/** A World Tour seed for this save, from its simulation RNG state (never 0). */
export const makeWorldSeed = (rng: number, salt: number): number => hash32(rng ^ Math.imul(salt + 1, 0x632be5ab)) || 0x51ab1e;

/** The plan of the farm at the frontier (null while the frontier is a starter farm). */
export function frontierPlan(j: Journey): FarmPlan | null {
  if (!worldUnlocked(j) || j.ordinal <= STARTER_COUNT) return null;
  return planFarm(j.seed, j.ordinal);
}

/** Upcoming World Tour destinations from the frontier on (for the map). */
export function upcoming(j: Journey, n: number): FarmPlan[] {
  if (!worldUnlocked(j)) return [];
  const out: FarmPlan[] = [];
  for (let o = Math.max(STARTER_COUNT + 1, j.ordinal); out.length < n; o++) out.push(planFarm(j.seed, o));
  return out;
}

/** The plan behind a World Tour key: the scheduled one when it matches, else rebuilt from the key itself. */
export function planForKey(key: FarmKey, worldSeed: number): FarmPlan | null {
  const k = parseWorldKey(key);
  if (!k || !BIOMES[k.biome]) return null;
  if (worldSeed) {
    const p = planFarm(worldSeed, k.ordinal);
    if (p.key === key) return p;
  }
  // A key from an older schedule (or a hand-edited save): the farm is still fully described by its key.
  const { tour, slot } = tourOf(k.ordinal);
  return {
    key,
    ordinal: k.ordinal,
    tour,
    slot,
    biome: k.biome,
    seed: k.seed,
    size: slot === FARMS_PER_TOUR - 1 ? 'grand' : 'standard',
    modifier: null,
    showcase: slot === FARMS_PER_TOUR - 1,
    name: hash32(k.seed ^ 0x2545f491) % 12,
    variant: hash32(k.seed ^ 0x51ed27) % 4,
  };
}

/** The blueprint of a World Tour farm from its key (null when the key is not a valid World Tour key). */
export function blueprintForKey(key: FarmKey, worldSeed: number): FarmBlueprint | null {
  const p = planForKey(key, worldSeed);
  return p ? generateBlueprint(p) : null;
}

/** Remember a completed farm (bounded: the oldest stamps fall off). */
export function stampFarm(j: Journey, s: FarmStamp): void {
  j.recent.push(s);
  if (j.recent.length > RECENT_STAMPS) j.recent.splice(0, j.recent.length - RECENT_STAMPS);
}

export function discoverBiome(j: Journey, b: BiomeId): boolean {
  if (j.biomes.includes(b)) return false;
  j.biomes.push(b);
  return true;
}

/** The farm number of a key (starter farms #1–#5). */
export function ordinalOf(key: FarmKey): number {
  if (isStarterFarm(key)) return STARTER_FARMS.indexOf(key) + 1;
  return parseWorldKey(key)?.ordinal ?? 0;
}
