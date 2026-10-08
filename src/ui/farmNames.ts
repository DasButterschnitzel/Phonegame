import type { BiomeId, FarmKey } from '../game/types.ts';
import { isStarterFarm } from '../game/types.ts';
import { planForKey } from '../game/world/journey.ts';
import { t, type I18nKey } from '../platform/i18n/i18n.ts';

export interface Named {
  key: FarmKey;
  biome: BiomeId;
  /** Index into the biome's name list (starter farms: −1). */
  name: number;
}

/** A farm's name: the starter farms have their own; World Tour farms take one from their biome's curated list. */
export function farmTitle(f: Named): string {
  if (isStarterFarm(f.key)) return t(`farm.${f.key}` as I18nKey);
  const list = t(`names.${f.biome}` as I18nKey).split('|');
  return list[((f.name % list.length) + list.length) % list.length];
}

/** The biome family's name ("Jade Rice Terraces"). */
export const biomeTitle = (b: BiomeId): string => t(`biome.${b}` as I18nKey);

/** Name of any farm key (World Tour keys are resolved through the journey's plan). */
export function titleForKey(key: FarmKey, worldSeed: number): string {
  if (isStarterFarm(key)) return t(`farm.${key}` as I18nKey);
  const p = planForKey(key, worldSeed);
  return p ? farmTitle(p) : key;
}

/** Name of a farm definition. */
export const titleOf = (f: { id: FarmKey; biome: BiomeId; name: number }): string => farmTitle({ key: f.id, biome: f.biome, name: f.name });
