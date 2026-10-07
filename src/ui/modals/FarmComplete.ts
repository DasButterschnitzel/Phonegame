import type { FarmId } from '../../game/types.ts';
import { button, h } from '../dom.ts';
import { icon } from '../icons.ts';
import { fmt, t, type I18nKey } from '../../platform/i18n/i18n.ts';
import type { ModalStack } from './ModalStack.ts';

export function openFarmComplete(
  modals: ModalStack,
  o: { reward: number; passive: number; next: FarmId | null; adAvailable: boolean; double: () => Promise<boolean>; openMap: () => void },
): void {
  modals.push(
    'farmcomplete',
    (close) => {
      const x2 = button('btn-big ad', async () => {
        if (await o.double()) {
          x2.disabled = true;
          amount.textContent = fmt(o.reward * 2);
        }
      }, icon('ad'), t('farm.rewardX2'));
      if (!o.adAvailable) x2.style.display = 'none';
      const amount = h('span', {}, fmt(o.reward));
      return [
        icon('trophy', 'ico trophy-big'),
        h('h2', {}, t('farm.complete')),
        h('div', { class: 'reward-big' }, icon('coin'), amount),
        h('p', {}, t('farm.completeBody', { n: fmt(o.passive) })),
        o.next ? h('p', {}, h('b', {}, t('farm.next', { name: t(`farm.${o.next}` as I18nKey) }))) : null,
        h(
          'div',
          { class: 'btn-row' },
          x2,
          button('btn-big', () => {
            close();
            o.openMap();
          }, icon('map'), t('map.title')),
        ),
      ];
    },
    { closable: false },
  );
}
