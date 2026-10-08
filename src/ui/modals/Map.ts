import type { BiomeId, FarmKey, ModifierId, SizeClass } from '../../game/types.ts';
import { button, h } from '../dom.ts';
import { icon } from '../icons.ts';
import { fmt, t } from '../../platform/i18n/i18n.ts';
import { biomeLook } from '../../render/palette.ts';
import { biomeTitle, farmTitle } from '../farmNames.ts';
import type { ModalStack } from './ModalStack.ts';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** One destination on the map (bounded: a few behind you, where you are, a few ahead). */
export interface MapNode {
  key: FarmKey;
  ordinal: number;
  biome: BiomeId;
  name: number;
  state: 'done' | 'current' | 'next' | 'future' | 'locked';
  showcase: boolean;
  size?: SizeClass;
  modifier?: ModifierId | null;
  /** Cleared share (null = not visited). */
  cleared: number | null;
  passive?: number;
  canTravel: boolean;
}

export interface MapInfo {
  /** The five starter farms while the Starter Tour is still the chapter you are in. */
  starter: MapNode[] | null;
  /** World Tour destinations around you (null until the Starter Tour is done). */
  world: { rank: number; nodes: MapNode[] } | null;
  travel: (key: FarmKey) => void;
}

function card(n: MapNode, onTap: () => void): HTMLButtonElement {
  const b = biomeLook(n.biome);
  const open = n.state !== 'locked';
  const sub =
    n.state === 'locked'
      ? t('map.locked')
      : n.state === 'current'
        ? `${t('map.current')} · ${t('hud.cleared', { n: Math.floor((n.cleared ?? 0) * 100) })}`
        : n.state === 'done'
          ? `${t('map.completed')}${n.passive ? ` · ${t('map.passive', { n: fmt(n.passive) })}` : ''}`
          : n.state === 'next'
            ? `${t('map.next')} · ${biomeTitle(n.biome)}`
            : biomeTitle(n.biome);
  const el = button(
    `farm-card farm-${n.biome}${open ? '' : ' locked'}${n.state === 'current' ? ' current' : ''}${n.state === 'next' ? ' next' : ''}${n.showcase ? ' showcase' : ''}`,
    onTap,
    h('div', { class: 'swatch', style: `background:linear-gradient(135deg, ${hex(b.groundA)}, ${hex(b.sky)})` }, icon(n.state === 'done' ? 'trophy' : open ? 'map' : 'lock')),
    h(
      'div',
      { class: 'info' },
      h('div', { class: 'name' }, `${n.ordinal > 0 ? `#${n.ordinal} ` : ''}${farmTitle(n)}`),
      h('div', { class: 'sub' }, `${n.showcase ? `★ ${t('map.finale')} · ` : ''}${sub}`),
    ),
  );
  el.style.setProperty('--fc', open ? '#fff' : '#eef1f5');
  return el;
}

export function openMap(modals: ModalStack, m: MapInfo): void {
  modals.push('map', (close) => {
    const out: HTMLElement[] = [h('h2', {}, t('map.title'))];
    const tap = (n: MapNode) => () => {
      if (!n.canTravel) return;
      m.travel(n.key);
      close();
    };
    if (m.starter) {
      const list = h('div', { class: 'farm-list' });
      for (const n of m.starter) list.append(card(n, tap(n)));
      out.push(h('div', { class: 'map-section' }, t('map.starter')), list);
    }
    if (m.world) {
      const list = h('div', { class: 'farm-list' });
      for (const n of m.world.nodes) list.append(card(n, tap(n)));
      out.push(h('div', { class: 'map-section' }, `${t('map.world')} · ${t('tour.rank', { n: m.world.rank })}`), list);
    }
    return out;
  });
}
