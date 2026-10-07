import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { BODY } from '../../game/config.ts';
import { sampleAt, type PathSample } from '../../game/path.ts';
import { bladeGeometry, headGeometry, legGeometry, segmentGeometry, trayGeometry } from '../geo/caterpillar.ts';
import { blobTexture } from '../geo/world.ts';
import { lambert } from '../geo/lowpoly.ts';
import { badgeMaterial, numberAtlas } from '../fx/NumberAtlas.ts';
import { levelColor } from '../palette.ts';
import { C, E, M4, Q, Q2, S, V, V2 } from '../scratch.ts';
import { wrap } from '../../shared/math.ts';

const MAX = 32;
const ps: PathSample = { x: 0, z: 0, tx: 0, tz: 0 };

export interface BodyPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
}

/**
 * The robot caterpillar: head mesh plus instanced bodies, trays, side blades, legs, level badges and blob shadows.
 * Visual segments are keyed by id and spring towards their simulated slot, so merges/reorders animate smoothly.
 */
export class CaterpillarView {
  readonly group = new THREE.Group();
  readonly head: THREE.Mesh;
  private bodies: THREE.InstancedMesh;
  private trays: THREE.InstancedMesh;
  private blades: THREE.InstancedMesh;
  private legs: THREE.InstancedMesh;
  private badges: THREE.InstancedMesh;
  private shadows: THREE.InstancedMesh;
  private cellAttr: THREE.InstancedBufferAttribute;
  private slot = new Map<number, number>();
  private spin = 0;
  /** Latest world pose of each body (0 = head) for other views (stacks, particles). */
  readonly poses: BodyPose[] = Array.from({ length: MAX + 1 }, () => ({ x: 0, y: 0, z: 0, yaw: 0, tx: 1, tz: 0 }));
  private sim: Sim;
  /** Extra per-segment scale pulses (merge pop). */
  private pulses = new Map<number, number>();

  constructor(sim: Sim) {
    this.sim = sim;
    const mat = lambert();
    this.head = new THREE.Mesh(headGeometry(), mat);
    this.group.add(this.head);
    this.bodies = new THREE.InstancedMesh(segmentGeometry(), mat, MAX);
    this.bodies.setColorAt(0, C.set(0xffffff));
    this.trays = new THREE.InstancedMesh(trayGeometry(), mat, MAX);
    this.blades = new THREE.InstancedMesh(bladeGeometry(), mat, MAX * 2 + 2);
    this.legs = new THREE.InstancedMesh(legGeometry(), mat, (MAX + 1) * 2);
    const plane = new THREE.PlaneGeometry(0.46, 0.46);
    this.badges = new THREE.InstancedMesh(plane, badgeMaterial(numberAtlas()), MAX);
    this.cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    this.badges.geometry.setAttribute('aCell', this.cellAttr);
    const shadowGeo = new THREE.PlaneGeometry(1.5, 1.2).rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
      MAX + 1,
    );
    this.shadows.renderOrder = -1;
    for (const m of [this.bodies, this.trays, this.blades, this.legs, this.badges, this.shadows]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
  }

  pulse(segId: number, now: number): void {
    this.pulses.set(segId, now);
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
    this.spin += st.v * dt * 4;
    const odo = st.odometer;

    // Ease each segment's displayed slot towards its true index.
    const k = 1 - Math.exp(-dt / 0.12);
    const alive = new Set<number>();
    for (let i = 0; i < n; i++) {
      const id = segs[i].id;
      alive.add(id);
      const cur = this.slot.get(id);
      this.slot.set(id, cur === undefined ? i : cur + (i - cur) * k);
    }
    for (const id of [...this.slot.keys()]) if (!alive.has(id)) this.slot.delete(id);

    // Head.
    this.pose(0, headS, path, odo);
    const hp = this.poses[0];
    this.head.position.set(hp.x, hp.y, hp.z);
    this.head.scale.setScalar(1.25);
    this.head.rotation.set(0, hp.yaw, Math.sin(odo * 2.2) * 0.04);
    this.setShadow(0, hp, 1.2);
    this.setLegs(0, hp, odo, 0);
    this.setBlade(0, hp, 0.62, 0.62, 0.28);
    this.setBlade(1, hp, -0.62, 0.62, 0.28);

    for (let i = 0; i < n; i++) {
      const seg = segs[i];
      const slot = this.slot.get(seg.id) ?? i;
      const s = headS - BODY.HEAD_GAP - slot * BODY.SEG_SPACING;
      this.pose(i + 1, s, path, odo, i + 1);
      const p = this.poses[i + 1];
      let scale = 1 + Math.min(0.15, 0.015 * (seg.level - 1));
      const pt = this.pulses.get(seg.id);
      if (pt !== undefined) {
        const u = (now - pt) / 0.45;
        if (u >= 1) this.pulses.delete(seg.id);
        else scale *= 1 + 0.35 * Math.sin(u * Math.PI) * (1 - u);
      }
      const squash = 1 + Math.sin(odo * 3 - (i + 1) * 0.8) * 0.04;
      V.set(p.x, p.y, p.z);
      E.set(0, p.yaw, 0);
      Q.setFromEuler(E);
      S.set(scale * squash, scale / squash, scale);
      M4.compose(V, Q, S);
      this.bodies.setMatrixAt(i, M4);
      this.trays.setMatrixAt(i, M4);
      this.bodies.setColorAt(i, C.setHex(levelColor(seg.level)));
      this.setShadow(i + 1, p, scale);
      this.setLegs(i + 1, p, odo, i + 1);
      this.setBlade(2 + i * 2, p, 0.56 * scale, 0.45 * scale, 0.3 * scale);
      this.setBlade(3 + i * 2, p, -0.56 * scale, 0.45 * scale, 0.3 * scale);
      // Badge: billboard on the camera-facing side of the body.
      camera.getWorldPosition(V2);
      V2.sub(V).setY(0).normalize().multiplyScalar(0.72 * scale);
      V.set(p.x + V2.x, p.y + 0.5 * scale, p.z + V2.z);
      camera.getWorldQuaternion(Q2);
      S.setScalar(scale);
      M4.compose(V, Q2, S);
      this.badges.setMatrixAt(i, M4);
      this.cellAttr.setX(i, Math.min(63, seg.level - 1));
    }
    this.bodies.count = n;
    this.trays.count = n;
    this.badges.count = n;
    this.blades.count = 2 + n * 2;
    this.legs.count = (n + 1) * 2;
    this.shadows.count = n + 1;
    for (const m of [this.bodies, this.trays, this.blades, this.legs, this.badges, this.shadows]) m.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    this.cellAttr.needsUpdate = true;
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
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? 1 : -1;
      const lift = Math.max(0, Math.sin(odo * 5 + phase * 1.3 + side * Math.PI)) * 0.12;
      const lx = 0;
      const lz = 0.36 * sgn;
      // Rotate local offset by yaw.
      const c = Math.cos(p.yaw);
      const sn = Math.sin(p.yaw);
      V.set(p.x + lx * c + lz * sn, lift, p.z - lx * sn + lz * c);
      E.set(0, p.yaw, 0);
      Q.setFromEuler(E);
      S.setScalar(1);
      M4.compose(V, Q, S);
      this.legs.setMatrixAt(b * 2 + side, M4);
    }
  }

  private setBlade(i: number, p: BodyPose, side: number, y: number, size: number): void {
    const c = Math.cos(p.yaw);
    const sn = Math.sin(p.yaw);
    V.set(p.x + side * sn, p.y + y, p.z + side * c);
    E.set(0, p.yaw, this.spin * (side > 0 ? 1 : -1), 'YXZ');
    Q.setFromEuler(E);
    S.setScalar(size / 0.3);
    M4.compose(V, Q, S);
    this.blades.setMatrixAt(i, M4);
  }
}

