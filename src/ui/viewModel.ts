import type { Sim } from '../game/sim.ts';
import type { FarmId, UpgradeId } from '../game/types.ts';
import { FARM_ORDER } from '../game/types.ts';
import { capacityOf, MOVE, TERRITORY } from '../game/config.ts';
import { maxSegments } from '../game/upgrades.ts';
import { findMergePair } from '../game/caterpillar.ts';

export interface UpgradeVM {
  id: UpgradeId;
  cost: number;
  ok: boolean;
  affordable: boolean;
  maxed: boolean;
  reason?: string;
  level: number;
  /** Secondary label numbers (e.g. segments/maxSegments, next merge level). */
  a?: number;
  b?: number;
}

export interface HudVM {
  coins: number;
  rate: number;
  mass: number;
  cap: number;
  fill: number;
  full: boolean;
  overflow: boolean;
  /** Outermost open zone (0..3). */
  zone: number;
  /** Destroyed share of the whole farm (the farm progress metric). */
  cleared: number;
  /** FINAL HARVEST is on (the farm's last stretch). */
  final: boolean;
  /** This farm is done (the progress bar reads COMPLETE). */
  finished: boolean;
  farmId: Sim['farm']['id'];
  upgrades: Record<'add' | 'merge' | 'speed' | 'capacity', UpgradeVM>;
  /** `progress`: clearing progress towards the free fence / finishing (0..1). */
  goal: { id: 'expand' | 'finish'; cost: number; ok: boolean; progress: number } | { id: 'travel'; farm: FarmId; cost: 0; ok: true; progress: 1 } | null;
  tornadoes: number;
  incomeX2: number;
  autopilot: number;
  /** Free boost charges (milestone gifts): the next activation costs nothing. */
  charges: Record<'incomeX2' | 'autopilot', number>;
  /** Coin prices (the alternative to an ad). */
  autopilotPrice: number;
  tornadoPrice: number;
  giftActive: boolean;
}

/** Pure projection of simulation state for the HUD (unit-testable, no DOM). */
export function buildHud(sim: Sim): HudVM {
  const st = sim.state;
  const p = st.progress;
  const cap = capacityOf(st);
  const up = (id: UpgradeId, level: number, extra: Partial<UpgradeVM> = {}): UpgradeVM => {
    const c = sim.check(id);
    const maxed = c.reason === 'maxSegments' || c.reason === 'maxLevel' || c.reason === 'noPair';
    return { id, cost: c.cost, ok: c.ok, affordable: st.coins >= c.cost, maxed, reason: c.reason, level, ...extra };
  };
  const pair = findMergePair(p.segments);
  let goal: HudVM['goal'] = null;
  if (p.zone < 3) {
    const c = sim.check('expand');
    goal = { id: 'expand', cost: c.cost, ok: c.ok, progress: Math.min(1, sim.openCleared / TERRITORY.ZONE_FREE_AT) };
  } else if (!p.finished) {
    const c = sim.check('finish');
    goal = { id: 'finish', cost: 0, ok: c.ok, progress: Math.min(1, sim.cleared / TERRITORY.FINISH_AT) };
  } else {
    // Farm done: point at the next unfinished farm so there's always a "what next".
    const next = FARM_ORDER.find((f) => f !== st.farmId && st.unlockedFarms.includes(f) && !st.completedFarms.includes(f));
    if (next) goal = { id: 'travel', farm: next, cost: 0, ok: true, progress: 1 };
  }
  return {
    coins: st.coins,
    rate: st.economy.ema,
    mass: st.basket.mass,
    cap,
    fill: Math.min(2, st.basket.mass / cap),
    full: st.basket.mass >= cap,
    overflow: st.basket.mass > cap,
    zone: p.zone,
    cleared: sim.cleared,
    final: sim.final,
    finished: p.finished,
    farmId: sim.farm.id,
    upgrades: {
      add: up('add', p.addCount + 1, { a: p.segments.length, b: maxSegments(sim.farm, p.zone, sim.path) }),
      merge: up('merge', p.mergeCount + 1, { a: pair ? pair.level + 1 : undefined }),
      speed: up('speed', p.speedLevel, { b: MOVE.MAX_LVL }),
      capacity: up('capacity', p.capacityLevel),
    },
    goal,
    tornadoes: st.tornadoes,
    incomeX2: st.boosts.incomeX2,
    autopilot: st.boosts.autopilot,
    charges: st.charges,
    autopilotPrice: sim.autopilotPrice,
    tornadoPrice: sim.tornadoPrice,
    giftActive: sim.giftActive,
  };
}
