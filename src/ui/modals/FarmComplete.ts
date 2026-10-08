import { button, countUp, h, showWhen } from '../dom.ts';
import { icon } from '../icons.ts';
import { fmt, t } from '../../platform/i18n/i18n.ts';
import type { ModalStack } from './ModalStack.ts';
import { confetti } from '../Confetti.ts';

export function openFarmComplete(
  modals: ModalStack,
  o: {
    reward: number;
    passive: number;
    /** "Farm complete!" / "Farm #17 complete!" / "Tour 3 complete!" / "Starter Tour complete!". */
    title: string;
    /** Core Rank line when a Tour was completed. */
    badge: string | null;
    /** Name of the next destination. */
    nextName: string | null;
    /** A free ×2 charge came with it (shown as a gift line). */
    gift?: boolean;
    adAvailable: () => boolean;
    double: () => Promise<boolean>;
    openMap: () => void;
  },
): void {
  const m = modals.push(
    'farmcomplete',
    (close) => {
      const x2 = button('btn-big ad', async () => {
        if (await o.double()) {
          x2.disabled = true;
          amount.textContent = fmt(o.reward * 2);
          amount.parentElement?.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.3,1.6,.5,1)' });
        }
      }, icon('ad'), t('farm.rewardX2'));
      showWhen(x2, () => o.adAvailable() && !x2.disabled);
      const amount = h('span', {}, fmt(0));
      countUp(amount, o.reward, fmt, 1200);
      return [
        h('div', { class: 'rays' }),
        icon('trophy', 'ico trophy-big'),
        h('h2', {}, o.title),
        o.badge ? h('div', { class: 'tour-badge' }, o.badge) : null,
        h('div', { class: 'reward-big' }, icon('coin'), amount),
        o.gift ? h('div', { class: 'farm-gift' }, icon('x2'), h('span', {}, t('bonus.farmGift'))) : null,
        h('p', {}, t('farm.completeBody', { n: fmt(o.passive) })),
        o.nextName ? h('p', {}, h('b', {}, t('farm.nextDest', { name: o.nextName }))) : null,
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
  confetti(m.el, 60);
}
