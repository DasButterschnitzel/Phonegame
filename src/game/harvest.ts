import type { GameState, PathTable, CropField, SimEvent } from './types.ts';
import { BODY, FIELD, MISC, capacityOf, crop as cropCfg } from './config.ts';
import { sampleAt, type PathSample } from './path.ts';
import { markDirty } from './field.ts';
import { nextRandom } from './rng.ts';
import { bodyOffset, bodyPower } from './caterpillar.ts';
import { updateReady, type Territory } from './territory.ts';
import { wrap } from '../shared/math.ts';

const tmp: PathSample = { x: 0, z: 0, tx: 0, tz: 0 };
const R2 = BODY.REACH * BODY.REACH;

export interface HarvestCtx {
  st: GameState;
  path: PathTable;
  field: CropField;
  terr: Territory;
  valueMult: number;
  events: SimEvent[];
  /** Bite power multiplier (FINAL HARVEST). */
  power?: number;
}

export function chunkValue(ctx: HarvestCtx, i: number): number {
  const v = cropCfg.chunkValue(ctx.field.tier[i]) * ctx.valueMult;
  return ctx.field.golden[i] ? v * MISC.GOLDEN_MULT : v;
}

/**
 * Damage crop i by `dmg`. Each time its HP crosses a chunk threshold a chunk drops into the basket; at 0 it is
 * destroyed for good. A full basket can't take a bite: the crop holds at its next threshold until there is room.
 */
export function damageCrop(ctx: HarvestCtx, i: number, dmg: number, body: number, limit: number): void {
  const { field, st, events } = ctx;
  const hpc = field.maxHp[i] / FIELD.CHUNKS;
  const before = Math.ceil(field.hp[i] / hpc - 1e-6);
  let hp = field.hp[i] - dmg;
  let after = hp <= 1e-6 ? 0 : Math.ceil(hp / hpc - 1e-6);
  const room = Math.max(0, Math.floor(limit - st.basket.mass + 1e-9));
  if (before - after > room) {
    after = before - room;
    hp = Math.max(hp, (after - 1) * hpc + hpc * 0.02);
    if (st.simTime - st.lastFullAt >= MISC.FULL_EVENT_COOLDOWN_S) {
      st.lastFullAt = st.simTime;
      events.push({ t: 'basketFull' });
    }
  }
  if (hp === field.hp[i]) return;
  field.hp[i] = hp;
  markDirty(field, i);
  const golden = field.golden[i] === 1;
  const tier = field.tier[i];
  for (let c = before; c > after; c--) {
    const value = chunkValue(ctx, i);
    st.basket.mass += 1;
    st.basket.value += value;
    st.basket.massByTier[golden ? 4 : tier] += 1;
    st.stats.harvested++;
    events.push({ t: 'chunk', crop: i, body, value, golden, tier });
  }
  if (after === 0) kill(ctx, i, body, false);
}

/** Destroys crop i for good and updates its plot (which may now be ready to join the territory). */
export function kill(ctx: HarvestCtx, i: number, body: number, swept: boolean): void {
  const { field, st, events, terr } = ctx;
  if (field.dead[i]) return;
  const golden = field.golden[i] === 1;
  field.hp[i] = 0;
  field.dead[i] = 1;
  field.deadCount++;
  markDirty(field, i);
  const p = field.plot[i];
  terr.deadIn[p]++;
  terr.zoneDead[field.tier[i]]++;
  if (field.reach[i]) terr.blockers[p]--;
  if (golden && !swept) {
    st.stats.goldenHarvested++;
    if (nextRandom(st) < MISC.TORNADO_DROP_P) {
      st.tornadoes++;
      events.push({ t: 'tornadoGranted', n: 1 });
    }
  }
  events.push({ t: 'kill', crop: i, body, golden, swept });
  if (updateReady(terr, p, st.progress.zone, st.simTime)) events.push({ t: 'plotReady', plot: p });
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
    const dmg = bodyPower(st, b) * ds * (ctx.power ?? 1);
    for (let k = bins.start[bin]; k < bins.start[bin + 1]; k++) {
      const i = bins.items[k];
      if (field.dead[i]) continue;
      const dx = field.x[i] - tmp.x;
      const dz = field.z[i] - tmp.z;
      if (dx * dx + dz * dz > R2) continue;
      damageCrop(ctx, i, dmg, b, cap);
    }
  }
}

/**
 * Tornado: destroys every living crop of an open zone within TORNADO_R of (hx, hz). Chunks fill the basket (up to
 * TORNADO_OVERFLOW × capacity); whatever doesn't fit is blown straight to the barn and paid at once.
 */
export function tornado(ctx: HarvestCtx, hx: number, hz: number, fromX = hx, fromZ = hz): number {
  const { field, st, events } = ctx;
  const r2 = MISC.TORNADO_R ** 2;
  const limit = capacityOf(st) * MISC.TORNADO_OVERFLOW;
  const crops: number[] = [];
  const v0 = st.basket.value;
  for (let i = 0; i < field.count; i++) {
    if (field.dead[i] || field.tier[i] > st.progress.zone) continue;
    if ((field.x[i] - hx) ** 2 + (field.z[i] - hz) ** 2 > r2) continue;
    crops.push(i);
  }
  // Nearest first so the basket keeps the closest crops.
  crops.sort((a, b) => (field.x[a] - hx) ** 2 + (field.z[a] - hz) ** 2 - ((field.x[b] - hx) ** 2 + (field.z[b] - hz) ** 2));
  const sub: SimEvent[] = [];
  const subCtx: HarvestCtx = { ...ctx, events: sub };
  let direct = 0;
  for (const i of crops) {
    damageCrop(subCtx, i, field.hp[i] + 1, 0, limit);
    if (field.dead[i]) continue;
    // Basket is full: the rest of this crop goes straight to the barn.
    const left = Math.ceil(field.hp[i] / (field.maxHp[i] / FIELD.CHUNKS) - 1e-6);
    direct += left * chunkValue(ctx, i);
    kill(subCtx, i, 0, false);
  }
  // Keep kill/plot/tornado-drop events but fold per-chunk events into one tornado event.
  for (const e of sub) if (e.t === 'kill' || e.t === 'tornadoGranted' || e.t === 'plotReady') events.push(e);
  st.stats.tornadoesUsed++;
  events.push({ t: 'tornado', x: hx, z: hz, fromX, fromZ, crops, value: st.basket.value - v0 + direct });
  return direct;
}
