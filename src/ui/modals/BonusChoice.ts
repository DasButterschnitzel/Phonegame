import { button, h, showWhen } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';
import { fmt, t, type I18nKey } from '../../platform/i18n/i18n.ts';
import type { ModalStack } from './ModalStack.ts';

export type BonusKind = 'incomeX2' | 'autopilot' | 'tornado';

export interface BonusChoiceDeps {
  kind: BonusKind;
  /** Coin price, or null when only an ad (or a free charge) can pay for it. */
  price: number | null;
  coins: () => number;
  adAvailable: () => boolean;
  /** Pay with coins (only called when affordable). */
  buy: () => void;
  /** Pay with a rewarded ad (the dialog is already closed: the ad takes the screen). */
  watchAd: () => void;
  /** Coins ran short between opening the dialog and tapping BUY. */
  notEnough: (el: HTMLElement) => void;
}

const ICON: Record<BonusKind, IconName> = { incomeX2: 'x2', autopilot: 'autopilot', tornado: 'tornado' };

/**
 * Compact "pay coins or watch an ad" choice. The reward is always spelled out; the coin button leads when the coins
 * are there, otherwise the ad does — and the ad button is never dressed up as "free".
 */
export function openBonusChoice(modals: ModalStack, d: BonusChoiceDeps): void {
  modals.push('bonus', (close) => {
    const affordable = d.price !== null && d.coins() >= d.price;
    const row = h('div', { class: 'btn-row bonus-row' });
    if (d.price !== null) {
      const price = d.price;
      const buy: HTMLButtonElement = button(
        `btn-big bonus-buy ${affordable ? 'go' : 'grey'}`,
        () => {
          if (d.coins() < price) return d.notEnough(buy);
          close();
          d.buy();
        },
        icon('coin'),
        h('span', {}, `${fmt(price)} · ${t('bonus.buy')}`),
      );
      row.append(buy);
    }
    const ad = button(
      `btn-big bonus-ad ${affordable ? 'soft' : 'ad'}`,
      () => {
        close();
        d.watchAd();
      },
      icon('ad'),
      h('span', {}, t('bonus.watchAd')),
    );
    showWhen(ad, d.adAvailable);
    row.append(ad);
    return [
      h('div', { class: 'bonus-head' }, icon(ICON[d.kind]), h('h2', {}, t(`bonus.${d.kind}.title` as I18nKey))),
      h('p', { class: 'bonus-desc' }, t(`bonus.${d.kind}.desc` as I18nKey)),
      row,
      d.kind === 'incomeX2' ? h('p', { class: 'bonus-hint' }, t('bonus.freeX2Hint')) : null,
    ];
  });
}
