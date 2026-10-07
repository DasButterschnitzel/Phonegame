import * as THREE from 'three';
import { smoothDampTo, clamp } from '../shared/math.ts';

const vel = { v: 0 };

/**
 * Fixed-yaw isometric-ish follow camera. Keeps a constant visible width in portrait,
 * zooms out a little as the caterpillar grows, adds small kicks for juice.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = Math.PI / 4;
  pitch = 0.92; // ~53°
  private tx = 0;
  private tz = 0;
  private vx = 0;
  private vz = 0;
  private zoom = 1;
  private shake = 0;
  private kick = 0;
  private zoomP = 0;
  reduceMotion = false;
  /** Visible world width at the target in portrait. */
  baseWidth = 10;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
  }

  snap(x: number, z: number): void {
    this.tx = x;
    this.tz = z;
    this.vx = 0;
    this.vz = 0;
  }

  addShake(amount: number): void {
    if (!this.reduceMotion) this.shake = Math.min(0.4, this.shake + amount);
  }

  /** Temporary zoom-out (e.g. to reveal a freshly expanded path); eases back on its own. */
  zoomPulse(amount: number): void {
    if (!this.reduceMotion) this.zoomP = Math.max(this.zoomP, amount);
  }

  addKick(amount: number): void {
    if (!this.reduceMotion) this.kick = Math.min(0.15, this.kick + amount);
  }

  update(targetX: number, targetZ: number, chainLen: number, speedFrac: number, dt: number, now: number): void {
    this.tx = smoothDampTo(this.tx, targetX, this.vx, 0.28, dt, vel);
    this.vx = vel.v;
    this.tz = smoothDampTo(this.tz, targetZ, this.vz, 0.28, dt, vel);
    this.vz = vel.v;
    const wantZoom = 1 + clamp(chainLen / 40, 0, 0.55) + speedFrac * 0.04;
    this.zoom += (wantZoom - this.zoom) * (1 - Math.exp(-dt / 0.8));
    const cam = this.camera;
    const aspect = cam.aspect;
    const halfV = THREE.MathUtils.degToRad(cam.fov / 2);
    // Portrait: fit width; landscape: fit an equivalent height so tablets/desktop see a similar area.
    const width = this.baseWidth * this.zoom * (1 + this.zoomP);
    this.zoomP *= Math.exp(-dt / 1.1);
    const dist = aspect < 1 ? width / (2 * Math.tan(halfV) * aspect) : (width * 1.25) / (2 * Math.tan(halfV));
    const d = dist * (1 - this.kick);
    this.kick *= Math.exp(-dt / 0.15);
    let sx = 0;
    let sz = 0;
    if (this.shake > 0.001) {
      sx = Math.sin(now * 61) * this.shake;
      sz = Math.cos(now * 53) * this.shake;
      this.shake *= Math.exp(-dt / 0.12);
    }
    const ch = Math.cos(this.pitch);
    cam.position.set(
      this.tx + Math.sin(this.yaw) * ch * d + sx,
      Math.sin(this.pitch) * d,
      this.tz + Math.cos(this.yaw) * ch * d + sz,
    );
    cam.lookAt(this.tx + sx * 0.5, 0, this.tz + sz * 0.5);
  }
}
