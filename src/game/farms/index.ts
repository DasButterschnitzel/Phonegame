import type { CropId, FarmId } from '../types.ts';
import type { Pt } from '../path.ts';

export interface StageDef {
  /** Polygon corners; the loop is these edges joined by fillets. Every stage passes the barn point. */
  corners: Pt[];
  /** Coins (before the farm cost multiplier) to EXPAND into this stage. 0 for stage 0. */
  cost: number;
  maxSegments: number;
}

export interface FarmDef {
  id: FarmId;
  index: number;
  seed: number;
  crops: [CropId, CropId, CropId, CropId];
  bounds: { x0: number; z0: number; x1: number; z1: number };
  /** Unload point on the path (x, z) and the barn building centre (bx, bz). */
  barn: { x: number; z: number; bx: number; bz: number };
  stages: [StageDef, StageDef, StageDef, StageDef];
  /** Coins (before multiplier) to finish the farm after the last stage. */
  finishCost: number;
}

const EXPAND_COSTS = [0, 2500, 30_000, 220_000] as const;
const MAX_SEGMENTS = [8, 14, 22, 32] as const;
const FINISH_COST = 1_200_000;

function stages(...polys: Pt[][]): [StageDef, StageDef, StageDef, StageDef] {
  return polys.map((corners, i) => ({
    corners: orient(corners),
    cost: EXPAND_COSTS[i],
    maxSegments: MAX_SEGMENTS[i],
  })) as [StageDef, StageDef, StageDef, StageDef];
}

/** All loops run the same way round (positive signed area in x/z), so EXPAND never reverses the caterpillar. */
function orient(corners: Pt[]): Pt[] {
  let a = 0;
  for (let i = 0; i < corners.length; i++) {
    const [x1, z1] = corners[i];
    const [x2, z2] = corners[(i + 1) % corners.length];
    a += x1 * z2 - x2 * z1;
  }
  return a < 0 ? [...corners].reverse() : corners;
}

export const FARMS: Record<FarmId, FarmDef> = {
  meadow: {
    id: 'meadow',
    index: 0,
    seed: 1101,
    crops: ['lettuce', 'wheat', 'carrot', 'pumpkin'],
    bounds: { x0: -24, z0: -27, x1: 24, z1: 8 },
    barn: { x: 0, z: 4, bx: 0, bz: 0.6 },
    stages: stages(
      [[-6, 4], [-6, -4], [6, -4], [6, 4]],
      [[-6, 4], [-6, -10], [12, -10], [12, 4]],
      [[-16, 4], [-16, -14], [12, -14], [12, -2], [6, -2], [6, 4]],
      [[-20, 4], [-20, -22], [-4, -22], [-4, -12], [4, -12], [4, -22], [20, -22], [20, 4]],
    ),
    finishCost: FINISH_COST,
  },
  pumpkin: {
    id: 'pumpkin',
    index: 1,
    seed: 2202,
    crops: ['cabbage', 'squash', 'pumpkin', 'watermelon'],
    bounds: { x0: -12, z0: -24, x1: 24, z1: 18 },
    barn: { x: -8, z: 0, bx: -4.6, bz: 0 },
    stages: stages(
      [[-8, 6], [-8, -6], [2, -6], [2, 6]],
      [[-8, 8], [-8, -12], [8, -12], [8, 8]],
      [[-8, 10], [-8, -12], [8, -12], [8, -4], [16, -4], [16, 10]],
      [[-8, 14], [-8, -20], [20, -20], [20, 14], [10, 14], [10, 4], [2, 4], [2, 14]],
    ),
    finishCost: FINISH_COST,
  },
  sunflower: {
    id: 'sunflower',
    index: 2,
    seed: 3303,
    crops: ['turnip', 'tomato', 'corn', 'sunflower'],
    bounds: { x0: -22, z0: -26, x1: 22, z1: 10 },
    barn: { x: 0, z: 6, bx: 0, bz: 2.6 },
    stages: stages(
      [[-7, 6], [-7, -2], [-3, -6], [7, -6], [7, 6]],
      [[-10, 6], [-10, -6], [-4, -12], [10, -12], [10, 6]],
      [[-14, 6], [-14, -10], [-8, -16], [14, -16], [14, 0], [8, 6]],
      [[-18, 6], [-18, -14], [-10, -22], [18, -22], [18, -2], [10, 6]],
    ),
    finishCost: FINISH_COST,
  },
  snowyberry: {
    id: 'snowyberry',
    index: 3,
    seed: 4404,
    crops: ['turnip', 'blueberry', 'strawberry', 'pumpkin'],
    bounds: { x0: -24, z0: -20, x1: 12, z1: 20 },
    barn: { x: 8, z: 0, bx: 4.6, bz: 0 },
    stages: stages(
      [[8, 5], [-4, 5], [-4, -5], [8, -5]],
      [[8, 8], [-10, 8], [-10, -8], [8, -8]],
      [[8, 8], [-6, 8], [-6, 14], [-16, 14], [-16, -10], [8, -10]],
      [[8, 16], [-20, 16], [-20, 4], [-10, 4], [-10, -4], [-20, -4], [-20, -16], [8, -16]],
    ),
    finishCost: FINISH_COST,
  },
  desert: {
    id: 'desert',
    index: 4,
    seed: 5505,
    crops: ['pepper', 'cactusfruit', 'watermelon', 'dragonfruit'],
    bounds: { x0: -22, z0: -13, x1: 22, z1: 22 },
    barn: { x: 0, z: -6, bx: 0, bz: -9.4 },
    stages: stages(
      [[-6, -6], [6, -6], [6, 4], [-6, 4]],
      [[-6, -6], [10, -6], [10, 10], [-6, 10]],
      [[-14, -6], [10, -6], [10, 14], [-2, 14], [-2, 6], [-14, 6]],
      [[-18, -6], [18, -6], [18, 18], [6, 18], [6, 10], [-6, 10], [-6, 18], [-18, 18]],
    ),
    finishCost: FINISH_COST,
  },
};

export const getFarm = (id: FarmId): FarmDef => FARMS[id];
