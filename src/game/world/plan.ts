import type { BiomeId, FarmKey, ModifierId, SizeClass } from '../types.ts';
import { STARTER_FARMS } from '../types.ts';
import { hash32 } from '../../shared/hash.ts';
import { NAME_COUNT, readyBiomes, type BiomeDef, type Rarity } from './biomes.ts';

/** Farms in a World Tour; the last one is the Tour's showcase finale. */
export const FARMS_PER_TOUR = 8;
/** Farm numbers #1–#5 are the hand-made Starter Tour. */
export const STARTER_COUNT = STARTER_FARMS.length;
/** Bump when the layout generator changes what it draws for a seed (stored with every blueprint). */
export const GEN_VERSION = 1;

/** Where a farm number sits: Tour 0 is the Starter Tour. */
export function tourOf(ordinal: number): { tour: number; slot: number } {
  if (ordinal <= STARTER_COUNT) return { tour: 0, slot: ordinal - 1 };
  const k = ordinal - STARTER_COUNT - 1;
  return { tour: 1 + Math.floor(k / FARMS_PER_TOUR), slot: k % FARMS_PER_TOUR };
}

export const firstOrdinalOfTour = (tour: number): number => (tour === 0 ? 1 : STARTER_COUNT + 1 + (tour - 1) * FARMS_PER_TOUR);

/** The cheap part of a World Tour farm (no layout): enough for the map, its key and its name. */
export interface FarmPlan {
  key: FarmKey;
  ordinal: number;
  tour: number;
  slot: number;
  biome: BiomeId;
  seed: number;
  size: SizeClass;
  modifier: ModifierId | null;
  showcase: boolean;
  name: number;
  variant: number;
}

/**
 * The rhythm of a Tour: mostly standard farms, a quick one now and then, one grand farm mid-Tour and the showcase
 * finale. Two long farms are never back to back.
 */
const RHYTHMS: readonly (readonly SizeClass[])[] = [
  ['standard', 'standard', 'quick', 'standard', 'grand', 'standard', 'quick', 'grand'],
  ['standard', 'quick', 'standard', 'grand', 'standard', 'quick', 'standard', 'grand'],
  ['quick', 'standard', 'standard', 'grand', 'standard', 'standard', 'quick', 'grand'],
];

const MODIFIERS: readonly ModifierId[] = ['golden', 'bumper', 'fasttrack', 'giant', 'rich'];
const SHOWCASE_MODIFIERS: readonly ModifierId[] = ['bumper', 'golden', 'rich'];

const RARITY_WEIGHT: Record<Rarity, number> = { common: 1, uncommon: 0.7, rare: 0.35, legendary: 0.15 };

/** Seeded stream (mulberry32) for one decision context. */
function stream(seed: number): () => number {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(items: readonly T[], weight: (x: T) => number, u: number): T {
  let total = 0;
  for (const x of items) total += Math.max(0, weight(x));
  let r = u * total;
  for (const x of items) {
    r -= Math.max(0, weight(x));
    if (r < 0) return x;
  }
  return items[items.length - 1];
}

export const farmSeed = (worldSeed: number, ordinal: number): number => hash32(hash32(worldSeed) ^ Math.imul(ordinal, 0x9e3779b1)) || 1;

export const worldKey = (ordinal: number, biome: BiomeId, seed: number): FarmKey => `w${ordinal}-${biome}-${(seed >>> 0).toString(16).padStart(8, '0')}`;

const KEY_RE = /^w(\d+)-([a-z]+)-([0-9a-f]{8})$/;
/** Ordinal, biome and seed of a World Tour key (null for starter ids and anything malformed). */
export function parseWorldKey(key: FarmKey): { ordinal: number; biome: BiomeId; seed: number } | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const ordinal = Number(m[1]);
  if (!Number.isInteger(ordinal) || ordinal <= STARTER_COUNT) return null;
  return { ordinal, biome: m[2] as BiomeId, seed: parseInt(m[3], 16) };
}

const tourCache = new Map<string, FarmPlan[]>();

/**
 * The eight destinations of World Tour `tour` for a journey seed. Deterministic, and sequential across Tours so that
 * no biome repeats within four farms (even over a Tour boundary). Fresh biome families come first in Tour 1;
 * rarer families favour the showcase finale.
 */
export function planTour(worldSeed: number, tour: number): FarmPlan[] {
  const ck = `${worldSeed}:${tour}`;
  const hit = tourCache.get(ck);
  if (hit) return hit;
  // Tours are planned in order (each looks at the one before): fill in any missing ones iteratively.
  let t = tour - 1;
  while (t >= 1 && !tourCache.has(`${worldSeed}:${t}`)) t--;
  for (let k = Math.max(1, t + 1); k < tour; k++) tourCache.set(`${worldSeed}:${k}`, buildTour(worldSeed, k));
  const out = buildTour(worldSeed, tour);
  tourCache.set(ck, out);
  return out;
}

function buildTour(worldSeed: number, tour: number): FarmPlan[] {
  const recent: BiomeId[] = tour > 1 ? (tourCache.get(`${worldSeed}:${tour - 1}`) ?? []).map((p) => p.biome) : [];
  const rnd = stream(hash32(worldSeed ^ Math.imul(tour + 1, 0x85ebca77)));
  const rhythm = RHYTHMS[Math.floor(rnd() * RHYTHMS.length)];
  const pool = readyBiomes().filter((b) => b.minTour <= tour);
  const out: FarmPlan[] = [];
  let lastModifier: ModifierId | null = null;
  for (let slot = 0; slot < FARMS_PER_TOUR; slot++) {
    const ordinal = firstOrdinalOfTour(tour) + slot;
    const showcase = slot === FARMS_PER_TOUR - 1;
    const taken = [...recent, ...out.map((p) => p.biome)];
    let biome: BiomeDef | null = null;
    // Repeat protection: not among the last 4 farms (relaxed only if the library is too small for it).
    for (let gap = 4; gap >= 0 && !biome; gap--) {
      const avoid = gap > 0 ? new Set(taken.slice(-gap)) : new Set<BiomeId>();
      const cands = pool.filter((b) => !avoid.has(b.id));
      if (!cands.length) continue;
      biome = pickWeighted(
        cands,
        (b) => {
          let w = RARITY_WEIGHT[b.rarity];
          // Showcase finales favour the rare and legendary families; normal stops favour the grounded ones.
          if (showcase) w *= b.rarity === 'legendary' ? 6 : b.rarity === 'rare' ? 3 : 0.5;
          else if (b.rarity === 'legendary') w *= 0.2;
          // Tour 1 shows new places first; the starter biomes return as variants later.
          if (tour === 1 && b.starter) w *= 0.15;
          // A family not seen for a while is a little more likely.
          if (!taken.includes(b.id)) w *= 1.4;
          return w;
        },
        rnd(),
      );
    }
    if (!biome) biome = pool[0];
    const size: SizeClass = rhythm[slot];
    let modifier: ModifierId | null = null;
    if (showcase) modifier = SHOWCASE_MODIFIERS[Math.floor(rnd() * SHOWCASE_MODIFIERS.length)];
    else if (rnd() < 0.3) {
      const m = MODIFIERS[Math.floor(rnd() * MODIFIERS.length)];
      modifier = m === lastModifier ? null : m;
    } else rnd();
    if (modifier) lastModifier = modifier;
    const seed = farmSeed(worldSeed, ordinal);
    out.push({
      key: worldKey(ordinal, biome.id, seed),
      ordinal,
      tour,
      slot,
      biome: biome.id,
      seed,
      size,
      modifier,
      showcase,
      name: hash32(seed ^ 0x2545f491) % NAME_COUNT,
      variant: hash32(seed ^ 0x51ed27) % 4,
    });
  }
  return out;
}

/** The plan of World Tour farm number `ordinal` (> STARTER_COUNT). */
export function planFarm(worldSeed: number, ordinal: number): FarmPlan {
  const { tour, slot } = tourOf(ordinal);
  if (tour < 1) throw new Error(`farm #${ordinal} is a starter farm`);
  return planTour(worldSeed, tour)[slot];
}
