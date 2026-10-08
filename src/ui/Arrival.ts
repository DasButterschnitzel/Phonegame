import type { BiomeId, ModifierId, SizeClass } from '../game/types.ts';
import { h } from './dom.ts';
import { t, type I18nKey } from '../platform/i18n/i18n.ts';

/** How long the arrival card stays (ms): the farm's entrance beat, never a wait — the crawler can move at once. */
export const ARRIVAL_MS = 1450;

export interface ArrivalInfo {
  name: string;
  biome: BiomeId;
  biomeTitle: string;
  ordinal: number;
  /** 0 = the Starter Tour. */
  tour: number;
  slot: number;
  farms: number;
  size: SizeClass | null;
  modifier: ModifierId | null;
  showcase: boolean;
  /** First farm of a family the journey had not been to. */
  newBiome: boolean;
  /** This farm opened a new World Tour. */
  newTour: boolean;
}

/**
 * The entrance of a farm: its Tour and number, its name on a ribbon, its family, what is special about it (size,
 * modifier with what it does, Tour finale) and a NEW BIOME stamp the first time you reach a family. Pointer events
 * pass through it; it removes itself after ARRIVAL_MS.
 */
export function showArrival(root: HTMLElement, a: ArrivalInfo): HTMLElement {
  const tourName = a.tour === 0 ? t('map.starter') : t('map.tourN', { n: a.tour });
  const top = a.newTour ? t('arrive.newTour', { n: a.tour }) : `${tourName} · ${t('arrive.farmOf', { n: a.slot + 1, m: a.farms })}`;
  const tags: HTMLElement[] = [];
  if (a.showcase) tags.push(h('span', { class: 'ftag finale' }, `★ ${t('arrive.finale')}`));
  if (a.size && a.size !== 'standard') tags.push(h('span', { class: `ftag size-${a.size}` }, t(`size.${a.size}` as I18nKey)));
  if (a.modifier) tags.push(h('span', { class: 'ftag mod' }, `${t(`mod.${a.modifier}` as I18nKey)} · ${t(`mod.${a.modifier}.d` as I18nKey)}`));
  const el = h(
    'div',
    { class: `arrival${a.showcase ? ' finale' : ''}${a.newBiome ? ' fresh' : ''}`, 'aria-live': 'polite' },
    h('div', { class: 'arr-top outline' }, top),
    h('div', { class: 'arr-ribbon' }, h('div', { class: 'arr-name outline' }, a.name)),
    h('div', { class: 'arr-sub' }, `${a.ordinal > 0 ? `#${a.ordinal} · ` : ''}${a.biomeTitle}`),
    tags.length ? h('div', { class: 'arr-tags' }, ...tags) : null,
    a.newBiome ? h('div', { class: 'arr-stamp' }, t('arrive.newBiome')) : null,
  );
  root.append(el);
  setTimeout(() => el.remove(), ARRIVAL_MS);
  return el;
}
