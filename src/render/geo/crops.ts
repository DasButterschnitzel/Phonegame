import * as THREE from 'three';
import type { CropId } from '../../game/types.ts';
import { build, ball, box, cone, cyl, lathe, octa, type Part } from './lowpoly.ts';
import { biteShape, bittenGeometry, type BiteShape } from './bite.ts';

const LEAF = 0x4caf50;
const LEAF_DARK = 0x2e8b3a;
const STEM = 0x6b8e23;

const leafFan = (n: number, r: number, h: number, color = LEAF, y = 0.05): Part[] =>
  Array.from({ length: n }, (_, i) => ({
    geo: cone(0.09, h, 3),
    color,
    pos: [Math.cos((i / n) * Math.PI * 2) * r, y + h / 2, Math.sin((i / n) * Math.PI * 2) * r] as [number, number, number],
    rot: [Math.sin((i / n) * Math.PI * 2) * 0.5, 0, -Math.cos((i / n) * Math.PI * 2) * 0.5] as [number, number, number],
    jitter: 0.15,
    leaf: true,
  }));

const fruitsAround = (n: number, r: number, y: number, size: number, color: number, geo: () => THREE.BufferGeometry = () => octa(size)): Part[] =>
  Array.from({ length: n }, (_, i) => ({
    geo: geo(),
    color,
    pos: [Math.cos((i / n) * Math.PI * 2 + 0.4) * r, y + (i % 2) * 0.12, Math.sin((i / n) * Math.PI * 2 + 0.4) * r] as [number, number, number],
    jitter: 0.1,
    leaf: true,
  }));

const bush = (r: number, h: number, color = LEAF_DARK): Part[] => [
  { geo: ball(r, 0), color, pos: [0, h, 0], scale: [1.1, 0.8, 1.1], jitter: 0.2, flesh: 0xb9e59a },
  { geo: octa(r * 0.75), color: LEAF, pos: [r * 0.45, h * 0.75, 0.1], jitter: 0.2, flesh: 0xc9eda8 },
];

const ribbed = (r: number, h: number): [number, number][] => [
  [0.0, 0],
  [r * 0.75, h * 0.08],
  [r, h * 0.45],
  [r * 0.7, h * 0.9],
  [0.0, h],
];

const BUILDERS: Record<CropId, () => Part[]> = {
  lettuce: () => [
    { geo: ball(0.32, 0), color: 0x8fdc5a, pos: [0, 0.26, 0], scale: [1, 0.75, 1], jitter: 0.2, flesh: 0xe6f8b4 },
    ...leafFan(5, 0.18, 0.32, 0x6cc24a, 0.0),
  ],
  wheat: () =>
    Array.from({ length: 4 }, (_, i) => {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      const r = 0.15;
      return [
        { geo: cone(0.035, 0.6, 3), color: 0xc9a43c, pos: [Math.cos(a) * r, 0.3, Math.sin(a) * r] as [number, number, number], rot: [Math.PI, 0, 0] as [number, number, number], flesh: 0xf6e7a8 },
        { geo: cone(0.08, 0.32, 4), color: 0xf2c94c, pos: [Math.cos(a) * r, 0.72, Math.sin(a) * r] as [number, number, number], jitter: 0.15, leaf: true },
      ];
    }).flat(),
  carrot: () => [
    { geo: cone(0.16, 0.4, 5), color: 0xff8c2b, pos: [0, 0.12, 0], rot: [Math.PI, 0, 0], jitter: 0.1, flesh: 0xffc58a },
    ...leafFan(4, 0.05, 0.45, 0x5cbf3a, 0.3),
  ],
  corn: () => [
    { geo: cyl(0.05, 0.07, 1.0, 4), color: STEM, pos: [0, 0.5, 0], flesh: 0xd8f0a0 },
    { geo: cyl(0.09, 0.07, 0.36, 5), color: 0xffd23f, pos: [0.1, 0.62, 0], rot: [0, 0, -0.35], jitter: 0.1, leaf: true },
    ...leafFan(3, 0.08, 0.55, LEAF, 0.15),
    { geo: cone(0.05, 0.25, 3), color: 0xe8c86a, pos: [0, 1.1, 0], leaf: true },
  ],
  cabbage: () => [
    { geo: ball(0.34, 0), color: 0x9fd987, pos: [0, 0.3, 0], scale: [1, 0.85, 1], jitter: 0.15, flesh: 0xf2fbe0 },
    ...leafFan(5, 0.25, 0.25, 0x6fbf6a, 0.0),
  ],
  pumpkin: () => [
    { geo: lathe(ribbed(0.36, 0.48), 8), color: 0xff7b1c, jitter: 0.12, flesh: 0xffc35a },
    { geo: cyl(0.04, 0.05, 0.16, 4), color: 0x5a7d2a, pos: [0, 0.52, 0], leaf: true },
    { geo: box(0.25, 0.02, 0.14), color: LEAF, pos: [0.15, 0.47, 0.05], rot: [0, 0.6, 0.3], leaf: true },
  ],
  squash: () => [
    { geo: ball(0.2, 0), color: 0xf6d743, pos: [0, 0.18, 0], scale: [1.6, 0.9, 1], jitter: 0.12, flesh: 0xfff3b8 },
    { geo: octa(0.16), color: 0x9acd32, pos: [0.25, 0.16, 0.05], scale: [1.2, 0.9, 1], jitter: 0.12, flesh: 0xeef8c4 },
    ...leafFan(3, 0.2, 0.22, LEAF, 0.0),
  ],
  watermelon: () => [
    { geo: lathe(ribbed(0.32, 0.5), 7), color: 0x2f8f3a, pos: [0, 0.32, 0], rot: [0, 0, Math.PI / 2], scale: [1.3, 1, 1], jitter: 0.3, flesh: 0xff5d6c },
    { geo: cyl(0.03, 0.03, 0.14, 3), color: 0x5a7d2a, pos: [-0.36, 0.36, 0], rot: [0, 0, 1.2], leaf: true },
  ],
  tomato: () => [...bush(0.3, 0.42), ...fruitsAround(4, 0.24, 0.32, 0.1, 0xff3b30)],
  sunflower: () => [
    { geo: cyl(0.04, 0.06, 1.1, 4), color: STEM, pos: [0, 0.55, 0], flesh: 0xd5eea0 },
    { geo: cyl(0.3, 0.3, 0.06, 7), color: 0xffd60a, pos: [0, 1.15, 0.05], rot: [1.2, 0, 0], jitter: 0.1, leaf: true },
    { geo: octa(0.15), color: 0x6b3e1f, pos: [0, 1.17, 0.1], rot: [1.2, 0, 0], scale: [1, 0.4, 1], leaf: true },
    ...leafFan(2, 0.1, 0.35, LEAF, 0.3),
  ],
  strawberry: () => [
    { geo: ball(0.26, 0), color: 0x3e9b47, pos: [0, 0.2, 0], scale: [1.2, 0.7, 1.2], jitter: 0.2, flesh: 0xb4e4a4 },
    ...fruitsAround(3, 0.24, 0.12, 0.09, 0xff2d55, () => cone(0.09, 0.16, 4)),
  ],
  blueberry: () => [...bush(0.3, 0.38, 0x3b7f4a), ...fruitsAround(4, 0.25, 0.3, 0.075, 0x3d5afe)],
  turnip: () => [
    { geo: octa(0.2), color: 0xf3e6ff, pos: [0, 0.16, 0], jitter: 0.1, flesh: 0xfffcf4 },
    { geo: octa(0.15), color: 0xb04fd6, pos: [0, 0.27, 0], jitter: 0.1, flesh: 0xfdf2ff },
    ...leafFan(4, 0.04, 0.38, 0x5cbf3a, 0.32),
  ],
  pepper: () => [...bush(0.27, 0.38), ...fruitsAround(3, 0.22, 0.26, 0.08, 0xff2e1f, () => cone(0.07, 0.24, 4))],
  cactusfruit: () => [
    { geo: cyl(0.16, 0.18, 0.75, 6), color: 0x3fae49, pos: [0, 0.375, 0], jitter: 0.12, flesh: 0xc8f5a8 },
    { geo: cyl(0.08, 0.09, 0.3, 5), color: 0x3fae49, pos: [0.22, 0.45, 0], rot: [0, 0, -0.9], flesh: 0xc8f5a8 },
    { geo: octa(0.09), color: 0xff6fb5, pos: [0, 0.8, 0], leaf: true },
    { geo: octa(0.08), color: 0xff6fb5, pos: [0.33, 0.57, 0], leaf: true },
  ],
  dragonfruit: () => [
    { geo: cyl(0.1, 0.13, 0.6, 5), color: 0x2e9c4a, pos: [0, 0.3, 0], jitter: 0.12, flesh: 0xc8f0a8 },
    { geo: ball(0.2, 0), color: 0xff3fa4, pos: [0, 0.72, 0], scale: [0.9, 1.25, 0.9], jitter: 0.12, flesh: 0xfff0f6 },
    ...leafFan(3, 0.12, 0.2, 0x7ddf64, 0.68),
  ],
};

export interface CropMeshes {
  /** The untouched crop (cheap: most of the field). */
  intact: THREE.BufferGeometry;
  /** Same crop, subdivided and tagged for the bite shader (only crops that have been bitten use it). */
  bitten: THREE.BufferGeometry;
  shape: BiteShape;
}

const cache = new Map<CropId, CropMeshes>();
/** Longest edge of a solid face in the bitten mesh: fine enough for a bite to carve a notch that reads on a phone. */
const BITE_EDGE = 0.15;

/** Low-poly crop geometry (~1 world unit footprint) and its bitten variant, cached. */
export function cropMeshes(id: CropId): CropMeshes {
  let m = cache.get(id);
  if (!m) {
    const parts = BUILDERS[id]();
    const triPart: number[] = [];
    const intact = build(parts, 0.35, 0.6, triPart);
    const bitten = bittenGeometry(intact, triPart, parts, BITE_EDGE);
    m = { intact, bitten, shape: biteShape(bitten) };
    cache.set(id, m);
  }
  return m;
}

export function cropGeometry(id: CropId): THREE.BufferGeometry {
  return cropMeshes(id).intact;
}
