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
}

export const BIOMES: Record<FarmId, Biome> = {
  meadow: { sky: 0x9fe0ff, fog: 0xbdeaff, groundA: 0x8ed36b, groundB: 0x7fc65d, outside: 0x6db04f, path: 0xd9a066, pathEdge: 0xb9824e, hemiSky: 0xffffff, hemiGround: 0x5d8a3c, sun: 0xfff1d6, decor: 'tree', yaw: Math.PI / 4 },
  pumpkin: { sky: 0xffd6a0, fog: 0xffe2bd, groundA: 0xb7c95a, groundB: 0xa8bb4c, outside: 0x8fa83f, path: 0xc98d5a, pathEdge: 0xa06c3f, hemiSky: 0xfff0dd, hemiGround: 0x7a6a3a, sun: 0xffe0b0, decor: 'birch', yaw: Math.PI / 4 },
  sunflower: { sky: 0x8fd8ff, fog: 0xb5e6ff, groundA: 0x9fdc6e, groundB: 0x91cf60, outside: 0x7dbc50, path: 0xe2b273, pathEdge: 0xbf8e52, hemiSky: 0xffffff, hemiGround: 0x6a9440, sun: 0xfff6dc, decor: 'tree', yaw: Math.PI / 4 },
  snowyberry: { sky: 0xcfe8ff, fog: 0xe4f1ff, groundA: 0xf4f8ff, groundB: 0xe6eef8, outside: 0xdfe8f3, path: 0xb7a28c, pathEdge: 0x93806c, hemiSky: 0xffffff, hemiGround: 0x9aa8b8, sun: 0xffffff, decor: 'pine', yaw: Math.PI / 4 },
  desert: { sky: 0xffd9a8, fog: 0xffe6c4, groundA: 0xf2cf8a, groundB: 0xe9c37a, outside: 0xe3b66a, path: 0xc58a52, pathEdge: 0xa46e3d, hemiSky: 0xfff4e0, hemiGround: 0xa47d47, sun: 0xffe7c2, decor: 'cactus', yaw: Math.PI / 4 },
};

/** Segment body colours by level (cycles; accessories distinguish later cycles). */
export const LEVEL_COLORS = [
  0x6cc24a, 0x3fa7f5, 0x9b5de5, 0xff5d5d, 0xff9f1c, 0xffd23f, 0x2ec4b6, 0xf15bb5, 0x5465ff, 0x8ac926, 0xe63946, 0xd9d9e8,
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
