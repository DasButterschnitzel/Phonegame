import type { Sim } from '../game/sim.ts';
import type { SimEvent } from '../game/types.ts';
import { MISC } from '../game/config.ts';
import { giftReward } from '../game/economy.ts';
import { DAILY_REWARDS, canClaimDaily, claimDaily, type DailyReward } from '../game/daily.ts';
import type { SaveMeta } from '../game/save/schema.ts';
import type { GameController } from './game.ts';
import type { SaveManager } from '../platform/storage/SaveManager.ts';
import { clock } from '../platform/clock.ts';
import { openMap } from '../ui/modals/Map.ts';
import { openFarmComplete } from '../ui/modals/FarmComplete.ts';
import { openDaily } from '../ui/modals/Daily.ts';
import { Gift } from '../ui/Gift.ts';
import { button, countUp, h, showWhen } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { fmt, t } from '../platform/i18n/i18n.ts';
import { FARM_ORDER } from '../game/types.ts';
import { clearedOfSnapshot } from '../game/sim.ts';

/** Map / travel, farm completion, daily calendar and lucky-bug gifts. */
export function installMetaFlows(sim: Sim, game: GameController, meta: SaveMeta, saves: SaveManager): { frame: () => void; maybeShowDaily: () => void } {
  const ads = game.d.ads;
  const ui = document.getElementById('ui')!;

  game.openMap = () =>
    openMap(game.modals, {
      current: sim.state.farmId,
      unlocked: sim.state.unlockedFarms,
      completed: sim.state.completedFarms,
      passive: sim.state.economy.passive,
      clearedOf: (id) => (id === sim.state.farmId ? sim.cleared : clearedOfSnapshot(id, sim.state.farmsProgress[id]?.field)),
      travel: (id) =>
        game.travelTo(id, () => {
          sim.execute({ c: 'travel', farm: id });
          void saves.saveNow();
        }),
    });

  const dailyCoins = (r: DailyReward) =>
    r.kind === 'coins' ? Math.max(Math.floor(sim.state.economy.ema * r.incomeSeconds), Math.floor(r.incomeSeconds * 2 * sim.valueMult)) : 0;

  game.openDaily = () =>
    openDaily(game.modals, {
      day: meta.daily.day,
      canClaim: canClaimDaily(meta.daily, clock.dateKey()),
      coinsFor: dailyCoins,
      adAvailable: () => ads.rewardedAvailable,
      claim: async (mult) => {
        if (mult > 1 && !(await game.rewarded('daily_x2'))) return false;
        const idx = claimDaily(meta.daily, clock.dateKey());
        if (idx === null) return false;
        const r = DAILY_REWARDS[idx];
        if (r.kind === 'coins') sim.execute({ c: 'grantCoins', amount: dailyCoins(r) * mult, reason: 'daily' });
        if (r.kind === 'tornado') sim.execute({ c: 'grantTornado', n: r.n * mult });
        if (r.kind === 'boost') {
          sim.execute({ c: 'boost', id: 'incomeX2', seconds: r.seconds * mult });
          sim.execute({ c: 'boost', id: 'autopilot', seconds: r.seconds * mult });
        }
        void saves.saveNow();
        return true;
      },
    });

  const gift = new Gift(ui);
  gift.onTap = () => {
    const amount = giftReward(sim.state, sim.valueMult);
    const kind = sim.state.gift.kind;
    game.modals.push('gift', (close) => {
      const x3 = button('btn-big ad', async () => {
        if (await game.rewarded('gift_x3')) {
          sim.execute({ c: 'claimGift', mult: 3 });
          close();
        }
      }, icon('ad'), t('gift.collectX3'));
      showWhen(x3, () => ads.rewardedAvailable);
      const countEl = h('span', {}, fmt(0));
      countUp(countEl, amount, fmt, 700);
      return [
        h('h2', {}, t('gift.title', { kind: t(kind === 'ladybug' ? 'gift.ladybug' : 'gift.butterfly') })),
        h('div', { class: 'reward-big' }, icon('coin'), countEl),
        h(
          'div',
          { class: 'btn-row' },
          button('btn-big soft', () => {
            sim.execute({ c: 'claimGift', mult: 1 });
            close();
          }, t('common.collect')),
          x3,
        ),
      ];
    });
  };

  game.listeners.push((e: SimEvent) => {
    if (e.t === 'giftSpawn') gift.show(e.kind, MISC.GIFT_LIFETIME_S);
    if (e.t === 'farmFinished') {
      openFarmComplete(game.modals, {
        reward: e.reward,
        passive: sim.state.economy.passive[e.farm] ?? 0,
        next: e.next,
        allDone: sim.state.completedFarms.length >= FARM_ORDER.length,
        adAvailable: () => ads.rewardedAvailable,
        double: async () => {
          if (!(await game.rewarded('farm_complete_x2'))) return false;
          sim.execute({ c: 'grantCoins', amount: e.reward, reason: 'farmComplete' });
          return true;
        },
        openMap: () => game.openMap(),
      });
      void saves.saveNow();
    }
  });

  // The daily calendar waits for the welcome-back dialog instead of being skipped for the session.
  let dailyPending = false;
  const maybeShowDaily = () => {
    if (meta.sessions <= 1 || !canClaimDaily(meta.daily, clock.dateKey())) return;
    if (game.modals.open) dailyPending = true;
    else game.openDaily();
  };
  game.modals.onClosed(() => {
    if (!dailyPending) return;
    setTimeout(() => {
      if (game.modals.open) return;
      dailyPending = false;
      game.openDaily();
    }, 250);
  });

  // Natural break after closing a reward dialog → maybe an interstitial (policy decides).
  game.modals.onClosed((name) => {
    if (!['offline', 'daily', 'farmcomplete', 'gift'].includes(name)) return;
    setTimeout(() => {
      if (game.modals.open) return;
      void ads.maybeInterstitial({ kind: 'dialog_closed', sinceThrottle: 99, tutorialActive: game.tutorialActive(), modalOpen: false });
    }, 350);
  });

  return {
    frame: () => {
      if (gift.visible) gift.update(game.modals.open || game.d.pause.has('ad'));
    },
    maybeShowDaily,
  };
}
