/** Small deterministic integer hashes (no Math.random in the simulation). */
export function hash32(a: number): number {
  let x = a | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

export function hash3(a: number, b: number, c: number): number {
  return hash32(hash32(hash32(a) ^ (b * 0x9e3779b1)) ^ (c * 0x85ebca77));
}

/** Uniform float in [0, 1) from three ints. */
export function hashFloat(a: number, b: number, c: number): number {
  return hash3(a, b, c) / 4294967296;
}

/** Pack a signed grid cell into one int key (cells within ±32767). */
export const cellKey = (ix: number, iz: number): number => ((ix + 32768) << 16) | (iz + 32768);
