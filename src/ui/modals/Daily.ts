import { DAILY_REWARDS, type DailyReward } from '../../game/daily.ts';
import { button, h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';
import { fmt, t } from '../../platform/i18n/i18n.ts';
import type { ModalStack } from './ModalStack.ts';

export interface DailyInfo {
  day: number;
  canClaim: boolean;
  coinsFor: (r: DailyReward) => number;
  adAvailable: boolean;
  claim: (mult: number) => Promise<boolean>;
}

const iconFor = (r: DailyReward): IconName => (r.kind === 'coins' ? 'coin' : r.kind === 'tornado' ? 'tornado' : 'x2');

export function openDaily(modals: ModalStack, d: DailyInfo): void {
  modals.push('daily', (close) => {
    const today = d.day % DAILY_REWARDS.length;
    const grid = h('div', { class: 'grid-days' });
    DAILY_REWARDS.forEach((r, i) => {
      const label = r.kind === 'coins' ? fmt(d.coinsFor(r)) : r.kind === 'tornado' ? t('daily.tornado', { n: r.n }) : t('daily.boost', { n: r.seconds / 60 });
      const done = i < today;
      const isToday = i === today && d.canClaim;
      grid.append(
        h('div', { class: `day${done ? ' done' : ''}${isToday ? ' today' : ''}${i === 6 ? ' big' : ''}` }, h('span', {}, t('daily.day', { n: i + 1 })), icon(iconFor(r)), h('span', {}, label)),
      );
    });
    const row = h('div', { class: 'btn-row' });
    if (d.canClaim) {
      const x2 = button('btn-big ad', async () => {
        if (await d.claim(2)) close();
      }, icon('ad'), t('daily.claimX2'));
      if (!d.adAvailable) x2.style.display = 'none';
      row.append(
        button('btn-big', async () => {
          await d.claim(1);
          close();
        }, t('common.claim')),
        x2,
      );
    } else row.append(h('p', {}, t('daily.comeBack')));
    return [h('h2', {}, t('daily.title')), grid, row];
  });
}
