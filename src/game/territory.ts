import type { FarmLayout } from './farms/layout.ts';
import type { Pt } from './path.ts';

/**
 * The cleared territory: a set of claimed plots whose outline is the route. It only ever grows, one plot at a time,
 * and always stays one simply connected blob (no holes, no corner-only contacts), so its outline is one simple loop.
 */
export interface Territory {
  layout: FarmLayout;
  claimed: Uint8Array;
  claimedCount: number;
  /** Alive crops of the plot that the route can reach (must be destroyed before the plot can be claimed). */
  blockers: Uint16Array;
  /** Destroyed crops per plot. */
  deadIn: Uint16Array;
  /** Crops per plot (static). */
  cropsIn: Uint16Array;
  /** Sim time the plot became ready to be claimed; −1 = not ready. */
  readySince: Float64Array;
  /** Crops and destroyed crops per zone. */
  zoneCrops: [number, number, number, number];
  zoneDead: [number, number, number, number];
}

export function newTerritory(layout: FarmLayout): Territory {
  const n = layout.cols * layout.rows;
  const claimed = Uint8Array.from(layout.start);
  let claimedCount = 0;
  for (let i = 0; i < n; i++) claimedCount += claimed[i];
  return {
    layout,
    claimed,
    claimedCount,
    blockers: new Uint16Array(n),
    deadIn: new Uint16Array(n),
    cropsIn: new Uint16Array(n),
    readySince: new Float64Array(n).fill(-1),
    zoneCrops: [0, 0, 0, 0],
    zoneDead: [0, 0, 0, 0],
  };
}

/**
 * Re-evaluates whether plot p is ready to be claimed. Returns true when it has just become ready. Readiness is sticky:
 * when a neighbour's claim moves the route and exposes a far crop of this plot, the plot stays ready (that crop is
 * eaten from the new route) — otherwise growth along an edge would stall every other plot and comb the route.
 */
export function updateReady(t: Territory, p: number, openZone: number, now: number): boolean {
  if (!isFrontier(t, p, openZone)) {
    t.readySince[p] = -1;
    return false;
  }
  if (t.readySince[p] >= 0 || t.blockers[p] > 0 || t.deadIn[p] === 0) return false;
  t.readySince[p] = now;
  return true;
}

/** Destroyed share of the crops in zones 0..z. */
export function clearedUpTo(t: Territory, z: number): number {
  let n = 0;
  let d = 0;
  for (let k = 0; k <= z; k++) {
    n += t.zoneCrops[k];
    d += t.zoneDead[k];
  }
  return n > 0 ? d / n : 1;
}

/** Full validity check (used when restoring a saved territory): connected, no corner-only contacts, no holes. */
export function isSimple(t: Territory): boolean {
  const { cols, rows, zone, start } = t.layout;
  let first = -1;
  let count = 0;
  for (let p = 0; p < cols * rows; p++) {
    if (!t.claimed[p]) continue;
    if (zone[p] < 0) return false;
    if (first < 0) first = p;
    count++;
  }
  for (let p = 0; p < cols * rows; p++) if (start[p] && !t.claimed[p]) return false;
  if (first < 0) return false;
  for (let wy = -1; wy < rows; wy++)
    for (let wx = -1; wx < cols; wx++) {
      const a = at(t, wx, wy);
      const b = at(t, wx + 1, wy);
      const c = at(t, wx, wy + 1);
      const d = at(t, wx + 1, wy + 1);
      if ((a && d && !b && !c) || (b && c && !a && !d)) return false;
    }
  // Territory 4-connected.
  const seen = new Uint8Array(cols * rows);
  const stack = [first];
  seen[first] = 1;
  let reached = 0;
  while (stack.length) {
    const p = stack.pop()!;
    reached++;
    const c = p % cols;
    const r = (p - c) / cols;
    for (const [x, y] of [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]]) {
      if (!at(t, x, y)) continue;
      const q = y * cols + x;
      if (!seen[q]) (seen[q] = 1), stack.push(q);
    }
  }
  return reached === count && complementConnected(t, cols, rows);
}

const at = (t: Territory, c: number, r: number): number =>
  c < 0 || r < 0 || c >= t.layout.cols || r >= t.layout.rows ? 0 : t.claimed[r * t.layout.cols + c];

/** Claimed 4-neighbours of plot p. */
export function claimedNeighbours(t: Territory, p: number): number {
  const c = p % t.layout.cols;
  const r = (p - c) / t.layout.cols;
  return at(t, c - 1, r) + at(t, c + 1, r) + at(t, c, r - 1) + at(t, c, r + 1);
}

/** A plot that may join the territory once it is cleared: in an open zone, unclaimed and touching the territory. */
export function isFrontier(t: Territory, p: number, openZone: number): boolean {
  const z = t.layout.zone[p];
  return z >= 0 && z <= openZone && !t.claimed[p] && claimedNeighbours(t, p) > 0;
}

/** Hard rules: claiming p keeps the territory one simple loop (no corner-only contact, no enclosed hole). */
export function keepsSimpleLoop(t: Territory, p: number): boolean {
  const { cols, rows } = t.layout;
  const c = p % cols;
  const r = (p - c) / cols;
  t.claimed[p] = 1;
  let ok = true;
  // Corner-only contacts in the four 2×2 windows around p.
  for (let wy = r - 1; wy <= r && ok; wy++) {
    for (let wx = c - 1; wx <= c && ok; wx++) {
      const a = at(t, wx, wy);
      const b = at(t, wx + 1, wy);
      const cc = at(t, wx, wy + 1);
      const d = at(t, wx + 1, wy + 1);
      if ((a && d && !b && !cc) || (b && cc && !a && !d)) ok = false;
    }
  }
  if (ok) ok = complementConnected(t, cols, rows);
  t.claimed[p] = 0;
  return ok;
}

let fillBuf = new Uint8Array(0);
let stackBuf = new Int32Array(0);

/** Everything that is not territory (padded by a ring of outside cells) must stay one 4-connected region. */
function complementConnected(t: Territory, cols: number, rows: number): boolean {
  const W = cols + 2;
  const H = rows + 2;
  if (fillBuf.length < W * H) {
    fillBuf = new Uint8Array(W * H);
    stackBuf = new Int32Array(W * H);
  }
  const seen = fillBuf;
  seen.fill(0, 0, W * H);
  let total = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const inside = x > 0 && y > 0 && x <= cols && y <= rows && t.claimed[(y - 1) * cols + (x - 1)] === 1;
      if (inside) seen[y * W + x] = 2;
      else total++;
    }
  let sp = 0;
  stackBuf[sp++] = 0;
  seen[0] = 1;
  let count = 0;
  while (sp > 0) {
    const i = stackBuf[--sp];
    count++;
    const x = i % W;
    const y = (i - x) / W;
    if (x > 0 && !seen[i - 1]) (seen[i - 1] = 1), (stackBuf[sp++] = i - 1);
    if (x < W - 1 && !seen[i + 1]) (seen[i + 1] = 1), (stackBuf[sp++] = i + 1);
    if (y > 0 && !seen[i - W]) (seen[i - W] = 1), (stackBuf[sp++] = i - W);
    if (y < H - 1 && !seen[i + W]) (seen[i + W] = 1), (stackBuf[sp++] = i + W);
  }
  return count === total;
}

/**
 * Soft rules that keep the route readable (no spaghetti): don't grow a spike out of a spike or a one-plot-wide strip,
 * and don't leave a one-plot-wide gap (notch or channel) of open field between two arms of territory — growth spreads
 * along an edge instead of combing it. Waived after a grace period so they can never block progress.
 */
export function keepsRouteTidy(t: Territory, p: number, openZone: number): boolean {
  const { cols } = t.layout;
  const c = p % cols;
  const r = (p - c) / cols;
  const n4: [number, number][] = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]];
  const nb = n4.filter(([x, y]) => at(t, x, y));
  if (nb.length === 1) {
    const [x, y] = nb[0];
    const l = at(t, x - 1, y);
    const rr = at(t, x + 1, y);
    const u = at(t, x, y - 1);
    const d = at(t, x, y + 1);
    const m = l + rr + u + d;
    if (m < 2 || (m === 2 && ((l && rr) || (u && d)))) return false;
  }
  t.claimed[p] = 1;
  let ok = true;
  for (const [x, y] of n4) {
    if (x < 0 || y < 0 || x >= cols || y >= t.layout.rows) continue;
    const q = y * cols + x;
    const z = t.layout.zone[q];
    // Gaps around rocks and still-fenced plots are part of the map; only open field must not be left as a slot.
    // A slot that is itself ready joins in the same batch.
    if (t.claimed[q] || z < 0 || z > openZone || t.readySince[q] >= 0) continue;
    if ((at(t, x - 1, y) && at(t, x + 1, y)) || (at(t, x, y - 1) && at(t, x, y + 1))) ok = false;
  }
  t.claimed[p] = 0;
  return ok;
}

/** Outline of the territory as polygon corners in world space (positive signed area, collinear points removed). */
export function traceOutline(t: Territory): Pt[] {
  const { cols, rows, x0, z0, plot } = t.layout;
  const VW = cols + 1;
  const next = new Int32Array(VW * (rows + 1)).fill(-1);
  const vid = (x: number, y: number) => y * VW + x;
  let first = -1;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (!t.claimed[r * cols + c]) continue;
      if (!at(t, c, r - 1)) next[vid(c, r)] = vid(c + 1, r);
      if (!at(t, c + 1, r)) next[vid(c + 1, r)] = vid(c + 1, r + 1);
      if (!at(t, c, r + 1)) next[vid(c + 1, r + 1)] = vid(c, r + 1);
      if (!at(t, c - 1, r)) next[vid(c, r + 1)] = vid(c, r);
      if (first < 0 && !at(t, c, r - 1)) first = vid(c, r);
    }
  const verts: number[] = [];
  let v = first;
  do {
    verts.push(v);
    v = next[v];
    if (v < 0 || verts.length > next.length) throw new Error('territory outline is not a simple loop');
  } while (v !== first);
  const out: Pt[] = [];
  const n = verts.length;
  for (let k = 0; k < n; k++) {
    const a = verts[(k - 1 + n) % n];
    const b = verts[k];
    const d = verts[(k + 1) % n];
    const ax = a % VW;
    const ay = (a - ax) / VW;
    const bx = b % VW;
    const by = (b - bx) / VW;
    const dx = d % VW;
    const dy = (d - dx) / VW;
    // Keep only real corners.
    if ((bx - ax) * (dy - by) - (by - ay) * (dx - bx) === 0) continue;
    out.push([x0 + bx * plot, z0 + by * plot]);
  }
  return out;
}

/** World-space rectangle of plot p, grown by `pad`. */
export function plotRect(t: Territory, p: number, pad: number): [number, number, number, number] {
  const { cols, x0, z0, plot } = t.layout;
  const c = p % cols;
  const r = (p - c) / cols;
  return [x0 + c * plot - pad, z0 + r * plot - pad, x0 + (c + 1) * plot + pad, z0 + (r + 1) * plot + pad];
}
