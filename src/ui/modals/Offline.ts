import { button, h } from '../dom.ts';
import { icon } from '../icons.ts';
import { fmt, t } from '../../platform/i18n/i18n.ts';
import { formatDuration } from '../../shared/format.ts';
import type { ModalStack } from './ModalStack.ts';

export function openOffline(modals: ModalStack, o: { seconds: number; coins: number; adAvailable: boolean; collect: (mult: number) => Promise<boolean> }): void {
  modals.push(
    'offline',
    (close) => {
      const x3 = button('btn-big ad', async () => {
        if (await o.collect(3)) close();
      }, icon('ad'), t('offline.collectX3'));
      if (!o.adAvailable) x3.style.display = 'none';
      return [
        h('h2', {}, t('offline.title')),
        h('p', {}, t('offline.body', { time: formatDuration(o.seconds) })),
        h('div', { class: 'reward-big' }, icon('coin'), h('span', {}, fmt(o.coins))),
        h(
          'div',
          { class: 'btn-row' },
          button('btn-big', async () => {
            await o.collect(1);
            close();
          }, t('common.collect')),
          x3,
        ),
      ];
    },
    { closable: false },
  );
}
