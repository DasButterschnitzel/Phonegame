import type { CropField, PathTable } from './types.ts';
import type { FarmDef } from './farms/index.ts';
import { BODY, FIELD, crop as cropCfg, farmEco } from './config.ts';
import { buildLoop } from './path.ts';
import { cellKey, hashFloat } from '../shared/hash.ts';

const pathCache = new Map<string, PathTable[]>();

/** The four stage loops of a farm (cached; paths are immutable). */
export function farmPaths(farm: FarmDef): PathTable[] {
  let p = pathCache.get(farm.id);
  if (!p) {
    p = farm.stages.map((st) => buildLoop(st.corners, FIELD.CORNER_R, 0.25, [farm.barn.x, farm.barn.z]));
    pathCache.set(farm.id, p);
  }
  return p;
}

/** Squared distance from (x, z) to the nearest sample of `p` (brute force; build time only). */
function dist2ToPath(p: PathTable, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < p.n; i++) {
    const d = (p.x[i] - x) ** 2 + (p.z[i] - z) ** 2;
    if (d < best) best = d;
  }
  return best;
}

export const BARN_CLEAR_R = 3.3;

/**
 * Generates every crop cell inside the farm bounds. A crop's tier is the index of the stage whose loop
 * passes closest to it, so each EXPAND reaches a band of new, more valuable crops.
 */
export function buildField(farm: FarmDef, stage: number): CropField {
  const paths = farmPaths(farm);
  const eco = farmEco(farm.index);
  const C = FIELD.CELL;
  const xs: number[] = [];
  const zs: number[] = [];
  const keys: number[] = [];
  const tiers: number[] = [];
  const seeds: number[] = [];
  const paved: number[][] = paths.map(() => []);
  const { x0, z0, x1, z1 } = farm.bounds;
  const pavedR2 = FIELD.PAVED * FIELD.PAVED;
  for (let iz = Math.ceil(z0 / C); iz <= Math.floor(z1 / C); iz++) {
    for (let ix = Math.ceil(x0 / C); ix <= Math.floor(x1 / C); ix++) {
      const jx = (hashFloat(ix, iz, farm.seed) - 0.5) * 2 * FIELD.JITTER;
      const jz = (hashFloat(iz, ix, farm.seed + 7) - 0.5) * 2 * FIELD.JITTER;
      const x = ix * C + jx;
      const z = iz * C + jz;
      if ((x - farm.barn.bx) ** 2 + (z - farm.barn.bz) ** 2 < BARN_CLEAR_R ** 2) continue;
      let bestD = Infinity;
      let tier = 0;
      const pv: number[] = [];
      for (let k = 0; k < paths.length; k++) {
        const d2 = dist2ToPath(paths[k], x, z);
        pv.push(d2 < pavedR2 ? 1 : 0);
        // Ties (shared stretches) go to the earliest stage.
        if (d2 < bestD - 0.01) {
          bestD = d2;
          tier = k;
        }
      }
      // Cells paved at every stage would never show — skip them entirely.
      if (pv.every((v) => v === 1)) continue;
      xs.push(x);
      zs.push(z);
      keys.push(cellKey(ix, iz));
      tiers.push(tier);
      seeds.push(hashFloat(ix * 3 + 1, iz * 5 + 2, farm.seed + 13));
      for (let k = 0; k < paths.length; k++) paved[k].push(pv[k]);
    }
  }
  const n = xs.length;
  const field: CropField = {
    count: n,
    key: Int32Array.from(keys),
    x: Float32Array.from(xs),
    z: Float32Array.from(zs),
    tier: Uint8Array.from(tiers),
    seed: Float32Array.from(seeds),
    hp: new Float32Array(n),
    maxHp: new Float32Array(n),
    regrowAt: new Float64Array(n),
    golden: new Uint8Array(n),
    paved: new Uint8Array(n),
    pavedAt: paved.map((a) => Uint8Array.from(a)),
    dead: new Uint32Array(n),
    deadCount: 0,
    dirty: new Uint32Array(n),
    dirtyCount: 0,
    dirtyMark: new Uint8Array(n),
    bins: { binLen: FIELD.BIN_LEN, n: 0, start: new Uint32Array(1), items: new Uint32Array(0) },
  };
  for (let i = 0; i < n; i++) {
    field.maxHp[i] = FIELD.CHUNKS * cropCfg.hpPerChunk(field.tier[i]) * eco.hpMult;
    field.hp[i] = field.maxHp[i];
  }
  applyStage(field, paths[stage], stage);
  return field;
}

/** Updates paved mask + proximity bins for a stage. Returns indices of crops newly paved (carved). */
export function applyStage(field: CropField, path: PathTable, stage: number): number[] {
  const carved: number[] = [];
  const mask = field.pavedAt[stage];
  for (let i = 0; i < field.count; i++) {
    if (mask[i] !== field.paved[i]) {
      if (mask[i] === 1) carved.push(i);
      field.paved[i] = mask[i];
      markDirty(field, i);
    }
  }
  buildBins(field, path);
  return carved;
}

/** Per arc-bin candidate lists: every unpaved crop within reach of any point in the bin. */
export function buildBins(field: CropField, path: PathTable): void {
  const binLen = field.bins.binLen;
  const nb = Math.max(1, Math.ceil(path.length / binLen));
  const r = BODY.REACH + binLen / 2 + 0.05;
  const r2 = r * r;
  const lists: number[][] = [];
  // Bucket crops into a coarse grid for the bin queries.
  const G = 2;
  const grid = new Map<number, number[]>();
  for (let i = 0; i < field.count; i++) {
    if (field.paved[i]) continue;
    const k = cellKey(Math.floor(field.x[i] / G), Math.floor(field.z[i] / G));
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(i);
  }
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
    const gx0 = Math.floor((px - r) / G);
    const gx1 = Math.floor((px + r) / G);
    const gz0 = Math.floor((pz - r) / G);
    const gz1 = Math.floor((pz + r) / G);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const a = grid.get(cellKey(gx, gz));
        if (!a) continue;
        for (const i of a) {
          if ((field.x[i] - px) ** 2 + (field.z[i] - pz) ** 2 <= r2) list.push(i);
        }
      }
    }
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

export const isAlive = (field: CropField, i: number): boolean => field.regrowAt[i] === 0 && field.paved[i] === 0;
