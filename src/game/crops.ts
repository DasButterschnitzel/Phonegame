import type { CropId } from './types.ts';

/**
 * How big a crop grows. Small crops stand 3 × 3 in a plot; large ones (fruit trees, vines) 2 × 2; huge ones (a
 * giant's pumpkin) fill the plot alone. A plot always holds the same as nine small crops — the same HP to chew
 * through and the same value — so a biome's crop sizes change how a field looks and feels, not its economy.
 */
export type CropSize = 'small' | 'large' | 'huge';

export interface CropFit {
  size: CropSize;
  /** Crops per plot side. */
  k: number;
  /** Chunks a crop drops as it is chomped down. */
  chunks: number;
  /** Per-chunk HP and value factor: k² · chunks · scale = 27 (nine small crops of three chunks). */
  scale: number;
}

const PLOT_CHUNKS = 27;
const fit = (size: CropSize, k: number, chunks: number): CropFit => ({ size, k, chunks, scale: PLOT_CHUNKS / (k * k * chunks) });

export const CROP_FITS: Record<CropSize, CropFit> = {
  small: fit('small', 3, 3),
  large: fit('large', 2, 7),
  huge: fit('huge', 1, 27),
};

/**
 * Game-side crop registry (the geometry lives in render/geo/crops.ts). Every CropId must be listed: the record type
 * makes the compiler check it.
 */
const ALL: Record<CropId, CropSize> = {
  lettuce: 'small',
  wheat: 'small',
  carrot: 'small',
  corn: 'small',
  cabbage: 'small',
  pumpkin: 'small',
  squash: 'small',
  watermelon: 'small',
  tomato: 'small',
  sunflower: 'small',
  strawberry: 'small',
  blueberry: 'small',
  turnip: 'small',
  pepper: 'small',
  cactusfruit: 'small',
  dragonfruit: 'small',
  groundnut: 'small',
  sorghum: 'small',
  papaya: 'large',
  mango: 'large',
  riceshoot: 'small',
  taro: 'small',
  rice: 'small',
  lychee: 'large',
  basil: 'small',
  artichoke: 'small',
  grapes: 'small',
  olive: 'large',
  pineapple: 'small',
  sugarcane: 'small',
  banana: 'large',
  coconut: 'large',
  holly: 'small',
  sapling: 'small',
  firtree: 'large',
  bigfir: 'huge',
  teabush: 'small',
  daikon: 'small',
  eggplant: 'small',
  cherry: 'large',
  potato: 'small',
  quinoa: 'small',
  amaranth: 'small',
  purplecorn: 'small',
  lingonberry: 'small',
  cloudberry: 'small',
  rhubarb: 'small',
  apple: 'large',
  chamomile: 'small',
  lavenderbush: 'small',
  melon: 'small',
  almond: 'large',
  puffball: 'small',
  chanterelle: 'small',
  toadstool: 'large',
  giantcap: 'huge',
  chili: 'small',
  sweetpotato: 'small',
  coffee: 'large',
  emberpepper: 'huge',
  bigradish: 'large',
  bigberry: 'large',
  bigcabbage: 'large',
  giantpumpkin: 'huge',
  moonsprout: 'small',
  spacepotato: 'small',
  podlettuce: 'small',
  starfruit: 'large',
};

export const CROP_IDS = Object.keys(ALL) as CropId[];

export const cropSize = (id: CropId): CropSize => ALL[id];
export const cropFit = (id: CropId): CropFit => CROP_FITS[ALL[id]];
