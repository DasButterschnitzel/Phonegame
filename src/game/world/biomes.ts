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
  // ——— World Tour families ———
  // Each is a different kind of place: its own crops (and crop sizes), layouts it favours, and — in the renderer — its
  // own trees, props, landmark, rocks, depot skin and weather. Inspired by real farming landscapes, never caricatures.
  // River-valley orchard of southern Africa: groundnuts and sorghum, pawpaw and mango trees, granite kopjes.
  orchard: {
    id: 'orchard',
    rarity: 'uncommon',
    crops: [['groundnut'], ['sorghum', 'corn'], ['papaya'], ['mango']],
    layouts: { riverbend: 1.6, brokenriver: 1, coast: 1, centralrock: 1.2, bowl: 0.8, twinponds: 0.6, valley: 0.6, horseshoe: 0.5 },
    minTour: 1,
  },
  // Flooded terraces climbing a misty hillside: seedlings, taro, golden rice, lychee trees at the top.
  rice: {
    id: 'rice',
    rarity: 'uncommon',
    crops: [['riceshoot'], ['taro'], ['rice'], ['lychee']],
    layouts: { terraces: 2.2, longvalley: 1.2, twinponds: 1, valley: 1, spiral: 0.6, riverbend: 0.6 },
    minTour: 1,
  },
  // Rolling hills of vines, cypress lanes and silver olive groves.
  vineyard: {
    id: 'vineyard',
    rarity: 'common',
    crops: [['basil'], ['artichoke', 'tomato'], ['grapes'], ['olive']],
    layouts: { ridge: 1.4, twinfields: 1.2, valley: 1, horseshoe: 0.8, bowl: 0.8, terraces: 0.6, longvalley: 0.6 },
    minTour: 1,
  },
  // A coastal plantation: pineapples and cane, banana and coconut palms by a turquoise lagoon.
  tropical: {
    id: 'tropical',
    rarity: 'common',
    crops: [['pineapple'], ['sugarcane'], ['banana'], ['coconut']],
    layouts: { coast: 2, archipelago: 1.2, twinponds: 1, bowl: 0.8, horseshoe: 0.8, crossing: 0.6 },
    minTour: 1,
  },
  // Rows of firs growing up under the snow, holly at their feet; grand firs fill a plot on their own.
  evergreen: {
    id: 'evergreen',
    rarity: 'uncommon',
    crops: [['holly'], ['sapling'], ['firtree'], ['bigfir']],
    layouts: { bowl: 1.2, valley: 1, horseshoe: 1, twinponds: 0.8, ridge: 0.6, spiral: 0.6 },
    minTour: 1,
  },
  // A hillside tea garden among cherry blossoms: tea, daikon, aubergines, cherry trees.
  blossom: {
    id: 'blossom',
    rarity: 'uncommon',
    crops: [['teabush'], ['daikon'], ['eggplant'], ['cherry']],
    layouts: { terraces: 1.4, twinponds: 1.2, valley: 1, horseshoe: 0.8, spiral: 0.8, bowl: 0.6 },
    minTour: 1,
  },
  // High stone terraces under snowy peaks: potatoes, quinoa, amaranth, purple corn.
  highland: {
    id: 'highland',
    rarity: 'uncommon',
    crops: [['potato'], ['quinoa'], ['amaranth'], ['purplecorn']],
    layouts: { terraces: 2, ridge: 1.2, longvalley: 1, valley: 0.8, canyon: 0.6 },
    minTour: 1,
  },
  // Lakes, birches and a red cottage under the midnight sun: lingon- and cloudberries, rhubarb, apple trees.
  nordic: {
    id: 'nordic',
    rarity: 'common',
    crops: [['lingonberry'], ['cloudberry'], ['rhubarb'], ['apple']],
    layouts: { twinponds: 1.6, archipelago: 1.2, coast: 1, bowl: 0.8, brokenriver: 0.6 },
    minTour: 1,
  },
  // Provence in July: chamomile, rows of lavender, melons, almond trees.
  lavender: {
    id: 'lavender',
    rarity: 'common',
    crops: [['chamomile'], ['lavenderbush'], ['melon'], ['almond']],
    layouts: { twinfields: 1.6, valley: 1.2, ridge: 1, bowl: 0.8, terraces: 0.6 },
    minTour: 1,
  },
  // ——— Showcase families: rarer, from the second Tour on, favoured for Tour finales ———
  // A glowing twilight bog: puffballs, chanterelles, toadstools and giant caps that fill a plot alone.
  marsh: {
    id: 'marsh',
    rarity: 'rare',
    crops: [['puffball'], ['chanterelle'], ['toadstool'], ['giantcap']],
    layouts: { twinponds: 1.6, archipelago: 1.4, brokenriver: 1.2, riverbend: 0.8, bowl: 0.6 },
    minTour: 2,
  },
  // Fields on a volcano's flank: chilies, sweet potatoes, coffee, and ember peppers as big as a car.
  volcanic: {
    id: 'volcanic',
    rarity: 'rare',
    crops: [['chili'], ['sweetpotato'], ['coffee'], ['emberpepper']],
    layouts: { canyon: 1.6, centralrock: 1.4, brokenriver: 1.2, ridge: 1, crossing: 0.6 },
    minTour: 2,
  },
  // Everything oversized: giant radishes, strawberries, cabbages and a prize pumpkin per plot.
  giant: {
    id: 'giant',
    rarity: 'legendary',
    crops: [['bigradish'], ['bigberry'], ['bigcabbage'], ['giantpumpkin']],
    layouts: { bowl: 1.4, centralrock: 1, horseshoe: 1, valley: 0.8, spiral: 0.8 },
    minTour: 2,
  },
  // Hydroponics under glass on the Moon: sprouts, potatoes, pod lettuce, star-fruit trees.
  lunar: {
    id: 'lunar',
    rarity: 'legendary',
    crops: [['moonsprout'], ['spacepotato'], ['podlettuce'], ['starfruit']],
    layouts: { centralrock: 1.4, archipelago: 1, bowl: 1, crossing: 0.8, twinponds: 0.6 },
    minTour: 3,
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
