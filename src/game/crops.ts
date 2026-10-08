import type { CropId } from './types.ts';

/**
 * Game-side crop registry (the geometry lives in render/geo/crops.ts). Every CropId must be listed: the record type
 * makes the compiler check it.
 */
const ALL: Record<CropId, true> = {
  lettuce: true,
  wheat: true,
  carrot: true,
  corn: true,
  cabbage: true,
  pumpkin: true,
  squash: true,
  watermelon: true,
  tomato: true,
  sunflower: true,
  strawberry: true,
  blueberry: true,
  turnip: true,
  pepper: true,
  cactusfruit: true,
  dragonfruit: true,
};

export const CROP_IDS = Object.keys(ALL) as CropId[];
