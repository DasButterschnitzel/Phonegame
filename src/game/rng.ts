/** mulberry32 stepping on a state-held seed so the simulation stays deterministic and serialisable. */
export function nextRandom(st: { rng: number }): number {
  let t = (st.rng = (st.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(st: { rng: number }, lo: number, hi: number): number {
  return lo + (hi - lo) * nextRandom(st);
}
