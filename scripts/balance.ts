/**
 * Headless pacing report: bots with different habits play the real simulation (src/game/bot) and the report shows
 * what a player would feel.
 *   node scripts/balance.ts --profile active|casual|idle|noAds|ads|heavy|speed|merge|all --farms 1 --minutes 240
 *                           [--bands] [--roi] [--md] [--assert] [--verbose] [--dt 0.0667] [--seed 1234]
 *
 * --bands  per farm, time and feel by cleared share (0–25 %, 25–50 %, 50–70 %, 70–80 %, 80–90 %, 90 %+)
 * --roi    measured upgrade payback: every 2 minutes the game is forked, each upgrade bought for free in a fork, and
 *          the forks' harvest compared over the next two minutes
 */
import { BAND_NAMES, PROFILES, runBot, type BandStats, type FarmStats, type ProfileId, type RunReport } from '../src/game/bot/bot.ts';
import { measureRoi, type RoiRow } from '../src/game/bot/roi.ts';
import type { FarmId } from '../src/game/types.ts';
import { formatDuration, formatNumber } from '../src/shared/format.ts';

const args = process.argv.slice(2);
const arg = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name: string): boolean => args.includes(`--${name}`);

const profileArg = arg('profile', 'active');
const farms = Number(arg('farms', '1'));
const startFarm = arg('farm', 'meadow') as FarmId;
const minutes = Number(arg('minutes', String(240 * farms)));
const dt = Number(arg('dt', String(1 / 15)));
const seed = Number(arg('seed', '1234'));
const md = flag('md');
const doAssert = flag('assert');
const verbose = flag('verbose');
const showBands = flag('bands');
const showRoi = flag('roi');

const fmtT = (s: number): string => (Number.isFinite(s) ? formatDuration(s) : '—');
const n0 = (x: number): string => formatNumber(x);
const pct = (x: number): string => `${Math.round(x * 100)}%`;

function table(head: string[], rows: string[][]): string {
  if (md) return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => '  ' + r.map((c, i) => c.padStart(w[i])).join('  ');
  return [line(head), ...rows.map(line)].join('\n');
}

function bandTable(f: FarmStats): string {
  const rows = f.bands.map((b: BandStats) => [
    b.name,
    fmtT(b.seconds),
    String(b.upgrades),
    `${b.growths}/${b.plots}`,
    `${n0(b.income0)}→${n0(b.income1)}`,
    `${b.speed0.toFixed(1)}→${b.speed1.toFixed(1)}`,
    b.clearPerMin.toFixed(1),
    b.chunksPerSec.toFixed(1),
    pct(b.fullShare),
    `${pct(b.droughtShare)} / ${Math.round(b.longestDrought)}s`,
    b.decisionsPerMin.toFixed(1),
    `${Math.round(b.longestEventGap)}s / ${Math.round(b.medianEventGap)}s`,
  ]);
  return table(['band', 'time', 'upgr', 'growth/plots', 'income/s', 'speed', '%/min', 'chunks/s', 'full', 'dry share/max', 'decisions/min', 'event gap max/med'], rows);
}

function farmTable(r: RunReport): string {
  const rows = r.farms.map((f) => [
    f.farm,
    f.finished ? fmtT(f.seconds) : `>${fmtT(f.seconds)}`,
    `${Math.round(f.longestDrought)}s`,
    pct(f.savingShare),
    `${Math.round(f.longestNoGrowth)}s`,
    `${Math.round(f.longestEventGap)}s`,
    `${f.avgUpgradeInterval.toFixed(0)}s`,
    `${f.end.speedLevel} (${f.end.vMax.toFixed(1)}/s)`,
    String(f.end.capacityLevel),
    `${f.end.segments} (max Lv ${f.end.maxLevel})`,
    Object.entries(f.purchases)
      .filter(([k]) => !k.startsWith('expand'))
      .map(([k, v]) => `${k}:${v}`)
      .join(' '),
  ]);
  return table(['farm', 'time', 'longest dry', 'dry share', 'no growth', 'event gap', 'upgrade every', 'speed', 'cap', 'segments', 'purchases'], rows);
}

const ids: ProfileId[] = profileArg === 'all' ? (Object.keys(PROFILES) as ProfileId[]) : (profileArg.split(',') as ProfileId[]);
const roiRows: RoiRow[] = [];
const reports: RunReport[] = [];
for (const id of ids) {
  const profile = PROFILES[id];
  if (!profile) throw new Error(`unknown profile ${id}`);
  const wantRoi = showRoi && id === ids[0];
  reports.push(
    runBot(profile, {
      farms,
      startFarm,
      minutes,
      dt,
      seed,
      onMinute: verbose ? (l) => console.log(`[${id}] ${l}`) : undefined,
      sampleEvery: wantRoi ? 120 : undefined,
      onSample: wantRoi ? (sim) => roiRows.push(...measureRoi(sim, profile.held, 240, dt)) : undefined,
    }),
  );
}

const out: string[] = [];
for (const r of reports) {
  out.push(md ? `\n### ${r.profile.label}` : `\n=== ${r.profile.label} ===`);
  if (md) out.push('| Milestone | Time |\n|---|---|');
  for (const [name, t] of r.milestones) out.push(md ? `| ${name} | ${formatDuration(t)} |` : `  ${formatDuration(t).padStart(8)}  ${name}`);
  out.push('');
  out.push(farmTable(r));
  if (r.adsWatched) out.push(`  rewarded ads watched: ${r.adsWatched}`);
  if (showBands) for (const f of r.farms) out.push(`\n  ${f.farm} by cleared share:\n${bandTable(f)}`);
}

if (showRoi && roiRows.length) {
  out.push(md ? '\n### Measured upgrade payback (ACTIVE)' : '\n=== Measured upgrade payback (forked sims, 4 min horizon) ===');
  const rows = roiRows.map((r) => [
    fmtT(r.t),
    r.farm,
    pct(r.cleared),
    r.id,
    String(r.level),
    n0(r.cost),
    n0(r.income),
    `${(r.rel * 100).toFixed(1)}%`,
    `${(r.predicted * 100).toFixed(1)}%`,
    r.clearGain.toFixed(1),
    Number.isFinite(r.payback) ? `${Math.round(r.payback)}s${r.payback > 600 ? ' !!' : ''}` : '∞ !!',
  ]);
  out.push(table(['t', 'farm', 'cleared', 'upgrade', 'lv', 'cost', 'income/s', 'gain (measured)', 'gain (model)', 'crops/min gain', 'payback'], rows));
  // How well the model tracks the forks, per upgrade (medians over all samples).
  const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  for (const id of ['add', 'merge', 'speed', 'capacity']) {
    const rs = roiRows.filter((r) => r.id === id);
    if (rs.length) out.push(`  ${id.padEnd(8)} median gain measured ${(med(rs.map((r) => r.rel)) * 100).toFixed(1)}%  model ${(med(rs.map((r) => r.predicted)) * 100).toFixed(1)}%  (${rs.length} samples)`);
  }
}
console.log(out.join('\n'));

if (doAssert) {
  const errors: string[] = [];
  const a = reports.find((r) => r.profile.id === 'active');
  if (a) {
    const t = (n: string) => a.milestones.find(([m]) => m.startsWith(n))?.[1] ?? Infinity;
    const check = (name: string, lo: number, hi: number) => {
      const v = t(name);
      if (!(v >= lo && v <= hi)) errors.push(`${name}: ${fmtT(v)} not in [${fmtT(lo)}, ${fmtT(hi)}]`);
    };
    check('first unload', 0, 25);
    check('ADD #1', 3, 45);
    check('first route growth', 25, 90);
    check('Lv 2 unlocked', 30, 300);
    check(`${startFarm} zone 2`, 120, 420);
    check(`${startFarm} zone 3`, 360, 900);
    check(`${startFarm} zone 4`, 720, 1500);
    check(`${startFarm} FINISHED`, 1500, 3000);
    const f = a.farms[0];
    if (f && f.longestNoGrowth > 240) errors.push(`longest stretch without route growth: ${f.longestNoGrowth.toFixed(0)}s > 240s`);
  }
  // No softlock: every profile finishes eventually.
  for (const r of reports) if (!r.finishedAll) errors.push(`${r.profile.label} never finished ${farms} farm(s) from ${startFarm} in ${minutes} min`);
  if (errors.length) {
    console.error('\nBalance targets missed:\n  ' + errors.join('\n  '));
    process.exit(1);
  }
  console.log('\nBalance targets OK');
}

export { BAND_NAMES };
