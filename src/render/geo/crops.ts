import * as THREE from 'three';
import type { CropId } from '../../game/types.ts';
import { build, ball, box, cone, cyl, dodeca, lathe, octa, type Part } from './lowpoly.ts';
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

/** A fruit tree's crown: a big faceted blob and a smaller lobe (solid — bites dent them) around `y`. */
const crown = (y: number, r: number, colors: readonly number[], flesh: number, spread = 0.42): Part[] => [
  { geo: dodeca(r), color: colors[0], pos: [0, y, 0], scale: [1.2, 0.85, 1.2], jitter: 0.18, flesh },
  { geo: dodeca(r * 0.72), color: colors[1 % colors.length], pos: [r * spread, y + r * 0.35, r * 0.2], jitter: 0.18, flesh },
];

/** Fruits hanging around a crown (bitten off whole). Octahedra: cheap, and they read as fruit at phone scale. */
const hanging = (n: number, r: number, y: number, size: number, colors: readonly number[], stretch = 1.25): Part[] =>
  Array.from({ length: n }, (_, i) => ({
    geo: octa(size),
    color: colors[i % colors.length],
    pos: [Math.cos((i / n) * Math.PI * 2 + 0.3) * r, y + ((i * 7) % 3) * 0.08, Math.sin((i / n) * Math.PI * 2 + 0.3) * r] as [number, number, number],
    scale: [1, stretch, 1] as [number, number, number],
    jitter: 0.1,
    leaf: true,
  }));

/**
 * World Tour crops. Budget: a plot of any crop stays under ~700 triangles (small crops ≤ ~78, large ones ≤ ~160 —
 * the starter crops sit at 300–830), so a farm of trees costs no more to draw than a farm of lettuce.
 * Large crops (trees, vines) stand 2 × 2 in a plot and are built bigger.
 */
const WORLD_BUILDERS = {
  // Low clover-like plant with yellow flowers; a pod peeks out of the soil.
  groundnut: (): Part[] => [
    { geo: ball(0.27, 0), color: 0x5fae45, pos: [0, 0.17, 0], scale: [1.35, 0.6, 1.35], jitter: 0.2, flesh: 0xd6efb0 },
    ...fruitsAround(3, 0.27, 0.2, 0.12, 0x79c955, () => octa(0.12)),
    ...fruitsAround(2, 0.12, 0.34, 0.06, 0xffd23f),
    { geo: octa(0.08), color: 0xd9b07a, pos: [0.3, 0.04, 0.12], scale: [1.7, 0.8, 0.9], rot: [0, 0.5, 0], leaf: true },
  ],
  // Two slender stalks with compact red-brown seed heads.
  sorghum: (): Part[] => {
    const head = (x: number, z: number, h: number): Part[] =>
      [
        [0, 0.07, 0, 0.08],
        [0.05, 0.15, 0.02, 0.065],
        [-0.02, 0.24, -0.02, 0.055],
      ].map(([dx, dy, dz, r], k): Part => ({ geo: octa(r), color: k % 2 ? 0xc8643a : 0xa94a2a, pos: [x + dx, h + dy, z + dz], scale: [1, 1.2, 1], jitter: 0.2, leaf: true }));
    return [
      { geo: cyl(0.035, 0.05, 0.95, 3), color: 0x7d9a3a, pos: [-0.08, 0.475, 0], flesh: 0xd8eea0 },
      { geo: cone(0.07, 0.6, 3), color: 0x6fa83e, pos: [0.06, 0.45, 0], rot: [0, 0, -0.9], leaf: true },
      ...head(-0.08, 0, 0.95),
      { geo: cyl(0.03, 0.045, 0.8, 3), color: 0x86a442, pos: [0.12, 0.4, 0.08], flesh: 0xd8eea0 },
      ...head(0.12, 0.08, 0.8),
    ];
  },
  // Pawpaw: a slim trunk, an umbrella of big leaves, fruit clustered under it.
  papaya: (): Part[] => [
    { geo: cyl(0.08, 0.13, 1.25, 5), color: 0x9a8f6a, pos: [0, 0.62, 0], jitter: 0.08, flesh: 0xe8dcb0 },
    ...Array.from({ length: 5 }, (_, i): Part => {
      const a = (i / 5) * Math.PI * 2;
      return { geo: cone(0.17, 0.78, 4), color: i % 2 ? 0x4caf50 : 0x5cbf55, pos: [Math.cos(a) * 0.34, 1.35, Math.sin(a) * 0.34], rot: [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25], scale: [1.4, 1, 0.4], jitter: 0.15, leaf: true };
    }),
    ...hanging(5, 0.13, 1.0, 0.12, [0xffa630, 0xc5d64a, 0xff9520], 1.45),
  ],
  // Mango tree: dense dark crown, orange and blushing fruit.
  mango: (): Part[] => [
    { geo: cyl(0.11, 0.17, 0.7, 5), color: 0x6e4a2a, pos: [0, 0.35, 0], jitter: 0.1, flesh: 0xd9b98a },
    ...crown(1.15, 0.62, [0x2f7d3a, 0x3d9446], 0xbfe39a),
    ...hanging(6, 0.56, 0.8, 0.11, [0xff9a2e, 0xf2c230, 0xe8543a]),
  ],
  // Rice seedlings: four lush tufts of bright blades.
  riceshoot: (): Part[] =>
    [
      [-0.17, -0.15],
      [0.18, -0.12],
      [-0.12, 0.2],
      [0.16, 0.18],
    ].flatMap(([x, z], t): Part[] =>
      Array.from({ length: 3 }, (_, i): Part => {
        const a = (i / 3) * Math.PI * 2 + t;
        const h = 0.46 + ((i + t) % 3) * 0.06;
        return { geo: cone(0.06, h, 3), color: [0x9be564, 0x84d752, 0xb2ee72][(i + t) % 3], pos: [x + Math.cos(a) * 0.05, h / 2, z + Math.sin(a) * 0.05], rot: [Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32], jitter: 0.1, leaf: true };
      }),
    ),
  // Taro: big heart-shaped leaves on long stems.
  taro: (): Part[] => [
    { geo: cyl(0.1, 0.13, 0.12, 5), color: 0x7a5a6a, pos: [0, 0.06, 0], flesh: 0xe8d4f0 },
    ...Array.from({ length: 4 }, (_, i): Part[] => {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const h = 0.5 + (i % 2) * 0.12;
      return [
        { geo: cone(0.035, h, 3), color: 0x7a9a5a, pos: [Math.cos(a) * 0.1, h / 2, Math.sin(a) * 0.1], rot: [Math.PI + Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], leaf: true },
        { geo: octa(0.28), color: i % 2 ? 0x3f9a4c : 0x4fae58, pos: [Math.cos(a) * 0.3, h + 0.05, Math.sin(a) * 0.3], rot: [Math.sin(a) * 0.5, a, -Math.cos(a) * 0.5], scale: [1.15, 0.18, 0.95], jitter: 0.12, leaf: true },
      ];
    }).flat(),
  ],
  // Ripe rice: a clump of stalks with drooping golden panicles.
  rice: (): Part[] =>
    Array.from({ length: 5 }, (_, i): Part[] => {
      const a = (i / 5) * Math.PI * 2;
      const r = 0.1 + (i % 2) * 0.1;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      return [
        { geo: cone(0.035, 0.72, 3), color: 0xb8b04a, pos: [x, 0.36, z], rot: [Math.PI, 0, 0], flesh: 0xf3eeb0 },
        { geo: octa(0.07), color: i % 2 ? 0xf0c94a : 0xe8bb3a, pos: [x + Math.cos(a) * 0.12, 0.66, z + Math.sin(a) * 0.12], rot: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7], scale: [0.8, 2.6, 0.8], leaf: true },
      ];
    }).flat(),
  // Lychee tree: a wide dark dome with red fruit clusters.
  lychee: (): Part[] => [
    { geo: cyl(0.1, 0.16, 0.6, 5), color: 0x5e4630, pos: [0, 0.3, 0], jitter: 0.1, flesh: 0xd8c09a },
    ...crown(1.02, 0.6, [0x2e6b3a, 0x3a8044], 0xb8dca0, 0.55),
    ...[0, 1, 2, 3].flatMap((k): Part[] => {
      const a = (k / 4) * Math.PI * 2 + 0.5;
      const cx = Math.cos(a) * 0.62;
      const cz = Math.sin(a) * 0.62;
      return [0, 1].map((j): Part => ({ geo: octa(0.085), color: j ? 0xc8283a : 0xe0303c, pos: [cx + (j - 0.5) * 0.09, 0.78 - j * 0.07, cz], jitter: 0.12, leaf: true }));
    }),
  ],
  // Basil: an upright bushy herb with glossy leaves and a white flower spike.
  basil: (): Part[] => [
    { geo: ball(0.22, 0), color: 0x4fb842, pos: [0, 0.26, 0], scale: [1.15, 1.1, 1.15], jitter: 0.18, flesh: 0xd2f2b8 },
    { geo: octa(0.16), color: 0x5cc24a, pos: [0.08, 0.46, 0.04], jitter: 0.18, flesh: 0xd2f2b8 },
    ...fruitsAround(4, 0.22, 0.3, 0.1, 0x7ad65a, () => octa(0.1)),
    { geo: cone(0.045, 0.22, 4), color: 0xf4f4ee, pos: [0.06, 0.68, 0.03], leaf: true },
  ],
  // Artichoke: silvery leaves and scaled buds, one already flowering purple.
  artichoke: (): Part[] => [
    ...leafFan(4, 0.16, 0.44, 0x8fae8a, 0.02),
    { geo: cyl(0.035, 0.045, 0.62, 3), color: 0x8fae8a, pos: [0, 0.31, 0], flesh: 0xdcebd6 },
    { geo: cone(0.15, 0.28, 6), color: 0x6f9a6a, pos: [0, 0.72, 0], jitter: 0.15, flesh: 0xe6f0c8 },
    { geo: cone(0.12, 0.22, 6), color: 0x6f9a6a, pos: [0.24, 0.42, 0.06], jitter: 0.15, flesh: 0xe6f0c8 },
    { geo: octa(0.09), color: 0x8e5aa8, pos: [0.24, 0.55, 0.06], scale: [1.2, 0.6, 1.2], leaf: true },
  ],
  // Grapevine on its stake: vine leaves and two purple bunches.
  grapes: (): Part[] => {
    const bunch = (x: number, z: number, y: number): Part[] => [
      { geo: cone(0.1, 0.24, 5), color: 0x6a3a8a, pos: [x, y, z], rot: [Math.PI, 0, 0], jitter: 0.15, leaf: true },
      { geo: octa(0.08), color: 0x7b4a9a, pos: [x, y + 0.1, z], jitter: 0.12, leaf: true },
    ];
    return [
      { geo: box(0.06, 0.9, 0.06), color: 0x8b6a45, pos: [0, 0.45, 0], flesh: 0xd9c09a },
      { geo: octa(0.2), color: 0x5f9e3c, pos: [0.16, 0.74, 0.04], scale: [1.3, 0.35, 1.3], jitter: 0.15, leaf: true },
      { geo: octa(0.18), color: 0x6fae48, pos: [-0.14, 0.82, -0.06], scale: [1.3, 0.35, 1.3], jitter: 0.15, leaf: true },
      ...bunch(0.17, 0.12, 0.5),
      ...bunch(-0.15, -0.1, 0.56),
    ];
  },
  // Olive tree: a twisted trunk, a light silver-green crown dotted with olives.
  olive: (): Part[] => [
    { geo: cyl(0.1, 0.16, 0.5, 5), color: 0x7b6a55, pos: [0.04, 0.25, 0], rot: [0, 0, 0.15], jitter: 0.12, flesh: 0xe0d2b0 },
    { geo: cyl(0.08, 0.1, 0.45, 4), color: 0x8a7860, pos: [-0.02, 0.66, 0.02], rot: [0.1, 0, -0.25], jitter: 0.12, flesh: 0xe0d2b0 },
    ...crown(1.08, 0.58, [0x8fa878, 0x9cb586], 0xe2ecd0, 0.6),
    ...hanging(6, 0.52, 0.88, 0.06, [0x3a3a2e, 0x5a6a2e], 1.3),
  ],
} satisfies Partial<Record<CropId, () => Part[]>>;

const BUILDERS: Record<CropId, () => Part[]> = {
  ...WORLD_BUILDERS,
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
