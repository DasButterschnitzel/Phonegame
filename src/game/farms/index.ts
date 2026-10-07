import type { CropId, FarmId } from '../types.ts';
import { FIELD } from '../config.ts';
import { buildLayout, type FarmLayout } from './layout.ts';

/**
 * A farm is a grid of square plots (FIELD.PLOT world units, 3×3 crops each). Row 0 is the far side (−z).
 *   '.' nothing (scenery)        '#' rocks, '~' water — never cleared, the route bends around them
 *   'S' start territory (cleared) 'D' start plot whose outward side carries the depot
 *   'o' plot, zone assigned by distance from the start   '0'..'3' plot with an explicit zone
 * The route is always the outline of the cleared territory; clearing plots next to it pushes it outward.
 */
export interface FarmDef {
  id: FarmId;
  index: number;
  seed: number;
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

function farm(id: FarmId, index: number, seed: number, crops: FarmDef['crops'], map: string[]): FarmDef {
  const layout = buildLayout(map, FIELD.PLOT, ZONE_SHARE, FIELD.PLOT_CROPS);
  return {
    id,
    index,
    seed,
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

export const FARMS: Record<FarmId, FarmDef> = {
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

export const getFarm = (id: FarmId): FarmDef => FARMS[id];
