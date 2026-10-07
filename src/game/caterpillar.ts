import type { GameState, Segment } from './types.ts';
import { BODY, MOVE, power, vMax } from './config.ts';
import { expApproach } from '../shared/math.ts';

/** Arc offset (behind the head) of body index b: 0 = head, 1.. = segments. */
export const bodyOffset = (b: number): number => (b === 0 ? 0 : BODY.HEAD_GAP + (b - 1) * BODY.SEG_SPACING);

export const bodyPower = (st: GameState, b: number): number =>
  b === 0 ? BODY.HEAD_POWER : power(st.progress.segments[b - 1].level);

/** Arc length needed by head + n segments (plus breathing room) — must fit inside the loop. */
export const chainLength = (n: number): number => BODY.HEAD_GAP + Math.max(0, n - 1) * BODY.SEG_SPACING + 2;

/** Hold-to-crawl: full speed while held (or autopilot), slow idle crawl otherwise; heavy baskets accelerate slower. */
export function updateSpeed(st: GameState, held: boolean, fill: number, dt: number, factor = 1): void {
  const vm = vMax(st.progress.speedLevel) * factor;
  const on = held || st.boosts.autopilot > 0;
  const target = on ? vm : MOVE.IDLE_FRAC * vm;
  const tau = target > st.v ? MOVE.TAU_UP * (1 + MOVE.LOAD_K * fill) : MOVE.TAU_DOWN;
  st.v = expApproach(st.v, target, dt, tau);
}

/**
 * Auto-merge: the lowest level with a pair; consumes the two rearmost segments of that level and inserts one of
 * level+1. Segments are then stably sorted by level (highest right behind the head).
 */
export function findMergePair(segs: Segment[]): { level: number; a: number; b: number } | null {
  const counts = new Map<number, number>();
  for (const s of segs) counts.set(s.level, (counts.get(s.level) ?? 0) + 1);
  let level = Infinity;
  for (const [l, c] of counts) if (c >= 2 && l < level && l < BODY.MAX_LVL) level = l;
  if (level === Infinity) return null;
  let a = -1;
  let b = -1;
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i].level !== level) continue;
    if (b < 0) b = i;
    else {
      a = i;
      break;
    }
  }
  return { level, a, b };
}

export function sortSegments(segs: Segment[]): void {
  // Array.prototype.sort is stable.
  segs.sort((p, q) => q.level - p.level);
}
