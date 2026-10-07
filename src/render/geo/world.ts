import * as THREE from 'three';
import type { PathTable } from '../../game/types.ts';
import { build, ball, box, cone, cyl, dodeca, type Part } from './lowpoly.ts';

/** Checkerboard field ground (vertex colours), tiles of `tile` units inside bounds. */
export function fieldGround(x0: number, z0: number, x1: number, z1: number, a: number, b: number, tile = 2): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  for (let z = Math.floor(z0 / tile) * tile; z < z1; z += tile) {
    for (let x = Math.floor(x0 / tile) * tile; x < x1; x += tile) {
      const c = ((x / tile + z / tile) & 1) === 0 ? ca : cb;
      const xa = Math.max(x, x0);
      const xb = Math.min(x + tile, x1);
      const za = Math.max(z, z0);
      const zb = Math.min(z + tile, z1);
      pos.push(xa, 0, za, xa, 0, zb, xb, 0, zb, xa, 0, za, xb, 0, zb, xb, 0, za);
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Path ribbon along the loop: dirt centre plus darker edges. */
export function pathRibbon(p: PathTable, width: number, center: number, edge: number, y = 0.02): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const cc = new THREE.Color(center);
  const ce = new THREE.Color(edge);
  const half = width / 2;
  const bands: [number, number, THREE.Color][] = [
    [-half - 0.12, -half + 0.08, ce],
    [-half + 0.08, half - 0.08, cc],
    [half - 0.08, half + 0.12, ce],
  ];
  const step = 2; // every other sample keeps the vertex count modest
  for (let i = 0; i < p.n; i += step) {
    const j = (i + step) % p.n;
    const nxi = -p.tz[i];
    const nzi = p.tx[i];
    const nxj = -p.tz[j];
    const nzj = p.tx[j];
    for (const [a, b, c] of bands) {
      const ax = p.x[i] + nxi * a;
      const az = p.z[i] + nzi * a;
      const bx = p.x[i] + nxi * b;
      const bz = p.z[i] + nzi * b;
      const cx = p.x[j] + nxj * a;
      const cz = p.z[j] + nzj * a;
      const dx = p.x[j] + nxj * b;
      const dz = p.z[j] + nzj * b;
      pos.push(ax, y, az, cx, y, cz, bx, y, bz, bx, y, bz, cx, y, cz, dx, y, dz);
      const shade = 0.96 + 0.08 * (((i * 7919) % 13) / 13);
      for (let k = 0; k < 6; k++) col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Ribbon is built with mixed winding depending on loop orientation; render double-sided.
  return g;
}

export function barnGeometry(): THREE.BufferGeometry {
  const red = 0xd64545;
  const white = 0xffffff;
  const roof = 0x5b3a29;
  const roofGeo = new THREE.CylinderGeometry(1.45, 1.45, 3.0, 3, 1);
  const parts: Part[] = [
    { geo: box(2.6, 1.8, 2.6), color: red, pos: [0, 0.9, 0], jitter: 0.06 },
    { geo: roofGeo, color: roof, pos: [0, 2.1, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.75], jitter: 0.08 },
    // Door facing +Z (rotated by the view to face the path).
    { geo: box(1.1, 1.3, 0.08), color: 0x7a2323, pos: [0, 0.65, 1.31] },
    { geo: box(1.2, 0.08, 0.1), color: white, pos: [0, 1.32, 1.33] },
    { geo: box(0.08, 1.3, 0.1), color: white, pos: [0.58, 0.65, 1.33] },
    { geo: box(0.08, 1.3, 0.1), color: white, pos: [-0.58, 0.65, 1.33] },
    { geo: box(1.5, 0.08, 0.1), color: white, pos: [0, 0.65, 1.34], rot: [0, 0, 0.75] },
    // Hay loft window.
    { geo: box(0.5, 0.45, 0.08), color: 0xffd23f, pos: [0, 2.0, 1.12] },
    // Silo.
    { geo: cyl(0.55, 0.55, 2.8, 8), color: 0xdfe6ee, pos: [1.75, 1.4, -0.6], jitter: 0.05 },
    { geo: cone(0.62, 0.6, 8), color: 0x8a99a8, pos: [1.75, 3.1, -0.6] },
  ];
  return build(parts, 0.2, 1.5);
}

export function decorGeometry(kind: 'tree' | 'pine' | 'cactus' | 'birch'): THREE.BufferGeometry {
  switch (kind) {
    case 'tree':
      return build([
        { geo: cyl(0.15, 0.22, 1.0, 5), color: 0x7a4a26, pos: [0, 0.5, 0] },
        { geo: dodeca(0.85), color: 0x3fae49, pos: [0, 1.5, 0], jitter: 0.2 },
        { geo: dodeca(0.6), color: 0x52c45a, pos: [0.35, 1.95, 0.15], jitter: 0.2 },
      ], 0.3, 1.5);
    case 'birch':
      return build([
        { geo: cyl(0.12, 0.16, 1.2, 5), color: 0xf2f2f2, pos: [0, 0.6, 0] },
        { geo: dodeca(0.75), color: 0xf2a541, pos: [0, 1.6, 0], jitter: 0.25 },
        { geo: dodeca(0.5), color: 0xe76f51, pos: [-0.3, 2.0, 0.2], jitter: 0.25 },
      ], 0.3, 1.5);
    case 'pine':
      return build([
        { geo: cyl(0.12, 0.16, 0.6, 5), color: 0x6b4226, pos: [0, 0.3, 0] },
        { geo: cone(0.9, 1.2, 6), color: 0x2d6a4f, pos: [0, 1.1, 0], jitter: 0.15 },
        { geo: cone(0.7, 1.0, 6), color: 0x40916c, pos: [0, 1.75, 0], jitter: 0.15 },
        { geo: cone(0.45, 0.6, 6), color: 0xffffff, pos: [0, 2.3, 0] },
      ], 0.3, 1.5);
    case 'cactus':
      return build([
        { geo: cyl(0.25, 0.3, 1.8, 7), color: 0x3fae49, pos: [0, 0.9, 0], jitter: 0.12 },
        { geo: cyl(0.14, 0.16, 0.7, 6), color: 0x3fae49, pos: [0.38, 1.0, 0], rot: [0, 0, -1.2] },
        { geo: cyl(0.14, 0.16, 0.6, 6), color: 0x3fae49, pos: [0.6, 1.35, 0] },
        { geo: ball(0.12, 0), color: 0xff6fb5, pos: [0, 1.85, 0] },
      ], 0.3, 1.5);
  }
}

export function rockGeometry(): THREE.BufferGeometry {
  return build([
    { geo: dodeca(0.45), color: 0x9aa0a6, pos: [0, 0.2, 0], scale: [1.2, 0.7, 1], jitter: 0.2 },
    { geo: dodeca(0.25), color: 0xb0b6bc, pos: [0.4, 0.12, 0.2], jitter: 0.2 },
  ]);
}

export function fencePostGeometry(): THREE.BufferGeometry {
  return build([
    { geo: box(0.14, 0.7, 0.14), color: 0xa0693a, pos: [0, 0.35, 0] },
    { geo: box(2.0, 0.1, 0.06), color: 0xc08552, pos: [1.0, 0.5, 0] },
    { geo: box(2.0, 0.1, 0.06), color: 0xc08552, pos: [1.0, 0.25, 0] },
  ]);
}

/** Dash for the "next expansion" outline. */
export function dashGeometry(): THREE.BufferGeometry {
  return build([{ geo: box(0.5, 0.03, 0.16), color: 0xffffff }]);
}

/** Radial blob shadow texture. */
export function blobTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.38)');
  grd.addColorStop(0.6, 'rgba(0,0,0,0.18)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const sproutGeometry = (): THREE.BufferGeometry =>
  build([
    { geo: cone(0.06, 0.18, 3), color: 0x6cc24a, pos: [0.05, 0.09, 0], rot: [0, 0, -0.4] },
    { geo: cone(0.06, 0.18, 3), color: 0x7ed957, pos: [-0.05, 0.09, 0], rot: [0, 0, 0.4] },
    { geo: cyl(0.16, 0.2, 0.05, 5), color: 0x8b5a2b, pos: [0, 0.02, 0] },
  ]);
