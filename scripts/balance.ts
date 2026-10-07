/**
 * Headless pacing report: a greedy bot plays the real simulation and prints when milestones happen.
 *   node scripts/balance.ts --profile active|casual|idle|all --farms 1 --minutes 120 --dt 0.0667 --md --assert
 */
import { Sim, newGameState } from '../src/game/sim.ts';
import type { UpgradeId } from '../src/game/types.ts';
import { BODY, capacityOf, power } from '../src/game/config.ts';
import { findMergePair } from '../src/game/caterpillar.ts';
import { formatNumber, formatDuration } from '../src/shared/format.ts';

type Profile = 'active' | 'casual' | 'idle';
const args = process.argv.slice(2);
const arg = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name: string): boolean => args.includes(`--${name}`);

const profileArg = arg('profile', 'active');
const farms = Number(arg('farms', '1'));
const minutes = Number(arg('minutes', '90'));
const dt = Number(arg('dt', String(1 / 15)));
const md = flag('md');
const doAssert = flag('assert');
const verbose = flag('verbose');

interface Report {
  profile: Profile;
  milestones: [string, number][];
  gaps: { window: string; longest: number }[];
  farmTimes: number[];
  rateByMinute: number[];
  fullShare: number;
  purchases: Record<string, number>;
}

function play(profile: Profile): Report {
  const sim = new Sim(newGameState(1234));
  const st = sim.state;
  const ms: [string, number][] = [];
  const mark = (name: string) => {
    if (!ms.some(([n]) => n === name)) ms.push([name, st.simTime]);
  };
  const purchases: Record<string, number> = {};
  let lastBuy = 0;
  const gapByWindow = new Map<string, number>();
  const farmTimes: number[] = [];
  const rate: number[] = [];
  let lastMinuteCoins = 0;
  let fullTicks = 0;
  let ticks = 0;
  let decideAcc = 0;
  let farmStart = 0;
  const decideEvery = profile === 'active' ? 1 : profile === 'casual' ? 10 : 300;

  const buy = (id: UpgradeId) => {
    sim.execute({ c: 'buy', id });
    purchases[id] = (purchases[id] ?? 0) + 1;
    const gap = st.simTime - lastBuy;
    const w = st.simTime < 300 ? '0-5m' : st.simTime < 900 ? '5-15m' : '15m+';
    if (id !== 'expand' && id !== 'finish') gapByWindow.set(w, Math.max(gapByWindow.get(w) ?? 0, gap));
    lastBuy = st.simTime;
  };

  // Rolling regime detectors.
  let fillAtUnload = 0;
  const aliveShare = (): number => {
    const f = sim.field;
    let n = 0;
    let alive = 0;
    for (let k = 0; k < f.bins.items.length; k += 3) {
      n++;
      if (f.regrowAt[f.bins.items[k]] === 0) alive++;
    }
    return n ? alive / n : 1;
  };

  const totalPower = (): number => {
    let P = BODY.HEAD_POWER;
    for (const g of st.progress.segments) P += power(g.level);
    return P;
  };

  /** Payback-time bot: estimates each upgrade's income gain in the current regime and buys the fastest payback. */
  const decide = () => {
    for (let k = 0; k < 8; k++) {
      const rate = Math.max(0.5, st.economy.ema);
      const alive = aliveShare();
      const regrowLimited = alive < 0.45;
      const capLimited = fillAtUnload > 0.85;
      const p = st.progress;
      const fin = sim.check('finish');
      if (fin.ok) {
        buy('finish');
        return;
      }
      const exp = sim.check('expand');
      if (exp.ok) {
        buy('expand');
        return;
      }
      const goal = p.stage < 3 ? exp : p.finished ? null : fin;
      const timeToGoal = goal && Number.isFinite(goal.cost) ? (goal.cost - st.coins) / rate : Infinity;
      const P = totalPower();
      const dmgFactor = regrowLimited ? 0.15 : capLimited ? 0.4 : 1;
      const options: { id: UpgradeId; payback: number }[] = [];
      for (const id of ['add', 'merge', 'speed', 'capacity'] as UpgradeId[]) {
        const c = sim.check(id);
        if (c.reason && c.reason !== 'coins') continue;
        let gain = 0;
        const n = Math.max(1, p.segments.length);
        if (id === 'add') gain = (rate * power(1)) / P * dmgFactor + (capLimited ? (rate * 0.6) / n : 0);
        if (id === 'merge') {
          const pair = findMergePair(p.segments);
          if (pair) gain = (rate * 0.4 * power(pair.level)) / P * dmgFactor - (capLimited ? (rate * 0.6) / n : 0);
          // Freeing a slot at the cap is worth an extra ADD.
          if (sim.check('add').reason === 'maxSegments') gain += (rate * power(1)) / P * dmgFactor;
        }
        if (id === 'speed') gain = rate * (0.1 / (1 + 0.1 * (p.speedLevel - 1))) * (regrowLimited ? 0.2 : 1);
        if (id === 'capacity') gain = rate * (capLimited ? 0.25 : 0.01);
        options.push({ id, payback: c.cost / Math.max(1e-9, gain) });
      }
      if (options.length === 0) return;
      options.sort((a, b) => a.payback - b.payback);
      const best = options[0];
      const bc = sim.check(best.id);
      if (!bc.ok) return;
      // Spend only when the upgrade pays for itself before we'd reach the next goal anyway.
      if (best.payback > Math.min(300, Math.max(30, timeToGoal))) return;
      buy(best.id);
    }
  };

  const total = minutes * 60;
  let farmsDone = 0;
  while (st.simTime < total) {
    const t = st.simTime;
    let held: boolean;
    if (profile === 'active') held = t % 7 < 6;
    else if (profile === 'casual') held = t % 20 < 10;
    else held = false;
    sim.step(dt, { throttleHeld: held });
    ticks++;
    if (st.basket.mass >= capacityOf(st)) fullTicks++;
    for (const e of sim.drainEvents()) {
      switch (e.t) {
        case 'chunk':
          mark('first chunk');
          break;
        case 'unload':
          mark('first unload');
          fillAtUnload = fillAtUnload * 0.7 + 0.3 * (e.mass / capacityOf(st));
          break;
        case 'basketFull':
          mark('first basket FULL');
          break;
        case 'segAdded':
          if ([1, 2, 5, 10, 20].includes(purchases.add ?? 0)) mark(`ADD #${purchases.add}`);
          break;
        case 'merged':
          if (e.firstTime) mark(`Lv ${e.level} unlocked`);
          break;
        case 'stageChanged':
          mark(`${st.farmId} stage ${e.stage + 1}`);
          break;
        case 'farmFinished':
          mark(`${e.farm} FINISHED`);
          farmTimes.push(st.simTime - farmStart);
          farmsDone++;
          if (farmsDone < farms && e.next) {
            sim.enqueue({ c: 'travel', farm: e.next });
            farmStart = st.simTime;
          }
          break;
        default:
          break;
      }
    }
    if (farmsDone >= farms) break;
    decideAcc += dt;
    if (decideAcc >= decideEvery) {
      decideAcc = 0;
      decide();
    }
    if (Math.floor(st.simTime / 60) > rate.length) {
      rate.push((st.lifetimeCoins - lastMinuteCoins) / 60);
      lastMinuteCoins = st.lifetimeCoins;
      if (verbose) {
        const f = sim.field;
        let inReach = 0;
        let alive = 0;
        const seen = new Set<number>();
        for (let k = 0; k < f.bins.items.length; k++) seen.add(f.bins.items[k]);
        for (const i of seen) {
          inReach++;
          if (f.regrowAt[i] === 0) alive++;
        }
        const lv = st.progress.segments.map((x) => x.level).join('');
        console.log(
          `${String(rate.length).padStart(3)}m rate=${formatNumber(rate.at(-1)!)}/s coins=${formatNumber(st.coins)} stage=${st.progress.stage} ` +
            `alive=${((alive / inReach) * 100).toFixed(0)}% full=${((fullTicks / ticks) * 100).toFixed(0)}% spd=${st.progress.speedLevel} cap=${st.progress.capacityLevel} segs=${lv} ` +
            `expand=${formatNumber(sim.check('expand').cost)}`,
        );
        fullTicks = 0;
        ticks = 0;
      }
    }
  }
  const gaps = [...gapByWindow.entries()].map(([window, longest]) => ({ window, longest }));
  if (verbose) console.log(st.progress, formatNumber(st.coins));
  return { profile, milestones: ms, gaps, farmTimes, rateByMinute: rate, fullShare: fullTicks / ticks, purchases };
}

const spark = (vals: number[]): string => {
  const chars = '▁▂▃▄▅▆▇█';
  const logs = vals.map((v) => Math.log10(1 + v));
  const max = Math.max(...logs, 1e-9);
  return logs.map((v) => chars[Math.min(7, Math.floor((v / max) * 7.99))]).join('');
};

const profiles: Profile[] = profileArg === 'all' ? ['active', 'casual', 'idle'] : [profileArg as Profile];
const reports = profiles.map(play);
const out: string[] = [];
for (const r of reports) {
  out.push(md ? `### Profile: ${r.profile}` : `\n=== Profile: ${r.profile} ===`);
  if (md) out.push('| Milestone | Time |\n|---|---|');
  for (const [name, t] of r.milestones) out.push(md ? `| ${name} | ${formatDuration(t)} |` : `  ${formatDuration(t).padStart(8)}  ${name}`);
  out.push(`  longest purchase gap: ${r.gaps.map((g) => `${g.window}=${g.longest.toFixed(0)}s`).join(', ')}`);
  out.push(`  basket-full share: ${(r.fullShare * 100).toFixed(0)}%   purchases: ${JSON.stringify(r.purchases)}`);
  out.push(`  farm times: ${r.farmTimes.map((t) => formatDuration(t)).join(', ') || '—'}`);
  out.push(`  coins/s per minute (log): ${spark(r.rateByMinute)}  last=${formatNumber(r.rateByMinute.at(-1) ?? 0)}/s`);
}
console.log(out.join('\n'));

if (doAssert) {
  const a = reports.find((r) => r.profile === 'active');
  const errors: string[] = [];
  if (a) {
    const t = (n: string) => a.milestones.find(([m]) => m === n)?.[1] ?? Infinity;
    const check = (name: string, lo: number, hi: number) => {
      const v = t(name);
      if (!(v >= lo && v <= hi)) errors.push(`${name}: ${formatDuration(v)} not in [${formatDuration(lo)}, ${formatDuration(hi)}]`);
    };
    check('first unload', 0, 25);
    check('ADD #1', 3, 45);
    check('Lv 2 unlocked', 20, 150);
    check('meadow stage 2', 150, 480);
    check('meadow stage 3', 540, 1200);
    check('meadow stage 4', 1200, 2400);
    check('meadow FINISHED', 2100, 3600);
  }
  if (errors.length) {
    console.error('\nBalance targets missed:\n  ' + errors.join('\n  '));
    process.exit(1);
  }
  console.log('\nBalance targets OK');
}
