import { button, countUp, exclusive, h, showWhen } from '../dom.ts';
import { icon } from '../icons.ts';
import { fmt, t } from '../../platform/i18n/i18n.ts';
import { formatDuration } from '../../shared/format.ts';
import type { ModalStack } from './ModalStack.ts';

export function openOffline(modals: ModalStack, o: { seconds: number; coins: number; adAvailable: () => boolean; collect: (mult: number) => Promise<boolean> }): void {
  modals.push(
    'offline',
    (close) => {
      const one = exclusive();
      const x3 = button('btn-big ad', one(async () => {
        if (await o.collect(3)) close();
      }), icon('ad'), t('offline.collectX3'));
      showWhen(x3, o.adAvailable);
      const amount = h('span', {}, fmt(0));
      countUp(amount, o.coins, fmt);
      return [
        h('h2', {}, t('offline.title')),
        h('p', {}, t('offline.body', { time: formatDuration(o.seconds) })),
        h('div', { class: 'reward-big' }, icon('coin'), amount),
        h(
          'div',
          { class: 'btn-row' },
          button('btn-big soft', one(async () => {
            await o.collect(1);
            close();
          }), t('common.collect')),
          x3,
        ),
      ];
    },
    { closable: false },
  );
}
