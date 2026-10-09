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
import { STARTER_FARMS, isStarterFarm } from '../game/types.ts';
import { coreBonus } from '../game/config.ts';
import { planForKey } from '../game/world/journey.ts';
import { readyBiomes } from '../game/world/biomes.ts';
import { buildTrail, nodeOfPlan, starterNode } from '../game/world/trail.ts';
import { FARMS_PER_TOUR } from '../game/world/plan.ts';

/** How long the farm-finished celebration plays before its dialog (ms). */
const CELEBRATE_MS = 1600;
/** Every biome family, for the journey's stamp collection. */
const FAMILIES = readyBiomes().map((b) => b.id);

/** Map / travel, farm completion, daily calendar and lucky-bug gifts. */
export function installMetaFlows(sim: Sim, game: GameController, meta: SaveMeta, saves: SaveManager): { frame: () => void; maybeShowDaily: () => void } {
  const ads = game.d.ads;
  const ui = document.getElementById('ui')!;

  game.openMap = () => {
    // The farm-finished celebration plays out first (its dialog leads on anyway).
    if (game.celebrating) return;
    const st = sim.state;
    const j = st.journey;
    const f = sim.farm;
    // A short trail (a few farms behind, where you are, what is coming, the Tour finale), never the whole history.
    const trail = buildTrail(
      j,
      { key: f.id, ordinal: f.ordinal, tour: f.tour, slot: f.slot, biome: f.biome, name: f.name, size: f.tour > 0 ? f.size : null, modifier: f.modifier, showcase: f.showcase, finished: st.progress.finished },
      st.completedFarms,
      st.unlockedFarms,
    );
    openMap(game.modals, {
      trail,
      rank: j.tours,
      rankBonus: coreBonus(j.tours),
      cleared: sim.cleared,
      passive: (key) => st.economy.passive[key] ?? 0,
      canTravel: (key) => sim.canTravel(key),
      stats: { farms: j.completed, found: j.biomes, families: FAMILIES, bestS: j.best.fastestS },
      travel: (key) =>
        game.travelTo(key, () => {
          sim.execute({ c: 'travel', farm: key });
          void saves.saveNow();
        }),
    });
  };

  const dailyCoins = (r: DailyReward) =>
    r.kind === 'coins' ? Math.max(Math.floor(sim.state.economy.ema * r.incomeSeconds), Math.floor(r.incomeSeconds * 2 * sim.valueMult)) : 0;

  game.openDaily = () =>
    openDaily(game.modals, {
      day: meta.daily.day,
      canClaim: canClaimDaily(meta.daily, clock.dateKey()),
      coinsFor: dailyCoins,
      adAvailable: () => ads.ready('daily_x2'),
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
      showWhen(x3, () => ads.ready('gift_x3'));
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
      // The celebration plays first (juice: pull-back, sparkles, fanfare; the crawler coasts). The dialog — and any
      // ad break after it — waits until it's over.
      game.celebrateUntil = performance.now() + CELEBRATE_MS;
      const st = sim.state;
      const passive = st.economy.passive[e.farm] ?? 0;
      const j = st.journey;
      const f = sim.farm;
      const title = e.tourDone === 0 ? t('tour.starterDone') : e.tourDone ? t('tour.done', { n: e.tourDone }) : f.tour > 0 ? t('farm.completeNo', { n: e.ordinal }) : t('farm.complete');
      // Where to go next: the next Starter farm, or the next World Tour farm (a new family says so).
      const plan = e.next && !isStarterFarm(e.next) ? planForKey(e.next, j.seed) : null;
      const next = e.next ? (isStarterFarm(e.next) ? starterNode(e.next, 'next') : plan ? nodeOfPlan(plan, 'next', j) : null) : null;
      const nextLabel = next && next.tour > 0 && next.tour !== f.tour ? `${t('map.next')} · ${t('map.tourN', { n: next.tour })}` : t('map.next');
      const pips = f.tour === 0 ? { farms: STARTER_FARMS.length, done: STARTER_FARMS.filter((id) => st.completedFarms.includes(id)).length, finale: false } : { farms: FARMS_PER_TOUR, done: f.slot + 1, finale: true };
      setTimeout(() => {
        if (e.tourDone !== null) game.onTourDone();
        openFarmComplete(game.modals, {
          reward: e.reward,
          passive,
          title,
          rank: e.tourDone !== null ? { from: j.tours - 1, to: j.tours, bonus: coreBonus(j.tours) } : null,
          worldOpens: e.tourDone === 0,
          families: FAMILIES.length,
          pips,
          next,
          nextLabel,
          gift: true,
          adAvailable: () => ads.ready('farm_complete_x2'),
          double: async () => {
            if (!(await game.rewarded('farm_complete_x2'))) return false;
            sim.execute({ c: 'grantCoins', amount: e.reward, reason: 'farmComplete' });
            return true;
          },
          // One tap on: travel straight to the next farm (the map if that is no longer possible).
          goNext: () => {
            const key = e.next;
            if (key && sim.canTravel(key))
              game.travelTo(key, () => {
                sim.execute({ c: 'travel', farm: key });
                void saves.saveNow();
              });
            else game.openMap();
          },
          openMap: () => game.openMap(),
        });
      }, CELEBRATE_MS);
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
      // Never on top of another dialog, and never during a farm's travel and entrance.
      if (game.modals.open || game.traveling) return;
      void ads.maybeInterstitial({ kind: 'dialog_closed', sinceThrottle: 99, tutorialActive: game.tutorialActive(), modalOpen: false, sinceBigMoment: game.sinceBigMoment() });
    }, 350);
  });

  return {
    frame: () => {
      if (gift.visible) gift.update(game.modals.open || game.d.pause.has('ad'));
    },
    maybeShowDaily,
  };
}
