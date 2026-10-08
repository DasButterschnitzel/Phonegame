import type { BiomeId, CropId, StarterFarmId } from '../types.ts';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

/** Layout archetypes the generator knows (see generate.ts). */
export type ArchetypeId =
  | 'bowl'
  | 'riverbend'
  | 'twinponds'
  | 'canyon'
  | 'terraces'
  | 'horseshoe'
  | 'valley'
  | 'twinfields'
  | 'ridge'
  | 'coast'
  | 'brokenriver'
  | 'archipelago'
  | 'longvalley'
  | 'crossing'
  | 'centralrock'
  | 'spiral';

/**
 * A biome family: what a farm is made of (crop pools per tier, layout tendencies, names) — the look lives in the
 * renderer (render/biomes.ts). A farm picks one crop per tier from the pools; tiers get tougher and more valuable.
 */
export interface BiomeDef {
  id: BiomeId;
  rarity: Rarity;
  crops: readonly [readonly CropId[], readonly CropId[], readonly CropId[], readonly CropId[]];
  /** Layout archetypes this biome likes, with weights. */
  layouts: Partial<Record<ArchetypeId, number>>;
  /** Earliest World Tour the biome can be scheduled on (fantasy showpieces come later). */
  minTour: number;
  /** Starter farm this biome began as (its first visit is that farm). */
  starter?: StarterFarmId;
}

const COMMON_LAYOUTS: Partial<Record<ArchetypeId, number>> = {
  bowl: 1,
  riverbend: 1,
  twinponds: 1,
  crossing: 1,
  ridge: 0.8,
  horseshoe: 0.7,
  valley: 0.7,
  twinfields: 0.6,
  coast: 0.6,
  centralrock: 0.6,
};

export const BIOMES: Partial<Record<BiomeId, BiomeDef>> = {
  meadow: {
    id: 'meadow',
    rarity: 'common',
    starter: 'meadow',
    crops: [['lettuce', 'cabbage'], ['wheat', 'corn'], ['carrot', 'turnip'], ['pumpkin', 'squash']],
    layouts: COMMON_LAYOUTS,
    minTour: 1,
  },
  pumpkin: {
    id: 'pumpkin',
    rarity: 'common',
    starter: 'pumpkin',
    crops: [['cabbage', 'lettuce'], ['squash', 'turnip'], ['pumpkin'], ['watermelon']],
    layouts: { ...COMMON_LAYOUTS, brokenriver: 1, riverbend: 1.2 },
    minTour: 1,
  },
  sunflower: {
    id: 'sunflower',
    rarity: 'common',
    starter: 'sunflower',
    crops: [['turnip', 'lettuce'], ['tomato'], ['corn'], ['sunflower']],
    layouts: { ...COMMON_LAYOUTS, ridge: 1.2, terraces: 0.8 },
    minTour: 1,
  },
  snowyberry: {
    id: 'snowyberry',
    rarity: 'uncommon',
    starter: 'snowyberry',
    crops: [['turnip', 'cabbage'], ['blueberry'], ['strawberry'], ['pumpkin']],
    layouts: { ...COMMON_LAYOUTS, twinponds: 1.4, archipelago: 0.8 },
    minTour: 1,
  },
  desert: {
    id: 'desert',
    rarity: 'uncommon',
    starter: 'desert',
    crops: [['pepper'], ['cactusfruit'], ['watermelon'], ['dragonfruit']],
    layouts: { ...COMMON_LAYOUTS, canyon: 1.4, centralrock: 1, ridge: 1 },
    minTour: 1,
  },
};

/** Biome families with complete content (crops, look, names): only these are scheduled. */
export const readyBiomes = (): BiomeDef[] => Object.values(BIOMES).filter((b): b is BiomeDef => !!b);

export const biomeDef = (id: BiomeId): BiomeDef => {
  const b = BIOMES[id];
  if (!b) throw new Error(`unknown biome ${id}`);
  return b;
};

/** How many curated names each biome has (the name lists live in i18n: `names.<biome>`). */
export const NAME_COUNT = 12;
