import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { cropMeshes } from './crops.ts';
import { landmarkGeometry, propGeometry, rockGeometry, treeGeometry } from './scenery.ts';
import { CROP_IDS, cropFit } from '../../game/crops.ts';
import type { LandmarkKind, PropKind, RockKind, TreeKind } from '../palette.ts';

/**
 * Triangle budgets for content (each crop tier and each scenery kind is one instanced mesh, so every instance counts):
 * a plot of any crop, any tree, rock, prop or landmark. New biome content must fit, so a farm of fruit trees costs
 * no more to draw than a farm of lettuce (goal-04 peak: ~158k triangles for the whole scene).
 */
const tris = (g: THREE.BufferGeometry) => g.getAttribute('position').count / 3;
const PLOT_BUDGET = 850;
const TREES: TreeKind[] = ['tree', 'pine', 'cactus', 'birch', 'baobab', 'acacia', 'bamboo', 'broadleaf', 'cypress', 'stonepine'];
const ROCKS: RockKind[] = ['stone', 'granite', 'mossy', 'limestone', 'sandstone'];
const PROPS: PropKind[] = ['snowman', 'termite', 'tallgrass', 'stonewall', 'haybale', 'urn', 'stilthut', 'sheep', 'scarecrow', 'beehive'];
const LANDMARKS: LandmarkKind[] = ['windmill', 'windpump', 'granary', 'farmhouse'];

describe('content triangle budgets', () => {
  it(`a plot of any crop stays under ${PLOT_BUDGET} triangles`, () => {
    const over = CROP_IDS.map((id) => [id, tris(cropMeshes(id).intact) * cropFit(id).k ** 2] as const).filter(([, n]) => n > PLOT_BUDGET);
    expect(over).toEqual([]);
  });
  it('trees ≤ 200, rocks ≤ 120, props ≤ 350, landmarks ≤ 700 triangles', () => {
    for (const k of TREES) expect(tris(treeGeometry(k)), k).toBeLessThanOrEqual(200);
    for (const k of ROCKS) expect(tris(rockGeometry(k)), k).toBeLessThanOrEqual(120);
    for (const k of PROPS) expect(tris(propGeometry(k)), k).toBeLessThanOrEqual(350);
    for (const k of LANDMARKS) {
      const l = landmarkGeometry(k);
      expect(tris(l.base) + (l.rotor ? tris(l.rotor) : 0), k).toBeLessThanOrEqual(700);
    }
  });
});
