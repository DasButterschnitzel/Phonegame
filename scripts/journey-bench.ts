/**
 * Endless journey bench (not part of `npm test`):
 *   node scripts/journey-bench.ts [--farms 500]
 *
 * Walks one journey through `--farms` farms with debug finishing (every farm cleared, FINISH, travel to the next
 * destination) and checks the structural promises of the World Tour: a next destination always exists and can be
 * travelled to (no route softlock), keys never repeat, every scheduled biome turns up, and the save stays bounded.
 * At 10 / 50 / 100 / 500 farms it reports the save size and how long serialize + parse take.
 */
import { performance } from 'node:perf_hooks';
import { Sim } from '../src/game/sim.ts';
import type { BiomeId, FarmKey } from '../src/game/types.ts';
import { STARTER_FARMS } from '../src/game/types.ts';
import { readyBiomes } from '../src/game/world/biomes.ts';
import { planTour } from '../src/game/world/plan.ts';
import { serialize } from '../src/game/save/serialize.ts';
import { parseSave } from '../src/game/save/migrations.ts';
import { newMeta } from '../src/game/save/schema.ts';

const args = process.argv.slice(2);
const at = args.indexOf('--farms');
const FARMS = at >= 0 ? Number(args[at + 1]) : 500;
const CHECKPOINTS = [10, 50, 100, 250, 500, 1000].filter((n) => n <= FARMS);

const sim = new Sim();
const keys = new Set<FarmKey>();
const seen = new Set<BiomeId>();
const errors: string[] = [];
const rows: string[] = [];
let genMs = 0;
let finishes = 0;
const t0 = performance.now();

const timed = <T>(f: () => T): [T, number] => {
  const a = performance.now();
  const r = f();
  return [r, performance.now() - a];
};

while (finishes < FARMS) {
  const here = sim.state.farmId;
  if (keys.has(here)) errors.push(`duplicate key ${here}`);
  keys.add(here);
  seen.add(sim.farm.biome);
  sim.execute({ c: 'grantCoins', amount: 1e15, reason: 'debug' });
  while (sim.state.progress.zone < 3) sim.execute({ c: 'buy', id: 'expand' });
  sim.execute({ c: 'clearAll' });
  sim.execute({ c: 'buy', id: 'finish' });
  const ev = sim.drainEvents().find((e) => e.t === 'farmFinished');
  if (!ev || ev.t !== 'farmFinished') {
    errors.push(`farm ${here} did not finish`);
    break;
  }
  finishes++;
  if (CHECKPOINTS.includes(finishes)) {
    const [json, sMs] = timed(() => JSON.stringify(serialize(sim, newMeta(1), {}, 2)));
    const [res, pMs] = timed(() => parseSave(json, 3));
    if (!res.ok) errors.push(`save after ${finishes} farms does not load: ${res.reason}`);
    rows.push(`${String(finishes).padStart(5)}  #${String(sim.farm.ordinal).padEnd(5)} ${(json.length / 1024).toFixed(1).padStart(7)} KB  ${sMs.toFixed(2).padStart(7)} ms  ${pMs.toFixed(2).padStart(7)} ms   recent ${sim.state.journey.recent.length}, passive ${Object.keys(sim.state.economy.passive).length}, farmsProgress ${Object.keys(sim.state.farmsProgress).length}`);
  }
  const next: FarmKey | undefined = ev.next ?? STARTER_FARMS.find((f) => sim.state.unlockedFarms.includes(f) && !sim.state.completedFarms.includes(f));
  if (!next) {
    errors.push(`no next destination after ${here}`);
    break;
  }
  if (!sim.canTravel(next)) {
    errors.push(`cannot travel ${here} → ${next}`);
    break;
  }
  const [, ms] = timed(() => sim.execute({ c: 'travel', farm: next }));
  sim.drainEvents();
  genMs += ms;
  if (sim.state.farmId !== next) {
    errors.push(`travel to ${next} landed on ${sim.state.farmId}`);
    break;
  }
}

const missing = readyBiomes().map((b) => b.id).filter((b) => !seen.has(b));
if (missing.length) errors.push(`biomes never scheduled: ${missing.join(', ')}`);
const [, planMs] = timed(() => planTour(0x5eed, 1 + Math.floor(FARMS / 8) + 50));

console.log(`Journey bench — ${finishes} farms finished in ${((performance.now() - t0) / 1000).toFixed(1)} s, now on #${sim.farm.ordinal} (Tour ${sim.farm.tour}, Core Rank ${sim.state.journey.tours})`);
console.log(`distinct keys ${keys.size}, biomes seen ${seen.size}/${readyBiomes().length}, travel + generate ${(genMs / finishes).toFixed(2)} ms/farm, planning 50 Tours ahead from cold ${planMs.toFixed(1)} ms\n`);
console.log('farms  live     save        serialize   parse');
for (const r of rows) console.log(r);
console.log(`\nerrors: ${errors.length}`);
for (const e of errors.slice(0, 20)) console.log(`  ${e}`);
if (errors.length) process.exitCode = 1;
