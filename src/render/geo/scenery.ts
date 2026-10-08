import * as THREE from 'three';
import type { LandmarkKind, PropKind, RockKind, TreeKind } from '../palette.ts';
import { build, ball, box, cone, cyl, dodeca, lathe, octa, type Part } from './lowpoly.ts';

/**
 * Biome scenery: trees, rocks, props and landmarks, built from low-poly parts. Each biome family picks its own set
 * (render/palette.ts), so places differ in silhouette, not only in colour.
 */

export function treeGeometry(kind: TreeKind): THREE.BufferGeometry {
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
    case 'baobab': {
      // A bottle-shaped trunk with stubby branches and sparse little crowns.
      const parts: Part[] = [
        { geo: lathe([[0, 0], [0.62, 0], [0.68, 0.45], [0.6, 1.2], [0.42, 1.85], [0, 1.95]], 7), color: 0x9c8a78, jitter: 0.1 },
      ];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.3;
        const x = Math.cos(a) * 0.38;
        const z = Math.sin(a) * 0.38;
        parts.push({ geo: cyl(0.06, 0.1, 0.7, 4), color: 0x8f7d6c, pos: [x, 2.1, z], rot: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7] });
        parts.push({ geo: octa(0.34), color: i % 2 ? 0x6f9a3a : 0x5f8f3a, pos: [x * 1.9, 2.45, z * 1.9], scale: [1.3, 0.6, 1.3], jitter: 0.2 });
      }
      return build(parts, 0.3, 1.6);
    }
    case 'acacia':
      // Thin forked trunk under a flat umbrella crown.
      return build([
        { geo: cyl(0.08, 0.13, 1.5, 5), color: 0x5a4030, pos: [0.08, 0.75, 0], rot: [0, 0, -0.1] },
        { geo: cyl(0.05, 0.07, 0.8, 5), color: 0x5a4030, pos: [-0.25, 1.6, 0.05], rot: [0, 0, 0.6] },
        { geo: cyl(0.05, 0.07, 0.8, 5), color: 0x5a4030, pos: [0.42, 1.6, -0.05], rot: [0, 0, -0.55] },
        { geo: cyl(1.35, 1.1, 0.32, 9), color: 0x5a8a3a, pos: [0, 2.05, 0], jitter: 0.18 },
        { geo: cyl(0.85, 0.75, 0.22, 8), color: 0x6a9a44, pos: [0.3, 2.28, 0.2], jitter: 0.18 },
      ], 0.3, 1.8);
    case 'bamboo': {
      // A clump of tall poles with leaves near the tops.
      const parts: Part[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const r = 0.12 + (i % 3) * 0.08;
        const h = 2.4 + ((i * 37) % 7) * 0.12;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        parts.push({ geo: cyl(0.045, 0.055, h, 4), color: i % 2 ? 0x7cb342 : 0x8bc34a, pos: [x, h / 2, z], rot: [Math.sin(a) * 0.06, 0, -Math.cos(a) * 0.06] });
        parts.push({ geo: cone(0.09, 0.6, 3), color: 0x9ccc65, pos: [x + Math.cos(a) * 0.22, h - 0.3, z + Math.sin(a) * 0.22], rot: [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1], jitter: 0.2 });
      }
      return build(parts, 0.25, 2.2);
    }
    case 'broadleaf':
      // A wide, low, deep-green crown on a stout trunk.
      return build([
        { geo: cyl(0.18, 0.26, 1.0, 6), color: 0x5e4630, pos: [0, 0.5, 0] },
        { geo: dodeca(1.0), color: 0x2e7d4a, pos: [0, 1.55, 0], scale: [1.45, 0.72, 1.45], jitter: 0.18 },
        { geo: dodeca(0.62), color: 0x3a9a5a, pos: [0.75, 1.75, 0.2], scale: [1.2, 0.8, 1.2], jitter: 0.18 },
        { geo: dodeca(0.55), color: 0x24704a, pos: [-0.7, 1.7, -0.25], scale: [1.2, 0.8, 1.2], jitter: 0.18 },
      ], 0.3, 1.6);
    case 'cypress':
      // A tall dark flame.
      return build([
        { geo: cyl(0.08, 0.1, 0.4, 5), color: 0x5e4630, pos: [0, 0.2, 0] },
        { geo: lathe([[0, 0.3], [0.38, 0.6], [0.42, 1.2], [0.34, 2.0], [0.18, 2.8], [0, 3.25]], 7), color: 0x2f5a3a, jitter: 0.15 },
      ], 0.3, 2.4);
    case 'stonepine':
      // Umbrella pine: a bare trunk and a broad flat crown high up.
      return build([
        { geo: cyl(0.11, 0.16, 2.3, 6), color: 0x7a5a40, pos: [0, 1.15, 0], rot: [0, 0, 0.06] },
        { geo: cyl(0.05, 0.07, 0.7, 5), color: 0x7a5a40, pos: [0.3, 2.2, 0], rot: [0, 0, -0.8] },
        { geo: cyl(1.45, 1.2, 0.4, 9), color: 0x3e6b3a, pos: [0.15, 2.55, 0], jitter: 0.16 },
        { geo: dodeca(0.8), color: 0x4a7a44, pos: [0.1, 2.75, 0.1], scale: [1.4, 0.4, 1.4], jitter: 0.16 },
      ], 0.3, 2.4);
    case 'palm': {
      // A leaning trunk under a crown of long fronds, two coconuts.
      const parts: Part[] = [];
      for (let k = 0; k < 3; k++) parts.push({ geo: cyl(0.1, 0.14, 0.95, 4), color: k % 2 ? 0x9a7a52 : 0x8a6c48, pos: [0.06 + k * k * 0.06, 0.48 + k * 0.85, 0], rot: [0, 0, -0.06 - k * 0.09] });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push({ geo: cone(0.17, 1.35, 4), color: i % 2 ? 0x3faa4a : 0x52bb55, pos: [0.38 + Math.cos(a) * 0.55, 2.62, Math.sin(a) * 0.55], rot: [Math.sin(a) * 1.35, 0, -Math.cos(a) * 1.35], scale: [1.5, 1, 0.35], jitter: 0.15 });
      }
      parts.push({ geo: octa(0.13), color: 0x6a4a2a, pos: [0.42, 2.45, 0.1] }, { geo: octa(0.12), color: 0x7a5a32, pos: [0.3, 2.42, -0.1] });
      return build(parts, 0.25, 2.2);
    }
    case 'fern': {
      // Tree fern: a shaggy trunk under arching fronds.
      const parts: Part[] = [{ geo: cyl(0.1, 0.14, 1.3, 5), color: 0x5a4a3a, pos: [0, 0.65, 0], jitter: 0.1 }];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        parts.push({ geo: cone(0.13, 1.05, 3), color: i % 2 ? 0x3e9a48 : 0x4fae52, pos: [Math.cos(a) * 0.45, 1.42, Math.sin(a) * 0.45], rot: [Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15], scale: [1.6, 1, 0.4], jitter: 0.15 });
      }
      parts.push({ geo: octa(0.16), color: 0x6fbf5a, pos: [0, 1.4, 0] });
      return build(parts, 0.25, 1.5);
    }
    case 'fir':
      // A full, dark fir (no snow on it).
      return build([
        { geo: cyl(0.1, 0.14, 0.5, 5), color: 0x5e4630, pos: [0, 0.25, 0] },
        { geo: cone(0.95, 1.4, 7), color: 0x1f5f3a, pos: [0, 1.05, 0], jitter: 0.12 },
        { geo: cone(0.75, 1.2, 7), color: 0x2a6e44, pos: [0, 1.75, 0], jitter: 0.12 },
        { geo: cone(0.48, 0.95, 7), color: 0x347a4c, pos: [0, 2.4, 0], jitter: 0.12 },
      ], 0.3, 1.8);
    case 'sakura':
      // Cherry blossom: a dark trunk and clouds of pink.
      return build([
        { geo: cyl(0.12, 0.18, 1.1, 5), color: 0x4a3530, pos: [0, 0.55, 0], rot: [0, 0, 0.1] },
        { geo: cyl(0.06, 0.09, 0.8, 4), color: 0x4a3530, pos: [0.35, 1.2, 0.05], rot: [0, 0, -0.8] },
        { geo: dodeca(0.8), color: 0xffb7d0, pos: [0.05, 1.65, 0], scale: [1.3, 0.85, 1.25], jitter: 0.12 },
        { geo: dodeca(0.55), color: 0xffc8dc, pos: [0.75, 1.55, 0.2], jitter: 0.12 },
        { geo: dodeca(0.5), color: 0xf7a8c4, pos: [-0.6, 1.7, -0.25], jitter: 0.12 },
      ], 0.25, 1.6);
    case 'blackpine':
      // Garden pine: a twisted trunk with flat cloud-pads of needles.
      return build([
        { geo: cyl(0.1, 0.15, 1.0, 4), color: 0x5a4636, pos: [0.1, 0.5, 0], rot: [0, 0, -0.25] },
        { geo: cyl(0.07, 0.1, 0.9, 4), color: 0x5a4636, pos: [0.15, 1.3, 0.05], rot: [0.2, 0, 0.45] },
        { geo: cyl(0.8, 0.7, 0.28, 7), color: 0x2f5a3a, pos: [-0.1, 1.85, 0.1], jitter: 0.12 },
        { geo: cyl(0.6, 0.5, 0.24, 7), color: 0x386a44, pos: [0.55, 1.3, -0.15], jitter: 0.12 },
        { geo: cyl(0.45, 0.4, 0.22, 7), color: 0x2a5236, pos: [-0.25, 2.3, -0.1], jitter: 0.12 },
      ], 0.25, 1.8);
    case 'polylepis':
      // Queñua: a crooked red-barked trunk, small grey-green crowns.
      return build([
        { geo: cyl(0.09, 0.14, 0.9, 4), color: 0xa0523a, pos: [0, 0.45, 0], rot: [0, 0, 0.2] },
        { geo: cyl(0.07, 0.09, 0.8, 4), color: 0xb0603e, pos: [-0.15, 1.15, 0], rot: [0.1, 0, -0.4] },
        { geo: dodeca(0.45), color: 0x7a8f62, pos: [-0.3, 1.6, 0], scale: [1.3, 0.8, 1.2], jitter: 0.15 },
        { geo: octa(0.38), color: 0x8a9e70, pos: [0.25, 1.2, 0.15], scale: [1.3, 0.7, 1.2], jitter: 0.15 },
        { geo: octa(0.32), color: 0x6f8458, pos: [0.1, 1.85, -0.2], scale: [1.3, 0.7, 1.2], jitter: 0.15 },
      ], 0.25, 1.3);
    case 'puya': {
      // Andean giant bromeliad: a spiky silver rosette with a towering flower spike.
      const parts: Part[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        parts.push({ geo: cone(0.08, 0.8, 3), color: i % 2 ? 0x8a9a6a : 0x9aaa78, pos: [Math.cos(a) * 0.3, 0.32, Math.sin(a) * 0.3], rot: [Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0] });
      }
      parts.push({ geo: cyl(0.12, 0.22, 2.4, 6), color: 0xb8c070, pos: [0, 1.6, 0], jitter: 0.12 }, { geo: cone(0.12, 0.45, 6), color: 0xd0d488, pos: [0, 3.0, 0] });
      return build(parts, 0.2, 1.5);
    }
    case 'whitebirch':
      // Birch with a white trunk, black marks and a light green crown.
      return build([
        { geo: cyl(0.11, 0.15, 1.6, 5), color: 0xf0f0ea, pos: [0, 0.8, 0] },
        { geo: box(0.1, 0.05, 0.3), color: 0x2a2a2a, pos: [0.06, 0.5, 0] },
        { geo: box(0.1, 0.05, 0.25), color: 0x2a2a2a, pos: [-0.05, 0.95, 0.04] },
        { geo: box(0.1, 0.04, 0.22), color: 0x2a2a2a, pos: [0.05, 1.35, -0.03] },
        { geo: dodeca(0.7), color: 0x7cc25a, pos: [0, 2.0, 0], scale: [1, 1.15, 1], jitter: 0.18 },
        { geo: dodeca(0.45), color: 0x8fd06a, pos: [0.3, 2.45, 0.1], jitter: 0.18 },
      ], 0.25, 1.6);
    case 'spruce':
      // A tall, narrow, dark spruce.
      return build([
        { geo: cyl(0.08, 0.11, 0.5, 4), color: 0x4e3a28, pos: [0, 0.25, 0] },
        { geo: cone(0.7, 1.4, 6), color: 0x1a4a30, pos: [0, 1.05, 0], jitter: 0.12 },
        { geo: cone(0.55, 1.3, 6), color: 0x1f5636, pos: [0, 1.85, 0], jitter: 0.12 },
        { geo: cone(0.36, 1.1, 6), color: 0x26603e, pos: [0, 2.6, 0], jitter: 0.12 },
      ], 0.3, 2.2);
    case 'plane':
      // Plane tree: a mottled trunk and a broad round crown.
      return build([
        { geo: cyl(0.16, 0.22, 1.4, 5), color: 0xb8ad8a, pos: [0, 0.7, 0] },
        { geo: box(0.2, 0.25, 0.05), color: 0x8a8068, pos: [0.12, 0.6, 0.12], rot: [0, 0.6, 0] },
        { geo: dodeca(1.0), color: 0x5a9a3a, pos: [0, 2.0, 0], scale: [1.25, 0.85, 1.25], jitter: 0.16 },
        { geo: dodeca(0.6), color: 0x6aaa46, pos: [0.6, 2.35, 0.2], jitter: 0.16 },
      ], 0.3, 1.8);
    case 'willow': {
      // Weeping willow: curtains of drooping green.
      const parts: Part[] = [
        { geo: cyl(0.14, 0.2, 1.4, 5), color: 0x5a4a3a, pos: [0, 0.7, 0] },
        { geo: dodeca(0.75), color: 0x5a8a4a, pos: [0, 1.9, 0], scale: [1.2, 0.7, 1.2], jitter: 0.15 },
      ];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push({ geo: cone(0.32, 1.5, 4), color: i % 2 ? 0x4f7f42 : 0x5f9050, pos: [Math.cos(a) * 0.62, 1.15, Math.sin(a) * 0.62], rot: [Math.PI, a, 0], scale: [1, 1, 0.45], jitter: 0.15 });
      }
      return build(parts, 0.25, 1.6);
    }
    case 'deadtree':
      // A bare, twisted marsh tree.
      return build([
        { geo: cyl(0.1, 0.18, 1.6, 5), color: 0x5a5048, pos: [0, 0.8, 0], rot: [0, 0, 0.12] },
        { geo: cyl(0.05, 0.08, 0.9, 4), color: 0x5a5048, pos: [0.35, 1.5, 0], rot: [0, 0, -0.9] },
        { geo: cyl(0.04, 0.07, 0.8, 4), color: 0x5a5048, pos: [-0.3, 1.7, 0.1], rot: [0.3, 0, 0.8] },
        { geo: cyl(0.03, 0.05, 0.6, 4), color: 0x5a5048, pos: [0.1, 2.0, -0.25], rot: [-0.7, 0, 0.1] },
        { geo: octa(0.18), color: 0x6a8a5a, pos: [0.7, 1.75, 0], scale: [1.3, 0.5, 1.3] },
      ], 0.3, 1.6);
    case 'charred':
      // A burnt tree on the volcano's slope, a few red leaves left.
      return build([
        { geo: cyl(0.09, 0.15, 1.5, 5), color: 0x2a2422, pos: [0, 0.75, 0], rot: [0, 0, -0.1] },
        { geo: cyl(0.05, 0.07, 0.8, 4), color: 0x2a2422, pos: [-0.3, 1.45, 0], rot: [0, 0, 0.8] },
        { geo: cyl(0.04, 0.06, 0.7, 4), color: 0x2a2422, pos: [0.28, 1.6, 0.1], rot: [0.2, 0, -0.7] },
        { geo: octa(0.16), color: 0xc8402a, pos: [-0.6, 1.75, 0], scale: [1.3, 0.6, 1.3] },
        { geo: octa(0.13), color: 0xe0602a, pos: [0.55, 1.88, 0.15], scale: [1.3, 0.6, 1.3] },
      ], 0.3, 1.5);
    case 'giantflower':
      // A daisy as tall as a house.
      return build([
        { geo: cyl(0.12, 0.16, 3.4, 5), color: 0x5aa83a, pos: [0, 1.7, 0] },
        { geo: cone(0.3, 1.1, 4), color: 0x4f9a36, pos: [0.4, 1.2, 0], rot: [0, 0, -1.0], scale: [1.6, 1, 0.3] },
        { geo: cyl(1.05, 1.05, 0.12, 10), color: 0xffffff, pos: [0, 3.45, 0.1], rot: [1.15, 0, 0], jitter: 0.06 },
        { geo: cyl(0.42, 0.42, 0.2, 8), color: 0xffc83a, pos: [0, 3.5, 0.18], rot: [1.15, 0, 0] },
      ], 0.25, 2.5);
    case 'grassblade': {
      // Blades of grass towering like trees.
      const parts: Part[] = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const h = 2.6 + (i % 2) * 0.9;
        parts.push({ geo: cone(0.22, h, 3), color: i % 2 ? 0x4fae3a : 0x5fbe46, pos: [Math.cos(a) * 0.25, h / 2, Math.sin(a) * 0.25], rot: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], scale: [1, 1, 0.35], jitter: 0.12 });
      }
      return build(parts, 0.2, 2.5);
    }
    case 'dome':
      // A glass habitat dome on the regolith (green inside).
      return build([
        { geo: cyl(1.1, 1.15, 0.2, 10), color: 0xd8d8e0, pos: [0, 0.1, 0] },
        { geo: lathe([[1.1, 0], [1.05, 0.35], [0.85, 0.75], [0.55, 1.0], [0, 1.1]], 10), color: 0xbfe8ff, pos: [0, 0.2, 0], jitter: 0.04 },
        { geo: dodeca(0.45), color: 0x5aaa5a, pos: [0, 0.55, 0], scale: [1.3, 0.8, 1.3] },
      ], 0.15, 1.2);
    case 'dish':
      // A satellite dish on a tripod.
      return build([
        { geo: cyl(0.06, 0.08, 1.2, 4), color: 0x9a9aa8, pos: [0, 0.6, 0] },
        { geo: lathe([[0, 0], [0.45, 0.06], [0.8, 0.28], [0.9, 0.36]], 10), color: 0xe8e8f0, pos: [0, 1.25, 0.1], rot: [-0.7, 0, 0] },
        { geo: cyl(0.03, 0.03, 0.6, 4), color: 0x7a7a88, pos: [0, 1.55, 0.35], rot: [-0.7, 0, 0] },
      ], 0.15, 1.2);
  }
}

export function rockGeometry(kind: RockKind = 'stone'): THREE.BufferGeometry {
  switch (kind) {
    case 'stone':
      return build([
        { geo: dodeca(0.45), color: 0x9aa0a6, pos: [0, 0.2, 0], scale: [1.2, 0.7, 1], jitter: 0.2 },
        { geo: dodeca(0.25), color: 0xb0b6bc, pos: [0.4, 0.12, 0.2], jitter: 0.2 },
      ]);
    case 'granite':
      // Rounded, stacked boulders (a little kopje).
      return build([
        { geo: dodeca(0.5), color: 0xb8a090, pos: [0, 0.3, 0], scale: [1.25, 0.75, 1.05], jitter: 0.14 },
        { geo: dodeca(0.32), color: 0xc4ae9c, pos: [0.15, 0.72, 0.05], scale: [1.1, 0.85, 1], jitter: 0.14 },
        { geo: ball(0.24, 0), color: 0xa89080, pos: [0.55, 0.14, 0.25], jitter: 0.14 },
      ]);
    case 'mossy':
      return build([
        { geo: dodeca(0.45), color: 0x8a958a, pos: [0, 0.2, 0], scale: [1.2, 0.7, 1], jitter: 0.18 },
        { geo: dodeca(0.36), color: 0x5a9a4a, pos: [-0.05, 0.42, 0.02], scale: [1.25, 0.3, 1.05], jitter: 0.2 },
        { geo: dodeca(0.24), color: 0x7f8a80, pos: [0.42, 0.12, 0.22], jitter: 0.18 },
      ]);
    case 'sandstone':
      // Layered red-orange slabs (a little mesa).
      return build([
        { geo: box(0.85, 0.3, 0.7), color: 0xc8703f, pos: [0, 0.15, 0], rot: [0, 0.2, 0], jitter: 0.08 },
        { geo: box(0.65, 0.26, 0.55), color: 0xd98a50, pos: [0.05, 0.43, 0.02], rot: [0, 0.35, 0], jitter: 0.08 },
        { geo: box(0.42, 0.22, 0.38), color: 0xb95f35, pos: [0.08, 0.67, 0], rot: [0, 0.1, 0], jitter: 0.08 },
      ]);
    case 'basalt':
      // Black hexagonal columns.
      return build([
        { geo: cyl(0.26, 0.28, 0.8, 6), color: 0x3a3a40, pos: [0, 0.4, 0], jitter: 0.1 },
        { geo: cyl(0.22, 0.24, 0.55, 6), color: 0x2e2e34, pos: [0.42, 0.28, 0.12], jitter: 0.1 },
        { geo: cyl(0.2, 0.22, 0.35, 6), color: 0x45454c, pos: [-0.3, 0.18, 0.3], jitter: 0.1 },
      ]);
    case 'ice':
      // Frosted blue blocks.
      return build([
        { geo: box(0.6, 0.45, 0.5), color: 0xc8e8ff, pos: [0, 0.22, 0], rot: [0.05, 0.4, 0.08], jitter: 0.08 },
        { geo: box(0.4, 0.35, 0.36), color: 0xb0d8f8, pos: [0.45, 0.17, 0.2], rot: [0, -0.3, 0], jitter: 0.08 },
        { geo: octa(0.22), color: 0xe4f4ff, pos: [-0.1, 0.55, 0.05] },
      ]);
    case 'pebble':
      // Smooth river stones.
      return build([
        { geo: ball(0.32, 0), color: 0x9aa0a0, pos: [0, 0.14, 0], scale: [1.4, 0.55, 1.1], jitter: 0.08 },
        { geo: ball(0.22, 0), color: 0xb4b8b4, pos: [0.42, 0.1, 0.18], scale: [1.3, 0.6, 1.1], jitter: 0.08 },
        { geo: ball(0.18, 0), color: 0x868c8c, pos: [-0.3, 0.08, 0.3], scale: [1.3, 0.6, 1], jitter: 0.08 },
      ]);
    case 'slate':
      // Dark slabs stacked flat.
      return build([
        { geo: box(0.8, 0.18, 0.6), color: 0x5a6068, pos: [0, 0.09, 0], rot: [0, 0.3, 0], jitter: 0.08 },
        { geo: box(0.6, 0.16, 0.5), color: 0x4e545c, pos: [0.05, 0.26, 0.02], rot: [0, -0.2, 0.04], jitter: 0.08 },
        { geo: box(0.4, 0.14, 0.35), color: 0x666c74, pos: [-0.02, 0.41, 0], rot: [0, 0.6, 0], jitter: 0.08 },
      ]);
    case 'regolith':
      // Pale, porous moon rocks.
      return build([
        { geo: dodeca(0.42), color: 0xb0b0b8, pos: [0, 0.2, 0], scale: [1.25, 0.65, 1], jitter: 0.22 },
        { geo: dodeca(0.24), color: 0x9a9aa4, pos: [0.42, 0.12, 0.2], jitter: 0.22 },
      ]);
    case 'limestone':
      // Pale angular blocks.
      return build([
        { geo: box(0.7, 0.42, 0.55), color: 0xe2d6b8, pos: [0, 0.21, 0], rot: [0, 0.3, 0.05], jitter: 0.1 },
        { geo: box(0.42, 0.3, 0.38), color: 0xd6c9a8, pos: [0.48, 0.15, 0.22], rot: [0, -0.4, 0], jitter: 0.1 },
        { geo: box(0.3, 0.22, 0.3), color: 0xeadfc4, pos: [0.05, 0.53, 0.02], rot: [0.1, 0.8, 0], jitter: 0.1 },
      ]);
  }
}

export function propGeometry(kind: PropKind): THREE.BufferGeometry {
  switch (kind) {
    case 'snowman':
      return build(
        [
          { geo: ball(0.6, 1), color: 0xffffff, pos: [0, 0.55, 0] },
          { geo: ball(0.42, 1), color: 0xffffff, pos: [0, 1.35, 0] },
          { geo: ball(0.3, 1), color: 0xffffff, pos: [0, 1.95, 0] },
          { geo: cone(0.07, 0.35, 4), color: 0xff8c2b, pos: [0, 1.95, 0.42], rot: [Math.PI / 2, 0, 0] },
          { geo: cyl(0.32, 0.32, 0.06, 8), color: 0x2b2d42, pos: [0, 2.2, 0] },
          { geo: cyl(0.2, 0.22, 0.35, 8), color: 0x2b2d42, pos: [0, 2.4, 0] },
          { geo: box(0.9, 0.12, 0.12), color: 0xd64545, pos: [0, 1.68, 0], rot: [0, 0.3, 0] },
        ],
        0.15,
        2,
      );
    case 'termite':
      // Red-earth mound with a second, smaller spire.
      return build([
        { geo: lathe([[0, 0], [0.5, 0], [0.44, 0.45], [0.27, 1.15], [0.12, 1.7], [0, 1.82]], 7), color: 0xb5653a, jitter: 0.14 },
        { geo: lathe([[0, 0], [0.3, 0], [0.24, 0.4], [0.1, 0.95], [0, 1.02]], 6), color: 0xa95d35, pos: [0.42, 0, 0.15], jitter: 0.14 },
      ], 0.25, 1.4);
    case 'tallgrass':
      return build(
        Array.from({ length: 6 }, (_, i): Part => {
          const a = (i / 6) * Math.PI * 2;
          return { geo: cone(0.05, 0.85, 3), color: i % 2 ? 0xd8b85a : 0xc9a94a, pos: [Math.cos(a) * 0.08, 0.42, Math.sin(a) * 0.08], rot: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] };
        }),
      );
    case 'stonewall': {
      // A short run of dry-stone wall with moss.
      const parts: Part[] = [];
      for (let i = 0; i < 6; i++) {
        const x = -1.2 + i * 0.48;
        parts.push({ geo: box(0.5, 0.3, 0.42), color: i % 2 ? 0x9a9a8a : 0xb0ab9a, pos: [x, 0.15, 0], rot: [0, (i % 3) * 0.08, 0], jitter: 0.12 });
        if (i % 2 === 0) parts.push({ geo: box(0.42, 0.24, 0.36), color: 0xa8a294, pos: [x + 0.22, 0.42, 0.02], rot: [0, 0.1, 0], jitter: 0.12 });
      }
      parts.push({ geo: dodeca(0.16), color: 0x6a9a4a, pos: [-0.5, 0.32, 0.18], scale: [1.4, 0.4, 1] });
      parts.push({ geo: dodeca(0.14), color: 0x6a9a4a, pos: [0.7, 0.3, -0.16], scale: [1.4, 0.4, 1] });
      return build(parts);
    }
    case 'haybale':
      return build([
        { geo: cyl(0.52, 0.52, 0.85, 10), color: 0xe0c068, pos: [0, 0.52, 0], rot: [0, 0, Math.PI / 2], jitter: 0.1 },
        { geo: cyl(0.4, 0.4, 0.87, 10), color: 0xc9a54a, pos: [0, 0.52, 0], rot: [0, 0, Math.PI / 2] },
      ]);
    case 'urn':
      // A terracotta pot with a little shrub.
      return build([
        { geo: lathe([[0, 0], [0.22, 0], [0.33, 0.3], [0.27, 0.6], [0.2, 0.68], [0.25, 0.74], [0, 0.74]], 8), color: 0xc8643a, jitter: 0.1 },
        { geo: dodeca(0.26), color: 0x6a9a4a, pos: [0, 0.92, 0], jitter: 0.2 },
        { geo: octa(0.06), color: 0xffd23f, pos: [0.15, 1.05, 0.1] },
        { geo: octa(0.06), color: 0xffd23f, pos: [-0.12, 0.98, -0.12] },
      ]);
    case 'sheep':
      // A woolly sheep grazing.
      return build([
        { geo: dodeca(0.38), color: 0xf6f3ea, pos: [0, 0.5, 0], scale: [1.35, 0.95, 1], jitter: 0.08 },
        { geo: dodeca(0.26), color: 0xfbf9f2, pos: [0.25, 0.68, 0.05], jitter: 0.08 },
        { geo: ball(0.18, 0), color: 0x3a3a3a, pos: [0.6, 0.5, 0], scale: [1.2, 1, 0.9] },
        { geo: box(0.12, 0.05, 0.2), color: 0x3a3a3a, pos: [0.55, 0.6, 0], rot: [0.4, 0, 0] },
        ...[
          [-0.28, -0.14],
          [-0.28, 0.14],
          [0.28, -0.14],
          [0.28, 0.14],
        ].map(([x, z]): Part => ({ geo: box(0.08, 0.32, 0.08), color: 0x3a3a3a, pos: [x, 0.16, z] })),
      ]);
    case 'scarecrow':
      return build([
        { geo: box(0.08, 1.5, 0.08), color: 0x8b5a2b, pos: [0, 0.75, 0] },
        { geo: box(1.1, 0.07, 0.07), color: 0x8b5a2b, pos: [0, 1.15, 0] },
        { geo: box(0.46, 0.55, 0.26), color: 0x4f7cac, pos: [0, 1.05, 0], jitter: 0.1 },
        { geo: box(0.3, 0.12, 0.2), color: 0xd64545, pos: [0.38, 1.15, 0] },
        { geo: box(0.3, 0.12, 0.2), color: 0xd64545, pos: [-0.38, 1.15, 0] },
        { geo: ball(0.2, 0), color: 0xf2d16b, pos: [0, 1.5, 0] },
        { geo: cyl(0.34, 0.34, 0.05, 8), color: 0xc9a43c, pos: [0, 1.66, 0] },
        { geo: cyl(0.16, 0.2, 0.2, 8), color: 0xc9a43c, pos: [0, 1.76, 0] },
      ], 0.2, 1.5);
    case 'beehive':
      // A stacked wooden hive on a stand.
      return build([
        { geo: box(0.08, 0.3, 0.08), color: 0x6b4a2e, pos: [-0.2, 0.15, -0.15] },
        { geo: box(0.08, 0.3, 0.08), color: 0x6b4a2e, pos: [0.2, 0.15, -0.15] },
        { geo: box(0.08, 0.3, 0.08), color: 0x6b4a2e, pos: [-0.2, 0.15, 0.15] },
        { geo: box(0.08, 0.3, 0.08), color: 0x6b4a2e, pos: [0.2, 0.15, 0.15] },
        { geo: box(0.55, 0.28, 0.48), color: 0xf2c14e, pos: [0, 0.44, 0], jitter: 0.06 },
        { geo: box(0.55, 0.28, 0.48), color: 0xffd76a, pos: [0, 0.72, 0], jitter: 0.06 },
        { geo: box(0.64, 0.08, 0.56), color: 0xffffff, pos: [0, 0.9, 0] },
        { geo: box(0.16, 0.05, 0.02), color: 0x3a2a1a, pos: [0, 0.34, 0.25] },
      ]);
    case 'hibiscus':
      return build([
        { geo: dodeca(0.36), color: 0x2f8a3a, pos: [0, 0.34, 0], scale: [1.2, 0.9, 1.2], jitter: 0.15 },
        ...[0, 1, 2, 3].map((i): Part => ({ geo: octa(0.11), color: i % 2 ? 0xff3b5c : 0xff6b3a, pos: [Math.cos(i * 1.6) * 0.32, 0.45 + (i % 2) * 0.12, Math.sin(i * 1.6) * 0.32], scale: [1.3, 0.5, 1.3] })),
      ]);
    case 'fruitcrate':
      return build([
        { geo: box(0.62, 0.34, 0.46), color: 0xb5895a, pos: [0, 0.17, 0], jitter: 0.08 },
        { geo: box(0.62, 0.34, 0.46), color: 0xa57a4a, pos: [0.05, 0.51, 0.02], rot: [0, 0.15, 0], jitter: 0.08 },
        { geo: octa(0.11), color: 0xffd23f, pos: [-0.1, 0.72, 0] },
        { geo: octa(0.11), color: 0xff9a2e, pos: [0.12, 0.72, 0.08] },
        { geo: octa(0.1), color: 0x7ccf3a, pos: [0.05, 0.74, -0.1] },
      ]);
    case 'giftbox':
      // Presents waiting under the trees.
      return build([
        { geo: box(0.55, 0.42, 0.5), color: 0xd62e3a, pos: [0, 0.21, 0], jitter: 0.05 },
        { geo: box(0.08, 0.44, 0.52), color: 0xffd23f, pos: [0, 0.21, 0] },
        { geo: box(0.57, 0.44, 0.08), color: 0xffd23f, pos: [0, 0.21, 0] },
        { geo: box(0.32, 0.3, 0.3), color: 0x2e8a4a, pos: [0.42, 0.15, 0.25], rot: [0, 0.5, 0], jitter: 0.05 },
        { geo: box(0.34, 0.32, 0.06), color: 0xffffff, pos: [0.42, 0.15, 0.25], rot: [0, 0.5, 0] },
        { geo: octa(0.1), color: 0xffd23f, pos: [0, 0.47, 0], scale: [1.4, 0.6, 1.4] },
      ]);
    case 'sled':
      return build([
        { geo: box(1.1, 0.05, 0.06), color: 0x8a5a3a, pos: [0, 0.04, 0.22] },
        { geo: box(1.1, 0.05, 0.06), color: 0x8a5a3a, pos: [0, 0.04, -0.22] },
        { geo: box(0.9, 0.08, 0.5), color: 0xc8323a, pos: [-0.05, 0.22, 0], jitter: 0.05 },
        { geo: cyl(0.03, 0.03, 0.32, 4), color: 0x8a5a3a, pos: [0.55, 0.15, 0.22], rot: [0, 0, 0.7] },
        { geo: cyl(0.03, 0.03, 0.32, 4), color: 0x8a5a3a, pos: [0.55, 0.15, -0.22], rot: [0, 0, 0.7] },
      ]);
    case 'lamppost':
      // A warm lantern on a post.
      return build([
        { geo: cyl(0.04, 0.06, 1.5, 4), color: 0x2b2d42, pos: [0, 0.75, 0] },
        { geo: box(0.22, 0.26, 0.22), color: 0x2b2d42, pos: [0, 1.6, 0] },
        { geo: octa(0.12), color: 0xffd27a, pos: [0, 1.6, 0], scale: [1, 1.2, 1] },
        { geo: cone(0.2, 0.16, 4), color: 0x2b2d42, pos: [0, 1.8, 0], rot: [0, Math.PI / 4, 0] },
      ]);
    case 'stonelantern':
      return build([
        { geo: box(0.42, 0.12, 0.42), color: 0x9a9a92, pos: [0, 0.06, 0] },
        { geo: cyl(0.09, 0.11, 0.55, 6), color: 0xa8a8a0, pos: [0, 0.39, 0] },
        { geo: box(0.32, 0.26, 0.32), color: 0xa8a8a0, pos: [0, 0.79, 0] },
        { geo: box(0.2, 0.14, 0.34), color: 0xffe9a8, pos: [0, 0.8, 0] },
        { geo: cone(0.36, 0.24, 4), color: 0x8a8a84, pos: [0, 1.04, 0], rot: [0, Math.PI / 4, 0] },
        { geo: octa(0.06), color: 0x8a8a84, pos: [0, 1.2, 0] },
      ]);
    case 'bamboofence': {
      const parts: Part[] = [];
      for (let i = 0; i < 5; i++) parts.push({ geo: cyl(0.04, 0.04, 0.9 + (i % 2) * 0.08, 4), color: i % 2 ? 0xb8a060 : 0xc8b070, pos: [-0.8 + i * 0.4, 0.45, 0] });
      parts.push({ geo: cyl(0.03, 0.03, 1.8, 4), color: 0xa89050, pos: [0, 0.7, 0.05], rot: [0, 0, Math.PI / 2] }, { geo: cyl(0.03, 0.03, 1.8, 4), color: 0xa89050, pos: [0, 0.35, 0.05], rot: [0, 0, Math.PI / 2] });
      return build(parts);
    }
    case 'alpaca':
      // A woolly alpaca, long neck up.
      return build([
        { geo: dodeca(0.32), color: 0xf2e6d0, pos: [0, 0.62, 0], scale: [1.4, 0.95, 1], jitter: 0.08 },
        { geo: cyl(0.1, 0.13, 0.55, 4), color: 0xf2e6d0, pos: [0.38, 0.95, 0], rot: [0, 0, -0.2] },
        { geo: octa(0.13), color: 0xf6ecdc, pos: [0.45, 1.25, 0], scale: [1.3, 1, 1] },
        { geo: cone(0.04, 0.14, 3), color: 0xe0d0b8, pos: [0.42, 1.38, 0.06] },
        { geo: cone(0.04, 0.14, 3), color: 0xe0d0b8, pos: [0.42, 1.38, -0.06] },
        ...[
          [-0.28, -0.13],
          [-0.28, 0.13],
          [0.26, -0.13],
          [0.26, 0.13],
        ].map(([x, z]): Part => ({ geo: box(0.08, 0.42, 0.08), color: 0xe8dcc4, pos: [x, 0.21, z] })),
      ]);
    case 'peak':
      // A distant snow-capped mountain (placed far beyond the farm).
      return build([
        { geo: cone(2.6, 4.6, 6), color: 0x8a96a8, pos: [0, 2.3, 0], jitter: 0.08 },
        { geo: cone(1.15, 2.0, 6), color: 0xf4f8fc, pos: [0, 3.65, 0] },
      ]);
    case 'woodpile': {
      const parts: Part[] = [];
      for (let row = 0; row < 3; row++)
        for (let k = 0; k < 3 - row; k++) parts.push({ geo: cyl(0.12, 0.12, 0.85, 5), color: (row + k) % 2 ? 0xa0703e : 0x8a5e34, pos: [(k - (2 - row) / 2) * 0.25, 0.12 + row * 0.21, 0], rot: [Math.PI / 2, 0, 0], jitter: 0.08 });
      return build(parts);
    }
    case 'cairn':
      // Stacked stones on the moor.
      return build([
        { geo: dodeca(0.32), color: 0x8a8a84, pos: [0, 0.16, 0], scale: [1.3, 0.55, 1.2] },
        { geo: dodeca(0.25), color: 0x9a9a92, pos: [0.03, 0.42, 0], scale: [1.3, 0.55, 1.2] },
        { geo: octa(0.2), color: 0x7a7a74, pos: [-0.02, 0.62, 0.02], scale: [1.3, 0.6, 1.2] },
        { geo: octa(0.13), color: 0xa4a49c, pos: [0, 0.78, 0], scale: [1.2, 0.7, 1.2] },
      ]);
    case 'cart': {
      // A wooden cart heaped with lavender bundles.
      const parts: Part[] = [
        { geo: box(1.1, 0.3, 0.7), color: 0x9a6a3a, pos: [0, 0.45, 0], jitter: 0.08 },
        { geo: cyl(0.28, 0.28, 0.08, 8), color: 0x6a4a2a, pos: [0.25, 0.28, 0.4], rot: [Math.PI / 2, 0, 0] },
        { geo: cyl(0.28, 0.28, 0.08, 8), color: 0x6a4a2a, pos: [0.25, 0.28, -0.4], rot: [Math.PI / 2, 0, 0] },
        { geo: box(0.7, 0.05, 0.05), color: 0x7a5232, pos: [-0.85, 0.42, 0], rot: [0, 0, 0.25] },
      ];
      for (let i = 0; i < 4; i++) parts.push({ geo: cone(0.12, 0.5, 4), color: i % 2 ? 0x8a6ab8 : 0x9a7ac8, pos: [-0.3 + i * 0.2, 0.75, (i % 2) * 0.15 - 0.07], rot: [0, 0, 1.4 - (i % 2) * 0.2] });
      return build(parts);
    }
    case 'reeds': {
      // Cattails at the water's edge.
      const parts: Part[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const h = 0.9 + (i % 3) * 0.2;
        parts.push({ geo: cyl(0.02, 0.025, h, 3), color: 0x6a8a4a, pos: [Math.cos(a) * 0.12, h / 2, Math.sin(a) * 0.12], rot: [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12] });
        if (i % 2 === 0) parts.push({ geo: cyl(0.05, 0.05, 0.22, 4), color: 0x6a4a2a, pos: [Math.cos(a) * 0.14, h - 0.12, Math.sin(a) * 0.14] });
      }
      return build(parts);
    }
    case 'glowshroom':
      // Little mushrooms that glow in the dusk.
      return build([
        { geo: cyl(0.05, 0.06, 0.3, 4), color: 0xe8e0c8, pos: [0, 0.15, 0] },
        { geo: cone(0.2, 0.16, 6), color: 0x8affc8, pos: [0, 0.34, 0] },
        { geo: cyl(0.04, 0.05, 0.2, 4), color: 0xe8e0c8, pos: [0.22, 0.1, 0.1] },
        { geo: cone(0.14, 0.12, 6), color: 0xc8ff8a, pos: [0.22, 0.23, 0.1] },
      ]);
    case 'steamvent':
      // A fumarole: a crusted mound with a glowing mouth.
      return build([
        { geo: lathe([[0, 0], [0.55, 0], [0.42, 0.3], [0.22, 0.42], [0.2, 0.45]], 7), color: 0x6a5a50, jitter: 0.15 },
        { geo: cyl(0.18, 0.18, 0.04, 7), color: 0xffa040, pos: [0, 0.44, 0] },
        { geo: octa(0.14), color: 0xe8d84a, pos: [0.3, 0.16, 0.25], scale: [1.4, 0.5, 1.2] },
      ]);
    case 'obsidian':
      return build([
        { geo: octa(0.3), color: 0x1a1a24, pos: [0, 0.3, 0], scale: [0.7, 1.4, 0.8], jitter: 0.1 },
        { geo: octa(0.2), color: 0x2a2a38, pos: [0.25, 0.18, 0.12], scale: [0.7, 1.4, 0.8], rot: [0, 0, -0.5], jitter: 0.1 },
      ]);
    case 'volcano':
      // A distant volcano with a glowing crater (placed far beyond the farm).
      return build([
        { geo: lathe([[3.2, 0], [2.6, 0.9], [1.6, 2.2], [0.9, 3.2], [0.7, 3.4], [0, 3.4]], 8), color: 0x4a3c38, jitter: 0.08 },
        { geo: cyl(0.62, 0.55, 0.12, 8), color: 0xff6a20, pos: [0, 3.36, 0] },
        { geo: cone(0.6, 1.4, 6), color: 0xff8a2a, pos: [0.9, 2.3, 0.6], rot: [0.3, 0, -0.4], scale: [0.5, 1, 0.3] },
      ]);
    case 'wateringcan':
      // A watering can the size of a shed.
      return build([
        { geo: cyl(0.6, 0.65, 1.1, 8), color: 0x5aa8d8, pos: [0, 0.55, 0], jitter: 0.06 },
        { geo: cyl(0.08, 0.12, 1.2, 6), color: 0x4a98c8, pos: [0.85, 0.85, 0], rot: [0, 0, -0.9] },
        { geo: cyl(0.2, 0.12, 0.18, 6), color: 0x4a98c8, pos: [1.35, 1.25, 0], rot: [0, 0, -0.9] },
        { geo: box(0.08, 0.6, 0.6), color: 0x3a88b8, pos: [-0.6, 1.0, 0], rot: [0, 0, 0.3] },
      ]);
    case 'flowerpot':
      // A giant terracotta pot with a sprout.
      return build([
        { geo: lathe([[0, 0], [0.55, 0], [0.75, 0.9], [0.85, 1.0], [0, 1.0]], 8), color: 0xc8643a, jitter: 0.08 },
        { geo: cyl(0.75, 0.75, 0.05, 8), color: 0x5a3a28, pos: [0, 0.98, 0] },
        { geo: cone(0.18, 0.9, 3), color: 0x5fbe46, pos: [0.1, 1.4, 0], rot: [0, 0, -0.3], scale: [1.6, 1, 0.4] },
        { geo: cone(0.16, 0.8, 3), color: 0x4fae3a, pos: [-0.12, 1.35, 0], rot: [0, 0, 0.4], scale: [1.6, 1, 0.4] },
      ]);
    case 'rover':
      // A little six-wheeled rover.
      return build([
        { geo: box(0.9, 0.25, 0.6), color: 0xe8e8f0, pos: [0, 0.38, 0], jitter: 0.05 },
        ...[-0.32, 0, 0.32].flatMap((x): Part[] => [
          { geo: cyl(0.13, 0.13, 0.1, 6), color: 0x3a3a48, pos: [x, 0.13, 0.36], rot: [Math.PI / 2, 0, 0] },
          { geo: cyl(0.13, 0.13, 0.1, 6), color: 0x3a3a48, pos: [x, 0.13, -0.36], rot: [Math.PI / 2, 0, 0] },
        ]),
        { geo: box(0.7, 0.04, 0.5), color: 0x3a5a9a, pos: [-0.05, 0.55, 0] },
        { geo: cyl(0.03, 0.03, 0.4, 4), color: 0x9a9aa8, pos: [0.32, 0.7, 0] },
        { geo: box(0.16, 0.12, 0.12), color: 0xff8a2a, pos: [0.32, 0.92, 0] },
      ]);
    case 'solarpanel':
      return build([
        { geo: cyl(0.04, 0.05, 0.5, 4), color: 0x9a9aa8, pos: [0, 0.25, 0] },
        { geo: box(1.2, 0.04, 0.7), color: 0x2a4a8a, pos: [0, 0.55, 0], rot: [0.5, 0, 0] },
        { geo: box(1.24, 0.03, 0.04), color: 0xd8d8e0, pos: [0, 0.56, 0], rot: [0.5, 0, 0] },
      ]);
    case 'crater':
      // A small crater rim in the dust.
      return build([
        { geo: cyl(0.9, 1.0, 0.16, 10), color: 0x9a9aa4, pos: [0, 0.08, 0], jitter: 0.12 },
        { geo: cyl(0.62, 0.62, 0.17, 10), color: 0x7a7a84, pos: [0, 0.09, 0] },
      ]);
    case 'stilthut':
      // A small raised hut on stilts, thatched.
      return build([
        ...[
          [-0.45, -0.35],
          [0.45, -0.35],
          [-0.45, 0.35],
          [0.45, 0.35],
        ].map(([x, z]): Part => ({ geo: box(0.08, 1.0, 0.08), color: 0x6a4a30, pos: [x, 0.5, z] })),
        { geo: box(1.2, 0.1, 1.0), color: 0x8a6a48, pos: [0, 1.0, 0] },
        { geo: box(0.95, 0.6, 0.78), color: 0xa07a50, pos: [0, 1.35, 0], jitter: 0.08 },
        { geo: box(0.3, 0.4, 0.05), color: 0x3e2a1c, pos: [0, 1.28, 0.4] },
        { geo: cone(0.95, 0.85, 4), color: 0xc9a45a, pos: [0, 2.05, 0], rot: [0, Math.PI / 4, 0], scale: [1.15, 1, 1], jitter: 0.12 },
      ], 0.2, 1.6);
  }
}

/** A landmark's static body and its optional rotor (spun about the local z axis at `hub`). */
export interface Landmark {
  base: THREE.BufferGeometry;
  rotor: THREE.BufferGeometry | null;
  hub: [number, number, number];
  /** Rotor speed factor. */
  spin: number;
  /** How many stand around the farm. */
  count: number;
}

function windmill(): Landmark {
  const sails: Part[] = [{ geo: cyl(0.18, 0.18, 0.2, 6), color: 0x5c6670, rot: [Math.PI / 2, 0, 0] }];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    sails.push({ geo: box(0.12, 1.9, 0.05), color: 0x8b5a2b, pos: [Math.sin(a) * 0.95, Math.cos(a) * 0.95, 0], rot: [0, 0, -a] });
    sails.push({ geo: box(0.42, 1.5, 0.03), color: 0xfffaf0, pos: [Math.sin(a) * 1.05 + Math.cos(a) * 0.24, Math.cos(a) * 1.05 - Math.sin(a) * 0.24, 0.03], rot: [0, 0, -a], jitter: 0.04 });
  }
  return {
    base: build(
      [
        { geo: cyl(0.55, 1.0, 3.6, 6), color: 0xf4efe6, pos: [0, 1.8, 0], jitter: 0.06 },
        { geo: cyl(0.62, 0.62, 0.18, 6), color: 0xb5651d, pos: [0, 0.09, 0] },
        { geo: cone(0.8, 1.0, 6), color: 0xd64545, pos: [0, 4.05, 0], jitter: 0.08 },
        { geo: box(0.5, 0.75, 0.08), color: 0x7a2323, pos: [0, 0.5, 0.9], rot: [-0.25, 0, 0] },
        { geo: cyl(0.12, 0.12, 0.5, 6), color: 0x5c6670, pos: [0, 3.55, 0.6], rot: [Math.PI / 2, 0, 0] },
      ],
      0.25,
      2,
    ),
    rotor: build(sails),
    hub: [0, 3.55, 0.85],
    spin: 1,
    count: 3,
  };
}

/** Farm wind pump: a steel lattice tower with a many-bladed fan and a water tank beside it. */
function windpump(): Landmark {
  const steel = 0x8a8f96;
  const base: Part[] = [];
  for (const [x, z] of [
    [-0.55, -0.55],
    [0.55, -0.55],
    [-0.55, 0.55],
    [0.55, 0.55],
  ]) {
    base.push({ geo: cyl(0.04, 0.05, 4.1, 4), color: steel, pos: [x * 0.55, 2.05, z * 0.55], rot: [z * 0.13, 0, -x * 0.13] });
  }
  for (const y of [1.0, 2.0, 3.0]) {
    const w = 1.15 - y * 0.15;
    base.push({ geo: box(w, 0.05, 0.05), color: steel, pos: [0, y, w / 2] });
    base.push({ geo: box(w, 0.05, 0.05), color: steel, pos: [0, y, -w / 2] });
    base.push({ geo: box(0.05, 0.05, w), color: steel, pos: [w / 2, y, 0] });
    base.push({ geo: box(0.05, 0.05, w), color: steel, pos: [-w / 2, y, 0] });
  }
  base.push({ geo: box(0.5, 0.12, 0.5), color: 0x6a7076, pos: [0, 4.12, 0] });
  base.push({ geo: box(0.08, 0.5, 1.2), color: 0xd64545, pos: [0, 4.35, -0.75] });
  base.push({ geo: cyl(0.08, 0.08, 0.5, 6), color: 0x5c6670, pos: [0, 4.3, 0.15], rot: [Math.PI / 2, 0, 0] });
  // Water tank on its stand.
  base.push({ geo: cyl(0.75, 0.75, 1.0, 10), color: 0xb8c0c8, pos: [1.9, 1.4, 0.3], jitter: 0.05 });
  base.push({ geo: cone(0.8, 0.25, 10), color: 0x9aa4ad, pos: [1.9, 2.02, 0.3] });
  for (const [x, z] of [
    [1.4, -0.2],
    [2.4, -0.2],
    [1.4, 0.8],
    [2.4, 0.8],
  ])
    base.push({ geo: box(0.08, 0.9, 0.08), color: 0x6a4a30, pos: [x, 0.45, z] });
  const fan: Part[] = [{ geo: cyl(0.12, 0.12, 0.14, 6), color: 0x5c6670, rot: [Math.PI / 2, 0, 0] }];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    fan.push({ geo: box(0.16, 0.6, 0.02), color: i % 3 === 0 ? 0xd64545 : 0xd8dde2, pos: [Math.sin(a) * 0.45, Math.cos(a) * 0.45, 0], rot: [0, 0.35, -a] });
  }
  return { base: build(base, 0.2, 2), rotor: build(fan), hub: [0, 4.3, 0.42], spin: 2.2, count: 2 };
}

/** Stilted granary with a steep thatched roof. */
function granary(): Landmark {
  const parts: Part[] = [];
  for (const x of [-0.7, 0, 0.7]) for (const z of [-0.55, 0.55]) parts.push({ geo: cyl(0.07, 0.08, 1.3, 5), color: 0x5e4630, pos: [x, 0.65, z] });
  parts.push({ geo: box(1.9, 0.14, 1.5), color: 0x7a5a3a, pos: [0, 1.32, 0] });
  parts.push({ geo: box(1.6, 1.0, 1.2), color: 0x9a7048, pos: [0, 1.9, 0], jitter: 0.08 });
  parts.push({ geo: box(0.5, 0.7, 0.05), color: 0x3e2a1c, pos: [0, 1.8, 0.62] });
  parts.push({ geo: box(0.12, 1.3, 0.5), color: 0x6a4a30, pos: [0.5, 0.65, 1.0], rot: [0.5, 0, 0] });
  parts.push({ geo: cone(1.65, 1.6, 4), color: 0xc9a45a, pos: [0, 3.15, 0], rot: [0, Math.PI / 4, 0], scale: [1.25, 1, 1], jitter: 0.12 });
  parts.push({ geo: box(0.2, 0.2, 2.0), color: 0x8a6a3a, pos: [0, 3.9, 0] });
  return { base: build(parts, 0.2, 2.5), rotor: null, hub: [0, 0, 0], spin: 0, count: 2 };
}

/** Stone farmhouse: stucco walls, terracotta roof, a little tower, green shutters. */
function farmhouse(): Landmark {
  const roof = 0xc0603a;
  return {
    base: build(
      [
        { geo: box(2.6, 1.6, 1.8), color: 0xe2cfa8, pos: [0, 0.8, 0], jitter: 0.06 },
        { geo: cone(1.95, 0.85, 4), color: roof, pos: [0, 2.02, 0], rot: [0, Math.PI / 4, 0], scale: [1.3, 1, 0.92], jitter: 0.08 },
        { geo: box(0.95, 2.7, 0.95), color: 0xe9d6b0, pos: [1.15, 1.35, -0.2], jitter: 0.06 },
        { geo: cone(0.8, 0.6, 4), color: 0xb85a36, pos: [1.15, 3.0, -0.2], rot: [0, Math.PI / 4, 0], jitter: 0.08 },
        { geo: box(0.5, 0.75, 0.06), color: 0x6b4a2e, pos: [-0.4, 0.4, 0.92] },
        ...[-1.0, 0.3].map((x): Part => ({ geo: box(0.36, 0.42, 0.06), color: 0x6e8a5a, pos: [x, 1.05, 0.92] })),
        { geo: box(0.36, 0.42, 0.06), color: 0x6e8a5a, pos: [1.15, 2.2, 0.29] },
        { geo: box(0.25, 0.6, 0.25), color: 0xb0a088, pos: [-0.8, 2.3, -0.3] },
      ],
      0.2,
      2,
    ),
    rotor: null,
    hub: [0, 0, 0],
    spin: 0,
    count: 1,
  };
}

/** A thatched lookout on stilts. */
function lookout(): Landmark {
  const wood = 0x8a6a48;
  const parts: Part[] = [];
  for (const [x, z] of [
    [-0.6, -0.6],
    [0.6, -0.6],
    [-0.6, 0.6],
    [0.6, 0.6],
  ])
    parts.push({ geo: box(0.12, 2.4, 0.12), color: 0x6a4a30, pos: [x, 1.2, z] });
  parts.push({ geo: box(1.6, 0.12, 1.6), color: wood, pos: [0, 2.4, 0] });
  for (const [x, z, w, d] of [
    [0, 0.78, 1.6, 0.06],
    [0, -0.78, 1.6, 0.06],
    [0.78, 0, 0.06, 1.6],
    [-0.78, 0, 0.06, 1.6],
  ])
    parts.push({ geo: box(w, 0.35, d), color: wood, pos: [x, 2.62, z] });
  parts.push({ geo: cone(1.35, 1.1, 4), color: 0xc9a45a, pos: [0, 3.55, 0], rot: [0, Math.PI / 4, 0], jitter: 0.12 });
  parts.push({ geo: box(0.08, 2.4, 0.5), color: 0x7a5a3a, pos: [0.85, 1.2, 0.3], rot: [0, 0, -0.25] });
  return { base: build(parts, 0.2, 2.4), rotor: null, hub: [0, 0, 0], spin: 0, count: 2 };
}

/** A log cabin under snow, warm light in the windows. */
function cabin(): Landmark {
  return {
    base: build(
      [
        { geo: box(2.2, 1.3, 1.6), color: 0x8b5a3c, pos: [0, 0.65, 0], jitter: 0.08 },
        { geo: box(2.24, 0.08, 1.64), color: 0x6e4630, pos: [0, 0.45, 0] },
        { geo: box(2.24, 0.08, 1.64), color: 0x6e4630, pos: [0, 0.9, 0] },
        { geo: cyl(1.25, 1.25, 2.4, 3), color: 0x5a3a28, pos: [0, 1.55, 0], rot: [0, 0, Math.PI / 2], scale: [0.62, 1, 1] },
        { geo: cyl(1.28, 1.28, 2.44, 3), color: 0xf4f8fc, pos: [0, 1.62, 0], rot: [0, 0, Math.PI / 2], scale: [0.5, 1, 1.04] },
        { geo: box(0.3, 0.9, 0.3), color: 0x7a6a5a, pos: [0.6, 2.1, -0.3] },
        { geo: box(0.4, 0.35, 0.05), color: 0xffd27a, pos: [-0.55, 0.75, 0.82] },
        { geo: box(0.4, 0.35, 0.05), color: 0xffd27a, pos: [0.55, 0.75, 0.82] },
        { geo: box(0.45, 0.8, 0.05), color: 0x4a2e1e, pos: [0, 0.4, 0.82] },
      ],
      0.2,
      2,
    ),
    rotor: null,
    hub: [0, 0, 0],
    spin: 0,
    count: 1,
  };
}

/** A tea pavilion: raised floor, paper screens, a dark tiled roof. */
function teahouse(): Landmark {
  const parts: Part[] = [{ geo: box(2.2, 0.3, 1.8), color: 0x8a6a4a, pos: [0, 0.15, 0] }];
  for (const [x, z] of [
    [-0.95, -0.75],
    [0.95, -0.75],
    [-0.95, 0.75],
    [0.95, 0.75],
  ])
    parts.push({ geo: cyl(0.07, 0.07, 1.3, 4), color: 0x5a3a28, pos: [x, 0.95, z] });
  parts.push({ geo: box(1.8, 1.0, 1.4), color: 0x7a5236, pos: [0, 0.85, 0] });
  parts.push({ geo: box(1.2, 0.8, 0.05), color: 0xf4ecd8, pos: [0, 0.85, 0.72] });
  parts.push({ geo: box(0.05, 0.8, 0.9), color: 0xf4ecd8, pos: [0.92, 0.85, 0] });
  parts.push({ geo: cone(1.95, 0.55, 4), color: 0x4a5260, pos: [0, 1.75, 0], rot: [0, Math.PI / 4, 0], scale: [1.15, 1, 0.95] });
  parts.push({ geo: cone(1.1, 0.5, 4), color: 0x3e4652, pos: [0, 2.2, 0], rot: [0, Math.PI / 4, 0], scale: [1.15, 1, 0.95] });
  return { base: build(parts, 0.2, 2), rotor: null, hub: [0, 0, 0], spin: 0, count: 1 };
}

/** A round stone hut with a thatched cone roof. */
function stonehut(): Landmark {
  return {
    base: build(
      [
        { geo: cyl(1.1, 1.2, 1.15, 8), color: 0x9a8a78, pos: [0, 0.58, 0], jitter: 0.14 },
        { geo: cone(1.55, 1.5, 8), color: 0xd8b860, pos: [0, 1.88, 0], jitter: 0.12 },
        { geo: box(0.5, 0.8, 0.08), color: 0x2a6a8a, pos: [0, 0.4, 1.12] },
      ],
      0.2,
      1.5,
    ),
    rotor: null,
    hub: [0, 0, 0],
    spin: 0,
    count: 2,
  };
}

/** A falu-red cottage with white corners and windows. */
function redhouse(): Landmark {
  const white = 0xffffff;
  return {
    base: build(
      [
        { geo: box(2.4, 1.4, 1.6), color: 0xa83a2a, pos: [0, 0.7, 0], jitter: 0.06 },
        { geo: cyl(1.3, 1.3, 2.6, 3), color: 0x3a3a3a, pos: [0, 1.62, 0], rot: [0, 0, Math.PI / 2], scale: [0.6, 1, 1.02] },
        ...[
          [-1.2, -0.8],
          [1.2, -0.8],
          [-1.2, 0.8],
          [1.2, 0.8],
        ].map(([x, z]): Part => ({ geo: box(0.1, 1.42, 0.1), color: white, pos: [x, 0.71, z] })),
        ...[-0.75, 0.75].map((x): Part => ({ geo: box(0.42, 0.42, 0.05), color: white, pos: [x, 0.85, 0.82] })),
        { geo: box(0.45, 0.85, 0.05), color: 0x7a2a20, pos: [0, 0.43, 0.82] },
        { geo: box(0.28, 0.6, 0.28), color: 0x8a8a84, pos: [0.7, 2.0, -0.2] },
      ],
      0.2,
      2,
    ),
    rotor: null,
    hub: [0, 0, 0],
    spin: 0,
    count: 1,
  };
}

/** A stone lavender distillery with a copper still and a chimney. */
function distillery(): Landmark {
  return {
    base: build(
      [
        { geo: box(2.2, 1.4, 1.6), color: 0xf2e4c8, pos: [0, 0.7, 0], jitter: 0.06 },
        { geo: cone(1.7, 0.8, 4), color: 0xb0603a, pos: [0, 1.8, 0], rot: [0, Math.PI / 4, 0], scale: [1.25, 1, 0.92] },
        { geo: box(0.3, 1.4, 0.3), color: 0xd8c8a8, pos: [0.75, 2.0, -0.3] },
        ...[-0.6, 0.6].map((x): Part => ({ geo: box(0.4, 0.45, 0.05), color: 0x8a6ab8, pos: [x, 0.85, 0.82] })),
        { geo: box(0.45, 0.8, 0.05), color: 0x7a5aa8, pos: [0, 0.4, 0.82] },
        { geo: ball(0.42, 1), color: 0xd0803a, pos: [1.55, 0.55, 0.3], scale: [1, 1.15, 1] },
        { geo: cyl(0.06, 0.06, 0.9, 6), color: 0xc0703a, pos: [1.55, 1.15, 0.3] },
      ],
      0.2,
      2,
    ),
    rotor: null,
    hub: [0, 0, 0],
    spin: 0,
    count: 1,
  };
}

/** A giant red-capped mushroom with a door and a window: somebody lives in it. */
function mushhouse(): Landmark {
  return {
    base: build(
      [
        { geo: cyl(0.75, 0.9, 1.6, 8), color: 0xf0e6cc, pos: [0, 0.8, 0], jitter: 0.06 },
        { geo: lathe([[1.4, 0], [1.75, 0.2], [1.6, 0.6], [0.9, 1.15], [0, 1.3]], 10), color: 0xc83a32, pos: [0, 1.55, 0], jitter: 0.08 },
        ...[0, 1, 2, 3, 4].map((i): Part => ({ geo: octa(0.18), color: 0xffffff, pos: [Math.cos(i * 1.26) * 1.05, 2.3 + (i % 2) * 0.25, Math.sin(i * 1.26) * 1.05], scale: [1.3, 0.4, 1.3] })),
        { geo: box(0.45, 0.75, 0.06), color: 0x6a4a2e, pos: [0, 0.4, 0.86] },
        { geo: cyl(0.2, 0.2, 0.06, 8), color: 0xe8ff9a, pos: [0.45, 1.05, 0.8], rot: [Math.PI / 2, 0, 0] },
      ],
      0.2,
      2,
    ),
    rotor: null,
    hub: [0, 0, 0],
    spin: 0,
    count: 2,
  };
}

/** A drying rack hung with strings of red chillies. */
function chilirack(): Landmark {
  const wood = 0x5a3e2a;
  const parts: Part[] = [
    { geo: box(0.12, 2.0, 0.12), color: wood, pos: [-1.0, 1.0, 0] },
    { geo: box(0.12, 2.0, 0.12), color: wood, pos: [1.0, 1.0, 0] },
    { geo: box(2.3, 0.12, 0.12), color: wood, pos: [0, 1.95, 0] },
    { geo: cone(1.5, 0.5, 4), color: 0x3a2e28, pos: [0, 2.25, 0], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.45] },
  ];
  for (let i = 0; i < 6; i++) parts.push({ geo: cone(0.1, 1.1, 4), color: i % 2 ? 0xd8202a : 0xe8402a, pos: [-0.75 + i * 0.3, 1.35, 0], rot: [Math.PI, 0, 0], scale: [1, 1, 0.8], jitter: 0.15 });
  return { base: build(parts, 0.2, 2), rotor: null, hub: [0, 0, 0], spin: 0, count: 2 };
}

/** A garden gnome as tall as a tower. */
function gnome(): Landmark {
  return {
    base: build(
      [
        { geo: cyl(0.5, 0.65, 0.4, 8), color: 0x3a5aa8, pos: [0, 0.2, 0] },
        { geo: cyl(0.7, 0.75, 1.2, 8), color: 0x3a8ad8, pos: [0, 1.0, 0], jitter: 0.05 },
        { geo: ball(0.48, 1), color: 0xf4c8a0, pos: [0, 1.95, 0.08] },
        { geo: cone(0.6, 1.1, 8), color: 0xffffff, pos: [0, 1.55, 0.35], rot: [Math.PI + 0.3, 0, 0] },
        { geo: ball(0.12, 0), color: 0xe8908a, pos: [0, 1.95, 0.5] },
        { geo: cone(0.55, 1.4, 8), color: 0xd62e3a, pos: [0, 2.85, -0.05], rot: [-0.15, 0, 0] },
      ],
      0.2,
      2,
    ),
    rotor: null,
    hub: [0, 0, 0],
    spin: 0,
    count: 1,
  };
}

/** A lunar lander on four legs. */
function lander(): Landmark {
  const gold = 0xe0b040;
  const parts: Part[] = [
    { geo: box(1.2, 0.7, 1.2), color: gold, pos: [0, 1.0, 0], jitter: 0.05 },
    { geo: cyl(0.55, 0.7, 0.8, 8), color: 0xd8d8e0, pos: [0, 1.75, 0] },
    { geo: box(0.25, 0.2, 0.05), color: 0x2a2a3a, pos: [0, 1.8, 0.62] },
    { geo: cyl(0.04, 0.04, 0.8, 4), color: 0x9a9aa8, pos: [0.3, 2.5, 0] },
  ];
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    parts.push({ geo: cyl(0.04, 0.05, 1.2, 4), color: 0x9a9aa8, pos: [x * 0.8, 0.55, z * 0.8], rot: [z * 0.5, 0, -x * 0.5] });
    parts.push({ geo: cyl(0.16, 0.18, 0.06, 6), color: 0x9a9aa8, pos: [x * 1.05, 0.03, z * 1.05] });
  }
  return { base: build(parts, 0.15, 2), rotor: null, hub: [0, 0, 0], spin: 0, count: 1 };
}

export function landmarkGeometry(kind: LandmarkKind): Landmark {
  switch (kind) {
    case 'windmill':
      return windmill();
    case 'windpump':
      return windpump();
    case 'granary':
      return granary();
    case 'farmhouse':
      return farmhouse();
    case 'lookout':
      return lookout();
    case 'cabin':
      return cabin();
    case 'teahouse':
      return teahouse();
    case 'stonehut':
      return stonehut();
    case 'redhouse':
      return redhouse();
    case 'distillery':
      return distillery();
    case 'mushhouse':
      return mushhouse();
    case 'chilirack':
      return chilirack();
    case 'gnome':
      return gnome();
    case 'lander':
      return lander();
  }
}

export function tuftGeometry(colors: readonly [number, number, number] = [0x4f9e3a, 0x5fb346, 0x6cc24a]): THREE.BufferGeometry {
  return build([
    { geo: cone(0.07, 0.42, 3), color: colors[0], pos: [0, 0.21, 0], rot: [0, 0, 0.25] },
    { geo: cone(0.07, 0.36, 3), color: colors[1], pos: [0.08, 0.18, 0.04], rot: [0.2, 0, -0.3] },
    { geo: cone(0.06, 0.3, 3), color: colors[2], pos: [-0.07, 0.15, -0.03], rot: [-0.25, 0, 0.1] },
  ]);
}
