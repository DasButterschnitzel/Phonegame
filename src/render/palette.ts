import type { FarmId } from '../game/types.ts';

export interface Biome {
  sky: number;
  fog: number;
  groundA: number;
  groundB: number;
  outside: number;
  path: number;
  pathEdge: number;
  hemiSky: number;
  hemiGround: number;
  sun: number;
  decor: 'tree' | 'pine' | 'cactus' | 'birch';
  yaw: number;
  /** Cleared territory (fresh meadow), water / ice. */
  cleared: number;
  water: number;
}

export const BIOMES: Record<FarmId, Biome> = {
  // Tilled soil fields + sandy paths make crops and the caterpillar pop against the grass outside the fence.
  meadow: { sky: 0x8fd6ff, fog: 0xcdeeff, groundA: 0xb9864f, groundB: 0xad7b46, outside: 0x7cc56b, path: 0xf5d394, pathEdge: 0xd9a866, hemiSky: 0xffffff, hemiGround: 0x6d8f4a, sun: 0xfff1d6, decor: 'tree', yaw: Math.PI / 4, cleared: 0x8fd468, water: 0x5cc3f0 },
  pumpkin: { sky: 0xffcf96, fog: 0xffe6c8, groundA: 0x9f6d3c, groundB: 0x936435, outside: 0x9bb04a, path: 0xf0cb8e, pathEdge: 0xcf9d5f, hemiSky: 0xfff0dd, hemiGround: 0x7a6a3a, sun: 0xffe0b0, decor: 'birch', yaw: Math.PI / 4, cleared: 0xa9cc5c, water: 0x5bb8d6 },
  sunflower: { sky: 0x80d0ff, fog: 0xc5ecff, groundA: 0xc3955a, groundB: 0xb88a51, outside: 0x86c95a, path: 0xf7dea6, pathEdge: 0xdcb36f, hemiSky: 0xffffff, hemiGround: 0x6a9440, sun: 0xfff6dc, decor: 'tree', yaw: Math.PI / 4, cleared: 0x9bd66a, water: 0x5cc3f0 },
  snowyberry: { sky: 0xbfe3ff, fog: 0xe8f3ff, groundA: 0xdfe8f4, groundB: 0xd2ddeb, outside: 0xdfe8f3, path: 0xb39a80, pathEdge: 0x8f7a64, hemiSky: 0xffffff, hemiGround: 0x9aa8b8, sun: 0xffffff, decor: 'pine', yaw: Math.PI / 4, cleared: 0xd3efd6, water: 0xb8e4ff },
  desert: { sky: 0xffd49c, fog: 0xffe9c9, groundA: 0xf2cf8a, groundB: 0xe7c178, outside: 0xe3b66a, path: 0xc3864d, pathEdge: 0xa46e3d, hemiSky: 0xfff4e0, hemiGround: 0xa47d47, sun: 0xffe7c2, decor: 'cactus', yaw: Math.PI / 4, cleared: 0xc9d47a, water: 0x4fc1d6 },
};

/** Segment body colours by level (cycles; accessories distinguish later cycles). */
export const LEVEL_COLORS = [
  0xff6b4a, 0x3fa7f5, 0x9b5de5, 0xffc93c, 0x2ec4b6, 0xf15bb5, 0xff9f1c, 0x5465ff, 0x8ac926, 0xe63946, 0x00b4d8, 0xd9d9e8,
];
export const levelColor = (level: number): number => LEVEL_COLORS[(level - 1) % LEVEL_COLORS.length];

/** Loot-stack block colours per crop tier (golden = index 4). */
export const TIER_BLOCK_COLORS: Record<FarmId, number[]> = {
  meadow: [0xc6f25a, 0xf2d16b, 0xff8c3b, 0xff7b1c, 0xffd700],
  pumpkin: [0x8fd694, 0xe9d36a, 0xff7b1c, 0x3fae49, 0xffd700],
  sunflower: [0xc77dff, 0xff4d4d, 0xffe14d, 0xffc300, 0xffd700],
  snowyberry: [0xc77dff, 0x4d6bff, 0xff3b5c, 0xff7b1c, 0xffd700],
  desert: [0xff3b3b, 0xff6fb5, 0x3fae49, 0xff3fa4, 0xffd700],
};
