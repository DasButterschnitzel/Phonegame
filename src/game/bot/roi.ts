/**
 * Upgrade return on investment, measured rather than guessed: fork the running game, buy one upgrade for free in
 * the fork, play both forks for the same time with the same hands, and compare what they harvested.
 */
import type { Sim } from '../sim.ts';
import type { UpgradeId } from '../types.ts';
import { Player, fork, type Profile } from './bot.ts';
import { findMergePair } from '../caterpillar.ts';
import { FIELD, MISC, crop as cropCfg } from '../config.ts';
import { upgradeValues } from '../advisor.ts';

export interface RoiRow {
  /** Sim time and farm state the sample was taken at. */
  t: number;
  farm: string;
  cleared: number;
  id: UpgradeId;
  /** Level being bought (SPEED/CAPACITY level after the purchase; ADD: segments after; MERGE: level created). */
  level: number;
  cost: number;
  income: number;
  /** Extra harvest value per second (coins/s) and extra crops destroyed per minute thanks to the upgrade. */
  gain: number;
  clearGain: number;
  /** Seconds of income to pay the upgrade back (cost / gain); Infinity when it gains nothing. */
  payback: number;
  /** Relative income gain (gain / income), and what the upgrade-value model (advisor.ts) predicted. */
  rel: number;
  predicted: number;
}

const CORE: UpgradeId[] = ['add', 'merge', 'speed', 'capacity'];

/**
 * Value eaten so far — every crop counts with the share of it that is gone (smooth, unlike chunk drops or depot
 * payouts, so a short what-if isn't drowned by quantisation) — and crops destroyed.
 */
function progress(s: Sim): { value: number; dead: number } {
  const f = s.field;
  let value = 0;
  for (let i = 0; i < f.count; i++) {
    const eaten = f.dead[i] ? 1 : 1 - f.hp[i] / f.maxHp[i];
    if (eaten > 0) value += eaten * FIELD.CHUNKS * cropCfg.chunkValue(f.tier[i]) * (f.golden[i] ? MISC.GOLDEN_MULT : 1);
  }
  return { value: value * s.valueMult, dead: f.deadCount };
}

function play(s: Sim, held: (t: number) => boolean, horizon: number, dt: number): { value: number; dead: number; full: number } {
  const a = progress(s);
  const end = s.state.simTime + horizon;
  let full = 0;
  let ticks = 0;
  while (s.state.simTime < end) {
    s.step(dt, { throttleHeld: held(s.state.simTime) });
    s.drainEvents();
    ticks++;
    if (s.state.basket.mass >= s.capacity - 0.5) full++;
  }
  const b = progress(s);
  return { value: b.value - a.value, dead: b.dead - a.dead, full: full / Math.max(1, ticks) };
}

/** ROI of every available core upgrade at the current state of `sim` (which is not modified). */
export function measureRoi(sim: Sim, held: (t: number) => boolean, horizon = 240, dt = 1 / 15): RoiRow[] {
  const st = sim.state;
  const baseRun = play(fork(sim), held, horizon, dt);
  const rows: RoiRow[] = [];
  const income = Math.max(1e-9, baseRun.value / horizon);
  const model = upgradeValues(sim, baseRun.full, income);
  for (const id of CORE) {
    const chk = sim.check(id);
    if (chk.reason && chk.reason !== 'coins') continue;
    const pair = findMergePair(st.progress.segments);
    const f = fork(sim);
    f.execute({ c: 'buy', id, free: true });
    const p = f.state.progress;
    const level = id === 'speed' ? p.speedLevel : id === 'capacity' ? p.capacityLevel : id === 'add' ? p.segments.length : (pair?.level ?? 0) + 1;
    const r = play(f, held, horizon, dt);
    const gain = (r.value - baseRun.value) / horizon;
    rows.push({
      t: st.simTime,
      farm: st.farmId,
      cleared: sim.cleared,
      id,
      level,
      cost: chk.cost,
      income,
      gain,
      clearGain: ((r.dead - baseRun.dead) * 60) / horizon,
      payback: gain > 0 ? chk.cost / gain : Infinity,
      rel: gain / income,
      predicted: model.find((m) => m.id === id)?.rel ?? 0,
    });
  }
  return rows;
}

export type RewardKind = 'incomeX2' | 'autopilot' | 'tornado' | 'upgrade';

/** Applies a rewarded-ad reward to a game (the same thing the app does after a completed ad). */
export function applyReward(s: Sim, kind: RewardKind): void {
  if (kind === 'incomeX2' || kind === 'autopilot') s.execute({ c: 'boost', id: kind, seconds: MISC.BOOST_ADD_S });
  else if (kind === 'tornado') {
    s.execute({ c: 'grantTornado', n: 1 });
    s.execute({ c: 'useTornado' });
  } else {
    const best = upgradeValues(s, 0).filter((u) => !u.blocked).sort((a, b) => a.payback - b.payback)[0];
    if (best) s.execute({ c: 'buy', id: best.id, free: true });
  }
}

/**
 * Seconds of progression an ad's reward is worth: the game is forked, one fork gets the reward, both are played on
 * by the same kind of player until the farm is finished, and the difference in finishing time is taken (coins only
 * turn into progress once they are spent, so a short horizon would miss most of ×2's value).
 */
export function measureReward(sim: Sim, profile: Profile, kind: RewardKind, maxT = 3 * 3600, dt = 1 / 15): number {
  const until = (s: Sim): number => {
    const p = new Player(profile);
    p.arrived(s);
    const t0 = s.state.simTime;
    while (s.state.simTime - t0 < maxT && !s.state.progress.finished) p.step(s, dt);
    return s.state.simTime - t0;
  };
  const base = fork(sim);
  const rewarded = fork(sim);
  applyReward(rewarded, kind);
  rewarded.drainEvents();
  return until(base) - until(rewarded);
}
