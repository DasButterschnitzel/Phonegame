import type { GameState, PathTable, CropField, SimEvent } from './types.ts';
import { BODY, FIELD, MISC, capacityOf, crop as cropCfg } from './config.ts';
import { sampleAt, type PathSample } from './path.ts';
import { markDirty } from './field.ts';
import { nextRandom } from './rng.ts';
import { bodyOffset, bodyPower } from './caterpillar.ts';
import { wrap } from '../shared/math.ts';

const tmp: PathSample = { x: 0, z: 0, tx: 0, tz: 0 };
const R2 = BODY.REACH * BODY.REACH;

export interface HarvestCtx {
  st: GameState;
  path: PathTable;
  field: CropField;
  valueMult: number;
  events: SimEvent[];
}

/** Adds one chunk to the basket; returns false when there is no room (chunk wasted). */
function addChunk(st: GameState, tier: number, value: number, golden: boolean, limit: number): boolean {
  if (st.basket.mass + 1 > limit) return false;
  st.basket.mass += 1;
  st.basket.value += value;
  st.basket.massByTier[golden ? 4 : tier] += 1;
  return true;
}

export function chunkValue(ctx: HarvestCtx, i: number): number {
  const v = cropCfg.chunkValue(ctx.field.tier[i]) * ctx.valueMult;
  return ctx.field.golden[i] ? v * MISC.GOLDEN_MULT : v;
}

/** Damage crop i by `dmg`; drops chunks into the basket as HP thresholds are crossed; kills at 0. */
export function damageCrop(ctx: HarvestCtx, i: number, dmg: number, body: number, limit: number): void {
  const { field, st, events } = ctx;
  const hpc = field.maxHp[i] / FIELD.CHUNKS;
  const before = Math.ceil(field.hp[i] / hpc - 1e-6);
  field.hp[i] -= dmg;
  const after = field.hp[i] <= 1e-6 ? 0 : Math.ceil(field.hp[i] / hpc - 1e-6);
  markDirty(field, i);
  const golden = field.golden[i] === 1;
  for (let c = before; c > after; c--) {
    const value = chunkValue(ctx, i);
    const ok = addChunk(st, field.tier[i], value, golden, limit);
    events.push({ t: 'chunk', crop: i, body, value, golden, wasted: !ok, tier: field.tier[i] });
    if (ok) st.stats.harvested++;
    else if (st.simTime - st.lastFullAt >= MISC.FULL_EVENT_COOLDOWN_S) {
      st.lastFullAt = st.simTime;
      events.push({ t: 'basketFull' });
    }
  }
  if (after === 0) kill(ctx, i, body);
}

function kill(ctx: HarvestCtx, i: number, body: number): void {
  const { field, st, events } = ctx;
  const golden = field.golden[i] === 1;
  field.hp[i] = 0;
  field.regrowAt[i] = st.simTime + cropCfg.regrowSec(field.tier[i]) * (0.9 + 0.2 * nextRandom(st));
  field.dead[field.deadCount++] = i;
  if (golden) {
    st.stats.goldenHarvested++;
    if (nextRandom(st) < MISC.TORNADO_DROP_P) {
      st.tornadoes++;
      events.push({ t: 'tornadoGranted', n: 1 });
    }
  }
  field.golden[i] = 0;
  events.push({ t: 'kill', crop: i, body, golden });
}

/** One fixed step of chomping: each body damages crops in reach by power × distance travelled. */
export function harvestStep(ctx: HarvestCtx, ds: number): void {
  if (ds <= 0) return;
  const { st, path, field } = ctx;
  const bins = field.bins;
  const cap = capacityOf(st);
  const nBodies = st.progress.segments.length + 1;
  for (let b = 0; b < nBodies; b++) {
    const s = wrap(st.headS - bodyOffset(b), path.length);
    sampleAt(path, s, tmp);
    const bin = Math.min(bins.n - 1, Math.floor(s / bins.binLen));
    const dmg = bodyPower(st, b) * ds;
    for (let k = bins.start[bin]; k < bins.start[bin + 1]; k++) {
      const i = bins.items[k];
      if (field.regrowAt[i] !== 0 || field.paved[i]) continue;
      const dx = field.x[i] - tmp.x;
      const dz = field.z[i] - tmp.z;
      if (dx * dx + dz * dz > R2) continue;
      damageCrop(ctx, i, dmg, b, cap);
    }
  }
}

/** Regrowth scan (call every ~0.5 s of sim time). */
export function regrowStep(ctx: HarvestCtx): void {
  const { field, st, events } = ctx;
  for (let k = field.deadCount - 1; k >= 0; k--) {
    const i = field.dead[k];
    if (st.simTime < field.regrowAt[i]) continue;
    field.regrowAt[i] = 0;
    field.hp[i] = field.maxHp[i];
    field.golden[i] = nextRandom(st) < MISC.GOLDEN_P ? 1 : 0;
    field.dead[k] = field.dead[--field.deadCount];
    markDirty(field, i);
    events.push({ t: 'regrow', crop: i, golden: field.golden[i] === 1 });
  }
}

/** Tornado: instantly harvests every living crop within TORNADO_R of the head; may overflow capacity. */
export function tornado(ctx: HarvestCtx, hx: number, hz: number): void {
  const { field, st, events } = ctx;
  const r2 = MISC.TORNADO_R ** 2;
  const limit = capacityOf(st) * MISC.TORNADO_OVERFLOW;
  const crops: number[] = [];
  const v0 = st.basket.value;
  for (let i = 0; i < field.count; i++) {
    if (field.regrowAt[i] !== 0 || field.paved[i]) continue;
    if ((field.x[i] - hx) ** 2 + (field.z[i] - hz) ** 2 > r2) continue;
    crops.push(i);
  }
  // Nearest first so overflow keeps the closest crops.
  crops.sort((a, b) => (field.x[a] - hx) ** 2 + (field.z[a] - hz) ** 2 - ((field.x[b] - hx) ** 2 + (field.z[b] - hz) ** 2));
  const taken: number[] = [];
  const sub: SimEvent[] = [];
  const subCtx: HarvestCtx = { ...ctx, events: sub };
  for (const i of crops) {
    if (st.basket.mass + 1 > limit) break;
    damageCrop(subCtx, i, field.hp[i] + 1, 0, limit);
    taken.push(i);
  }
  // Keep kill/tornado-drop events but fold per-chunk events into one tornado event.
  for (const e of sub) if (e.t === 'kill' || e.t === 'tornadoGranted') events.push(e);
  st.stats.tornadoesUsed++;
  events.push({ t: 'tornado', x: hx, z: hz, crops: taken, value: st.basket.value - v0 });
}
