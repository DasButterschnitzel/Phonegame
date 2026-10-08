import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import { capacityOf } from '../../game/config.ts';
import { sampleAt } from '../../game/path.ts';
import { arrowGeometry, barnDoorGeometry, barnGeometry, chevronGeometry, conveyorGeometry, depotPadGeometry, depotSignGeometry, hopperGeometry } from '../geo/world.ts';
import { hullGeometry, outlineMaterial, toon } from '../materials.ts';
import { RED_BARN, biomeLook } from '../palette.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, E, M4, Q, S, V } from '../scratch.ts';
import { clamp, easeOutBack, wrap } from '../../shared/math.ts';

const PAD_LEN = 3.4;
const PAD_W = 1.75;
const HOPPER_OUT = 1.55;
const CHEVRONS = 3;
const CLEATS = 6;
/** Distance ahead (along the route) at which the depot starts reacting to an approaching load. */
const APPROACH = 9;

/**
 * The depot: barn with swinging doors, a hopper/chute beside the route, a short conveyor into the barn, a painted
 * unloading bay with chevrons, and a sign. Everything wakes up as a loaded caterpillar approaches, so the drop-off
 * point is unmistakable.
 */
export class DepotView {
  readonly group = new THREE.Group();
  barn!: THREE.Group;
  private sim: Sim;
  private mat = toon({ rim: 0.12 });
  private glowMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  private doors!: THREE.InstancedMesh;
  private doorOpen = 0;
  private hopper!: THREE.Mesh;
  private chevrons!: THREE.InstancedMesh;
  private cleats!: THREE.InstancedMesh;
  private padGlow!: THREE.Mesh;
  private arrow!: THREE.Mesh;
  private arrowShown = 0;
  private beltPhase = 0;
  private beltRun = 0;
  private bounceT = -1;
  private hopperT = -1;
  private cueT = -1;
  private cueLevel = 0;
  private wakeT = -1;
  /** World positions used by other views (stack fliers aim here). */
  readonly hopperTop = new THREE.Vector3();
  readonly doorPos = new THREE.Vector3();
  private tx = 1;
  private tz = 0;
  private staticGeo: THREE.BufferGeometry | null = null;

  constructor(sim: Sim) {
    this.sim = sim;
    this.rebuild();
  }

  rebuild(): void {
    // Free the previous farm's depot: every geometry and the materials made for it (the shared toon and glow stay).
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m !== this.mat && m !== this.glowMat) m.dispose();
      });
    }
    this.staticGeo = null;
    const { farm, path } = this.sim;
    const [nx, nz] = farm.layout.depotNormal;
    const t = sampleAt(path, path.barnS, { x: 0, z: 0, tx: 0, tz: 0 });
    this.tx = t.tx;
    this.tz = t.tz;
    const { x, z, bx, bz } = farm.barn;
    const faceYaw = Math.atan2(x - bx, z - bz);
    const outline = outlineMaterial(0.05);

    // Barn (door panels hinge open to both sides).
    this.barn = new THREE.Group();
    const skin = biomeLook(farm.biome).depot ?? RED_BARN;
    const barnMesh = new THREE.Mesh(barnGeometry(skin), this.mat);
    barnMesh.add(new THREE.Mesh(hullGeometry(barnMesh.geometry), outline));
    this.barn.add(barnMesh);
    // Both door panels in one draw call (hinged at the doorway edges, swung by the update).
    this.doors = new THREE.InstancedMesh(barnDoorGeometry(skin), this.mat, 2);
    this.doors.frustumCulled = false;
    this.doors.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.barn.add(this.doors);
    this.doorOpen = -1;
    this.barn.position.set(bx, 0, bz);
    this.barn.rotation.y = faceYaw;
    this.group.add(this.barn);

    // Hopper beside the route, conveyor into the barn door.
    const hx = x + nx * HOPPER_OUT;
    const hz = z + nz * HOPPER_OUT;
    this.hopper = new THREE.Mesh(hopperGeometry(), this.mat);
    this.hopper.add(new THREE.Mesh(hullGeometry(this.hopper.geometry), outline));
    this.hopper.position.set(hx, 0, hz);
    this.hopper.rotation.y = faceYaw;
    this.group.add(this.hopper);
    this.hopperTop.set(hx, 1.45, hz);
    const doorDist = Math.hypot(bx - hx, bz - hz) - 1.3;
    const beltYaw = Math.atan2(bx - hx, bz - hz);
    // Static pieces (conveyor bed, painted bay, sign) are merged into one mesh: one draw call.
    const statics: THREE.BufferGeometry[] = [];
    const place = (g: THREE.BufferGeometry, x0: number, y0: number, z0: number, yaw: number) =>
      statics.push(g.applyMatrix4(new THREE.Matrix4().compose(V.set(x0, y0, z0), Q.setFromEuler(E.set(0, yaw, 0)), S.setScalar(1))));
    place(conveyorGeometry(Math.max(0.3, doorDist)), hx, 0, hz, beltYaw);
    this.doorPos.set(hx + (bx - hx) * (doorDist / (doorDist + 1.3)), 0.9, hz + (bz - hz) * (doorDist / (doorDist + 1.3)));
    this.cleats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), new THREE.MeshLambertMaterial({ color: 0x2b2f38 }), CLEATS);
    this.cleats.frustumCulled = false;
    this.cleats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cleats.userData = { x: hx, z: hz, yaw: beltYaw, len: Math.max(0.3, doorDist) };
    this.group.add(this.cleats);

    // Painted bay on the route + chevrons pointing the way you drive.
    const padYaw = Math.atan2(-this.tz, this.tx);
    place(depotPadGeometry(PAD_LEN, PAD_W), x, 0.012, z, padYaw);
    this.padGlow = new THREE.Mesh(new THREE.PlaneGeometry(PAD_LEN + 0.5, PAD_W + 0.5).rotateX(-Math.PI / 2), this.glowMat);
    this.padGlow.position.set(x, 0.045, z);
    this.padGlow.rotation.y = padYaw;
    this.padGlow.renderOrder = 2;
    this.group.add(this.padGlow);
    this.chevrons = new THREE.InstancedMesh(chevronGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }), CHEVRONS);
    this.chevrons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chevrons.setColorAt(0, C.set(0xffffff));
    this.chevrons.frustumCulled = false;
    this.group.add(this.chevrons);

    // Sign on the far side of the bay.
    place(depotSignGeometry(), x + this.tx * (PAD_LEN / 2 + 0.6) + nx * 1.05, 0, z + this.tz * (PAD_LEN / 2 + 0.6) + nz * 1.05, faceYaw);
    this.staticGeo = mergeGeometries(statics);
    for (const g of statics) g.dispose();
    if (this.staticGeo) this.group.add(new THREE.Mesh(this.staticGeo, this.mat));

    this.arrow = new THREE.Mesh(arrowGeometry(), this.mat);
    this.arrow.add(new THREE.Mesh(hullGeometry(this.arrow.geometry), outline));
    this.arrow.visible = false;
    this.group.add(this.arrow);
  }

  /** A load landed: barn squash-and-stretch. */
  bounce(now: number): void {
    this.bounceT = now;
  }

  /** The unload wave starts: the hopper rears up to catch, the bay flashes, the conveyor starts. */
  wake(now: number): void {
    this.wakeT = now;
    this.beltRun = 2;
  }

  /** A segment just tipped its cargo into the hopper. */
  onSegment(now: number): void {
    this.hopperT = now;
    this.beltRun = 1.2;
  }

  /** Approach milestone reached (1 = half a lap away, 2 = a quarter, 3 = right before the chute): flash the bay. */
  cue(level: number): void {
    this.cueT = performance.now() / 1000;
    this.cueLevel = level;
  }

  /** 0..1: how close a loaded caterpillar is to the bay (0 = far or empty). */
  approach(): number {
    const st = this.sim.state;
    if (st.basket.mass <= 0 && !st.depot.active) return 0;
    if (st.depot.active) return 1;
    const d = wrap(this.sim.path.barnS - st.headS, this.sim.path.length);
    return clamp(1 - d / APPROACH, 0, 1);
  }

  update(now: number, dt: number): void {
    const st = this.sim.state;
    const ap = this.approach();
    const carrying = st.basket.mass > 0;
    const fill = Math.min(1, st.basket.mass / Math.max(1, capacityOf(st)));

    // Doors swing open as a load approaches and close after the pass.
    const want = ap > 0.05 || st.depot.active ? 1 : 0;
    const prevOpen = this.doorOpen;
    this.doorOpen = prevOpen < 0 ? want : this.doorOpen + (want - this.doorOpen) * Math.min(1, dt * (want ? 6 : 3));
    if (Math.abs(this.doorOpen - prevOpen) > 1e-4) {
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1;
        V.set(-0.55 * side, 0, 1.36);
        E.set(0, -side * this.doorOpen * 1.6, 0);
        Q.setFromEuler(E);
        S.set(side, 1, 1);
        this.doors.setMatrixAt(k, M4.compose(V, Q, S));
      }
      this.doors.instanceMatrix.needsUpdate = true;
    }

    // Bay glow: a soft pulse while carrying anything, strong when close.
    const pulse = 0.5 + 0.5 * Math.sin(now * (4 + 6 * ap));
    let flash = 0;
    if (this.cueT >= 0) {
      const u = (now - this.cueT) / 0.6;
      if (u >= 1) this.cueT = -1;
      else flash = (1 - u) * (0.25 + 0.15 * this.cueLevel);
    }
    if (this.wakeT >= 0) flash = Math.max(flash, (1 - (now - this.wakeT) / 0.35) * 0.55);
    this.glowMat.opacity = carrying || st.depot.active ? Math.min(0.95, (0.08 + 0.22 * fill + 0.35 * ap) * (0.6 + 0.4 * pulse) + flash) : 0;
    this.padGlow.visible = this.glowMat.opacity > 0.01;

    // Chevrons scroll in the travel direction, brighter as you approach.
    const { x, z } = this.sim.farm.barn;
    const yaw = Math.atan2(-this.tz, this.tx);
    for (let k = 0; k < CHEVRONS; k++) {
      const u = (k / CHEVRONS + now * (0.4 + ap * 0.8)) % 1;
      const o = (u - 0.5) * (PAD_LEN - 0.6);
      V.set(x + this.tx * o, 0.03, z + this.tz * o);
      E.set(0, yaw, 0);
      Q.setFromEuler(E);
      S.setScalar(1);
      this.chevrons.setMatrixAt(k, M4.compose(V, Q, S));
      const b = 0.65 + 0.35 * Math.sin(u * Math.PI) * (0.4 + ap);
      this.chevrons.setColorAt(k, C.setRGB(b, b, b * (carrying ? 0.7 : 1)));
    }
    this.chevrons.instanceMatrix.needsUpdate = true;
    if (this.chevrons.instanceColor) this.chevrons.instanceColor.needsUpdate = true;

    // Conveyor cleats run while cargo is moving.
    this.beltRun = Math.max(0, this.beltRun - dt);
    if (st.depot.active || this.beltRun > 0) this.beltPhase += dt * 1.6;
    const cd = this.cleats.userData as { x: number; z: number; yaw: number; len: number };
    for (let k = 0; k < CLEATS; k++) {
      const u = (k / CLEATS + this.beltPhase) % 1;
      V.set(cd.x + Math.sin(cd.yaw) * u * cd.len, 0.42, cd.z + Math.cos(cd.yaw) * u * cd.len);
      E.set(0, cd.yaw, 0);
      Q.setFromEuler(E);
      S.setScalar(1);
      this.cleats.setMatrixAt(k, M4.compose(V, Q, S));
    }
    this.cleats.instanceMatrix.needsUpdate = true;

    // Hopper rears up as the wave starts (anticipation), then kicks each time a load drops in.
    let hx = 0;
    let hy = 0;
    if (this.wakeT >= 0) {
      const u = (now - this.wakeT) / 0.35;
      if (u >= 1) this.wakeT = -1;
      else hy += Math.sin(u * Math.PI) * (1 - u * 0.5) * 0.12;
    }
    if (this.hopperT >= 0) {
      const u = (now - this.hopperT) / 0.3;
      const k = u >= 1 ? 0 : Math.sin(u * Math.PI) * (1 - u);
      hx += 0.12 * k;
      hy -= 0.14 * k;
      if (u >= 1) this.hopperT = -1;
    }
    this.hopper.scale.set(1 + hx - hy * 0.4, 1 + hy, 1 + hx - hy * 0.4);

    // "Sell here" arrow while the basket is full.
    const full = st.basket.mass >= capacityOf(st);
    this.arrowShown += ((full ? 1 : 0) - this.arrowShown) * Math.min(1, dt * 8);
    this.arrow.visible = this.arrowShown > 0.02;
    if (this.arrow.visible) {
      this.arrow.position.set(this.hopperTop.x, 3.2 + Math.abs(Math.sin(now * 3.2)) * 0.6, this.hopperTop.z);
      this.arrow.rotation.y = now * 1.6;
      this.arrow.scale.setScalar(this.arrowShown * (1 + 0.08 * Math.sin(now * 6.4)));
    }

    if (this.bounceT >= 0) {
      const u = (now - this.bounceT) / 0.5;
      if (u >= 1) {
        this.bounceT = -1;
        this.barn.scale.set(1, 1, 1);
      } else {
        const k = easeOutBack(u) - u;
        const sq = Math.sin(u * Math.PI * 2) * (1 - u) * 0.1 + k * 0.02;
        this.barn.scale.set(1 + sq, 1 - sq, 1 + sq);
      }
    }
  }
}
