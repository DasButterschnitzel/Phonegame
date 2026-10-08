import type { BiomeId, CropId, FarmBlueprint, FarmKey, ModifierId, SizeClass, StarterFarmId } from '../types.ts';
import { FIELD, MISC, farmEco, worldEco, type FarmEco } from '../config.ts';
import { buildLayout, type FarmLayout } from './layout.ts';

/**
 * A farm is a grid of square plots (FIELD.PLOT world units, 3×3 crops each). Row 0 is the far side (−z).
 *   '.' nothing (scenery)        '#' rocks, '~' water — never cleared, the route bends around them
 *   'S' start territory (cleared) 'D' start plot whose outward side carries the depot
 *   'o' plot, zone assigned by distance from the start   '0'..'3' plot with an explicit zone
 * The route is always the outline of the cleared territory; clearing plots next to it pushes it outward.
 */
export interface FarmDef {
  /** The farm key (a starter id or a World Tour key). */
  id: FarmKey;
  /** Starter farms: 0..4 (their place in the Starter Tour and their economy); World Tour farms: −1. */
  index: number;
  seed: number;
  biome: BiomeId;
  /** Farm number over the whole journey (#1 Sunny Meadow …). */
  ordinal: number;
  /** 0 = Starter Tour, 1… = World Tours. */
  tour: number;
  /** Position in its Tour. */
  slot: number;
  size: SizeClass;
  modifier: ModifierId | null;
  showcase: boolean;
  /** Name index in the biome's name list (−1 = the starter farm's own name). */
  name: number;
  variant: number;
  /** Values, costs and crop toughness of this farm. */
  eco: FarmEco;
  /** Chance a crop is golden. */
  goldenP: number;
  /** Top speed factor (FAST TRACK). */
  speedMult: number;
  /** The blueprint a World Tour farm was built from (null for starter farms). */
  bp: FarmBlueprint | null;
  crops: [CropId, CropId, CropId, CropId];
  map: readonly string[];
  /** Share of the non-start plots in each zone (auto-assigned by distance from the start). */
  zoneShare: readonly [number, number, number, number];
  /** Coins (before the farm cost multiplier) to open zone k before it would open for free; [0] unused. */
  zoneCost: readonly [number, number, number, number];
  /** Segment cap while zone k is the outermost open zone. */
  maxSegments: readonly [number, number, number, number];
  layout: FarmLayout;
  /** World-space extent of the plot grid. */
  bounds: { x0: number; z0: number; x1: number; z1: number };
  /** Depot point on the route (x, z) and the barn building centre (bx, bz). */
  barn: { x: number; z: number; bx: number; bz: number };
}

const ZONE_SHARE = [0.12, 0.22, 0.3, 0.36] as const;
const ZONE_COST = [0, 900, 12_000, 110_000] as const;
const MAX_SEGMENTS = [8, 14, 22, 32] as const;

function farm(id: StarterFarmId, index: number, seed: number, crops: FarmDef['crops'], map: string[]): FarmDef {
  const layout = buildLayout(map, FIELD.PLOT, ZONE_SHARE, FIELD.PLOT_CROPS);
  return {
    id,
    index,
    seed,
    biome: id,
    ordinal: index + 1,
    tour: 0,
    slot: index,
    size: 'standard',
    modifier: null,
    showcase: false,
    name: -1,
    variant: 0,
    eco: farmEco(index),
    goldenP: MISC.GOLDEN_P,
    speedMult: 1,
    bp: null,
    crops,
    map,
    zoneShare: ZONE_SHARE,
    zoneCost: ZONE_COST,
    maxSegments: MAX_SEGMENTS,
    layout,
    bounds: layout.bounds,
    barn: layout.barn,
  };
}

export const FARMS: Record<StarterFarmId, FarmDef> = {
  // Wide meadow: a pond eats into the top, a rock spur from the left.
  meadow: farm('meadow', 0, 1101, ['lettuce', 'wheat', 'carrot', 'pumpkin'], [
    '..oooo~~oooo..',
    '.ooooo~~ooooo.',
    'ooooooo~oooooo',
    'oooooooooooooo',
    '##oooooooooooo',
    '#ooooooooooooo',
    'oooooooooooooo',
    'oooooooooooooo',
    'oooooSSSSooooo',
    '.ooooSDSSoooo.',
  ]),
  // Tall patch with a creek cutting in from the right: the route has to wrap around it.
  pumpkin: farm('pumpkin', 1, 2202, ['cabbage', 'squash', 'pumpkin', 'watermelon'], [
    '..oooooooo..',
    '.oooooooooo.',
    'oooooooooooo',
    'oooooooooooo',
    'ooooooo~~~~~',
    'oooooooo~~~~',
    'oooooooooooo',
    'oooooooooooo',
    'oooooooooooo',
    'oooooooooooo',
    'ooooSSSooooo',
    '.oooSDSoooo.',
  ]),
  // Rounded hill with rock ledges on both flanks.
  sunflower: farm('sunflower', 2, 3303, ['turnip', 'tomato', 'corn', 'sunflower'], [
    '...oooooooo...',
    '..oooooooooo..',
    '.oooooooooooo.',
    '##oooooooooooo',
    '###ooooooooooo',
    'oooooooooooooo',
    'oooooooooooo##',
    'ooooooooooooo#',
    'oooooSSSoooooo',
    '.ooooSDSooooo.',
  ]),
  // Frozen pond at the top, pines in the bottom-left corner.
  snowyberry: farm('snowyberry', 3, 4404, ['turnip', 'blueberry', 'strawberry', 'pumpkin'], [
    'ooooo~~ooooo',
    'ooooo~~ooooo',
    'oooooo~ooooo',
    'oooooooooooo',
    'oooooooooooo',
    'oooooooooooo',
    'oooooooooooo',
    'oooooooooooo',
    'oooooooooooo',
    '#ooooooooooo',
    '##ooSSSooooo',
    '##ooSDSoooo.',
  ]),
  // Wide ranch with two mesas on the far edge.
  desert: farm('desert', 4, 5505, ['pepper', 'cactusfruit', 'watermelon', 'dragonfruit'], [
    'oo###oooooo##oo',
    'ooo#oooooooo#oo',
    'ooooooooooooooo',
    'ooooooooooooooo',
    'ooooooooooooooo',
    'ooooooooooooooo',
    'ooooooooooooooo',
    'ooooooSSSoooooo',
    '.oooooSDSooooo.',
  ]),
};

/** Modifier effects: an opportunity, never a handicap. */
export const MODIFIER_FX: Record<ModifierId, { value: number; hp: number; golden: number; speed: number }> = {
  // Golden soil: four times the golden crops.
  golden: { value: 1, hp: 1, golden: 4, speed: 1 },
  // Bumper harvest: everything is worth more (and a touch tougher).
  bumper: { value: 1.35, hp: 1.1, golden: 1, speed: 1 },
  // Fast track: the crawler runs a little faster here.
  fasttrack: { value: 1, hp: 1, golden: 1, speed: 1.12 },
  // Giant crops: tougher, much more valuable.
  giant: { value: 1.7, hp: 1.45, golden: 1, speed: 1 },
  // Rich field: high value, tougher crops.
  rich: { value: 1.5, hp: 1.25, golden: 1, speed: 1 },
};

/** A World Tour farm from its blueprint (`coreRank`: tours completed, a small permanent bonus). */
export function farmFromBlueprint(bp: FarmBlueprint, coreRank: number): FarmDef {
  const layout = buildLayout(bp.map, FIELD.PLOT, ZONE_SHARE, FIELD.PLOT_CROPS);
  const fx = bp.modifier ? MODIFIER_FX[bp.modifier] : null;
  return {
    id: bp.key,
    index: -1,
    seed: bp.seed,
    biome: bp.biome,
    ordinal: bp.ordinal,
    tour: bp.tour,
    slot: bp.slot,
    size: bp.size,
    modifier: bp.modifier,
    showcase: bp.showcase,
    name: bp.name,
    variant: bp.variant,
    eco: worldEco(bp.slot, coreRank, fx?.value ?? 1, fx?.hp ?? 1),
    goldenP: MISC.GOLDEN_P * (fx?.golden ?? 1),
    speedMult: fx?.speed ?? 1,
    bp,
    crops: bp.crops,
    map: bp.map,
    zoneShare: ZONE_SHARE,
    zoneCost: ZONE_COST,
    maxSegments: MAX_SEGMENTS,
    layout,
    bounds: layout.bounds,
    barn: layout.barn,
  };
}

export const getFarm = (id: StarterFarmId): FarmDef => FARMS[id];
