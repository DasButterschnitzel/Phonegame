/** Compact bitset <-> base64 (no DOM btoa/atob, so it works in the pure simulation and in Node scripts). */
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const REV = new Int8Array(128).fill(-1);
for (let i = 0; i < ABC.length; i++) REV[ABC.charCodeAt(i)] = i;

/** Packs a 0/1 array into base64 (6 bits per char). */
export function packBits(a: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < a.length; i += 6) {
    let v = 0;
    for (let b = 0; b < 6; b++) if (i + b < a.length && a[i + b]) v |= 1 << b;
    out += ABC[v];
  }
  return out;
}

/** Inverse of packBits; returns null when the string doesn't fit `n` bits. */
export function unpackBits(s: unknown, n: number): Uint8Array | null {
  if (typeof s !== 'string' || s.length !== Math.ceil(n / 6)) return null;
  const out = new Uint8Array(n);
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    const v = c < 128 ? REV[c] : -1;
    if (v < 0) return null;
    for (let b = 0; b < 6; b++) if (k * 6 + b < n) out[k * 6 + b] = (v >> b) & 1;
  }
  return out;
}
