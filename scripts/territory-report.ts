/** Prints each farm's zone map and a headless run showing when the route grows. `node scripts/territory-report.ts [farm] [minutes]` */
import { FARMS } from '../src/game/farms/index.ts';
import { Sim, newGameState } from '../src/game/sim.ts';
import type { StarterFarmId as FarmId } from '../src/game/types.ts';

const farmArg = (process.argv[2] ?? 'all') as FarmId | 'all';
const minutes = Number(process.argv[3] ?? 0);

function zoneMap(id: FarmId, claimed?: Uint8Array): string {
  const l = FARMS[id].layout;
  const rows: string[] = [];
  for (let r = 0; r < l.rows; r++) {
    let s = '';
    for (let c = 0; c < l.cols; c++) {
      const p = r * l.cols + c;
      const z = l.zone[p];
      s += z === -1 ? ' ' : z === -2 ? '#' : l.start[p] ? 'S' : claimed?.[p] ? '=' : String(z);
    }
    rows.push(s);
  }
  return rows.join('\n');
}

for (const id of Object.keys(FARMS) as FarmId[]) {
  if (farmArg !== 'all' && farmArg !== id) continue;
  const l = FARMS[id].layout;
  console.log(`\n${id}: ${l.cols}x${l.rows} plots, zone plots ${l.zonePlots.join('/')}`);
  console.log(zoneMap(id));
  if (!minutes) continue;
  const st = newGameState(7);
  st.farmId = id;
  st.unlockedFarms = [id];
  const sim = new Sim(st);
  let grew = 0;
  let firstGrow = -1;
  for (let i = 0; i < minutes * 60 * 30; i++) {
    sim.step(1 / 30, { throttleHeld: true });
    for (const e of sim.drainEvents()) {
      if (e.t === 'routeGrew') {
        grew += e.plots.length;
        if (firstGrow < 0) firstGrow = st.simTime;
      }
    }
    // Greedy: open zones when free, buy the cheapest upgrade.
    if (i % 30 === 0) {
      if (sim.check('expand').ok && sim.check('expand').cost === 0) sim.execute({ c: 'buy', id: 'expand' });
      const opts = (['add', 'merge', 'capacity', 'speed'] as const).map((u) => ({ u, c: sim.check(u) })).filter((o) => o.c.ok).sort((a, b) => a.c.cost - b.c.cost);
      if (opts[0]) sim.execute({ c: 'buy', id: opts[0].u });
    }
    if (i % (60 * 30) === 0 && i > 0)
      console.log(`${(st.simTime / 60).toFixed(0)}m coins=${st.coins.toFixed(0)} zone=${st.progress.zone} plots+${grew} cleared=${(sim.cleared * 100).toFixed(0)}% L=${sim.path.length.toFixed(0)} segs=${st.progress.segments.map((s) => s.level).join('')} cap=${st.progress.capacityLevel} spd=${st.progress.speedLevel}`);
  }
  console.log(`first growth at ${firstGrow.toFixed(1)}s; ${grew} plots claimed`);
  console.log(zoneMap(id, sim.terr.claimed));
}
