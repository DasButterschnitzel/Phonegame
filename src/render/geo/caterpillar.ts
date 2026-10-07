import * as THREE from 'three';
import { build, ball, box, cone, cyl, type Part } from './lowpoly.ts';

/** Robot caterpillar head, facing +X. */
export function headGeometry(): THREE.BufferGeometry {
  const body = 0x7bd33f;
  const metal = 0x9aa5b1;
  const parts: Part[] = [
    { geo: ball(0.62, 1), color: body, pos: [0, 0.62, 0], scale: [1.05, 0.95, 1], jitter: 0.08 },
    // Visor band.
    { geo: box(0.3, 0.42, 0.95), color: 0x2b2d42, pos: [0.42, 0.78, 0], rot: [0, 0, -0.15] },
    // Eyes.
    { geo: ball(0.2, 1), color: 0xffffff, pos: [0.55, 0.86, 0.22] },
    { geo: ball(0.2, 1), color: 0xffffff, pos: [0.55, 0.86, -0.22] },
    { geo: ball(0.09, 0), color: 0x111111, pos: [0.72, 0.86, 0.22] },
    { geo: ball(0.09, 0), color: 0x111111, pos: [0.72, 0.86, -0.22] },
    // Cheeks.
    { geo: ball(0.08, 0), color: 0xff8fa3, pos: [0.6, 0.6, 0.38] },
    { geo: ball(0.08, 0), color: 0xff8fa3, pos: [0.6, 0.6, -0.38] },
    // Antennae.
    { geo: cyl(0.025, 0.025, 0.5, 4), color: 0x333333, pos: [0.05, 1.38, 0.2], rot: [0.35, 0, -0.2] },
    { geo: cyl(0.025, 0.025, 0.5, 4), color: 0x333333, pos: [0.05, 1.38, -0.2], rot: [-0.35, 0, -0.2] },
    { geo: ball(0.08, 0), color: 0xffd23f, pos: [0.1, 1.62, 0.3] },
    { geo: ball(0.08, 0), color: 0xffd23f, pos: [0.1, 1.62, -0.3] },
    // Mandible chompers.
    { geo: cone(0.12, 0.45, 4), color: metal, pos: [0.78, 0.35, 0.26], rot: [0, 0, -Math.PI / 2 - 0.2] },
    { geo: cone(0.12, 0.45, 4), color: metal, pos: [0.78, 0.35, -0.26], rot: [0, 0, -Math.PI / 2 - 0.2] },
    // Bolts.
    { geo: cyl(0.07, 0.07, 0.06, 6), color: metal, pos: [0, 0.7, 0.6], rot: [Math.PI / 2, 0, 0] },
    { geo: cyl(0.07, 0.07, 0.06, 6), color: metal, pos: [0, 0.7, -0.6], rot: [Math.PI / 2, 0, 0] },
  ];
  return build(parts, 0.2, 1.0);
}

/** Body segment in white (tinted per level via instanceColor), with a basket tray on top. */
export function segmentGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: ball(0.5, 1), color: 0xffffff, pos: [0, 0.5, 0], scale: [1.05, 0.85, 1], jitter: 0.08 },
    // Belly band (stays neutral-ish because it multiplies the tint).
    { geo: cyl(0.52, 0.52, 0.14, 10), color: 0xd8d8d8, pos: [0, 0.42, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.92] },
  ];
  return build(parts, 0.25, 0.9);
}

/** Basket tray + rim (not tinted). */
export function trayGeometry(): THREE.BufferGeometry {
  return build([
    { geo: box(0.66, 0.06, 0.62), color: 0x8b5a2b, pos: [0, 0.95, 0] },
    { geo: box(0.7, 0.12, 0.06), color: 0xa0693a, pos: [0, 1.0, 0.32] },
    { geo: box(0.7, 0.12, 0.06), color: 0xa0693a, pos: [0, 1.0, -0.32] },
  ]);
}

/** Circular saw/chomper blade lying in the XY plane (spins around Z). */
export function bladeGeometry(): THREE.BufferGeometry {
  const teeth: Part[] = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return {
      geo: cone(0.07, 0.16, 3),
      color: 0xdfe6ee,
      pos: [Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0] as [number, number, number],
      rot: [0, 0, a - Math.PI / 2] as [number, number, number],
    };
  });
  return build([
    { geo: cyl(0.3, 0.3, 0.06, 10), color: 0xb8c4cf, rot: [Math.PI / 2, 0, 0] },
    { geo: cyl(0.1, 0.1, 0.09, 6), color: 0x5c6670, rot: [Math.PI / 2, 0, 0] },
    ...teeth,
  ]);
}

export function legGeometry(): THREE.BufferGeometry {
  return build([{ geo: ball(0.11, 0), color: 0x3a3f47, pos: [0, 0.1, 0], scale: [1.2, 1, 1] }]);
}

/** A loot block (one chunk) — white so instanceColor gives the crop colour. */
export function blockGeometry(): THREE.BufferGeometry {
  return build([{ geo: box(0.3, 0.2, 0.3), color: 0xffffff, jitter: 0.06 }], 0.25, 0.2);
}
