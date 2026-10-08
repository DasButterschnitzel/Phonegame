/**
 * Endless economy report — the bot plays the Starter Tour and on through World Tours:
 *   node scripts/endless.ts [--profiles noAds,active,casual,idle,twoFinger,bare] [--farms 100] [--seed 1] [--md out.md] [--assert]
 *
 * One process per profile (run in parallel). Per profile it reports farm durations by size class, the band of farms
 * 20+ (target 12–22 min for a typical farm; quick 8–12, standard 14–20, grand 20–26), difficulty cliffs (a farm far
 * slower than its size class's median), wallet droughts, softlocks (a farm that never finishes), the biggest number
 * ever held (readable: never 8e74) and the Tours / Core Rank reached.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROFILES, runBot } from '../src/game/bot/bot.ts';
import type { ProfileId } from '../src/game/bot/bot.ts';
import { formatNumber, formatDuration } from '../src/shared/format.ts';
import type { SizeClass } from '../src/game/types.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const FARMS = Number(arg('farms', '100'));
const SEED = Number(arg('seed', '1'));

export interface FarmRow {
  ordinal: number;
  key: string;
  biome: string;
  tour: number;
  slot: number;
  size: SizeClass;
  modifier: string | null;
  showcase: boolean;
  minutes: number;
  finished: boolean;
  droughtS: number;
  peakCoins: number;
  coreRank: number;
  plots: number;
  archetype: string;
  map: readonly string[];
  route: number;
  obstacles: number;
  capacityLevel: number;
  speedLevel: number;
  maxLevel: number;
}

function child(id: ProfileId): void {
  const rows: FarmRow[] = [];
  runBot(PROFILES[id], {
    farms: FARMS,
    startFarm: 'meadow',
    // Idle play is slow by design (the motor only crawls); give it room to finish the journey.
    minutes: (id === 'idle' ? 150 : 75) * FARMS,
    dt: 1 / 15,
    seed: SEED,
    onFarm: (sim, f) =>
      rows.push({
        ordinal: sim.farm.ordinal,
        key: sim.farm.id,
        biome: sim.farm.biome,
        tour: sim.farm.tour,
        slot: sim.farm.slot,
        size: sim.farm.size,
        modifier: sim.farm.modifier,
        showcase: sim.farm.showcase,
        minutes: f.seconds / 60,
        finished: f.finished,
        droughtS: f.longestDrought,
        peakCoins: f.peakCoins,
        coreRank: sim.state.journey.tours,
        plots: sim.farm.layout.zonePlots.reduce((a, b) => a + b, 0),
        archetype: sim.farm.bp?.archetype ?? 'starter',
        map: sim.farm.map,
        route: sim.path.length,
        obstacles: Array.from(sim.farm.layout.zone).filter((z) => z === -2).length,
        capacityLevel: f.end.capacityLevel,
        speedLevel: f.end.speedLevel,
        maxLevel: f.end.maxLevel,
      }),
  });
  process.stdout.write(JSON.stringify(rows));
}

const pct = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const m1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const TARGET: Record<SizeClass, [number, number]> = { quick: [8, 12], standard: [14, 20], grand: [20, 26] };

export function summarize(id: string, rows: FarmRow[]): { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  const label = PROFILES[id as ProfileId]?.label ?? id;
  const world = rows.filter((r) => r.tour > 0 && r.finished);
  const late = world.filter((r) => r.ordinal >= 20);
  const total = rows.reduce((s, r) => s + r.minutes, 0);
  const unfinished = rows.filter((r) => !r.finished);
  lines.push(`\n=== ${label} — ${rows.filter((r) => r.finished).length} farms in ${formatDuration(total * 60)}, Core Rank ${rows.at(-1)?.coreRank ?? 0} ===`);
  lines.push(`  Starter Tour: ${rows.filter((r) => r.tour === 0).map((r) => `${r.key} ${m1(r.minutes)}`).join(' · ')}`);
  for (const size of ['quick', 'standard', 'grand'] as SizeClass[]) {
    const xs = world.filter((r) => r.size === size).map((r) => r.minutes);
    const [lo, hi] = TARGET[size];
    const inBand = xs.filter((x) => x >= lo * 0.85 && x <= hi * 1.15).length;
    lines.push(`  ${size.padEnd(9)} n=${String(xs.length).padStart(3)}  p10 ${m1(pct(xs, 0.1))}  p50 ${m1(pct(xs, 0.5))}  p90 ${m1(pct(xs, 0.9))} min   target ${lo}–${hi} (±15 %: ${xs.length ? Math.round((inBand / xs.length) * 100) : 0} % in)`);
  }
  const lx = late.map((r) => r.minutes);
  lines.push(`  farms 20+: n=${lx.length}  p10 ${m1(pct(lx, 0.1))}  p50 ${m1(pct(lx, 0.5))}  p90 ${m1(pct(lx, 0.9))} min (typical farm target 12–22)`);
  // Cliffs: a farm far slower than its size class's median (over farms 20+).
  const med: Record<string, number> = {};
  for (const size of ['quick', 'standard', 'grand']) med[size] = pct(late.filter((r) => r.size === size).map((r) => r.minutes), 0.5);
  const cliffs = late.filter((r) => r.minutes > 1.6 * med[r.size]);
  lines.push(`  cliffs (> 1.6× the size median): ${cliffs.length}${cliffs.length ? ` — ${cliffs.slice(0, 5).map((r) => `#${r.ordinal} ${r.size} ${m1(r.minutes)}`).join(', ')}` : ''}`);
  const dr = world.map((r) => r.droughtS);
  lines.push(`  longest wallet drought: p50 ${m1(pct(dr, 0.5))} s, worst ${m1(Math.max(0, ...dr))} s`);
  const peak = Math.max(0, ...rows.map((r) => r.peakCoins));
  const peakWorld = Math.max(0, ...world.map((r) => r.peakCoins));
  lines.push(`  biggest bank: ${formatNumber(peak)} (World Tour ${formatNumber(peakWorld)})`);
  // Slot curve: how a Tour's eight farms pace.
  const bySlot = Array.from({ length: 8 }, (_, s) => m1(pct(world.filter((r) => r.slot === s).map((r) => r.minutes), 0.5)));
  lines.push(`  Tour slot medians (min): ${bySlot.join(' · ')}`);
  // A farm the run ended on is only a softlock if it had been going far longer than its size class takes.
  const stuck = unfinished.filter((r) => r.minutes > 4 * (pct(world.filter((w) => w.size === r.size).map((w) => w.minutes), 0.5) || 30));
  if (stuck.length) errors.push(`${label}: softlock — ${stuck.map((r) => `#${r.ordinal} ${r.key} stuck after ${m1(r.minutes)} min`).join(', ')}`);
  if (unfinished.length > stuck.length) lines.push(`  (run ended on #${unfinished.at(-1)!.ordinal} after ${m1(unfinished.at(-1)!.minutes)} min there — time budget, not a softlock)`);
  if (rows.some((r) => !Number.isFinite(r.peakCoins))) errors.push(`${label}: number overflow`);
  return { lines, errors };
}

const self = fileURLToPath(import.meta.url);
if (args.includes('--child')) child(arg('profile', 'noAds') as ProfileId);
else {
  const ids = arg('profiles', 'noAds,active,casual,idle,twoFinger,bare').split(',') as ProfileId[];
  const t0 = Date.now();
  const results = await Promise.all(
    ids.map(
      (id) =>
        new Promise<[ProfileId, FarmRow[]]>((resolve, reject) => {
          const p = spawn(process.execPath, [self, '--child', '--profile', id, '--farms', String(FARMS), '--seed', String(SEED)], { stdio: ['ignore', 'pipe', 'inherit'] });
          let out = '';
          p.stdout.on('data', (d) => (out += d));
          p.on('exit', (code) => (code === 0 ? resolve([id, JSON.parse(out) as FarmRow[]]) : reject(new Error(`${id} exited ${code}`))));
        }),
    ),
  );
  const lines = [`Endless economy — ${FARMS} farms per profile, seed ${SEED} (${Math.round((Date.now() - t0) / 1000)} s)`];
  const errors: string[] = [];
  for (const [id, rows] of results) {
    const s = summarize(id, rows);
    lines.push(...s.lines);
    errors.push(...s.errors);
  }
  lines.push(`\nerrors: ${errors.length}`, ...errors.map((e) => `  ${e}`));
  console.log(lines.join('\n'));
  const md = arg('md', '');
  if (md) writeFileSync(md, ['```', ...lines, '```', ''].join('\n'));
  const json = arg('json', '');
  if (json) writeFileSync(json, JSON.stringify(Object.fromEntries(results), null, 1));
  if (args.includes('--assert') && errors.length) process.exitCode = 1;
}
