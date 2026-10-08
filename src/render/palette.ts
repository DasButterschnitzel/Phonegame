import type { BiomeId, CropId } from '../game/types.ts';

/** Trees of the decor ring and of the gaps in a farm's outline. */
export const TREE_KINDS = [
  'tree', 'pine', 'cactus', 'birch', 'baobab', 'acacia', 'bamboo', 'broadleaf', 'cypress', 'stonepine',
  'palm', 'fern', 'fir', 'sakura', 'blackpine', 'polylepis', 'puya', 'whitebirch', 'spruce',
] as const;
export type TreeKind = (typeof TREE_KINDS)[number];
/** Smaller scenery scattered in the decor ring. */
export const PROP_KINDS = [
  'snowman', 'termite', 'tallgrass', 'stonewall', 'haybale', 'urn', 'stilthut', 'sheep', 'scarecrow', 'beehive',
  'hibiscus', 'fruitcrate', 'giftbox', 'sled', 'lamppost', 'stonelantern', 'bamboofence', 'alpaca', 'peak', 'woodpile', 'cairn',
] as const;
export type PropKind = (typeof PROP_KINDS)[number];
/** Landmarks beyond the field corners (some have a spinning rotor). */
export const LANDMARK_KINDS = ['windmill', 'windpump', 'granary', 'farmhouse', 'lookout', 'cabin', 'teahouse', 'stonehut', 'redhouse'] as const;
export type LandmarkKind = (typeof LANDMARK_KINDS)[number];
/** Rocks: field obstacles and the ring. */
export const ROCK_KINDS = ['stone', 'granite', 'mossy', 'limestone', 'sandstone', 'basalt', 'ice', 'pebble', 'slate'] as const;
export type RockKind = (typeof ROCK_KINDS)[number];
/** Ambient particles drifting over the farm. */
export type WeatherKind = 'none' | 'dust' | 'mist' | 'leaves' | 'snow' | 'pollen' | 'butterflies' | 'petals';

export interface PropSpec {
  kind: PropKind;
  n: number;
  dMin: number;
  dMax: number;
  /** Size multiplier (distant mountains are big). */
  scale?: number;
}

/** The depot keeps its language (pad, hopper, chevrons, sign); its barn is dressed per biome. */
export interface DepotSkin {
  wall: number;
  roof: number;
  trim: number;
  door: number;
  silo: number;
  siloTop: number;
  loft: number;
}

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
  decor: TreeKind;
  /** A second tree kind mixed into the ring (and the outline gaps). */
  decor2?: TreeKind;
  yaw: number;
  /** Cleared territory (fresh meadow), water / ice. */
  cleared: number;
  water: number;
  rock?: RockKind;
  /** Grass tuft colours (ring and cleared plots). */
  tuft?: readonly [number, number, number];
  /** Flower colours in the ring and on cleared plots (null: no flowers). */
  flowers?: readonly number[] | null;
  props?: readonly PropSpec[];
  landmark?: LandmarkKind;
  weather?: WeatherKind;
  depot?: DepotSkin;
}

export const DEFAULT_TUFT = [0x4f9e3a, 0x5fb346, 0x6cc24a] as const;
export const DEFAULT_FLOWERS = [0xff6fb5, 0xffffff, 0xffd23f, 0x9b5de5, 0xff5d5d] as const;
export const RED_BARN: DepotSkin = { wall: 0xd64545, roof: 0x5b3a29, trim: 0xffffff, door: 0xa83232, silo: 0xdfe6ee, siloTop: 0x8a99a8, loft: 0xffd23f };

/** Looks per biome family (World Tour farms of a family share it, with variants). */
export const BIOMES: Partial<Record<BiomeId, Biome>> = {
  // Tilled soil fields + sandy paths make crops and the caterpillar pop against the grass outside the fence.
  meadow: { sky: 0x8fd6ff, fog: 0xcdeeff, groundA: 0xb9864f, groundB: 0xad7b46, outside: 0x7cc56b, path: 0xf5d394, pathEdge: 0xd9a866, hemiSky: 0xffffff, hemiGround: 0x6d8f4a, sun: 0xfff1d6, decor: 'tree', yaw: Math.PI / 4, cleared: 0x8fd468, water: 0x5cc3f0, props: [{ kind: 'sheep', n: 9, dMin: 2.5, dMax: 10 }] },
  pumpkin: { sky: 0xffcf96, fog: 0xffe6c8, groundA: 0x9f6d3c, groundB: 0x936435, outside: 0x9bb04a, path: 0xf0cb8e, pathEdge: 0xcf9d5f, hemiSky: 0xfff0dd, hemiGround: 0x7a6a3a, sun: 0xffe0b0, decor: 'birch', yaw: Math.PI / 4, cleared: 0xa9cc5c, water: 0x5bb8d6, props: [{ kind: 'scarecrow', n: 6, dMin: 2, dMax: 8 }, { kind: 'haybale', n: 6, dMin: 3, dMax: 10 }], weather: 'leaves' },
  sunflower: { sky: 0x80d0ff, fog: 0xc5ecff, groundA: 0xc3955a, groundB: 0xb88a51, outside: 0x86c95a, path: 0xf7dea6, pathEdge: 0xdcb36f, hemiSky: 0xffffff, hemiGround: 0x6a9440, sun: 0xfff6dc, decor: 'tree', yaw: Math.PI / 4, cleared: 0x9bd66a, water: 0x5cc3f0, props: [{ kind: 'beehive', n: 8, dMin: 2, dMax: 8 }], weather: 'pollen' },
  snowyberry: { sky: 0xbfe3ff, fog: 0xe8f3ff, groundA: 0xdfe8f4, groundB: 0xd2ddeb, outside: 0xdfe8f3, path: 0xb39a80, pathEdge: 0x8f7a64, hemiSky: 0xffffff, hemiGround: 0x9aa8b8, sun: 0xffffff, decor: 'pine', yaw: Math.PI / 4, cleared: 0xd3efd6, water: 0xb8e4ff, props: [{ kind: 'snowman', n: 10, dMin: 3, dMax: 9 }], weather: 'snow' },
  desert: { sky: 0xffd49c, fog: 0xffe9c9, groundA: 0xf2cf8a, groundB: 0xe7c178, outside: 0xe3b66a, path: 0xc3864d, pathEdge: 0xa46e3d, hemiSky: 0xfff4e0, hemiGround: 0xa47d47, sun: 0xffe7c2, decor: 'cactus', yaw: Math.PI / 4, cleared: 0xc9d47a, water: 0x4fc1d6, flowers: null, rock: 'sandstone', weather: 'dust' },
  // ——— World Tour families: each its own trees, props, landmark, rocks, barn, weather and light ———
  // Zambezi Orchard: red laterite soil, golden grass, baobabs and umbrella acacias, granite kopjes, a wind pump, warm dust.
  orchard: {
    sky: 0x9fd6f0, fog: 0xf2e0bc, groundA: 0xb5653a, groundB: 0xa95d35, outside: 0xc9b46a, path: 0xebc38c, pathEdge: 0xc08a52,
    hemiSky: 0xfff3dc, hemiGround: 0x8a6a3a, sun: 0xffe0aa, decor: 'acacia', decor2: 'baobab', yaw: Math.PI / 4,
    cleared: 0xb2c45e, water: 0x6aa89a, rock: 'granite', tuft: [0x8f8a3a, 0xa39a42, 0x7d7a34], flowers: [0xffd23f, 0xff8c42, 0xffffff],
    props: [{ kind: 'termite', n: 16, dMin: 2.5, dMax: 12 }, { kind: 'tallgrass', n: 150, dMin: 1.2, dMax: 10 }],
    landmark: 'windpump', weather: 'dust',
    depot: { wall: 0xd9a05b, roof: 0xb8c0c8, trim: 0x7a4a2a, door: 0x8a5a32, silo: 0xc9d0d6, siloTop: 0x9aa4ad, loft: 0xffe08a },
  },
  // Jade Rice Terraces: wet earth beds, jade paddies once cleared, bamboo and broadleaf trees, stilted granaries, mist.
  rice: {
    sky: 0xb9e4dc, fog: 0xdcefe6, groundA: 0x8a7550, groundB: 0x7e6a48, outside: 0x5fae5a, path: 0xd9c9a0, pathEdge: 0xa89468,
    hemiSky: 0xf0fff8, hemiGround: 0x4f7a4a, sun: 0xfff4e2, decor: 'broadleaf', decor2: 'bamboo', yaw: Math.PI / 4,
    cleared: 0x86cfa8, water: 0x7cc8bd, rock: 'mossy', tuft: [0x6cc26a, 0x84d47a, 0x5ab45a], flowers: [0xffffff, 0xff9ec4, 0xfff3a0],
    props: [{ kind: 'stonewall', n: 16, dMin: 2, dMax: 12 }, { kind: 'stilthut', n: 4, dMin: 5, dMax: 12 }],
    landmark: 'granary', weather: 'mist',
    depot: { wall: 0x7a5236, roof: 0xc9a45a, trim: 0x3e2a1c, door: 0x5e3e26, silo: 0xb08a5a, siloTop: 0xc9a45a, loft: 0xfff0b0 },
  },
  // Tuscan Vineyard: ochre soil, sage hills, cypress lanes and umbrella pines, limestone, a stone farmhouse, falling leaves.
  vineyard: {
    sky: 0x9fcff5, fog: 0xf4e6c8, groundA: 0xc49a62, groundB: 0xb98f58, outside: 0xa9b66a, path: 0xf0dcb0, pathEdge: 0xcfae7a,
    hemiSky: 0xfff8e8, hemiGround: 0x7d7a48, sun: 0xffe8c0, decor: 'cypress', decor2: 'stonepine', yaw: Math.PI / 4,
    cleared: 0xb3c96a, water: 0x6fb2c9, rock: 'limestone', tuft: [0x9aae5a, 0xa8bc66, 0x8aa04e], flowers: [0xe63946, 0xffffff, 0xb39ddb],
    props: [{ kind: 'haybale', n: 10, dMin: 3, dMax: 12 }, { kind: 'urn', n: 8, dMin: 2.5, dMax: 8 }],
    landmark: 'farmhouse', weather: 'leaves',
    depot: { wall: 0xead2a4, roof: 0xc0603a, trim: 0x6b4a2e, door: 0x6e8a5a, silo: 0xe2cfa8, siloTop: 0xb85a36, loft: 0xffe6a8 },
  },
  // Tropical Plantation: rich red-brown soil, lush green, palms and tree ferns, hibiscus, a lagoon, butterflies.
  tropical: {
    sky: 0x7fd8f0, fog: 0xc8f0ec, groundA: 0xa0603a, groundB: 0x935836, outside: 0x4fbf5a, path: 0xf2dfb0, pathEdge: 0xd4b77a,
    hemiSky: 0xf0fffa, hemiGround: 0x4a8a4a, sun: 0xfff2d0, decor: 'palm', decor2: 'fern', yaw: Math.PI / 4,
    cleared: 0x7fd66a, water: 0x3fd0d0, rock: 'basalt', tuft: [0x3faa4a, 0x52bb55, 0x6cc85a], flowers: [0xff3b5c, 0xffd23f, 0xff8c42],
    props: [{ kind: 'hibiscus', n: 30, dMin: 1.6, dMax: 10 }, { kind: 'fruitcrate', n: 8, dMin: 2.5, dMax: 8 }],
    landmark: 'lookout', weather: 'butterflies',
    depot: { wall: 0x5fc9c0, roof: 0xc9a45a, trim: 0xffffff, door: 0x3a8a8a, silo: 0xe8e0c8, siloTop: 0xc9a45a, loft: 0xfff0b0 },
  },
  // Christmas Tree Farm: dark frozen beds in deep snow, firs, presents and sleds, warm lamps, a log cabin, snowfall.
  evergreen: {
    sky: 0x9ab8d8, fog: 0xc8d8ea, groundA: 0x7a6a5a, groundB: 0x6e5f50, outside: 0xeaf1f8, path: 0xc9b49a, pathEdge: 0xa08a70,
    hemiSky: 0xdfe8ff, hemiGround: 0x8a9ab0, sun: 0xffe6c8, decor: 'fir', decor2: 'pine', yaw: Math.PI / 4,
    cleared: 0xdbe8e4, water: 0xc8e8ff, rock: 'ice', tuft: [0xc8d8d0, 0xb8ccc4, 0xd8e4de], flowers: null,
    props: [{ kind: 'giftbox', n: 12, dMin: 2, dMax: 9 }, { kind: 'sled', n: 5, dMin: 2.5, dMax: 9 }, { kind: 'lamppost', n: 8, dMin: 1.6, dMax: 6 }],
    landmark: 'cabin', weather: 'snow',
    depot: { wall: 0x8b5a3c, roof: 0xf4f8fc, trim: 0xd64545, door: 0x6b3a2a, silo: 0xb89a78, siloTop: 0xf4f8fc, loft: 0xffd27a },
  },
  // Sakura Tea Garden: dark soil, moss, raked-gravel paths, cherry blossom and garden pines, stone lanterns, petals.
  blossom: {
    sky: 0xbfe0f5, fog: 0xf3e6ee, groundA: 0x6a5a48, groundB: 0x5f5040, outside: 0x8cc77a, path: 0xe8dcc8, pathEdge: 0xb8a890,
    hemiSky: 0xfff6fa, hemiGround: 0x6a8a5a, sun: 0xfff0f0, decor: 'sakura', decor2: 'blackpine', yaw: Math.PI / 4,
    cleared: 0x9fd48a, water: 0x7fc0d8, rock: 'pebble', tuft: [0x6aaa5a, 0x7cbc66, 0x5a9a4e], flowers: [0xffffff, 0xffc0d8, 0xfff3a0],
    props: [{ kind: 'stonelantern', n: 9, dMin: 1.8, dMax: 8 }, { kind: 'bamboofence', n: 10, dMin: 2, dMax: 10 }],
    landmark: 'teahouse', weather: 'petals',
    depot: { wall: 0x8a5a3a, roof: 0x4a5260, trim: 0xe8dcc8, door: 0x6a4a2e, silo: 0xd8c8a8, siloTop: 0x4a5260, loft: 0xfff0c8 },
  },
  // Andean Terraces: deep blue sky, high grassland, stone walls, queñua and puya, alpacas, distant snowy peaks.
  highland: {
    sky: 0x5aa8ec, fog: 0xd6e4f2, groundA: 0x8a6a4a, groundB: 0x7e6044, outside: 0xc2b06a, path: 0xd6c3a0, pathEdge: 0xa89070,
    hemiSky: 0xffffff, hemiGround: 0x8a7a5a, sun: 0xfff8e8, decor: 'polylepis', decor2: 'puya', yaw: Math.PI / 4,
    cleared: 0xa8c070, water: 0x6ab8e0, rock: 'slate', tuft: [0xd8c070, 0xc8b060, 0xe0cc84], flowers: [0xffd23f, 0xff6b3a, 0xc8a8f0],
    props: [{ kind: 'alpaca', n: 14, dMin: 1.8, dMax: 9 }, { kind: 'stonewall', n: 16, dMin: 2, dMax: 11 }, { kind: 'peak', n: 9, dMin: 9, dMax: 16, scale: 1.6 }],
    landmark: 'stonehut', weather: 'mist',
    depot: { wall: 0xc8a882, roof: 0xd8b860, trim: 0x7a5a3a, door: 0x2a6a8a, silo: 0xb89a78, siloTop: 0xd8b860, loft: 0xfff0c0 },
  },
  // Nordic Berry: peaty soil, birch meadows and spruce, lakes, a falu-red cottage, woodpiles and cairns, low gold sun.
  nordic: {
    sky: 0xa8d4f0, fog: 0xe0eef4, groundA: 0x6a5038, groundB: 0x5e4732, outside: 0x6aaa5a, path: 0xd8c8a0, pathEdge: 0xa8946a,
    hemiSky: 0xfff8e8, hemiGround: 0x5a7a4a, sun: 0xffe8b8, decor: 'whitebirch', decor2: 'spruce', yaw: Math.PI / 4,
    cleared: 0x8acc6a, water: 0x5aa0d0, rock: 'granite', tuft: [0x5a9a4a, 0x6aaa54, 0x7aba5e], flowers: [0xffffff, 0xb39ddb, 0xffd23f],
    props: [{ kind: 'woodpile', n: 8, dMin: 2.5, dMax: 9 }, { kind: 'cairn', n: 7, dMin: 2, dMax: 12 }],
    landmark: 'redhouse', weather: 'none',
    depot: { wall: 0xa83a2a, roof: 0x3a3a3a, trim: 0xffffff, door: 0x7a2a20, silo: 0xe8e0d0, siloTop: 0x3a3a3a, loft: 0xffe08a },
  },
};

/** Segment body colours by level (cycles; accessories distinguish later cycles). */
export const LEVEL_COLORS = [
  0xff6b4a, 0x3fa7f5, 0x9b5de5, 0xffc93c, 0x2ec4b6, 0xf15bb5, 0xff9f1c, 0x5465ff, 0x8ac926, 0xe63946, 0x00b4d8, 0xd9d9e8,
];
export const levelColor = (level: number): number => LEVEL_COLORS[(level - 1) % LEVEL_COLORS.length];

/** The look of a biome family (falls back to the meadow's while a family's look is being made). */
export const biomeLook = (id: BiomeId): Biome => BIOMES[id] ?? BIOMES.meadow!;

/** Loot-stack block colour of each crop (its most recognisable colour). */
export const CROP_COLORS: Record<CropId, number> = {
  lettuce: 0xc6f25a,
  wheat: 0xf2d16b,
  carrot: 0xff8c3b,
  corn: 0xffe14d,
  cabbage: 0x8fd694,
  pumpkin: 0xff7b1c,
  squash: 0xe9d36a,
  watermelon: 0x3fae49,
  tomato: 0xff4d4d,
  sunflower: 0xffc300,
  strawberry: 0xff3b5c,
  blueberry: 0x4d6bff,
  turnip: 0xc77dff,
  pepper: 0xff3b3b,
  cactusfruit: 0xff6fb5,
  dragonfruit: 0xff3fa4,
  groundnut: 0xd9b07a,
  sorghum: 0xc0552f,
  papaya: 0xffb347,
  mango: 0xff6b3d,
  riceshoot: 0x9be564,
  taro: 0xb18cc8,
  rice: 0xf2d36b,
  lychee: 0xe0303c,
  basil: 0x52c23f,
  artichoke: 0x7fb39a,
  grapes: 0x8a3fb0,
  olive: 0xc8b43a,
  pineapple: 0xf2b33a,
  sugarcane: 0x9acd52,
  banana: 0xffe14d,
  coconut: 0x8a5a32,
  holly: 0xd62e3a,
  sapling: 0x7ccf6a,
  firtree: 0x2f8a4a,
  bigfir: 0x2e6e6a,
  teabush: 0x4f9a46,
  daikon: 0xf4f4ee,
  eggplant: 0x6a3a8a,
  cherry: 0xe23a5a,
  potato: 0xc9a26a,
  quinoa: 0xe0703a,
  amaranth: 0xc8327a,
  purplecorn: 0x5a2a7a,
  lingonberry: 0xb01c30,
  cloudberry: 0xffa84a,
  rhubarb: 0xff7a8a,
  apple: 0x7ccf3a,
};

export const GOLD_BLOCK = 0xffd700;

/** Loot-stack block colours of a farm's four crop tiers, golden as index 4. */
export const tierColors = (crops: readonly CropId[]): number[] => [...crops.map((c) => CROP_COLORS[c]), GOLD_BLOCK];
