import type { Sim } from './sim.ts';
import type { UpgradeId } from './types.ts';
import { capacityPerSegment, power, vMax } from './config.ts';
import { bodyPower, findMergePair } from './caterpillar.ts';

/**
 * A rough model of what an upgrade is worth right now (the shop's quiet hint and the balance bots use it):
 * - SPEED shortens every lap: harvest grows with speed one to one.
 * - Power (ADD, MERGE) only helps while crops need more than one pass to go down.
 * - CAPACITY only helps while the basket fills up before the depot.
 * `rel` is the relative harvest gain, `payback` the seconds of current income the price represents per unit of gain.
 */
export type CoreUpgrade = 'add' | 'merge' | 'speed' | 'capacity';
export const CORE_UPGRADES: readonly CoreUpgrade[] = ['add', 'merge', 'speed', 'capacity'];

export interface UpgradeValue {
  id: CoreUpgrade;
  cost: number;
  /** Buyable now (affordable and not maxed). */
  ok: boolean;
  /** Not available at all (maxed, no pair, no room). */
  blocked: boolean;
  rel: number;
  payback: number;
}

/** Average length of route a crop spends in reach of one body (world units): reach 2 → chords of 0..4. */
const CHORD = 3;

/** Passes the caterpillar needs, on average, to destroy the crops it can reach now. */
export function passesNeeded(sim: Sim): number {
  const f = sim.field;
  const zone = sim.state.progress.zone;
  let hp = 0;
  let n = 0;
  for (let i = 0; i < f.count; i++) {
    if (f.dead[i] || !f.reach[i] || f.tier[i] > zone) continue;
    hp += f.hp[i];
    n++;
  }
  if (n === 0) return 1;
  let P = 0;
  for (let b = 0; b <= sim.state.progress.segments.length; b++) P += bodyPower(sim.state, b);
  return hp / n / (P * CHORD);
}

/** How much of a power gain turns into harvest: none while crops already fall in one pass. */
export const powerElasticity = (passes: number): number => (passes <= 0.5 ? 0 : passes / (passes + 0.5));

/**
 * `fullShare`: the recent share of time the basket was full (0..1). `income`: coins per second to express
 * paybacks in (the rolling income by default).
 */
export function upgradeValues(sim: Sim, fullShare: number, income = sim.state.economy.ema): UpgradeValue[] {
  const st = sim.state;
  const p = st.progress;
  const n = p.segments.length;
  let P = 0;
  for (let b = 0; b <= n; b++) P += bodyPower(st, b);
  const f = Math.min(1, Math.max(0, fullShare));
  const powerEl = powerElasticity(passesNeeded(sim)) * (1 - f);
  const capPer = capacityPerSegment(p.capacityLevel);
  const r = Math.max(1e-6, income);
  const out: UpgradeValue[] = [];
  for (const id of CORE_UPGRADES) {
    const chk = sim.check(id as UpgradeId);
    const blocked = !!chk.reason && chk.reason !== 'coins';
    let rel = 0;
    if (!blocked) {
      if (id === 'speed') rel = vMax(p.speedLevel + 1) / vMax(p.speedLevel) - 1;
      else if (id === 'capacity') rel = (capacityPerSegment(p.capacityLevel + 1) / capPer - 1) * f;
      else if (id === 'add') rel = (power(1) / P) * powerEl + (1 / Math.max(1, n)) * f;
      else {
        const pair = findMergePair(p.segments);
        // Two level-L segments become one level L+1: power × 2.4 / 2, and the freed slot takes a new ADD.
        if (pair) rel = ((power(pair.level + 1) - 2 * power(pair.level)) / P) * powerEl - (1 / Math.max(1, n)) * f;
      }
    }
    out.push({ id, cost: chk.cost, ok: chk.ok, blocked, rel, payback: rel > 0 ? chk.cost / (r * rel) : Infinity });
  }
  return out;
}
