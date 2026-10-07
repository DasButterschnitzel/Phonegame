import { hash32 } from '../../shared/hash.ts';

/** Parses a farm's plot map into the static layout the territory, field and renderer share. */

/** Plot kinds; zone indices 0..3 are stored separately. */
export const VOID = -1;
export const ROCK = -2;

export interface FarmLayout {
  cols: number;
  rows: number;
  /** Plot edge length in world units. */
  plot: number;
  /** World position of the outer corner of plot (0, 0); plot (c, r) spans [x0 + c·plot, x0 + (c+1)·plot]. */
  x0: number;
  z0: number;
  /** Per plot (index r·cols + c): VOID, ROCK or zone 0..3. */
  zone: Int8Array;
  /** 1 = part of the cleared start territory. */
  start: Uint8Array;
  /** 1 = the ROCK cell is water (pond, creek, ice) — rendering only. */
  water: Uint8Array;
  depotPlot: number;
  /** Outward unit normal of the depot side. */
  depotNormal: [number, number];
  bounds: { x0: number; z0: number; x1: number; z1: number };
  barn: { x: number; z: number; bx: number; bz: number };
  /** Plots (excluding start plots) per zone. */
  zonePlots: [number, number, number, number];
  /** Hash of the map and crop layout; saved field state only applies to the same version. */
  version: number;
}

const BARN_SET_BACK = 3.6;

export function buildLayout(map: readonly string[], plot: number, share: readonly number[], cropsPerSide: number): FarmLayout {
  const rows = map.length;
  const cols = map[0].length;
  for (const line of map) if (line.length !== cols) throw new Error(`farm map rows must all be ${cols} wide: "${line}"`);
  const n = cols * rows;
  const zone = new Int8Array(n).fill(VOID);
  const start = new Uint8Array(n);
  const water = new Uint8Array(n);
  const auto: number[] = [];
  let depotPlot = -1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = map[r][c];
      const i = r * cols + c;
      if (ch === '.') continue;
      if (ch === '#' || ch === '~') {
        zone[i] = ROCK;
        if (ch === '~') water[i] = 1;
        continue;
      }
      if (ch === 'S' || ch === 'D') {
        zone[i] = 0;
        start[i] = 1;
        if (ch === 'D') depotPlot = i;
      } else if (ch >= '0' && ch <= '3') zone[i] = ch.charCodeAt(0) - 48;
      else if (ch === 'o') auto.push(i);
      else throw new Error(`unknown farm map char "${ch}"`);
    }
  }
  if (depotPlot < 0) throw new Error('farm map needs a D plot');

  // Geodesic distance from the start (8-neighbourhood; no corner cutting past rocks or voids).
  const dist = new Float64Array(n).fill(Infinity);
  const plotMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) plotMask[i] = zone[i] >= 0 ? 1 : 0;
  for (const i of auto) plotMask[i] = 1;
  const inPlot = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && plotMask[r * cols + c] === 1;
  const open: number[] = [];
  for (let i = 0; i < n; i++)
    if (start[i]) {
      dist[i] = 0;
      open.push(i);
    }
  // Small grid: a simple O(n²) Dijkstra is plenty.
  const done = new Uint8Array(n);
  for (;;) {
    let best = -1;
    for (const i of open) if (!done[i] && (best < 0 || dist[i] < dist[best])) best = i;
    if (best < 0) break;
    done[best] = 1;
    const c = best % cols;
    const r = (best - c) / cols;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (!inPlot(nc, nr)) continue;
        if (dr && dc && (!inPlot(c + dc, r) || !inPlot(c, r + dr))) continue;
        const j = nr * cols + nc;
        const d = dist[best] + (dr && dc ? Math.SQRT2 : 1);
        if (d < dist[j]) {
          dist[j] = d;
          if (!open.includes(j)) open.push(j);
        }
      }
  }
  auto.sort((a, b) => dist[a] - dist[b] || a - b);
  const cum: number[] = [];
  let acc = 0;
  for (const s of share) cum.push((acc += s));
  auto.forEach((i, k) => {
    const u = (k + 0.5) / auto.length;
    let z = 0;
    while (z < 3 && u > cum[z] / acc) z++;
    zone[i] = z;
  });
  const zonePlots: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) if (zone[i] >= 0 && !start[i]) zonePlots[zone[i]]++;

  const x0 = (-cols * plot) / 2;
  const z0 = (-rows * plot) / 2;
  // Depot side: the side of the D plot that faces out of the farm (prefer the near side, +z).
  const dc = depotPlot % cols;
  const dr = (depotPlot - dc) / cols;
  const outside = (c: number, r: number) => c < 0 || r < 0 || c >= cols || r >= rows || zone[r * cols + c] === VOID;
  const sides: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const side = sides.find(([sx, sz]) => outside(dc + sx, dr + sz));
  if (!side) throw new Error('the D plot must touch the edge of the farm');
  const cx = x0 + (dc + 0.5) * plot;
  const cz = z0 + (dr + 0.5) * plot;
  const x = cx + side[0] * plot * 0.5;
  const z = cz + side[1] * plot * 0.5;
  return {
    cols,
    rows,
    plot,
    x0,
    z0,
    zone,
    start,
    water,
    depotPlot,
    depotNormal: side,
    bounds: { x0, z0, x1: -x0, z1: -z0 },
    barn: { x, z, bx: x + side[0] * BARN_SET_BACK, bz: z + side[1] * BARN_SET_BACK },
    zonePlots,
    version: layoutVersion(map, plot, cropsPerSide, share),
  };
}

function layoutVersion(map: readonly string[], plot: number, k: number, share: readonly number[]): number {
  let h = hash32(k * 1000 + Math.round(plot * 100));
  for (const s of share) h = hash32(h ^ Math.round(s * 1000));
  for (const line of map) for (let i = 0; i < line.length; i++) h = hash32(h ^ (line.charCodeAt(i) + i * 131));
  return h;
}

/** World-space centre of plot p. */
export function plotCenter(l: FarmLayout, p: number): [number, number] {
  const c = p % l.cols;
  const r = (p - c) / l.cols;
  return [l.x0 + (c + 0.5) * l.plot, l.z0 + (r + 0.5) * l.plot];
}
