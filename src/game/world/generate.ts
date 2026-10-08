import type { CropId, FarmBlueprint, SizeClass } from '../types.ts';
import { hash32 } from '../../shared/hash.ts';
import { FIELD } from '../config.ts';
import { buildLayout } from '../farms/layout.ts';
import { biomeDef, type ArchetypeId } from './biomes.ts';
import { GEN_VERSION, type FarmPlan } from './plan.ts';

/**
 * Authored procedural farms. An archetype (river bend, canyon, terraces, …) draws a designed shape — a rounded field,
 * obstacles that always open to the outside, the start block and depot on the near edge — with seeded parameters and
 * mirroring; repair passes clean up what the territory rules can't use (one-plot necks, corner-only pinches, cut-off
 * pockets, enclosed holes) and validation rejects anything still off, in which case the next attempt is drawn.
 *
 * Map characters (see farms/layout.ts): '.' outside, 'o' plot, '#' rock, '~' water, 'S' start, 'D' depot start plot.
 */

const VOID = 0;
const PLOT = 1;
const ROCK = 2;
const WATER = 3;
const START = 4;
const DEPOT = 5;

const CH = ['.', 'o', '#', '~', 'S', 'D'];

interface Grid {
  cols: number;
  rows: number;
  c: Uint8Array;
}

const isPlot = (v: number): boolean => v === PLOT || v === START || v === DEPOT;
const isObstacle = (v: number): boolean => v === ROCK || v === WATER;

function rngOf(seed: number): () => number {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (g: Grid, c: number, r: number): number => (c < 0 || r < 0 || c >= g.cols || r >= g.rows ? VOID : g.c[r * g.cols + c]);
const set = (g: Grid, c: number, r: number, v: number): void => {
  if (c >= 0 && r >= 0 && c < g.cols && r < g.rows) {
    const i = r * g.cols + c;
    // The start block is sacred.
    if (g.c[i] === START || g.c[i] === DEPOT) return;
    g.c[i] = v;
  }
};

/** Plot counts per size class (the authored starter farms have ~95–125). */
export const SIZE_PLOTS: Record<SizeClass, [number, number]> = {
  quick: [50, 82],
  standard: [90, 130],
  grand: [130, 178],
};

const DIMS: Record<SizeClass, { cols: [number, number]; rows: [number, number] }> = {
  quick: { cols: [9, 10], rows: [8, 10] },
  standard: { cols: [11, 13], rows: [10, 12] },
  grand: { cols: [13, 15], rows: [12, 14] },
};

interface Ctx {
  g: Grid;
  rnd: () => number;
  /** Start block centre column (the D plot) and the rows it occupies (rows − 2 … rows − 1). */
  sc: number;
}

const ri = (rnd: () => number, lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));

/** Cells near the start block stay field (the opening must be roomy). */
const nearStart = (x: Ctx, c: number, r: number): boolean => r >= x.g.rows - 4 && Math.abs(c - x.sc) <= 3;

function paint(x: Ctx, c: number, r: number, v: number): void {
  if (nearStart(x, c, r)) return;
  set(x.g, c, r, v);
}

/** A blob of radius ~rad around (cc, rr). */
function blob(x: Ctx, cc: number, rr: number, rad: number, v: number): void {
  for (let r = Math.floor(rr - rad); r <= Math.ceil(rr + rad); r++)
    for (let c = Math.floor(cc - rad); c <= Math.ceil(cc + rad); c++) {
      const d = Math.hypot(c - cc, (r - rr) * 1.1);
      if (d <= rad + 0.15 * (x.rnd() - 0.5)) paint(x, c, r, v);
    }
}

/** A meandering band from an edge point inwards (rivers, canyons, ridges). Thickness 1–2, always open to the outside. */
function band(x: Ctx, c0: number, r0: number, dc: number, dr: number, len: number, thick: number, v: number, wiggle = 0.35): void {
  let c = c0;
  let r = r0;
  for (let k = 0; k < len; k++) {
    paint(x, Math.round(c), Math.round(r), v);
    if (thick > 1) {
      // Thicken across the direction of travel.
      paint(x, Math.round(c + (dr !== 0 ? 1 : 0)), Math.round(r + (dc !== 0 ? 1 : 0)), v);
    }
    c += dc;
    r += dr;
    if (x.rnd() < wiggle) {
      if (dc !== 0) r += x.rnd() < 0.5 ? -1 : 1;
      else c += x.rnd() < 0.5 ? -1 : 1;
    }
  }
}

/**
 * Base field: an organic outline — a superellipse whose radius wobbles with two seeded harmonics (rounder or boxier per
 * archetype) — flattened towards the near edge, where the start block and depot sit.
 */
function baseShape(x: Ctx, roundness: number): void {
  const { g, rnd } = x;
  const p = Math.max(2, 2.3 + rnd() * 1.5 - roundness * 0.3);
  const h1 = rnd() * Math.PI * 2;
  const h2 = rnd() * Math.PI * 2;
  const a1 = 0.06 + rnd() * 0.09;
  const a2 = 0.04 + rnd() * 0.07;
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      const u = ((c + 0.5) / g.cols) * 2 - 1;
      let v = ((r + 0.5) / g.rows) * 2 - 1;
      // The near half is squashed so the outline runs almost straight along the near edge.
      if (v > 0) v *= 0.6;
      const ang = Math.atan2(v, u);
      const rad = 1.03 + a1 * Math.sin(2 * ang + h1) + a2 * Math.sin(3 * ang + h2);
      g.c[r * g.cols + c] = Math.abs(u) ** p + Math.abs(v) ** p <= rad ** p ? PLOT : VOID;
    }
  // Start block: 3 × 2 on the near edge, the depot plot in the middle of the last row.
  for (let r = g.rows - 2; r < g.rows; r++) for (let c = x.sc - 1; c <= x.sc + 1; c++) g.c[r * g.cols + c] = START;
  g.c[(g.rows - 1) * g.cols + x.sc] = DEPOT;
}

type Drawer = (x: Ctx) => void;

const side = (x: Ctx): -1 | 1 => (x.rnd() < 0.5 ? -1 : 1);
const edgeCol = (x: Ctx, s: -1 | 1): number => (s < 0 ? 0 : x.g.cols - 1);

const ARCHETYPES: Record<ArchetypeId, Drawer> = {
  bowl: (x) => {
    if (x.rnd() < 0.6) blob(x, ri(x.rnd, 2, x.g.cols - 3), 0, ri(x.rnd, 1, 2), WATER);
  },
  riverbend: (x) => {
    const s = side(x);
    const r0 = ri(x.rnd, Math.floor(x.g.rows * 0.3), Math.floor(x.g.rows * 0.5));
    const run = Math.floor(x.g.cols * (0.3 + 0.12 * x.rnd()));
    band(x, edgeCol(x, s), r0, -s, 0, run, 2, WATER, 0.25);
    // …and widens into a pool where it ends. (A river that turns towards the far edge cuts off a lobe the route can
    // only reach round the water: measured 1.26× the duration of other farms of its size, worst 2.6×.)
    blob(x, edgeCol(x, s) - s * run, r0 + 0.5, 1.25, WATER);
  },
  twinponds: (x) => {
    blob(x, ri(x.rnd, 1, Math.floor(x.g.cols / 2) - 1), 0, 1.6, WATER);
    if (x.rnd() < 0.5) blob(x, x.g.cols - 1, ri(x.rnd, 2, Math.floor(x.g.rows / 2)), 1.6, WATER);
    else blob(x, ri(x.rnd, Math.ceil(x.g.cols / 2) + 1, x.g.cols - 2), 0, 1.6, WATER);
  },
  canyon: (x) => {
    const c0 = ri(x.rnd, Math.floor(x.g.cols * 0.35), Math.ceil(x.g.cols * 0.65));
    band(x, c0, 0, 0, 1, Math.floor(x.g.rows * (0.35 + 0.15 * x.rnd())), 2, ROCK, 0.25);
  },
  terraces: (x) => {
    let s = side(x);
    for (let r = 2; r < x.g.rows - 4; r += 3) {
      band(x, edgeCol(x, s), r, -s, 0, Math.floor(x.g.cols * (0.3 + 0.2 * x.rnd())), 1, ROCK, 0);
      s = s < 0 ? 1 : -1;
    }
  },
  horseshoe: (x) => {
    const w = ri(x.rnd, 2, 3);
    const c0 = Math.floor(x.g.cols / 2 - w / 2) + ri(x.rnd, -1, 1);
    const depth = Math.floor(x.g.rows * (0.35 + 0.1 * x.rnd()));
    for (let r = 0; r < depth; r++) for (let c = c0; c < c0 + w; c++) paint(x, c, r, VOID);
    // A pond at the bottom of the notch (open to the outside through it).
    if (x.rnd() < 0.6) for (let c = c0; c < c0 + w; c++) paint(x, c, depth, WATER);
  },
  valley: (x) => {
    // A diagonal valley: the far corner on one side and the opposite flank fall away.
    const s = side(x);
    const n = Math.floor(Math.min(x.g.cols, x.g.rows) * 0.45);
    for (let k = 0; k < n; k++) for (let j = 0; j < n - k; j++) paint(x, s < 0 ? j : x.g.cols - 1 - j, k, VOID);
    const rr = Math.floor(x.g.rows * 0.5);
    for (let k = 0; k < n - 2; k++) for (let j = 0; j < Math.max(0, n - 2 - k - 1); j++) paint(x, s < 0 ? x.g.cols - 1 - j : j, rr + k - 1, ROCK);
  },
  twinfields: (x) => {
    const r0 = ri(x.rnd, Math.floor(x.g.rows * 0.3), Math.floor(x.g.rows * 0.45));
    const d = ri(x.rnd, 2, 3);
    for (let r = r0; r < r0 + 2; r++)
      for (let c = 0; c < d; c++) {
        paint(x, c, r, VOID);
        paint(x, x.g.cols - 1 - c, r, VOID);
      }
  },
  ridge: (x) => {
    const s = side(x);
    band(x, edgeCol(x, s), ri(x.rnd, 2, Math.floor(x.g.rows * 0.5)), -s, 0, Math.floor(x.g.cols * (0.5 + 0.15 * x.rnd())), x.rnd() < 0.5 ? 1 : 2, ROCK, 0.25);
  },
  coast: (x) => {
    const s = side(x);
    let depth = ri(x.rnd, 1, 2);
    for (let r = 0; r < x.g.rows - 3; r++) {
      for (let k = 0; k < depth; k++) paint(x, s < 0 ? k : x.g.cols - 1 - k, r, WATER);
      depth = Math.max(1, Math.min(3, depth + (x.rnd() < 0.5 ? -1 : 1) * (x.rnd() < 0.6 ? 1 : 0)));
    }
  },
  brokenriver: (x) => {
    band(x, ri(x.rnd, 2, x.g.cols - 3), 0, 0, 1, Math.floor(x.g.rows * 0.3), 2, WATER, 0.3);
    const s = side(x);
    band(x, edgeCol(x, s), Math.floor(x.g.rows * 0.55), -s, 0, Math.floor(x.g.cols * 0.3), 2, WATER, 0.3);
  },
  archipelago: (x) => {
    const n = ri(x.rnd, 3, 4);
    for (let k = 0; k < n; k++) {
      const top = x.rnd() < 0.55;
      if (top) blob(x, ri(x.rnd, 1, x.g.cols - 2), 0, 1.2 + 0.5 * x.rnd(), WATER);
      else blob(x, x.rnd() < 0.5 ? 0 : x.g.cols - 1, ri(x.rnd, 1, x.g.rows - 5), 1.2 + 0.5 * x.rnd(), WATER);
    }
  },
  longvalley: (x) => {
    let s = side(x);
    for (let r = 2; r < x.g.rows - 4; r += 4) {
      blob(x, s < 0 ? 0 : x.g.cols - 1, r, 1.5, ROCK);
      s = s < 0 ? 1 : -1;
    }
  },
  crossing: (x) => {
    blob(x, 0, 0, 2.2, ROCK);
    blob(x, x.g.cols - 1, 0, 2.2, ROCK);
    if (x.rnd() < 0.5) blob(x, ri(x.rnd, 3, x.g.cols - 4), 0, 1.2, WATER);
  },
  centralrock: (x) => {
    const cc = ri(x.rnd, Math.floor(x.g.cols * 0.4), Math.ceil(x.g.cols * 0.6));
    const rr = Math.floor(x.g.rows * (0.3 + 0.1 * x.rnd()));
    blob(x, cc, rr, 1.4, ROCK);
    // A ridge to the far edge keeps it open to the outside (the route can't enclose it).
    band(x, cc, 0, 0, 1, rr, 1, ROCK, 0);
  },
  spiral: (x) => {
    const s = side(x);
    const r = Math.min(x.g.cols, x.g.rows) * 0.5;
    for (let a = 0; a <= Math.PI / 2; a += 0.12) {
      const c = s < 0 ? Math.round(Math.sin(a) * r) : Math.round(x.g.cols - 1 - Math.sin(a) * r);
      paint(x, c, Math.round((1 - Math.cos(a)) * r * 0.9), ROCK);
    }
  },
};

// ── Repair and validation ───────────────────────────────────────────────────────────────────────────────────────

/** Most common obstacle type around (c, r), or VOID when it touches the outside. */
function fillFor(g: Grid, c: number, r: number): number {
  let rock = 0;
  let water = 0;
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const v = at(g, c + dc, r + dr);
    if (v === VOID) return VOID;
    if (v === ROCK) rock++;
    if (v === WATER) water++;
  }
  return water > rock ? WATER : ROCK;
}

/** Non-plot cells reachable from outside the grid (4-neighbour, through non-plot cells). */
function openToOutside(g: Grid): Uint8Array {
  const W = g.cols + 2;
  const H = g.rows + 2;
  const seen = new Uint8Array(W * H);
  const stack: number[] = [0];
  seen[0] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (seen[j]) continue;
      const inside = nx > 0 && ny > 0 && nx <= g.cols && ny <= g.rows;
      if (inside && isPlot(g.c[(ny - 1) * g.cols + (nx - 1)])) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  const out = new Uint8Array(g.cols * g.rows);
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) out[r * g.cols + c] = seen[(r + 1) * W + (c + 1)];
  return out;
}

/** Plot cells 4-connected to the depot plot. */
function connectedPlots(g: Grid): Uint8Array {
  const out = new Uint8Array(g.cols * g.rows);
  const d = g.c.indexOf(DEPOT);
  if (d < 0) return out;
  const stack = [d];
  out[d] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const c = i % g.cols;
    const r = (i - c) / g.cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
      const j = nr * g.cols + nc;
      if (out[j] || !isPlot(g.c[j])) continue;
      out[j] = 1;
      stack.push(j);
    }
  }
  return out;
}

/** A plot belongs to some 2×2 block of plots (no one-plot necks or spikes). */
function thick(g: Grid, c: number, r: number): boolean {
  for (let dy = -1; dy <= 0; dy++)
    for (let dx = -1; dx <= 0; dx++)
      if (isPlot(at(g, c + dx, r + dy)) && isPlot(at(g, c + dx + 1, r + dy)) && isPlot(at(g, c + dx, r + dy + 1)) && isPlot(at(g, c + dx + 1, r + dy + 1))) return true;
  return false;
}

/** Cleans up what the territory rules can't use. Returns true if anything changed. */
function repairOnce(g: Grid): boolean {
  let changed = false;
  // Enclosed holes (obstacles or voids not open to the outside) become field.
  const open = openToOutside(g);
  for (let i = 0; i < g.c.length; i++)
    if (!isPlot(g.c[i]) && !open[i]) {
      g.c[i] = PLOT;
      changed = true;
    }
  // One-plot necks and spikes go.
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      const v = at(g, c, r);
      if (v === PLOT && !thick(g, c, r)) {
        g.c[r * g.cols + c] = fillFor(g, c, r);
        changed = true;
      }
    }
  // Corner-only pinches: break the diagonal.
  for (let r = 0; r + 1 < g.rows; r++)
    for (let c = 0; c + 1 < g.cols; c++) {
      const a = isPlot(at(g, c, r));
      const b = isPlot(at(g, c + 1, r));
      const cc = isPlot(at(g, c, r + 1));
      const d = isPlot(at(g, c + 1, r + 1));
      if (a && d && !b && !cc) {
        const pick = at(g, c, r) === PLOT ? [c, r] : [c + 1, r + 1];
        set(g, pick[0], pick[1], fillFor(g, pick[0], pick[1]));
        changed = true;
      } else if (b && cc && !a && !d) {
        const pick = at(g, c + 1, r) === PLOT ? [c + 1, r] : [c, r + 1];
        set(g, pick[0], pick[1], fillFor(g, pick[0], pick[1]));
        changed = true;
      }
    }
  // Field cut off from the start joins the obstacle around it.
  const conn = connectedPlots(g);
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      const i = r * g.cols + c;
      if (g.c[i] === PLOT && !conn[i]) {
        g.c[i] = fillFor(g, c, r);
        changed = true;
      }
    }
  return changed;
}

export interface MapCheck {
  ok: boolean;
  reason?: string;
  plots: number;
  obstacles: number;
}

/** Static validation of a plot map (the same rules the territory needs to stay one simple loop). */
export function checkMap(map: readonly string[], size?: SizeClass): MapCheck {
  const rows = map.length;
  const cols = map[0]?.length ?? 0;
  const g: Grid = { cols, rows, c: new Uint8Array(cols * rows) };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) g.c[r * cols + c] = Math.max(0, CH.indexOf(map[r][c]));
  let plots = 0;
  let obstacles = 0;
  let starts = 0;
  let depots = 0;
  for (const v of g.c) {
    if (v === PLOT) plots++;
    if (isObstacle(v)) obstacles++;
    if (v === START || v === DEPOT) starts++;
    if (v === DEPOT) depots++;
  }
  const fail = (reason: string): MapCheck => ({ ok: false, reason, plots, obstacles });
  if (depots !== 1 || starts < 4) return fail('start');
  const d = g.c.indexOf(DEPOT);
  if (Math.floor(d / cols) !== rows - 1) return fail('depot not on the near edge');
  const open = openToOutside(g);
  for (let i = 0; i < g.c.length; i++) if (!isPlot(g.c[i]) && !open[i]) return fail('enclosed hole');
  const conn = connectedPlots(g);
  for (let i = 0; i < g.c.length; i++) if (isPlot(g.c[i]) && !conn[i]) return fail('disconnected field');
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (at(g, c, r) === PLOT && !thick(g, c, r)) return fail('one-plot neck');
  for (let r = 0; r + 1 < rows; r++)
    for (let c = 0; c + 1 < cols; c++) {
      const a = isPlot(at(g, c, r));
      const b = isPlot(at(g, c + 1, r));
      const cc = isPlot(at(g, c, r + 1));
      const dd = isPlot(at(g, c + 1, r + 1));
      if ((a && dd && !b && !cc) || (b && cc && !a && !dd)) return fail('corner pinch');
    }
  if (size) {
    const [lo, hi] = SIZE_PLOTS[size];
    if (plots < lo || plots > hi) return fail(`size ${plots}`);
  }
  if (obstacles > (plots + obstacles) * 0.3) return fail('too many obstacles');
  try {
    buildLayout(map, FIELD.PLOT, [0.12, 0.22, 0.3, 0.36], FIELD.PLOT_CROPS);
  } catch (e) {
    return fail(`layout: ${(e as Error).message}`);
  }
  return { ok: true, plots, obstacles };
}

function toMap(g: Grid): string[] {
  const out: string[] = [];
  for (let r = 0; r < g.rows; r++) {
    let line = '';
    for (let c = 0; c < g.cols; c++) line += CH[g.c[r * g.cols + c]];
    out.push(line);
  }
  return out;
}

/** One candidate map for an archetype (seeded). Not yet validated. */
export function drawMap(archetype: ArchetypeId, size: SizeClass, seed: number): string[] {
  const rnd = rngOf(seed);
  const dims = DIMS[size];
  let cols = ri(rnd, dims.cols[0], dims.cols[1]);
  let rows = ri(rnd, dims.rows[0], dims.rows[1]);
  if (archetype === 'longvalley') {
    rows += 2;
    cols -= 2;
  }
  if (archetype === 'crossing' || archetype === 'coast') cols += 1;
  const sc = Math.floor(cols / 2) + ri(rnd, -1, 1);
  const g: Grid = { cols, rows, c: new Uint8Array(cols * rows) };
  const x: Ctx = { g, rnd, sc };
  baseShape(x, archetype === 'bowl' ? 1 : 0);
  ARCHETYPES[archetype](x);
  for (let k = 0; k < 12 && repairOnce(g); k++);
  // Mirror half the time (the start block stays put: it is symmetric around its own column).
  const map = toMap(g);
  return rnd() < 0.5 ? map.map((line) => [...line].reverse().join('')) : map;
}

export interface Generated {
  map: string[];
  archetype: ArchetypeId;
  attempts: number;
}

/** Validated map for a plan: archetypes by the biome's taste, rerolled until one passes; a plain bowl as the floor. */
/**
 * Archetypes whose feature cuts across the field (a river, a ridge, a long valley) are too much for a quick farm's
 * small grid: measured up to 2.2× a quick farm's usual length. Quick farms use the biome's other layouts.
 */
const NOT_QUICK: readonly ArchetypeId[] = ['riverbend', 'ridge', 'longvalley'];

export function generateMap(biome: FarmPlan['biome'], size: SizeClass, seed: number): Generated {
  const def = biomeDef(biome);
  const rnd = rngOf(hash32(seed ^ 0x3c6ef372));
  let entries = Object.entries(def.layouts) as [ArchetypeId, number][];
  if (size === 'quick') {
    const fit = entries.filter(([a]) => !NOT_QUICK.includes(a));
    entries = fit.length ? fit : [['bowl', 1]];
  }
  for (let attempt = 1; attempt <= 24; attempt++) {
    let total = 0;
    for (const [, w] of entries) total += w;
    let u = rnd() * total;
    let arch: ArchetypeId = entries[0][0];
    for (const [a, w] of entries) {
      u -= w;
      if (u < 0) {
        arch = a;
        break;
      }
    }
    const map = drawMap(arch, size, hash32(seed + attempt * 0x9e3779b1));
    if (checkMap(map, size).ok) return { map, archetype: arch, attempts: attempt };
  }
  for (let k = 0; k < 64; k++) {
    const map = drawMap('bowl', size, hash32(seed ^ (k * 7919 + 1)));
    if (checkMap(map, size).ok) return { map, archetype: 'bowl', attempts: 25 + k };
  }
  throw new Error(`no valid farm for ${biome}/${size}/${seed}`);
}

/** One crop per tier from the biome's pools (no crop twice on one farm). */
export function pickCrops(biome: FarmPlan['biome'], seed: number): [CropId, CropId, CropId, CropId] {
  const def = biomeDef(biome);
  const used = new Set<CropId>();
  const out: CropId[] = [];
  for (let t = 0; t < 4; t++) {
    const pool = def.crops[t].filter((c) => !used.has(c));
    const list = pool.length ? pool : def.crops[t];
    const c = list[hash32(seed ^ Math.imul(t + 1, 0x27d4eb2d)) % list.length];
    used.add(c);
    out.push(c);
  }
  return out as [CropId, CropId, CropId, CropId];
}

/** The full blueprint of a planned World Tour farm. */
export function generateBlueprint(plan: FarmPlan): FarmBlueprint {
  const gen = generateMap(plan.biome, plan.size, plan.seed);
  return {
    gen: GEN_VERSION,
    key: plan.key,
    ordinal: plan.ordinal,
    tour: plan.tour,
    slot: plan.slot,
    biome: plan.biome,
    seed: plan.seed,
    archetype: gen.archetype,
    size: plan.size,
    modifier: plan.modifier,
    showcase: plan.showcase,
    name: plan.name,
    crops: pickCrops(plan.biome, plan.seed),
    map: gen.map,
    variant: plan.variant,
  };
}
