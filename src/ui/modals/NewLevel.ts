import { button, h } from '../dom.ts';
import { fmt, lang, t } from '../../platform/i18n/i18n.ts';
import { levelColor } from '../../render/palette.ts';
import { power } from '../../game/config.ts';
import { BODY } from '../../game/config.ts';
import type { ModalStack } from './ModalStack.ts';
import { confetti } from '../Confetti.ts';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export function openNewLevel(modals: ModalStack, level: number): void {
  const m = modals.push(
    'newlevel',
    (close) => {
      const x = power(level) / power(1);
      return [
        h('div', { class: 'rays' }),
        h('h2', {}, t('newLevel.title')),
        h('div', { class: 'seg-preview outline', style: `background:${hex(levelColor(level))}` }, String(level)),
        h('p', {}, t('newLevel.body', { n: level, x: mult(x) })),
        h('div', { class: 'btn-row' }, button('btn-big go', () => close(), t('common.go'))),
      ];
    },
    { closeX: false },
  );
  confetti(m.el);
}

/** Power multiplier label: one decimal below 10 (locale decimal separator), compact above. */
const mult = (x: number): string => (x < 10 ? x.toFixed(1).replace('.', lang() === 'de' ? ',' : '.') : fmt(x));

export function openCollection(modals: ModalStack, maxLevel: number): void {
  modals.push('collection', () => {
    const grid = h('div', { class: 'collection-grid' });
    for (let l = 1; l <= BODY.MAX_LVL; l++) {
      const known = l <= maxLevel;
      // Discovered levels show their chomp power; the next one to discover is teased.
      const next = l === maxLevel + 1;
      grid.append(
        h(
          'div',
          { class: `coll-item${known ? '' : ' unknown'}${next ? ' next' : ''}`, style: known ? `background:${hex(levelColor(l))}` : '' },
          h('span', { class: 'lv outline' }, known || next ? String(l) : '?'),
          known ? h('span', { class: 'pw' }, `×${mult(power(l) / power(1))}`) : null,
        ),
      );
    }
    return [h('h2', {}, t('collection.title')), h('p', {}, `${maxLevel} / ${BODY.MAX_LVL}`), grid];
  });
}
