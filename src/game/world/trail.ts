import type { BiomeId, FarmKey, Journey, ModifierId, SizeClass, StarterFarmId } from '../types.ts';
import { STARTER_FARMS, isStarterFarm } from '../types.ts';
import { BIOMES, type Rarity } from './biomes.ts';
import { upcoming, worldUnlocked } from './journey.ts';
import { FARMS_PER_TOUR, firstOrdinalOfTour, planFarm, tourOf, type FarmPlan } from './plan.ts';

/**
 * The journey map as a short trail: a few farms behind you, where you are, the next destinations and the Tour's
 * finale. Bounded whatever the journey's length — it reads the journey's last stamps and plans a handful of farms
 * ahead, never the history.
 */
export const TRAIL_BEHIND = 3;
export const TRAIL_AHEAD = 5;

export type TrailState = 'done' | 'current' | 'next' | 'future';

export interface TrailNode {
  key: FarmKey;
  ordinal: number;
  tour: number;
  slot: number;
  biome: BiomeId;
  /** Index into the biome's name list (starter farms: −1). */
  name: number;
  state: TrailState;
  size: SizeClass | null;
  modifier: ModifierId | null;
  /** A Tour finale (the showcase farm at the end of a World Tour). */
  showcase: boolean;
  rarity: Rarity;
  /** The first farm of a family the journey has not been to yet. */
  newBiome: boolean;
  /** A new family further ahead than the next stop: shown as a mystery until it is next. */
  mystery: boolean;
}

export interface Trail {
  /** The Tour this map is about (0 = the Starter Tour). */
  tour: number;
  /** Farms in that Tour, how many of them are done, and which one you are on (−1: not on this Tour yet). */
  farms: number;
  done: number;
  hereSlot: number;
  /** Behind you (oldest first), where you are, then ahead. */
  nodes: TrailNode[];
  /** The next Tour finale when it lies beyond the farms shown ahead. */
  milestone: TrailNode | null;
  /** On the Starter Tour: the World Tour waits at its end. */
  worldTeaser: boolean;
}

export interface TrailHere {
  key: FarmKey;
  ordinal: number;
  tour: number;
  slot: number;
  biome: BiomeId;
  name: number;
  size: SizeClass | null;
  modifier: ModifierId | null;
  showcase: boolean;
  finished: boolean;
}

const rarityOf = (b: BiomeId): Rarity => BIOMES[b]?.rarity ?? 'common';

/** A planned World Tour farm as a trail node (a new family further ahead than `next` is a mystery). */
export function nodeOfPlan(p: FarmPlan, state: TrailState, j: Journey): TrailNode {
  const newBiome = !j.biomes.includes(p.biome);
  return {
    key: p.key,
    ordinal: p.ordinal,
    tour: p.tour,
    slot: p.slot,
    biome: p.biome,
    name: p.name,
    state,
    size: p.size,
    modifier: p.modifier,
    showcase: p.showcase,
    rarity: rarityOf(p.biome),
    newBiome,
    mystery: newBiome && state === 'future',
  };
}

function hereNode(h: TrailHere): TrailNode {
  return { ...h, state: 'current', rarity: rarityOf(h.biome), newBiome: false, mystery: false };
}

/** A Starter Tour farm as a trail node. */
export function starterNode(id: StarterFarmId, state: TrailState): TrailNode {
  const i = STARTER_FARMS.indexOf(id);
  return { key: id, ordinal: i + 1, tour: 0, slot: i, biome: id, name: -1, state, size: null, modifier: null, showcase: false, rarity: 'common', newBiome: false, mystery: false };
}

/** The trail for the map (`completed` / `unlocked`: the Starter Tour's farms, used while you are on it). */
export function buildTrail(j: Journey, here: TrailHere, completed: readonly FarmKey[], unlocked: readonly FarmKey[]): Trail {
  if (!worldUnlocked(j)) {
    // The Starter Tour: its five hand-made farms in order, then the World Tour as the promise at the end.
    const nodes: TrailNode[] = STARTER_FARMS.map((id, i) => ({
      key: id,
      ordinal: i + 1,
      tour: 0,
      slot: i,
      biome: id,
      name: -1,
      state: id === here.key ? 'current' : completed.includes(id) ? 'done' : unlocked.includes(id) ? 'next' : 'future',
      size: null,
      modifier: null,
      showcase: false,
      rarity: 'common',
      // Every Starter farm is a new place: no need to say so on each.
      newBiome: false,
      mystery: false,
    }));
    const hereSlot = STARTER_FARMS.indexOf(here.key as (typeof STARTER_FARMS)[number]);
    return { tour: 0, farms: STARTER_FARMS.length, done: STARTER_FARMS.filter((id) => completed.includes(id)).length, hereSlot, nodes, milestone: null, worldTeaser: true };
  }
  const onStarter = isStarterFarm(here.key) || here.tour === 0;
  const nodes: TrailNode[] = [];
  for (const s of j.recent.filter((r) => r.key !== here.key).slice(-TRAIL_BEHIND))
    nodes.push({
      key: s.key,
      ordinal: s.ordinal,
      ...tourOf(s.ordinal),
      biome: s.biome,
      name: s.name,
      state: 'done',
      size: null,
      modifier: null,
      showcase: !!s.showcase,
      rarity: rarityOf(s.biome),
      newBiome: false,
      mystery: false,
    });
  nodes.push(hereNode(here));
  const ahead = upcoming(j, TRAIL_AHEAD + 1)
    .filter((p) => p.key !== here.key)
    .slice(0, TRAIL_AHEAD);
  ahead.forEach((p, i) => nodes.push(nodeOfPlan(p, i === 0 ? 'next' : 'future', j)));
  // The next Tour finale: inside the farms shown ahead, or a milestone beyond them.
  const tour = onStarter ? 1 : here.tour;
  const finaleOrdinal = !onStarter && here.slot === FARMS_PER_TOUR - 1 ? firstOrdinalOfTour(tour + 1) + FARMS_PER_TOUR - 1 : firstOrdinalOfTour(tour) + FARMS_PER_TOUR - 1;
  const last = ahead.at(-1)?.ordinal ?? here.ordinal;
  const milestone = finaleOrdinal > last ? nodeOfPlan(planFarm(j.seed, finaleOrdinal), 'future', j) : null;
  return {
    tour,
    farms: FARMS_PER_TOUR,
    done: onStarter ? 0 : here.slot + (here.finished ? 1 : 0),
    hereSlot: onStarter ? -1 : here.slot,
    nodes,
    milestone,
    worldTeaser: false,
  };
}
