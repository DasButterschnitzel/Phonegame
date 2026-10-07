/**
 * Headless pacing report: a greedy bot plays the real simulation and prints when milestones happen.
 *   node scripts/balance.ts --profile active|casual|idle|all --farms 1 --minutes 120 --dt 0.0667 --md --assert --verbose
 *
 * The world is finite (crops never regrow), so besides coins the report tracks how often the world changes
 * (route growth), how long the longest stretch without growth is, and that every profile can finish (no softlock).
 */
import { Sim, newGameState } from '../src/game/sim.ts';
import type { FarmId, UpgradeId } from '../src/game/types.ts';
import { BODY, capacityOf, power } from '../src/game/config.ts';
import { findMergePair } from '../src/game/caterpillar.ts';
import { isFrontier } from '../src/game/territory.ts';
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
const startFarm = arg('farm', 'meadow') as FarmId;
const minutes = Number(arg('minutes', '240'));
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
  growthByMinute: number[];
  longestNoGrowth: number;
  fullShare: number;
  purchases: Record<string, number>;
  finished: boolean;
}

function play(profile: Profile): Report {
  const st0 = newGameState(1234);
  if (startFarm !== 'meadow') {
    st0.farmId = startFarm;
    st0.unlockedFarms = [startFarm];
  }
  const sim = new Sim(st0);
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
  const growth: number[] = [];
  let grownThisMinute = 0;
  let lastGrowth = 0;
  let longestNoGrowth = 0;
  let lastMinuteCoins = 0;
  let fullTicks = 0;
  let ticks = 0;
  let decideAcc = 0;
  let farmStart = 0;
  const decideEvery = profile === 'active' ? 1 : profile === 'casual' ? 10 : 300;

  const buy = (id: UpgradeId) => {
    const free = sim.check(id).cost === 0;
    sim.execute({ c: 'buy', id });
    purchases[id] = (purchases[id] ?? 0) + 1;
    if (id === 'expand') purchases[free ? 'expand(free)' : 'expand(paid)'] = (purchases[free ? 'expand(free)' : 'expand(paid)'] ?? 0) + 1;
    const gap = st.simTime - lastBuy;
    const w = st.simTime < 300 ? '0-5m' : st.simTime < 900 ? '5-15m' : '15m+';
    if (id !== 'expand' && id !== 'finish') gapByWindow.set(w, Math.max(gapByWindow.get(w) ?? 0, gap));
    lastBuy = st.simTime;
  };

  let fullRecent = 0;
  const totalPower = (): number => {
    let P = BODY.HEAD_POWER;
    for (const g of st.progress.segments) P += power(g.level);
    return P;
  };
  /** Alive crops the route can reach right now (0 = the open area is exhausted: open the next fence). */
  const frontierLeft = (): number => {
    const t = sim.terr;
    let n = 0;
    for (let p = 0; p < t.claimed.length; p++) if (isFrontier(t, p, st.progress.zone)) n += t.blockers[p];
    return n;
  };

  /** Payback-time bot: estimates each upgrade's clearing/income gain in the current regime and buys the fastest payback. */
  const decide = () => {
    for (let k = 0; k < 8; k++) {
      const r = Math.max(0.5, st.economy.ema);
      const capLimited = fullRecent > 0.35;
      const p = st.progress;
      if (sim.check('finish').ok) {
        buy('finish');
        return;
      }
      const exp = sim.check('expand');
      // Free fences always; paid ones when the reachable field is nearly used up and we can afford it.
      if (exp.ok && (exp.cost === 0 || (frontierLeft() < 12 && st.coins >= exp.cost))) {
        buy('expand');
        return;
      }
      const P = totalPower();
      const dmgFactor = capLimited ? 0.35 : 1;
      const options: { id: UpgradeId; payback: number }[] = [];
      for (const id of ['add', 'merge', 'speed', 'capacity'] as UpgradeId[]) {
        const c = sim.check(id);
        if (c.reason && c.reason !== 'coins') continue;
        let gain = 0;
        const n = Math.max(1, p.segments.length);
        if (id === 'add') gain = ((r * power(1)) / P) * dmgFactor + (capLimited ? (r * 0.7) / n : 0);
        if (id === 'merge') {
          const pair = findMergePair(p.segments);
          if (pair) gain = ((r * 0.4 * power(pair.level)) / P) * dmgFactor - (capLimited ? (r * 0.7) / n : 0);
          if (sim.check('add').reason === 'maxSegments') gain += ((r * power(1)) / P) * dmgFactor;
        }
        if (id === 'speed') gain = r * (0.1 / (1 + 0.1 * (p.speedLevel - 1))) * (capLimited ? 1 : 0.5);
        if (id === 'capacity') gain = r * (capLimited ? 0.3 : 0.02);
        options.push({ id, payback: c.cost / Math.max(1e-9, gain) });
      }
      if (options.length === 0) return;
      options.sort((a, b) => a.payback - b.payback);
      const best = options[0];
      if (!sim.check(best.id).ok) return;
      // Save up only while a paid fence is the next goal and within reach; otherwise spend like a player would.
      const saving = st.progress.zone < 3 && exp.cost > 0 && exp.cost < st.coins * 3;
      if (saving && best.payback > 240) return;
      buy(best.id);
    }
  };

  const total = minutes * 60;
  let farmsDone = 0;
  let finished = false;
  while (st.simTime < total) {
    const t = st.simTime;
    let held: boolean;
    if (profile === 'active') held = t % 7 < 6;
    else if (profile === 'casual') held = t % 20 < 10;
    else held = false;
    sim.step(dt, { throttleHeld: held });
    ticks++;
    const full = st.basket.mass >= capacityOf(st) - 0.5;
    if (full) fullTicks++;
    fullRecent = fullRecent * 0.995 + (full ? 0.005 : 0);
    for (const e of sim.drainEvents()) {
      switch (e.t) {
        case 'chunk':
          mark('first chunk');
          break;
        case 'unload':
          mark('first unload');
          break;
        case 'basketFull':
          mark('first basket FULL');
          break;
        case 'routeGrew':
          mark('first route growth');
          grownThisMinute += e.plots.length;
          if (st.simTime - farmStart > 60) longestNoGrowth = Math.max(longestNoGrowth, st.simTime - lastGrowth);
          lastGrowth = st.simTime;
          break;
        case 'segAdded':
          if ([1, 2, 5, 10, 20].includes(purchases.add ?? 0)) mark(`ADD #${purchases.add}`);
          break;
        case 'merged':
          if (e.firstTime) mark(`Lv ${e.level} unlocked`);
          break;
        case 'zoneOpened':
          mark(`${st.farmId} zone ${e.zone + 1}${e.free ? ' (free)' : ' (paid)'}`);
          mark(`${st.farmId} zone ${e.zone + 1}`);
          break;
        case 'farmFinished':
          mark(`${e.farm} FINISHED`);
          farmTimes.push(st.simTime - farmStart);
          farmsDone++;
          finished = true;
          if (farmsDone < farms && e.next) {
            sim.enqueue({ c: 'travel', farm: e.next });
            farmStart = st.simTime;
            lastGrowth = st.simTime;
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
      growth.push(grownThisMinute);
      grownThisMinute = 0;
      lastMinuteCoins = st.lifetimeCoins;
      if (verbose) {
        const lv = st.progress.segments.map((x) => x.level).join('');
        console.log(
          `${String(rate.length).padStart(3)}m rate=${formatNumber(rate.at(-1)!)}/s coins=${formatNumber(st.coins)} zone=${st.progress.zone} ` +
            `cleared=${(sim.cleared * 100).toFixed(0)}% open=${(sim.openCleared * 100).toFixed(0)}% +${growth.at(-1)}plots full=${((fullTicks / ticks) * 100).toFixed(0)}% ` +
            `L=${sim.path.length.toFixed(0)} spd=${st.progress.speedLevel} cap=${st.progress.capacityLevel} segs=${lv} expand=${formatNumber(sim.check('expand').cost)}`,
        );
        fullTicks = 0;
        ticks = 0;
      }
    }
  }
  const gaps = [...gapByWindow.entries()].map(([window, longest]) => ({ window, longest }));
  return {
    profile,
    milestones: ms.filter(([n]) => !/zone \d$/.test(n)),
    gaps,
    farmTimes,
    rateByMinute: rate,
    growthByMinute: growth,
    longestNoGrowth,
    fullShare: ticks ? fullTicks / ticks : 0,
    purchases,
    finished,
  };
}

const spark = (vals: number[], log = true): string => {
  const chars = '▁▂▃▄▅▆▇█';
  const v2 = vals.map((v) => (log ? Math.log10(1 + v) : v));
  const max = Math.max(...v2, 1e-9);
  return v2.map((v) => chars[Math.min(7, Math.floor((v / max) * 7.99))]).join('');
};

const profiles: Profile[] = profileArg === 'all' ? ['active', 'casual', 'idle'] : [profileArg as Profile];
const reports = profiles.map(play);
const out: string[] = [];
for (const r of reports) {
  out.push(md ? `### Profile: ${r.profile}` : `\n=== Profile: ${r.profile} ===`);
  if (md) out.push('| Milestone | Time |\n|---|---|');
  for (const [name, t] of r.milestones) out.push(md ? `| ${name} | ${formatDuration(t)} |` : `  ${formatDuration(t).padStart(8)}  ${name}`);
  out.push(`  longest purchase gap: ${r.gaps.map((g) => `${g.window}=${g.longest.toFixed(0)}s`).join(', ')}`);
  out.push(`  longest stretch without route growth: ${r.longestNoGrowth.toFixed(0)}s`);
  out.push(`  basket-full share: ${(r.fullShare * 100).toFixed(0)}%   purchases: ${JSON.stringify(r.purchases)}`);
  out.push(`  farm times: ${r.farmTimes.map((t) => formatDuration(t)).join(', ') || '—'}`);
  out.push(`  plots claimed per minute: ${spark(r.growthByMinute, false)}`);
  out.push(`  coins/s per minute (log): ${spark(r.rateByMinute)}  last=${formatNumber(r.rateByMinute.at(-1) ?? 0)}/s`);
}
console.log(out.join('\n'));

if (doAssert) {
  const errors: string[] = [];
  const a = reports.find((r) => r.profile === 'active');
  if (a) {
    const t = (n: string) => a.milestones.find(([m]) => m.startsWith(n))?.[1] ?? Infinity;
    const check = (name: string, lo: number, hi: number) => {
      const v = t(name);
      if (!(v >= lo && v <= hi)) errors.push(`${name}: ${formatDuration(v)} not in [${formatDuration(lo)}, ${formatDuration(hi)}]`);
    };
    check('first unload', 0, 25);
    check('ADD #1', 3, 45);
    check('first route growth', 25, 90);
    check('Lv 2 unlocked', 30, 300);
    check(`${startFarm} zone 2`, 120, 420);
    check(`${startFarm} zone 3`, 360, 900);
    check(`${startFarm} zone 4`, 720, 1500);
    check(`${startFarm} FINISHED`, 1500, 3000);
    const early = a.gaps.find((g) => g.window === '0-5m');
    if (early && early.longest > 60) errors.push(`longest purchase gap in the first 5 min: ${early.longest.toFixed(0)}s > 60s`);
    if (a.longestNoGrowth > 240) errors.push(`longest stretch without route growth: ${a.longestNoGrowth.toFixed(0)}s > 240s`);
  }
  // No softlock: every profile finishes eventually.
  for (const r of reports) if (!r.finished) errors.push(`${r.profile} never finished ${startFarm} in ${minutes} min`);
  if (errors.length) {
    console.error('\nBalance targets missed:\n  ' + errors.join('\n  '));
    process.exit(1);
  }
  console.log('\nBalance targets OK');
}


