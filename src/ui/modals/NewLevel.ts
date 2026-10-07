import { button, h } from '../dom.ts';
import { t } from '../../platform/i18n/i18n.ts';
import { levelColor } from '../../render/palette.ts';
import { power } from '../../game/config.ts';
import { BODY } from '../../game/config.ts';
import type { ModalStack } from './ModalStack.ts';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export function openNewLevel(modals: ModalStack, level: number): void {
  modals.push('newlevel', (close) => {
    const x = power(level) / power(1);
    return [
      h('h2', {}, t('newLevel.title')),
      h('div', { class: 'seg-preview outline', style: `background:${hex(levelColor(level))}` }, String(level)),
      h('p', {}, t('newLevel.body', { n: level, x: x >= 100 ? Math.round(x) : x.toFixed(1) })),
      h('div', { class: 'btn-row' }, button('btn-big', () => close(), t('common.go'))),
    ];
  });
}

export function openCollection(modals: ModalStack, maxLevel: number): void {
  modals.push('collection', () => {
    const grid = h('div', { class: 'collection-grid' });
    for (let l = 1; l <= BODY.MAX_LVL; l++) {
      const known = l <= maxLevel;
      grid.append(h('div', { class: `coll-item outline${known ? '' : ' unknown'}`, style: known ? `background:${hex(levelColor(l))}` : '' }, known ? String(l) : '?'));
    }
    return [h('h2', {}, t('collection.title')), h('p', {}, `${maxLevel} / ${BODY.MAX_LVL}`), grid];
  });
}
