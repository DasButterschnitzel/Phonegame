import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { BODY, capacityOf, vMax } from '../../game/config.ts';
import { sampleAt, type PathSample } from '../../game/path.ts';
import { bladeGeometry, crownGeometry, haloGeometry, headParts, hornsGeometry, legGeometry, segmentGeometry, trayGeometry } from '../geo/caterpillar.ts';
import { blobTexture } from '../geo/world.ts';
import { badgeMaterial, numberAtlas } from '../fx/NumberAtlas.ts';
import { levelColor } from '../palette.ts';
import { instancedOutline, hullGeometry, outlineMaterial, toon } from '../materials.ts';
import { C, E, M4, Q, Q2, S, V, V2 } from '../scratch.ts';
import { easeOutBack, wrap } from '../../shared/math.ts';

const MAX = 32;
/** Extra body instances for merge "ghosts" (the two consumed segments sliding into the new one). */
const GHOSTS = 4;
/** Merge choreography (s): ghosts travel, then the new segment pops out with overshoot. */
export const MERGE_TRAVEL = 0.26;
const MERGE_POP = 0.34;

interface Ghost {
  fromSlot: number;
  into: number;
  level: number;
  t0: number;
}
const ps: PathSample = { x: 0, z: 0, tx: 0, tz: 0 };
const ps2: PathSample = { x: 0, z: 0, tx: 0, tz: 0 };

export interface BodyPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
}

interface Spring {
  a: number;
  v: number;
}

/**
 * The robot caterpillar. The head is a small rig (blinking eyes, looking pupils, spring antennae, chomping
 * mandibles); bodies, trays, blades, legs, badges, accessories and blob shadows are instanced. Visual segments
 * are keyed by id and ease towards their simulated slot, so merges/reorders slide smoothly.
 */
export class CaterpillarView {
  readonly group = new THREE.Group();
  readonly head = new THREE.Group();
  private eyes: THREE.Group;
  private pupils: THREE.Mesh;
  private antennae: THREE.Mesh[] = [];
  private mandibles: THREE.Mesh[] = [];
  private bodies: THREE.InstancedMesh;
  private bodyOutline: THREE.InstancedMesh;
  private trays: THREE.InstancedMesh;
  private blades: THREE.InstancedMesh;
  private legs: THREE.InstancedMesh;
  private badges: THREE.InstancedMesh;
  private shadows: THREE.InstancedMesh;
  private horns: THREE.InstancedMesh;
  private crowns: THREE.InstancedMesh;
  private halos: THREE.InstancedMesh;
  private cellAttr: THREE.InstancedBufferAttribute;
  private slot = new Map<number, number>();
  private alive = new Set<number>();
  private spin = 0;
  private chompPhase = 0;
  private nextBlink = 2;
  private blinkT = -1;
  private antSpring: Spring[] = [
    { a: 0, v: 0 },
    { a: 0, v: 0 },
  ];
  private prevV = 0;
  /** Smoothed acceleration, chain compression (+ bunches up when braking) and cargo load (0..1). */
  private accelS = 0;
  private compress = 0;
  private load = 0;
  /** Blades grinding against crops that won't fit in a full basket. */
  private grindUntil = -1;
  private lastNow = 0;
  private prevYaw = 0;
  private turn = 0;
  /** Latest world pose of each body (0 = head) for other views (stacks, particles). */
  readonly poses: BodyPose[] = Array.from({ length: MAX + 1 }, () => ({ x: 0, y: 0, z: 0, yaw: 0, tx: 1, tz: 0 }));
  private sim: Sim;
  private ghosts: Ghost[] = [];
  /** New merged segments: time their pop-out starts. */
  private emerge = new Map<number, number>();

  /**
   * Merge choreography: the two consumed segments are pulled into the new one (ease-in, so they "snap"
   * together), which then pops out with overshoot. Call before the next update (slots are still known).
   */
  merge(consumed: [number, number], into: number, level: number, now: number): void {
    const target = this.sim.state.progress.segments.findIndex((s) => s.id === into);
    for (const id of consumed) {
      const fromSlot = this.slot.get(id) ?? target;
      if (this.ghosts.length < GHOSTS) this.ghosts.push({ fromSlot, into, level: level - 1, t0: now });
    }
    this.emerge.set(into, now + MERGE_TRAVEL);
  }

  /** Per-segment scale pulses (merge pop / add). */
  private pulses = new Map<number, number>();
  /** Per-body gulp time (last chunk eaten), index 0 = head. */
  private gulps = new Float32Array(MAX + 1).fill(-9);
  /** Per-body time a chunk last landed in its basket (the segment dips under the weight). */
  private lands = new Float32Array(MAX + 1).fill(-9);
  /** Per-body time it tipped its cargo into the depot hopper (a quick heave). */
  private tips = new Float32Array(MAX + 1).fill(-9);

  constructor(sim: Sim) {
    this.sim = sim;
    const mat = toon({ rim: 0.4 });
    const parts = headParts();
    const body = new THREE.Mesh(parts.body, mat);
    body.add(new THREE.Mesh(hullGeometry(parts.body), outlineMaterial(0.035)));
    this.head.add(body);
    this.eyes = new THREE.Group();
    this.eyes.position.set(0.55, 0.88, 0);
    const eyeWhites = new THREE.Mesh(parts.eyes, mat);
    eyeWhites.add(new THREE.Mesh(hullGeometry(parts.eyes), outlineMaterial(0.025)));
    this.pupils = new THREE.Mesh(parts.pupils, mat);
    this.pupils.position.x = 0.16;
    this.eyes.add(eyeWhites, this.pupils);
    this.head.add(this.eyes);
    for (const side of [1, -1]) {
      const ant = new THREE.Mesh(parts.antenna, mat);
      ant.position.set(0.02, 1.12, 0.16 * side);
      this.antennae.push(ant);
      this.head.add(ant);
      const mand = new THREE.Mesh(parts.mandible, mat);
      mand.position.set(0.6, 0.36, 0.22 * side);
      this.mandibles.push(mand);
      this.head.add(mand);
    }
    this.head.scale.setScalar(1.25);
    this.group.add(this.head);

    this.bodies = new THREE.InstancedMesh(segmentGeometry(), mat, MAX + GHOSTS);
    this.bodies.setColorAt(0, C.set(0xffffff));
    this.bodyOutline = instancedOutline(this.bodies, 0.04);
    this.trays = new THREE.InstancedMesh(trayGeometry(), mat, MAX);
    this.blades = new THREE.InstancedMesh(bladeGeometry(), mat, MAX * 2 + 2);
    this.legs = new THREE.InstancedMesh(legGeometry(), mat, (MAX + 1) * 2);
    this.horns = new THREE.InstancedMesh(hornsGeometry(), mat, MAX);
    this.horns.setColorAt(0, C.set(0xffffff));
    this.crowns = new THREE.InstancedMesh(crownGeometry(), mat, MAX);
    this.halos = new THREE.InstancedMesh(haloGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }), MAX);
    const plane = new THREE.PlaneGeometry(0.46, 0.46);
    this.badges = new THREE.InstancedMesh(plane, badgeMaterial(numberAtlas()), MAX);
    this.cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    this.badges.geometry.setAttribute('aCell', this.cellAttr);
    const shadowGeo = new THREE.PlaneGeometry(1.5, 1.2).rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }), MAX + 1);
    this.shadows.renderOrder = -1;
    for (const m of [this.bodies, this.bodyOutline, this.trays, this.blades, this.legs, this.horns, this.crowns, this.halos, this.badges, this.shadows]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
  }

  pulse(segId: number, now: number): void {
    this.pulses.set(segId, now);
  }

  /** A pulse travelling down the whole chain, head to tail (capacity upgrade). */
  pulseWave(now: number, stagger = 0.045): void {
    const segs = this.sim.state.progress.segments;
    for (let i = 0; i < segs.length; i++) this.pulses.set(segs[i].id, now + i * stagger);
  }

  /** Body b (0 = head) just ate a chunk. */
  gulp(b: number, now: number): void {
    if (b <= MAX && now - this.gulps[b] > 0.12) this.gulps[b] = now;
  }

  /** A chunk landed in body b's basket. */
  land(b: number, now: number): void {
    if (b <= MAX) this.lands[b] = now;
  }

  /** Body b heaves its cargo up and out (depot unload). */
  tip(b: number, now: number): void {
    if (b <= MAX) this.tips[b] = now;
  }

  /** Arc slot (fractional index) currently shown for a segment id. */
  slotOf(id: number): number | undefined {
    return this.slot.get(id);
  }

  update(headS: number, camera: THREE.Camera, dt: number, now: number): void {
    const sim = this.sim;
    const st = sim.state;
    const path = sim.path;
    const segs = st.progress.segments;
    const n = segs.length;
    const speedFrac = Math.min(1, st.v / vMax(st.progress.speedLevel));
    this.spin += st.v * dt * 4;
    const odo = st.odometer;

    // Ease each segment's displayed slot towards its true index (no allocations).
    const k = 1 - Math.exp(-dt / 0.12);
    this.alive.clear();
    for (let i = 0; i < n; i++) {
      const id = segs[i].id;
      this.alive.add(id);
      const cur = this.slot.get(id);
      this.slot.set(id, cur === undefined ? i : cur + (i - cur) * k);
    }
    if (this.slot.size > n) for (const id of this.slot.keys()) if (!this.alive.has(id)) this.slot.delete(id);

    // ——— Head rig ———
    this.pose(0, headS, path, odo);
    const hp = this.poses[0];
    const accel = dt > 0 ? (st.v - this.prevV) / dt : 0;
    this.prevV = st.v;
    this.accelS += (accel - this.accelS) * Math.min(1, dt * 8);
    // Weight: braking bunches the chain up, accelerating stretches it a touch; cargo makes everything heavier.
    const wantCompress = Math.max(-0.05, Math.min(0.12, -this.accelS * 0.035));
    this.compress += (wantCompress - this.compress) * Math.min(1, dt * 5);
    this.load += (Math.min(1, st.basket.mass / Math.max(1, capacityOf(st))) - this.load) * Math.min(1, dt * 3);
    const grinding = now < this.grindUntil;
    this.lastNow = now;
    let dyaw = hp.yaw - this.prevYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.prevYaw = hp.yaw;
    this.turn += ((dt > 0 ? dyaw / dt : 0) - this.turn) * Math.min(1, dt * 6);
    const breathe = 1 + Math.sin(now * 2.2) * 0.02 * (1 - speedFrac);
    this.head.position.set(hp.x, hp.y - 0.04 * this.load, hp.z);
    // Pitch: nod with the stride, dip forward when accelerating, rear back when braking. Roll: lean into turns.
    this.head.rotation.set(
      Math.max(-0.14, Math.min(0.14, -this.turn * 0.09)),
      hp.yaw + (grinding ? Math.sin(now * 60) * 0.03 : 0),
      Math.sin(odo * 2.2) * 0.04 - Math.max(-0.1, Math.min(0.1, this.accelS * 0.025)) - 0.04 * this.load,
      'YXZ',
    );
    const hg = Math.max(0, 1 - (now - this.gulps[0]) / 0.18);
    this.head.scale.set(1.25 * (1 + hg * 0.06), 1.25 * breathe * (1 - hg * 0.05), 1.25 * (1 + hg * 0.06));
    // Blink every few seconds.
    if (now >= this.nextBlink && this.blinkT < 0) this.blinkT = now;
    let eyeY = 1;
    if (this.blinkT >= 0) {
      const u = (now - this.blinkT) / 0.16;
      eyeY = Math.max(0.08, Math.abs(1 - 2 * Math.min(1, u)));
      if (u >= 1) {
        this.blinkT = -1;
        this.nextBlink = now + 1.8 + Math.random() * 3.5;
      }
    }
    this.eyes.scale.set(1, eyeY, 1);
    // Pupils look into turns and up when idle.
    this.pupils.position.set(0.16, (1 - speedFrac) * 0.03, Math.max(-0.06, Math.min(0.06, this.turn * 0.05)));
    // Antennae: damped springs kicked by acceleration and turning.
    for (let i = 0; i < 2; i++) {
      const s = this.antSpring[i];
      const force = -accel * 0.08 - this.turn * 0.25 * (i === 0 ? 1 : 0.8) + Math.sin(odo * 3 + i) * 0.4 * speedFrac;
      s.v += (-90 * s.a - 7 * s.v + force * 20) * dt;
      s.a += s.v * dt;
      s.a = Math.max(-0.6, Math.min(0.6, s.a));
      this.antennae[i].rotation.set((i === 0 ? 0.35 : -0.35) + s.a * 0.5, 0, -0.25 + s.a);
    }
    // Mandibles chomp; faster at speed, snap shut on a gulp.
    this.chompPhase += dt * (3 + 13 * speedFrac);
    const open = (0.18 + 0.32 * Math.abs(Math.sin(this.chompPhase))) * (0.35 + 0.65 * speedFrac) * (1 - hg * 0.8);
    this.mandibles[0].rotation.y = -open;
    this.mandibles[1].rotation.y = open;

    this.setShadow(0, hp, 1.2);
    this.setLegs(0, hp, odo, 0);
    this.setBlade(0, hp, 0.62, 0.62, 0.28);
    this.setBlade(1, hp, -0.62, 0.62, 0.28);

    camera.getWorldPosition(V2);
    const camX = V2.x;
    const camZ = V2.z;
    camera.getWorldQuaternion(Q2);
    let nh = 0;
    let nc = 0;
    let na = 0;
    for (let i = 0; i < n; i++) {
      const seg = segs[i];
      const slot = this.slot.get(seg.id) ?? i;
      const s = headS - (BODY.HEAD_GAP + slot * BODY.SEG_SPACING) * (1 - this.compress);
      this.pose(i + 1, s, path, odo, i + 1);
      const p = this.poses[i + 1];
      let scale = 1 + Math.min(0.15, 0.015 * (seg.level - 1));
      const pt = this.pulses.get(seg.id);
      if (pt !== undefined) {
        const u = (now - pt) / 0.45;
        if (u >= 1) this.pulses.delete(seg.id);
        else if (u > 0) scale *= 1 + 0.35 * Math.sin(u * Math.PI) * (1 - u);
      }
      const et = this.emerge.get(seg.id);
      if (et !== undefined) {
        // Hidden while the ghosts travel in, then an overshooting pop.
        const u = (now - et) / MERGE_POP;
        if (u >= 1) this.emerge.delete(seg.id);
        else scale *= u < 0 ? 0.35 : 0.35 + 0.65 * easeOutBack(u);
      }
      const g = Math.max(0, 1 - (now - this.gulps[i + 1]) / 0.16);
      // A landing chunk pushes the segment down a touch and it springs back.
      const lu = (now - this.lands[i + 1]) / 0.2;
      const dip = lu >= 0 && lu < 1 ? Math.sin(lu * Math.PI) * (1 - lu) : 0;
      // Unloading: the segment heaves its stack up and out, then settles lighter.
      const tu = (now - this.tips[i + 1]) / 0.32;
      const heave = tu >= 0 && tu < 1 ? Math.sin(tu * Math.PI) * (1 - tu * 0.6) : 0;
      // Loaded segments sit lower, squat wider and jiggle heavier with each step.
      const L = this.load;
      const squash = (1 + Math.sin(odo * 3 - (i + 1) * 0.8) * (0.04 + 0.03 * L)) * (1 + g * 0.08 + dip * 0.1 - heave * 0.1) * (1 + Math.sin(now * 2.2 - i * 0.6) * 0.015 * (1 - speedFrac));
      p.y = p.y * (1 - 0.6 * L) - 0.05 * L - dip * 0.06 + heave * 0.16;
      V.set(p.x, p.y, p.z);
      // Lean into turns (roll) — the chain follows the head's lean.
      E.set(Math.max(-0.12, Math.min(0.12, -this.turn * 0.07)), p.yaw, 0, 'YXZ');
      Q.setFromEuler(E);
      S.set(scale * squash * (1 + 0.05 * L), (scale / squash) * (1 - 0.07 * L), scale * (1 + g * 0.05) * (1 + 0.05 * L));
      M4.compose(V, Q, S);
      this.bodies.setMatrixAt(i, M4);
      this.trays.setMatrixAt(i, M4);
      // High levels shimmer.
      C.setHex(levelColor(seg.level));
      if (seg.level >= 5) C.multiplyScalar(1 + 0.12 * (0.5 + 0.5 * Math.sin(now * 4 + i)));
      this.bodies.setColorAt(i, C);
      if (seg.level >= 3) {
        this.horns.setMatrixAt(nh, M4);
        this.horns.setColorAt(nh, C.setHex(seg.level >= 7 ? 0xffd23f : 0xfff6e0));
        nh++;
      }
      if (seg.level >= 6) {
        V.set(p.x, p.y + 1.18 * scale + Math.sin(now * 3 + i) * 0.04, p.z);
        E.set(0, p.yaw + now * 0.8, 0);
        Q.setFromEuler(E);
        S.setScalar(scale);
        this.crowns.setMatrixAt(nc++, M4.compose(V, Q, S));
      }
      if (seg.level >= 9) {
        V.set(p.x, p.y + 1.55 * scale + Math.sin(now * 2 + i) * 0.05, p.z);
        E.set(0.15 * Math.sin(now + i), now * 1.5, 0);
        Q.setFromEuler(E);
        S.setScalar(scale);
        this.halos.setMatrixAt(na++, M4.compose(V, Q, S));
      }
      this.setShadow(i + 1, p, scale);
      this.setLegs(i + 1, p, odo, i + 1);
      this.setBlade(2 + i * 2, p, 0.56 * scale, 0.45 * scale, 0.3 * scale);
      this.setBlade(3 + i * 2, p, -0.56 * scale, 0.45 * scale, 0.3 * scale);
      // Badge: billboard on the camera-facing side of the body.
      let dx = camX - p.x;
      let dz = camZ - p.z;
      const dl = Math.hypot(dx, dz) || 1;
      dx = (dx / dl) * 0.72 * scale;
      dz = (dz / dl) * 0.72 * scale;
      V.set(p.x + dx, p.y + 0.5 * scale, p.z + dz);
      S.setScalar(scale * (1 + g * 0.15));
      M4.compose(V, Q2, S);
      this.badges.setMatrixAt(i, M4);
      this.cellAttr.setX(i, Math.min(63, seg.level - 1));
    }
    // Merge ghosts: the consumed segments accelerate into the new one and shrink as they arrive.
    let ng = 0;
    for (let k = 0; k < this.ghosts.length; k++) {
      const gh = this.ghosts[k];
      const u = (now - gh.t0) / MERGE_TRAVEL;
      if (u >= 1) continue;
      const target = this.slot.get(gh.into) ?? gh.fromSlot;
      const e = u * u * u;
      const slot = gh.fromSlot + (target - gh.fromSlot) * e;
      this.pose(MAX, headS - BODY.HEAD_GAP - slot * BODY.SEG_SPACING, path, odo, MAX);
      const p = this.poses[MAX];
      const sc = (1 + Math.min(0.15, 0.015 * (gh.level - 1))) * (1 - 0.45 * e);
      // Stretch along the direction of travel as it speeds up.
      V.set(p.x, p.y + 0.06 * Math.sin(u * Math.PI), p.z);
      E.set(0, p.yaw, 0);
      Q.setFromEuler(E);
      S.set(sc * (1 + 0.25 * e), sc * (1 - 0.12 * e), sc);
      M4.compose(V, Q, S);
      this.bodies.setMatrixAt(n + ng, M4);
      this.bodies.setColorAt(n + ng, C.setHex(levelColor(gh.level)));
      ng++;
    }
    if (ng === 0 && this.ghosts.length) this.ghosts.length = 0;
    this.bodies.count = n + ng;
    this.bodyOutline.count = n + ng;
    this.trays.count = n;
    this.badges.count = n;
    this.blades.count = 2 + n * 2;
    this.legs.count = (n + 1) * 2;
    this.shadows.count = n + 1;
    this.horns.count = nh;
    this.crowns.count = nc;
    this.halos.count = na;
    for (const m of [this.bodies, this.trays, this.blades, this.legs, this.badges, this.shadows, this.horns, this.crowns, this.halos]) m.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.horns.instanceColor) this.horns.instanceColor.needsUpdate = true;
    this.cellAttr.needsUpdate = true;
  }

  /** Point slightly behind body b on the path (for dust puffs). */
  tailPoint(b: number, back: number): PathSample {
    const p = this.poses[b];
    ps2.x = p.x - p.tx * back;
    ps2.z = p.z - p.tz * back;
    ps2.tx = p.tx;
    ps2.tz = p.tz;
    return ps2;
  }

  private pose(b: number, s: number, path: Sim['path'], odo: number, wave = b): void {
    sampleAt(path, wrap(s, path.length), ps);
    const p = this.poses[b];
    p.x = ps.x;
    p.z = ps.z;
    p.tx = ps.tx;
    p.tz = ps.tz;
    p.y = Math.max(0, Math.sin(odo * 3 - wave * 0.8)) * 0.08;
    p.yaw = Math.atan2(-ps.tz, ps.tx);
  }

  private setShadow(i: number, p: BodyPose, scale: number): void {
    V.set(p.x, 0.03, p.z);
    E.set(0, p.yaw, 0);
    Q.setFromEuler(E);
    S.setScalar(scale);
    M4.compose(V, Q, S);
    this.shadows.setMatrixAt(i, M4);
  }

  private setLegs(b: number, p: BodyPose, odo: number, phase: number): void {
    const c = Math.cos(p.yaw);
    const sn = Math.sin(p.yaw);
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? 1 : -1;
      const lift = Math.max(0, Math.sin(odo * 5 + phase * 1.3 + side * Math.PI)) * 0.12;
      const lz = 0.36 * sgn;
      V.set(p.x + lz * sn, lift, p.z + lz * c);
      E.set(0, p.yaw, 0);
      Q.setFromEuler(E);
      S.setScalar(1);
      M4.compose(V, Q, S);
      this.legs.setMatrixAt(b * 2 + side, M4);
    }
  }

  /** Blades grind (shake, spark) for a moment: the basket is full and the crop won't give. */
  grind(now: number): void {
    this.grindUntil = now + 0.6;
  }

  private setBlade(i: number, p: BodyPose, side: number, y: number, size: number): void {
    const c = Math.cos(p.yaw);
    const sn = Math.sin(p.yaw);
    const j = this.grindUntil > this.lastNow ? Math.sin(this.lastNow * 70 + i) * 0.04 : 0;
    V.set(p.x + side * sn + j, p.y + y, p.z + side * c - j);
    E.set(0, p.yaw, this.spin * (side > 0 ? 1 : -1), 'YXZ');
    Q.setFromEuler(E);
    S.setScalar(size / 0.3);
    M4.compose(V, Q, S);
    this.blades.setMatrixAt(i, M4);
  }
}
