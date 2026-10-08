import * as THREE from 'three';
import type { PathTable } from '../../game/types.ts';
import { build, ball, box, cone, cyl, octa, type Part } from './lowpoly.ts';
import { RED_BARN, type DepotSkin } from '../palette.ts';

/** Checkerboard ground (vertex colours), tiles of `tile` units inside bounds. */
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

/**
 * Path ribbon along the loop: dirt centre plus darker edges. `aArc` holds each vertex's reveal distance (0 = always
 * visible) so new stretches can "draw themselves". `style` (the outermost open zone) upgrades the path as the farm
 * develops: dirt → gravel edging → paving → golden brick.
 */
export function pathRibbon(p: PathTable, width: number, center: number, edge: number, y = 0.02, arcOf: (i: number) => number = () => 0, style = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const arc: number[] = [];
  const cc = new THREE.Color(center);
  const ce = new THREE.Color(edge);
  if (style >= 1) ce.lerp(new THREE.Color(0xe8e2d6), 0.35);
  if (style >= 3) {
    cc.lerp(new THREE.Color(0xf6c35a), 0.35);
    ce.lerp(new THREE.Color(0xc98a2b), 0.5);
  }
  const stripe = new THREE.Color(0xfff3c4);
  const half = width / 2;
  const bands: [number, number, number][] = style >= 3
    ? [[-half - 0.14, -half + 0.1, 0], [-half + 0.1, -0.06, 1], [-0.06, 0.06, 2], [0.06, half - 0.1, 1], [half - 0.1, half + 0.14, 0]]
    : [[-half - 0.12, -half + 0.08, 0], [-half + 0.08, half - 0.08, 1], [half - 0.08, half + 0.12, 0]];
  const tmp = new THREE.Color();
  const step = 2; // every other sample keeps the vertex count modest
  for (let i = 0; i < p.n; i += step) {
    const j = (i + step) % p.n;
    const nxi = -p.tz[i];
    const nzi = p.tx[i];
    const nxj = -p.tz[j];
    const nzj = p.tx[j];
    const ai = arcOf(i);
    const aj = arcOf(j);
    for (const [a, b, kind] of bands) {
      const ax = p.x[i] + nxi * a;
      const az = p.z[i] + nzi * a;
      const bx = p.x[i] + nxi * b;
      const bz = p.z[i] + nzi * b;
      const cx = p.x[j] + nxj * a;
      const cz = p.z[j] + nzj * a;
      const dx = p.x[j] + nxj * b;
      const dz = p.z[j] + nzj * b;
      pos.push(ax, y, az, cx, y, cz, bx, y, bz, bx, y, bz, cx, y, cz, dx, y, dz);
      arc.push(ai, aj, ai, ai, aj, aj);
      tmp.copy(kind === 0 ? ce : kind === 2 ? stripe : cc);
      let shade = 0.96 + 0.08 * (((i * 7919) % 13) / 13);
      // Paving: alternating slabs across the path.
      if (style >= 2 && kind === 1) shade *= Math.floor(i / 4) % 2 ? 1.06 : 0.92;
      // Gravel edging: speckled.
      if (style >= 1 && kind === 0) shade *= 0.9 + 0.2 * (((i * 104729) % 7) / 7);
      for (let k = 0; k < 6; k++) col.push(tmp.r * shade, tmp.g * shade, tmp.b * shade);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aArc', new THREE.Float32BufferAttribute(arc, 1));
  // Flat ribbon: every normal points up (cheaper than computeVertexNormals on every route growth).
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

/** The barn, dressed in its biome's depot skin (corrugated iron, thatch, terracotta, red paint …). */
export function barnGeometry(skin: DepotSkin = RED_BARN): THREE.BufferGeometry {
  const roofGeo = new THREE.CylinderGeometry(1.45, 1.45, 3.0, 3, 1);
  const parts: Part[] = [
    { geo: box(2.6, 1.8, 2.6), color: skin.wall, pos: [0, 0.9, 0], jitter: 0.06 },
    { geo: roofGeo, color: skin.roof, pos: [0, 2.1, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.75], jitter: 0.08 },
    // Dark doorway facing +Z (rotated by the view to face the path); the door panels are animated separately.
    { geo: box(1.1, 1.3, 0.06), color: 0x2a1a14, pos: [0, 0.65, 1.3] },
    { geo: box(1.3, 0.1, 0.12), color: skin.trim, pos: [0, 1.35, 1.33] },
    { geo: box(0.1, 1.35, 0.12), color: skin.trim, pos: [0.62, 0.67, 1.33] },
    { geo: box(0.1, 1.35, 0.12), color: skin.trim, pos: [-0.62, 0.67, 1.33] },
    // Hay loft window.
    { geo: box(0.5, 0.45, 0.08), color: skin.loft, pos: [0, 2.0, 1.12] },
    // Silo.
    { geo: cyl(0.55, 0.55, 2.8, 8), color: skin.silo, pos: [1.75, 1.4, -0.6], jitter: 0.05 },
    { geo: cone(0.62, 0.6, 8), color: skin.siloTop, pos: [1.75, 3.1, -0.6] },
  ];
  return build(parts, 0.2, 1.5);
}

export function fencePostGeometry(): THREE.BufferGeometry {
  return build([
    { geo: box(0.14, 0.7, 0.14), color: 0xa0693a, pos: [0, 0.35, 0] },
    { geo: box(2.0, 0.1, 0.06), color: 0xc08552, pos: [1.0, 0.5, 0] },
    { geo: box(2.0, 0.1, 0.06), color: 0xc08552, pos: [1.0, 0.25, 0] },
  ]);
}

/** Chunky "go here" arrow pointing down (shown over the barn when the basket is full). */
export function arrowGeometry(): THREE.BufferGeometry {
  const gold = 0xffd23f;
  return build([
    { geo: cone(0.62, 0.9, 6), color: gold, pos: [0, 0.45, 0], rot: [Math.PI, 0, 0] },
    { geo: cyl(0.24, 0.24, 0.8, 6), color: gold, pos: [0, 1.25, 0] },
  ]);
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

/** One barn door panel (hinge at x = 0, opening towards +x) with the cross brace in the trim colour. */
export function barnDoorGeometry(skin: DepotSkin = RED_BARN): THREE.BufferGeometry {
  return build([
    { geo: box(0.55, 1.28, 0.07), color: skin.door, pos: [0.275, 0.64, 0] },
    { geo: box(0.07, 1.28, 0.09), color: skin.trim, pos: [0.52, 0.64, 0] },
    { geo: box(0.08, 1.35, 0.09), color: skin.trim, pos: [0.275, 0.64, 0.01], rot: [0, 0, 0.42] },
  ]);
}

/** Fence run along +x of length `len` (posts at both ends, two rails). */
export function fenceSegmentGeometry(len: number): THREE.BufferGeometry {
  const posts = Math.max(2, Math.round(len / 1.2) + 1);
  const parts: Part[] = [];
  for (let k = 0; k < posts; k++) parts.push({ geo: box(0.15, 0.78, 0.15), color: 0x9a6334, pos: [(k / (posts - 1)) * len, 0.39, 0], jitter: 0.12 });
  parts.push({ geo: box(len, 0.1, 0.06), color: 0xc98d55, pos: [len / 2, 0.56, 0], jitter: 0.08 });
  parts.push({ geo: box(len, 0.1, 0.06), color: 0xc98d55, pos: [len / 2, 0.28, 0], jitter: 0.08 });
  return build(parts);
}

/** Square ring (plot highlight), outer size `size`, bar width `w`, lying flat. */
export function plotFrameGeometry(size: number, w: number): THREE.BufferGeometry {
  const h = size / 2;
  const parts: Part[] = [
    { geo: box(size, 0.02, w), color: 0xffffff, pos: [0, 0, -h + w / 2] },
    { geo: box(size, 0.02, w), color: 0xffffff, pos: [0, 0, h - w / 2] },
    { geo: box(w, 0.02, size - 2 * w), color: 0xffffff, pos: [-h + w / 2, 0, 0] },
    { geo: box(w, 0.02, size - 2 * w), color: 0xffffff, pos: [h - w / 2, 0, 0] },
  ];
  return build(parts);
}

/** What is left of a destroyed crop until its plot is cleared: cut stalks on a scuffed dirt patch. */
export function stubbleGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [{ geo: cyl(0.26, 0.3, 0.03, 6), color: 0x7a5232, pos: [0, 0.015, 0], jitter: 0.2 }];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    parts.push({ geo: cyl(0.025, 0.035, 0.12 + (k % 3) * 0.04, 3), color: k % 2 ? 0xb9a35a : 0x8a9a3e, pos: [Math.cos(a) * 0.12, 0.07, Math.sin(a) * 0.12], rot: [0.2 * Math.sin(a), 0, 0.2 * Math.cos(a)] });
  }
  return build(parts);
}

/** Depot pad: a painted unloading bay along +x (length `len`, width `w`) with yellow/charcoal hazard edges. */
export function depotPadGeometry(len: number, w: number): THREE.BufferGeometry {
  const parts: Part[] = [{ geo: box(len, 0.02, w), color: 0xf2e3b8, pos: [0, 0.01, 0] }];
  const n = Math.round(len / 0.4);
  for (let k = 0; k < n; k++) {
    const x = -len / 2 + (k + 0.5) * (len / n);
    const c = k % 2 ? 0xffc62e : 0x3a3f4c;
    parts.push({ geo: box(len / n, 0.025, 0.18), color: c, pos: [x, 0.015, -w / 2 + 0.09] });
    parts.push({ geo: box(len / n, 0.025, 0.18), color: c, pos: [x, 0.015, w / 2 - 0.09] });
  }
  return build(parts);
}

/** Chevron arrow pointing +x (painted on the pad; animated by instance colour). */
export function chevronGeometry(): THREE.BufferGeometry {
  return build([
    { geo: box(0.5, 0.02, 0.13), color: 0xffffff, pos: [0, 0, 0.17], rot: [0, 0.75, 0] },
    { geo: box(0.5, 0.02, 0.13), color: 0xffffff, pos: [0, 0, -0.17], rot: [0, -0.75, 0] },
  ]);
}

/** Hopper/chute next to the route: a funnel on legs that takes the cargo (front faces +z, towards the route). */
export function hopperGeometry(): THREE.BufferGeometry {
  const y = 0xffc62e;
  const dark = 0x3a3f4c;
  return build(
    [
      { geo: cyl(0.62, 0.26, 0.62, 8), color: y, pos: [0, 1.05, 0], jitter: 0.06 },
      // Open mouth: a dark hole inside a bright rim.
      { geo: cyl(0.48, 0.48, 0.04, 8), color: 0x2a1f16, pos: [0, 1.37, 0] },
      { geo: cyl(0.66, 0.66, 0.06, 8), color: 0xffe08a, pos: [0, 1.33, 0] },
      { geo: cyl(0.22, 0.22, 0.42, 6), color: dark, pos: [0, 0.58, 0] },
      { geo: box(0.08, 0.8, 0.08), color: dark, pos: [0.42, 0.4, 0.3] },
      { geo: box(0.08, 0.8, 0.08), color: dark, pos: [-0.42, 0.4, 0.3] },
      { geo: box(0.08, 0.8, 0.08), color: dark, pos: [0.42, 0.4, -0.3] },
      { geo: box(0.08, 0.8, 0.08), color: dark, pos: [-0.42, 0.4, -0.3] },
    ],
    0.2,
    1.4,
  );
}

/** Conveyor bed along +z from the hopper to the barn door. */
export function conveyorGeometry(len: number): THREE.BufferGeometry {
  return build([
    { geo: box(0.62, 0.12, len), color: 0x4a505e, pos: [0, 0.34, len / 2] },
    { geo: box(0.07, 0.2, len), color: 0xffc62e, pos: [0.33, 0.4, len / 2] },
    { geo: box(0.07, 0.2, len), color: 0xffc62e, pos: [-0.33, 0.4, len / 2] },
    { geo: box(0.08, 0.34, 0.08), color: 0x3a3f4c, pos: [0.3, 0.17, 0.1] },
    { geo: box(0.08, 0.34, 0.08), color: 0x3a3f4c, pos: [-0.3, 0.17, 0.1] },
  ]);
}

/** Depot sign: post with a round coin board. */
export function depotSignGeometry(): THREE.BufferGeometry {
  return build([
    { geo: box(0.12, 1.7, 0.12), color: 0x8b5a2b, pos: [0, 0.85, 0] },
    { geo: cyl(0.48, 0.48, 0.1, 10), color: 0xffffff, pos: [0, 1.85, 0], rot: [Math.PI / 2, 0, 0] },
    { geo: cyl(0.38, 0.38, 0.12, 10), color: 0xffc62e, pos: [0, 1.85, 0.01], rot: [Math.PI / 2, 0, 0] },
    { geo: box(0.1, 0.36, 0.13), color: 0xd99a00, pos: [0, 1.85, 0.03] },
  ]);
}

/** A little bloom patch: three flowers of different colours (one mesh instead of one per colour), optional clover. */
export function flowerClusterGeometry(colors: readonly number[] = [0xff6fb5, 0xffffff, 0xffd23f], clover = false): THREE.BufferGeometry {
  const parts: Part[] = [];
  if (clover)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      parts.push({ geo: ball(0.1, 0), color: k % 2 ? 0x5fb346 : 0x6cc24a, pos: [-0.3 + Math.cos(a) * 0.13, 0.05, 0.15 + Math.sin(a) * 0.13], scale: [1, 0.45, 1] });
    }
  const spots: [number, number, number][] = [
    [0, 0, 1],
    [0.22, 0.12, 0.85],
    [-0.15, 0.2, 0.75],
  ];
  spots.forEach(([x, z, s], i) => {
    parts.push({ geo: cyl(0.02, 0.02, 0.4 * s, 3), color: 0x4f9e3a, pos: [x, 0.2 * s, z] });
    parts.push({ geo: octa(0.11 * s), color: colors[i % colors.length], pos: [x, 0.42 * s, z], scale: [1.3, 0.55, 1.3] });
    parts.push({ geo: octa(0.05 * s), color: 0xffd23f, pos: [x, 0.46 * s, z] });
  });
  return build(parts);
}
