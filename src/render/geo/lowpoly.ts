import * as THREE from 'three';

/**
 * Tiny toolkit for flat-shaded, vertex-coloured low-poly meshes built entirely in code.
 * Parts are converted to non-indexed geometry (flat normals) and merged into one BufferGeometry.
 */
export interface Part {
  geo: THREE.BufferGeometry;
  color: number;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number] | number;
  /** Per-vertex colour jitter amount (0..1) for a hand-made look. */
  jitter?: number;
  /** Bitten crops: thin bits (leaves, berries, ears) are bitten off whole instead of showing a cut. */
  leaf?: boolean;
  /** Bitten crops: colour of the cut surface of a solid part (default: a pale version of `color`). */
  flesh?: number;
}

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const c = new THREE.Color();

let seed = 1;
const rnd = (): number => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** `triPart` (optional) receives the index of the part each output triangle came from. */
export function build(parts: Part[], aoFloor = 0.0, aoHeight = 1.0, triPart?: number[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  for (let pi = 0; pi < parts.length; pi++) {
    const p = parts[pi];
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    const sc = p.scale ?? 1;
    s.set(...(typeof sc === 'number' ? ([sc, sc, sc] as [number, number, number]) : sc));
    e.set(...(p.rot ?? [0, 0, 0]));
    q.setFromEuler(e);
    v.set(...(p.pos ?? [0, 0, 0]));
    m.compose(v, q, s);
    g.applyMatrix4(m);
    const pos = g.getAttribute('position');
    c.setHex(p.color);
    // One colour per triangle (with optional jitter) keeps the faceted look.
    for (let i = 0; i < pos.count; i += 3) {
      triPart?.push(pi);
      const j = p.jitter ? 1 + (rnd() - 0.5) * p.jitter : 1;
      for (let k = 0; k < 3; k++) {
        const y = pos.getY(i + k);
        const ao = aoFloor > 0 ? THREE.MathUtils.lerp(1 - aoFloor, 1, THREE.MathUtils.clamp(y / aoHeight, 0, 1)) : 1;
        positions.push(pos.getX(i + k), y, pos.getZ(i + k));
        colors.push(c.r * j * ao, c.g * j * ao, c.b * j * ao);
      }
    }
    g.dispose();
    g = null as unknown as THREE.BufferGeometry;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}

// Shared primitive factories (low segment counts on purpose).
export const box = (w = 1, h = 1, d = 1) => new THREE.BoxGeometry(w, h, d);
export const ball = (r = 0.5, detail = 0) => new THREE.IcosahedronGeometry(r, detail);
export const cyl = (rt = 0.5, rb = 0.5, h = 1, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
export const cone = (r = 0.5, h = 1, seg = 6) => new THREE.ConeGeometry(r, h, seg, 1);
export const dodeca = (r = 0.5) => new THREE.DodecahedronGeometry(r, 0);
export const octa = (r = 0.5) => new THREE.OctahedronGeometry(r, 0);
/** Ribbed lathe (pumpkins, melons): profile points (radius, y) revolved with `seg` facets. */
export const lathe = (pts: [number, number][], seg = 8) =>
  new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

/** Shared material for nearly everything: per-vertex colours, flat normals from geometry. */
export function lambert(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}
