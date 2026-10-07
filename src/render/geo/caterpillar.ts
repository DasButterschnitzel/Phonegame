import * as THREE from 'three';
import { build, ball, box, cone, cyl, octa, type Part } from './lowpoly.ts';

/** Robot caterpillar head parts (facing +X, origin on the ground). Animated separately by the view. */
export function headParts(): {
  body: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  pupils: THREE.BufferGeometry;
  antenna: THREE.BufferGeometry;
  mandible: THREE.BufferGeometry;
} {
  const shell = 0x7bd33f;
  const metal = 0x9aa5b1;
  const body = build(
    [
      { geo: ball(0.62, 1), color: shell, pos: [0, 0.62, 0], scale: [1.05, 0.95, 1], jitter: 0.08 },
      // Visor band.
      { geo: box(0.3, 0.46, 0.98), color: 0x2b2d42, pos: [0.42, 0.8, 0], rot: [0, 0, -0.15] },
      // Cheeks.
      { geo: ball(0.09, 0), color: 0xff8fa3, pos: [0.6, 0.58, 0.4] },
      { geo: ball(0.09, 0), color: 0xff8fa3, pos: [0.6, 0.58, -0.4] },
      // Smile.
      { geo: box(0.05, 0.05, 0.28), color: 0x2b2d42, pos: [0.66, 0.5, 0], rot: [0, 0, 0.2] },
      // Bolts.
      { geo: cyl(0.08, 0.08, 0.07, 6), color: metal, pos: [0, 0.72, 0.6], rot: [Math.PI / 2, 0, 0] },
      { geo: cyl(0.08, 0.08, 0.07, 6), color: metal, pos: [0, 0.72, -0.6], rot: [Math.PI / 2, 0, 0] },
    ],
    0.2,
    1.0,
  );
  // Eyes are centred on their own origin so the view can blink them by scaling Y.
  const eyes = build([
    { geo: ball(0.21, 1), color: 0xffffff, pos: [0, 0, 0.22] },
    { geo: ball(0.21, 1), color: 0xffffff, pos: [0, 0, -0.22] },
  ]);
  const pupils = build([
    { geo: ball(0.1, 1), color: 0x111111, pos: [0, 0, 0.22] },
    { geo: ball(0.1, 1), color: 0x111111, pos: [0, 0, -0.22] },
    { geo: ball(0.035, 0), color: 0xffffff, pos: [0.06, 0.05, 0.25] },
    { geo: ball(0.035, 0), color: 0xffffff, pos: [0.06, 0.05, -0.19] },
  ]);
  // Antenna pivots at its base (origin).
  const antenna = build([
    { geo: cyl(0.03, 0.035, 0.55, 5), color: 0x333333, pos: [0, 0.27, 0] },
    { geo: ball(0.1, 1), color: 0xffd23f, pos: [0, 0.6, 0] },
  ]);
  // Mandible pivots at its hinge (origin) and points +X.
  const mandible = build([{ geo: cone(0.13, 0.5, 4), color: metal, pos: [0.25, 0, 0], rot: [0, 0, -Math.PI / 2] }]);
  return { body, eyes, pupils, antenna, mandible };
}

/** Collectible flair for higher segment levels (white; tinted per instance). */
export function hornsGeometry(): THREE.BufferGeometry {
  return build([
    { geo: cone(0.09, 0.32, 5), color: 0xffffff, pos: [0.3, 0.98, 0.26], rot: [0.35, 0, -0.5] },
    { geo: cone(0.09, 0.32, 5), color: 0xffffff, pos: [0.3, 0.98, -0.26], rot: [-0.35, 0, -0.5] },
  ]);
}

export function crownGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [{ geo: cyl(0.2, 0.2, 0.1, 8), color: 0xffd23f, pos: [0, 0, 0] }];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push({ geo: cone(0.06, 0.18, 4), color: 0xffd23f, pos: [Math.cos(a) * 0.17, 0.12, Math.sin(a) * 0.17] });
    parts.push({ geo: octa(0.035), color: i % 2 ? 0xff3b5c : 0x3fa7f5, pos: [Math.cos(a) * 0.2, 0.0, Math.sin(a) * 0.2] });
  }
  return build(parts);
}

export function haloGeometry(): THREE.BufferGeometry {
  return build([{ geo: new THREE.TorusGeometry(0.28, 0.04, 4, 14).rotateX(Math.PI / 2), color: 0xfff3a0 }]);
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
