export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number): number => (b === a ? 0 : (x - a) / (b - a));
/** Positive modulo: wrap(x, L) ∈ [0, L). */
export const wrap = (x: number, L: number): number => {
  const r = x % L;
  return r < 0 ? r + L : r;
};
/** Frame-rate independent exponential approach. */
export const expApproach = (cur: number, target: number, dt: number, tau: number): number =>
  tau <= 0 ? target : target + (cur - target) * Math.exp(-dt / tau);
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** Critically damped spring (Unity-style SmoothDamp) on a scalar. Returns [value, velocity]. */
/** Allocation-free smoothDamp: returns the new value and writes the new velocity into `out.v`. */
export function smoothDampTo(cur: number, target: number, vel: number, smoothTime: number, dt: number, out: { v: number }): number {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel + omega * change) * dt;
  out.v = (vel - omega * temp) * exp;
  return target + (change + temp) * exp;
}

export function smoothDamp(cur: number, target: number, vel: number, smoothTime: number, dt: number): [number, number] {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel + omega * change) * dt;
  const newVel = (vel - omega * temp) * exp;
  const out = target + (change + temp) * exp;
  return [out, newVel];
}
