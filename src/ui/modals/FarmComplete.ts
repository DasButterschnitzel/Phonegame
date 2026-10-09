import type { TrailNode } from '../../game/world/trail.ts';
import { button, countUp, exclusive, h, showWhen } from '../dom.ts';
import { icon } from '../icons.ts';
import { fmt, t } from '../../platform/i18n/i18n.ts';
import type { ModalStack } from './ModalStack.ts';
import { confetti } from '../Confetti.ts';
import { destinationCard, tourPips } from './Map.ts';

export interface FarmCompleteInfo {
  reward: number;
  passive: number;
  /** "Farm complete!" / "Farm #17 complete!" / "Tour 3 complete!" / "Starter Tour complete!". */
  title: string;
  /** A Tour was completed: Core Rank before → after, with the harvest-value bonus it now gives. */
  rank: { from: number; to: number; bonus: number } | null;
  /** The Starter Tour is done: the World Tour opens (a three-line explainer). */
  worldOpens: boolean;
  families: number;
  /** The Tour this farm belonged to, as pips. */
  pips: { farms: number; done: number; finale: boolean } | null;
  /** Where to go next, and the label above it. */
  next: TrailNode | null;
  nextLabel: string;
  /** A free ×2 charge came with it (shown as a gift line). */
  gift?: boolean;
  adAvailable: () => boolean;
  double: () => Promise<boolean>;
  goNext: () => void;
  openMap: () => void;
}

/**
 * Farm (or Tour) complete: the reward, what it means (Core Rank, the World Tour opening), where you are in the Tour
 * and where you go next — one tap travels on, the map is the other way. The ×2 is an offer, never in the way.
 */
export function openFarmComplete(modals: ModalStack, o: FarmCompleteInfo): void {
  const m = modals.push(
    'farmcomplete',
    (close) => {
      const one = exclusive();
      const x2 = button('btn-big ad', one(async () => {
        if (await o.double()) {
          x2.disabled = true;
          amount.textContent = fmt(o.reward * 2);
          amount.parentElement?.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.3,1.6,.5,1)' });
        }
      }), icon('ad'), t('farm.rewardX2'));
      showWhen(x2, () => o.adAvailable() && !x2.disabled);
      const amount = h('span', {}, fmt(0));
      countUp(amount, o.reward, fmt, 1200);
      const rank = o.rank
        ? h(
            'div',
            { class: 'tour-badge' },
            icon('star'),
            h('b', {}, o.rank.from > 0 ? t('tour.rankUp', { a: o.rank.from, b: o.rank.to }) : t('tour.rank', { n: o.rank.to })),
            h('span', {}, t('rank.bonus', { n: Math.round(o.rank.bonus * 100) })),
          )
        : null;
      const intro = o.worldOpens
        ? h(
            'div',
            { class: 'world-intro' },
            h('div', {}, icon('globe'), h('span', {}, t('map.teaserBody', { n: o.families }))),
            h('div', {}, icon('star'), h('span', {}, t('tour.intro2'))),
            h('div', {}, icon('trophy'), h('span', {}, t('tour.intro3'))),
          )
        : null;
      return [
        h('div', { class: 'rays' }),
        icon('trophy', 'ico trophy-big'),
        h('h2', {}, o.title),
        rank,
        intro,
        h('div', { class: 'reward-big' }, icon('coin'), amount),
        o.gift ? h('div', { class: 'farm-gift' }, icon('x2'), h('span', {}, t('bonus.farmGift'))) : null,
        o.passive > 0 ? h('p', { class: 'passive-line' }, t('farm.completeBody', { n: fmt(o.passive) })) : null,
        o.pips ? tourPips(o.pips.farms, o.pips.done, -1, o.pips.finale) : null,
        o.next ? h('div', { class: 'next-dest' }, h('div', { class: 'next-label' }, o.nextLabel), destinationCard(o.next)) : null,
        h(
          'div',
          { class: 'btn-row' },
          // The ×2 offer takes the row's first line (when an ad is ready); the way on sits under it.
          x2,
          button('btn-big soft btn-map', one(() => {
            close();
            o.openMap();
          }), icon('map'), t('map.title')),
          o.next
            ? button('btn-big go btn-next', one(() => {
                close();
                o.goNext();
              }), h('span', {}, o.worldOpens ? t('tour.start') : t('farm.goNext')), icon('arrow'))
            : null,
        ),
      ];
    },
    { closable: false },
  );
  confetti(m.el, o.rank ? 110 : 60);
}
