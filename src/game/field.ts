import type { CropField, PathTable } from './types.ts';
import type { FarmDef } from './farms/index.ts';
import { BODY, FIELD, crop as cropCfg } from './config.ts';
import { buildLoop } from './path.ts';
import { traceOutline, type Territory } from './territory.ts';
import { cellKey, hashFloat } from '../shared/hash.ts';

/** The route: the territory's outline with filleted corners, passing the depot. */
export function buildRoute(farm: FarmDef, terr: Territory): PathTable {
  return buildLoop(traceOutline(terr), FIELD.CORNER_R, 0.25, [farm.barn.x, farm.barn.z]);
}

/**
 * Plants PLOT_CROPS² crops in every plot outside the start territory. Crops are stored plot by plot, so a plot's crops
 * are one contiguous index range. A crop's tier is its plot's zone.
 */
export function buildField(farm: FarmDef): CropField {
  const l = farm.layout;
  const eco = farm.eco;
  const K = FIELD.PLOT_CROPS;
  const inset = (l.plot - (K - 1) * FIELD.CROP_SPACING) / 2;
  const xs: number[] = [];
  const zs: number[] = [];
  const keys: number[] = [];
  const tiers: number[] = [];
  const plots: number[] = [];
  const seeds: number[] = [];
  const golden: number[] = [];
  const nPlots = l.cols * l.rows;
  const plotStart = new Uint32Array(nPlots + 1);
  for (let p = 0; p < nPlots; p++) {
    plotStart[p] = xs.length;
    const zone = l.zone[p];
    if (zone < 0 || l.start[p]) continue;
    const c = p % l.cols;
    const r = (p - c) / l.cols;
    for (let j = 0; j < K; j++)
      for (let i = 0; i < K; i++) {
        const ix = c * K + i;
        const iz = r * K + j;
        const jx = (hashFloat(ix, iz, farm.seed) - 0.5) * 2 * FIELD.JITTER;
        const jz = (hashFloat(iz, ix, farm.seed + 7) - 0.5) * 2 * FIELD.JITTER;
        xs.push(l.x0 + c * l.plot + inset + i * FIELD.CROP_SPACING + jx);
        zs.push(l.z0 + r * l.plot + inset + j * FIELD.CROP_SPACING + jz);
        keys.push(cellKey(ix, iz));
        tiers.push(zone);
        plots.push(p);
        seeds.push(hashFloat(ix * 3 + 1, iz * 5 + 2, farm.seed + 13));
        golden.push(hashFloat(ix, iz, farm.seed + 29) < farm.goldenP ? 1 : 0);
      }
  }
  plotStart[nPlots] = xs.length;
  const n = xs.length;
  const field: CropField = {
    count: n,
    key: Int32Array.from(keys),
    x: Float32Array.from(xs),
    z: Float32Array.from(zs),
    tier: Uint8Array.from(tiers),
    plot: Int32Array.from(plots),
    seed: Float32Array.from(seeds),
    hp: new Float32Array(n),
    maxHp: new Float32Array(n),
    golden: Uint8Array.from(golden),
    dead: new Uint8Array(n),
    deadCount: 0,
    reach: new Uint8Array(n),
    plotStart,
    dirty: new Uint32Array(n),
    dirtyCount: 0,
    dirtyMark: new Uint8Array(n),
    bins: { binLen: FIELD.BIN_LEN, n: 0, start: new Uint32Array(1), items: new Uint32Array(0) },
  };
  for (let i = 0; i < n; i++) {
    field.maxHp[i] = FIELD.CHUNKS * cropCfg.hpPerChunk(field.tier[i]) * eco.hpMult;
    field.hp[i] = field.maxHp[i];
  }
  return field;
}

const G = 2;
/** Coarse spatial grid of crops (built per call; fields are small and routes change rarely). */
function cropGrid(field: CropField, keep: (i: number) => boolean): Map<number, number[]> {
  const grid = new Map<number, number[]>();
  for (let i = 0; i < field.count; i++) {
    if (!keep(i)) continue;
    const k = cellKey(Math.floor(field.x[i] / G), Math.floor(field.z[i] / G));
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(i);
  }
  return grid;
}

function forNear(grid: Map<number, number[]>, px: number, pz: number, r: number, fn: (i: number) => void): void {
  const gx0 = Math.floor((px - r) / G);
  const gx1 = Math.floor((px + r) / G);
  const gz0 = Math.floor((pz - r) / G);
  const gz1 = Math.floor((pz + r) / G);
  for (let gz = gz0; gz <= gz1; gz++)
    for (let gx = gx0; gx <= gx1; gx++) {
      const a = grid.get(cellKey(gx, gz));
      if (a) for (const i of a) fn(i);
    }
}

/** Per arc-bin candidate lists: every alive crop of an open zone within reach of any point in the bin. */
export function buildBins(field: CropField, path: PathTable, openZone: number): void {
  const binLen = field.bins.binLen;
  const nb = Math.max(1, Math.ceil(path.length / binLen));
  const r = BODY.REACH + binLen / 2 + 0.05;
  const r2 = r * r;
  const grid = cropGrid(field, (i) => !field.dead[i] && field.tier[i] <= openZone);
  const lists: number[][] = [];
  let total = 0;
  for (let b = 0; b < nb; b++) {
    const s = (b + 0.5) * binLen;
    const u = (s / path.ds) % path.n;
    const i0 = Math.floor(u);
    const i1 = (i0 + 1) % path.n;
    const f = u - i0;
    const px = path.x[i0] + (path.x[i1] - path.x[i0]) * f;
    const pz = path.z[i0] + (path.z[i1] - path.z[i0]) * f;
    const list: number[] = [];
    forNear(grid, px, pz, r, (i) => {
      if ((field.x[i] - px) ** 2 + (field.z[i] - pz) ** 2 <= r2) list.push(i);
    });
    list.sort((a, b2) => a - b2);
    lists.push(list);
    total += list.length;
  }
  const start = new Uint32Array(nb + 1);
  const items = new Uint32Array(total);
  let o = 0;
  for (let b = 0; b < nb; b++) {
    start[b] = o;
    for (const i of lists[b]) items[o++] = i;
  }
  start[nb] = o;
  field.bins = { binLen, n: nb, start, items };
}

/** Marks every crop within CLAIM_REACH of the route. */
export function computeReach(field: CropField, path: PathTable): void {
  field.reach.fill(0);
  const grid = cropGrid(field, () => true);
  const r = FIELD.CLAIM_REACH;
  const r2 = r * r;
  for (let s = 0; s < path.n; s++) {
    const px = path.x[s];
    const pz = path.z[s];
    forNear(grid, px, pz, r, (i) => {
      if (!field.reach[i] && (field.x[i] - px) ** 2 + (field.z[i] - pz) ** 2 <= r2) field.reach[i] = 1;
    });
  }
}

export function markDirty(field: CropField, i: number): void {
  if (field.dirtyMark[i]) return;
  field.dirtyMark[i] = 1;
  field.dirty[field.dirtyCount++] = i;
}

/** Hands the renderer the list of changed crops and resets it. */
export function consumeDirty(field: CropField, fn: (i: number) => void): void {
  for (let k = 0; k < field.dirtyCount; k++) {
    const i = field.dirty[k];
    field.dirtyMark[i] = 0;
    fn(i);
  }
  field.dirtyCount = 0;
}

export const isAlive = (field: CropField, i: number): boolean => field.dead[i] === 0;

/** Damage stage for visuals and feedback: 4 = untouched, 3/2/1 = bitten down to 75/50/25 %, 0 = destroyed. */
export function damageStage(field: CropField, i: number): number {
  if (field.dead[i]) return 0;
  const f = field.hp[i] / field.maxHp[i];
  return f >= 0.999 ? 4 : f > 0.5 ? 3 : f > 0.25 ? 2 : 1;
}
