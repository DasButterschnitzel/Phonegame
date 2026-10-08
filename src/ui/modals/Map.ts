import type { BiomeId, FarmKey } from '../../game/types.ts';
import type { Trail, TrailNode } from '../../game/world/trail.ts';
import { button, h } from '../dom.ts';
import { icon } from '../icons.ts';
import { fmt, t, type I18nKey } from '../../platform/i18n/i18n.ts';
import { formatDuration } from '../../shared/format.ts';
import { biomeLook } from '../../render/palette.ts';
import { biomeTitle, farmTitle } from '../farmNames.ts';
import type { ModalStack } from './ModalStack.ts';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
/** A biome as a tiny landscape postcard: its sky, the land around the farm and its soil. */
const gradient = (b: BiomeId) => {
  const l = biomeLook(b);
  return `background:linear-gradient(180deg, ${hex(l.sky)} 0 36%, ${hex(l.outside)} 36% 68%, ${hex(l.groundA)} 68%)`;
};

export interface MapInfo {
  trail: Trail;
  /** Core Rank (Tours completed) and its bonus on harvest value (a fraction). */
  rank: number;
  rankBonus: number;
  /** How much of the farm you are on is cleared. */
  cleared: number;
  passive: (key: FarmKey) => number;
  canTravel: (key: FarmKey) => boolean;
  stats: { farms: number; found: readonly BiomeId[]; families: readonly BiomeId[]; bestS: number };
  travel: (key: FarmKey) => void;
}

/** Size, modifier and rarity of a destination, as short chips. */
export function farmChips(n: Pick<TrailNode, 'size' | 'modifier' | 'rarity' | 'showcase'>): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (n.showcase) out.push(h('span', { class: 'ftag finale' }, `★ ${t('map.finale')}`));
  if (n.rarity === 'rare' || n.rarity === 'legendary') out.push(h('span', { class: `ftag ${n.rarity}` }, t(`rarity.${n.rarity}` as I18nKey)));
  if (n.size && n.size !== 'standard') out.push(h('span', { class: `ftag size-${n.size}` }, t(`size.${n.size}` as I18nKey)));
  if (n.modifier) out.push(h('span', { class: 'ftag mod', title: t(`mod.${n.modifier}.d` as I18nKey) }, t(`mod.${n.modifier}` as I18nKey)));
  return out;
}

function swatch(n: TrailNode): HTMLElement {
  if (n.mystery) return h('div', { class: 'swatch mystery' }, h('b', {}, '?'));
  const inner =
    n.state === 'done' ? icon('check') : n.state === 'current' ? icon('pin') : n.showcase ? icon('star') : h('b', { class: 'ord outline' }, n.ordinal > 0 ? `#${n.ordinal}` : '');
  return h('div', { class: 'swatch', style: gradient(n.biome) }, inner);
}

/** Name, number, family and tags of a destination ahead (the map's next stops, the farm-complete dialog). */
function aheadLines(n: TrailNode): HTMLElement[] {
  const lines: HTMLElement[] = [
    h('div', { class: 'name' }, n.mystery ? t('map.mystery') : farmTitle(n)),
    h('div', { class: 'sub' }, n.mystery ? `#${n.ordinal}` : `${n.ordinal > 0 ? `#${n.ordinal} · ` : ''}${biomeTitle(n.biome)}`),
  ];
  // A mystery card already says "new" (its "?"): the tag is for a new family you can see coming.
  const tags = [...(n.newBiome && !n.mystery ? [h('span', { class: 'ftag new' }, t('map.newBiome'))] : []), ...farmChips(n)];
  if (tags.length) lines.push(h('div', { class: 'ftags' }, ...tags));
  return lines;
}

/** A destination as a card (not a button): the farm-complete dialog's next stop. */
export function destinationCard(n: TrailNode): HTMLElement {
  return h('div', { class: `farm-card next dest farm-${n.biome}${n.showcase ? ' finale' : ''}` }, swatch(n), h('div', { class: 'info' }, ...aheadLines(n)));
}

/** A Tour's farms as pips: done, the one you are on, the finale star (World Tours). */
export function tourPips(farms: number, done: number, hereSlot: number, finale: boolean): HTMLElement {
  const out = h('div', { class: 'tour-pips' });
  for (let i = 0; i < farms; i++) {
    const star = finale && i === farms - 1;
    out.append(h('i', { class: `pip${i < done ? ' done' : ''}${i === hereSlot ? ' here' : ''}${star ? ' finale' : ''}` }, star ? '★' : ''));
  }
  return out;
}

function stop(n: TrailNode, m: MapInfo, close: () => void, milestone = false): HTMLElement {
  const travel = m.canTravel(n.key) && (n.state === 'next' || n.state === 'done');
  const lines: (HTMLElement | null)[] = n.state === 'current' || n.state === 'done' ? [h('div', { class: 'name' }, `#${n.ordinal} ${farmTitle(n)}`)] : aheadLines(n);
  if (n.state === 'current') {
    const fill = h('i', { style: `transform:scaleX(${Math.min(1, m.cleared).toFixed(3)})` });
    lines.push(h('div', { class: 'sub' }, `${t('map.current')} · ${t('hud.cleared', { n: Math.floor(m.cleared * 100) })}`), h('div', { class: 'mini-prog' }, fill));
  } else if (n.state === 'done') {
    const p = m.passive(n.key);
    lines.push(h('div', { class: 'sub' }, `${t('map.completed')}${p > 0 ? ` · ${t('map.passive', { n: fmt(p) })}` : ''}`));
  }
  if (n.state === 'next') lines.push(travel ? null : h('div', { class: 'hint' }, t('map.finishFirst')));
  const cls = `farm-card ${n.state} farm-${n.biome}${n.showcase ? ' finale' : ''}${n.mystery ? ' mystery' : ''}${milestone ? ' milestone' : ''}`;
  const body = [swatch(n), h('div', { class: 'info' }, ...lines)];
  const card = travel
    ? button(cls, () => {
        m.travel(n.key);
        close();
      }, ...body, h('span', { class: 'go' }, n.state === 'done' ? t('map.visit') : t('common.go'), n.state === 'next' ? icon('arrow') : null))
    : h('div', { class: cls }, ...body);
  return h('div', { class: `stop s-${n.state}${milestone ? ' s-milestone' : ''}` }, card);
}


export function openMap(modals: ModalStack, m: MapInfo): void {
  modals.push('map', (close) => {
    const tr = m.trail;
    const head = h(
      'div',
      { class: 'tour-head' },
      tourPips(tr.farms, tr.done, tr.hereSlot, tr.tour > 0),
      tr.hereSlot >= 0 ? h('div', { class: 'tour-of' }, t('map.tourOf', { n: tr.hereSlot + 1, m: tr.farms })) : null,
      m.rank > 0 ? h('div', { class: 'rank-chip' }, icon('star'), h('b', {}, t('tour.rank', { n: m.rank })), h('span', {}, t('rank.bonus', { n: Math.round(m.rankBonus * 100) }))) : null,
    );
    const list = h('div', { class: 'trail' });
    let prevTour = -1;
    for (const n of tr.nodes) {
      if (prevTour >= 0 && n.tour !== prevTour && n.tour > 0) list.append(h('div', { class: 'tour-divider' }, t('map.tourN', { n: n.tour })));
      prevTour = n.tour;
      list.append(stop(n, m, close));
    }
    if (tr.milestone) {
      const gap = tr.milestone.ordinal - (tr.nodes.at(-1)?.ordinal ?? 0) - 1;
      if (gap > 0) list.append(h('div', { class: 'trail-gap' }, `⋯ ${gap === 1 ? t('map.moreOne') : t('map.more', { n: gap })}`));
      list.append(stop(tr.milestone, m, close, true));
    }
    if (tr.worldTeaser)
      list.append(
        h(
          'div',
          { class: 'stop s-milestone' },
          h('div', { class: 'farm-card milestone teaser' }, h('div', { class: 'swatch globe' }, icon('globe')), h('div', { class: 'info' }, h('div', { class: 'name' }, t('map.teaser')), h('div', { class: 'sub' }, t('map.teaserBody', { n: m.stats.families.length })))),
        ),
      );
    const found = new Set(m.stats.found);
    const journey = h(
      'div',
      { class: 'journey' },
      h('div', { class: 'journey-title' }, t('map.journey')),
      h(
        'div',
        { class: 'journey-stats' },
        h('span', {}, t('map.statFarms', { n: m.stats.farms })),
        h('span', {}, t('map.statBiomes', { n: m.stats.families.filter((b) => found.has(b)).length, m: m.stats.families.length })),
        m.stats.bestS > 0 ? h('span', {}, t('map.statBest', { t: formatDuration(m.stats.bestS) })) : null,
      ),
      h('div', { class: 'stamps' }, ...m.stats.families.map((b) => (found.has(b) ? h('i', { class: 'stamp', style: gradient(b), title: biomeTitle(b) }) : h('i', { class: 'stamp unknown' }, '?')))),
    );
    // Open on where you are and where you go next.
    requestAnimationFrame(() => (list.querySelector('.s-next') ?? list.querySelector('.s-current'))?.scrollIntoView({ block: 'center' }));
    return [h('h2', {}, tr.tour === 0 ? t('map.starter') : t('map.tourN', { n: tr.tour })), head, list, journey];
  });
}
