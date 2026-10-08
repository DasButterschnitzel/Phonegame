/**
 * World Tour generator stress test (not part of `npm test`):
 *   node scripts/worldgen.ts [--seeds 1000] [--playout 200] [--biome <id>|all] [--json out.json]
 *
 * For every scheduled biome, `--seeds` farms are planned and generated through the real scheduler (sizes,
 * modifiers and all), then `--playout` of them are played out with the real simulation: the frontier is cleared
 * plot by plot while the crawler drives, until the farm is done or stuck. Reports fallbacks (no archetype passed, a
 * plain bowl was used), attempts, plots, crops, obstacle share, route length, play-out failures (< 90 % of the field
 * claimable or cleared) and an estimated active play time per size class.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { Sim, newFarmProgress, newGameState } from '../src/game/sim.ts';
import { SIM } from '../src/game/config.ts';
import type { BiomeId, FarmBlueprint, SizeClass } from '../src/game/types.ts';
import { readyBiomes } from '../src/game/world/biomes.ts';
import { checkMap, generateMap, pickCrops } from '../src/game/world/generate.ts';
import { GEN_VERSION, planFarm, type FarmPlan } from '../src/game/world/plan.ts';
import { FARMS } from '../src/game/farms/index.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const SEEDS = Number(arg('seeds', '1000'));
const PLAYOUT = Number(arg('playout', '200'));
const ONLY = arg('biome', 'all');
const JSON_OUT = arg('json', '');

/** Plots of a map that can be claimed (everything but voids and obstacles). */
const plotCount = (map: readonly string[]) => map.join('').replace(/[.#~]/g, '').length;

export interface PlayOut {
  cleared: number;
  claimed: number;
  pathLength: number;
  ms: number;
  ok: boolean;
}

/** Clears the farm with the real simulation (frontier plots, the crawler driving) and reports how far it got. */
export function playOut(bp: FarmBlueprint): PlayOut {
  const t0 = performance.now();
  const st = newGameState(1);
  st.journey.seed = 1;
  st.journey.tours = bp.tour;
  st.journey.ordinal = bp.ordinal;
  st.farmId = bp.key;
  st.progress = { ...newFarmProgress(1), bp };
  const sim = new Sim(st);
  sim.state.progress.segments = Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, level: 6 }));
  sim.execute({ c: 'grantCoins', amount: 1e15, reason: 'debug' });
  while (sim.state.progress.zone < 3) sim.execute({ c: 'buy', id: 'expand' });
  const l = sim.farm.layout;
  let total = 0;
  for (let p = 0; p < l.zone.length; p++) if (l.zone[p] >= 0) total++;
  for (let k = 0; k < 500 && sim.cleared < 0.995; k++) {
    sim.execute({ c: 'clearFrontier', n: 3 });
    for (let s = 0; s < 36; s++) sim.step(SIM.DT, { throttleHeld: true });
    sim.drainEvents();
  }
  // Let the last claims land.
  for (let s = 0; s < 30 * 8; s++) sim.step(SIM.DT, { throttleHeld: true });
  sim.drainEvents();
  const claimed = sim.terr.claimedCount / total;
  return { cleared: sim.cleared, claimed, pathLength: sim.path.length, ms: performance.now() - t0, ok: sim.cleared >= 0.9 && claimed >= 0.9 };
}

const pct = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');

// Calibration: the starter farms' plots vs their measured no-ads times (goal 04 balance run).
const STARTER_MIN: Record<string, number> = { meadow: 18.2, pumpkin: 20.1, sunflower: 19.2, snowyberry: 31.2, desert: 22.4 };
let calib = 0;
for (const [id, m] of Object.entries(STARTER_MIN)) calib += m / plotCount(FARMS[id as keyof typeof FARMS].map);
calib /= Object.keys(STARTER_MIN).length;

interface Row {
  biome: BiomeId;
  farms: number;
  fallbacks: number;
  attempts: number[];
  plots: Record<SizeClass, number[]>;
  crops: number[];
  obstacles: number[];
  archetypes: Record<string, number>;
  playouts: PlayOut[];
  fails: string[];
}

const rows: Row[] = [];
const t0 = performance.now();
for (const b of readyBiomes()) {
  if (ONLY !== 'all' && ONLY !== b.id) continue;
  const row: Row = { biome: b.id, farms: 0, fallbacks: 0, attempts: [], plots: { quick: [], standard: [], grand: [] }, crops: [], obstacles: [], archetypes: {}, playouts: [], fails: [] };
  // Plans from many journeys, keeping those of this biome (sizes and slots as the scheduler deals them).
  const plans: FarmPlan[] = [];
  for (let seed = 1; plans.length < SEEDS; seed++) for (let o = 6; o < 6 + 24 && plans.length < SEEDS; o++) {
    const p = planFarm(seed * 7919, o);
    if (p.biome === b.id) plans.push(p);
  }
  for (const p of plans) {
    const gen = generateMap(p.biome, p.size, p.seed);
    row.farms++;
    row.attempts.push(gen.attempts);
    if (gen.attempts > 24) row.fallbacks++;
    row.archetypes[gen.archetype] = (row.archetypes[gen.archetype] ?? 0) + 1;
    const chk = checkMap(gen.map, p.size);
    if (!chk.ok) row.fails.push(`${p.key}: ${chk.reason}`);
    row.plots[p.size].push(chk.plots);
    row.crops.push(chk.plots * 9);
    row.obstacles.push(chk.obstacles / (chk.plots + chk.obstacles));
    if (row.playouts.length < PLAYOUT) {
      const bp: FarmBlueprint = { gen: GEN_VERSION, key: p.key, ordinal: p.ordinal, tour: p.tour, slot: p.slot, biome: p.biome, seed: p.seed, archetype: gen.archetype, size: p.size, modifier: p.modifier, showcase: p.showcase, name: p.name, crops: pickCrops(p.biome, p.seed), map: gen.map, variant: p.variant };
      const po = playOut(bp);
      row.playouts.push(po);
      if (!po.ok) row.fails.push(`${p.key} play-out: cleared ${(po.cleared * 100).toFixed(0)}%, claimed ${(po.claimed * 100).toFixed(0)}%\n${gen.map.join('\n')}`);
    }
  }
  rows.push(row);
}

const lines: string[] = [];
lines.push(`World Tour generator stress test — ${SEEDS} farms per biome, ${PLAYOUT} played out (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
lines.push(`estimated active minutes ≈ ${calib.toFixed(3)} × plots (calibrated on the starter farms)\n`);
lines.push('biome        farms  fallback  attempts p50/p95/max  plots quick | standard | grand (p50, min–max)        obstacles p50  route p50  play-out fail  ms/play-out');
for (const r of rows) {
  const ps = (s: SizeClass) => (r.plots[s].length ? `${pct(r.plots[s], 0.5)} (${Math.min(...r.plots[s])}–${Math.max(...r.plots[s])})` : '—');
  const fails = r.playouts.filter((p) => !p.ok).length;
  lines.push(
    `${r.biome.padEnd(12)} ${String(r.farms).padStart(5)}  ${String(r.fallbacks).padStart(8)}  ${`${pct(r.attempts, 0.5)}/${pct(r.attempts, 0.95)}/${Math.max(...r.attempts)}`.padStart(20)}  ${ps('quick').padEnd(13)}| ${ps('standard').padEnd(14)}| ${ps('grand').padEnd(14)}  ${(pct(r.obstacles, 0.5) * 100).toFixed(0).padStart(11)}%  ${f1(pct(r.playouts.map((p) => p.pathLength), 0.5)).padStart(9)}  ${`${fails}/${r.playouts.length}`.padStart(13)}  ${f1(pct(r.playouts.map((p) => p.ms), 0.5)).padStart(11)}`,
  );
}
lines.push('\nestimated active minutes by size (p10 / p50 / p90):');
for (const s of ['quick', 'standard', 'grand'] as SizeClass[]) {
  const all = rows.flatMap((r) => r.plots[s]).map((n) => n * calib);
  lines.push(`  ${s.padEnd(9)} ${f1(pct(all, 0.1))} / ${f1(pct(all, 0.5))} / ${f1(pct(all, 0.9))}`);
}
const arch: Record<string, number> = {};
for (const r of rows) for (const [a, n] of Object.entries(r.archetypes)) arch[a] = (arch[a] ?? 0) + n;
lines.push(`\narchetypes used: ${Object.entries(arch).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(', ')}`);
const failures = rows.flatMap((r) => r.fails);
lines.push(`\nfailures: ${failures.length}`);
for (const f of failures.slice(0, 12)) lines.push(f);
console.log(lines.join('\n'));
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rows.map((r) => ({ ...r, playouts: r.playouts.length, playoutFails: r.playouts.filter((p) => !p.ok).length })), null, 1));
if (failures.length) process.exitCode = 1;
