import type { FarmId } from '../../game/types.ts';
import { FARM_ORDER } from '../../game/types.ts';
import { button, h } from '../dom.ts';
import { icon } from '../icons.ts';
import { fmt, t, type I18nKey } from '../../platform/i18n/i18n.ts';
import { BIOMES } from '../../render/palette.ts';
import type { ModalStack } from './ModalStack.ts';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export interface MapInfo {
  current: FarmId;
  unlocked: FarmId[];
  completed: FarmId[];
  passive: Partial<Record<FarmId, number>>;
  stageOf: (id: FarmId) => number | null;
  travel: (id: FarmId) => void;
}

export function openMap(modals: ModalStack, m: MapInfo): void {
  modals.push('map', (close) => {
    const list = h('div', { class: 'farm-list' });
    for (const id of FARM_ORDER) {
      const unlocked = m.unlocked.includes(id);
      const done = m.completed.includes(id);
      const isCur = id === m.current;
      const b = BIOMES[id];
      const stage = m.stageOf(id);
      const sub = !unlocked
        ? t('map.locked')
        : isCur
          ? `${t('map.current')} · ${t('hud.stage', { n: (stage ?? 0) + 1 })}`
          : done
            ? `${t('map.completed')} · ${t('map.passive', { n: fmt(m.passive[id] ?? 0) })}`
            : t('hud.stage', { n: (stage ?? 0) + 1 });
      const card = button(
        `farm-card farm-${id}${unlocked ? '' : ' locked'}${isCur ? ' current' : ''}`,
        () => {
          if (!unlocked || isCur) return;
          m.travel(id);
          close();
        },
        h('div', { class: 'swatch', style: `background:linear-gradient(135deg, ${hex(b.groundA)}, ${hex(b.sky)})` }, icon(unlocked ? (done ? 'trophy' : 'map') : 'lock')),
        h('div', { class: 'info' }, h('div', { class: 'name' }, t(`farm.${id}` as I18nKey)), h('div', { class: 'sub' }, sub)),
      );
      card.style.setProperty('--fc', unlocked ? '#fff' : '#eef1f5');
      list.append(card);
    }
    return [h('h2', {}, t('map.title')), list];
  });
}
