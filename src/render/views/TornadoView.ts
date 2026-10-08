import * as THREE from 'three';
import { C, E, M4, Q, S, V } from '../scratch.ts';
import { easeOutBack } from '../../shared/math.ts';

const HEIGHT = 6.2;
const DEBRIS = 22;

/** Open funnel surface: radius widens towards the top; `aY` is the normalized height for the shader. */
function funnelGeometry(): THREE.BufferGeometry {
  const radial = 22;
  const rings = 14;
  const pos: number[] = [];
  const ys: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const r = 0.28 + 2.4 * v ** 1.7;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      pos.push(Math.cos(a) * r, v * HEIGHT, Math.sin(a) * r);
      ys.push(v);
    }
  }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < radial; i++) {
      const a = j * (radial + 1) + i;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aY', new THREE.Float32BufferAttribute(ys, 1));
  g.setIndex(idx);
  return g;
}

const VERT = /* glsl */ `
uniform float uTime;
uniform float uLift;
attribute float aY;
varying float vY;
varying float vAng;
void main() {
  vec3 p = position;
  vAng = atan(p.z, p.x);
  vY = aY;
  // Faster spin near the ground, a twist up the funnel and a wandering axis.
  float a = uTime * (9.0 - 5.0 * aY) + aY * 2.6;
  float c = cos(a);
  float s = sin(a);
  p.xz = mat2(c, -s, s, c) * p.xz;
  p.x += sin(uTime * 5.0 + aY * 3.0) * 0.4 * aY;
  p.z += cos(uTime * 4.3 + aY * 2.4) * 0.3 * aY;
  p.y += uLift;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
varying float vY;
varying float vAng;
void main() {
  // Spiral wind bands, white on sky blue, dusty near the ground.
  float band = sin(vAng * 3.0 + vY * 10.0 - uTime * 15.0);
  float b = smoothstep(-0.15, 0.55, band);
  vec3 col = mix(vec3(0.62, 0.82, 0.96), vec3(1.0), b);
  col = mix(col, vec3(0.78, 0.64, 0.47), smoothstep(0.28, 0.0, vY) * 0.7);
  float a = (0.42 + 0.45 * b) * smoothstep(0.0, 0.06, vY) * smoothstep(1.0, 0.7, vY) * uAlpha;
  gl_FragColor = vec4(col, a);
}`;

/**
 * The tornado consumable: a spiralling funnel that snaps up out of the ground, sucks debris in and up,
 * then lifts off and fades. One shader-animated mesh + a small instanced debris swarm.
 */
export class TornadoView {
  readonly group = new THREE.Group();
  private funnel: THREE.Mesh;
  private debris: THREE.InstancedMesh;
  private uniforms = { uTime: { value: 0 }, uLift: { value: 0 }, uAlpha: { value: 1 } };
  private t0 = -1;
  private readonly dur = 1.8;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private delays = new Float32Array(DEBRIS);
  private radii = new Float32Array(DEBRIS);

  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.funnel = new THREE.Mesh(funnelGeometry(), mat);
    this.funnel.frustumCulled = false;
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), new THREE.MeshLambertMaterial(), DEBRIS);
    this.debris.setColorAt(0, C.set(0xffffff));
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.frustumCulled = false;
    this.group.add(this.funnel, this.debris);
    this.group.visible = false;
  }

  /** `colors`: what gets swept up (the farm's crop colours) for the debris. */
  /** Spin up at the head (fromX, fromZ) and race out to the target (x, z) it sweeps. */
  play(x: number, z: number, now: number, colors: readonly number[] = [0x6cc24a, 0xc9a27a], fromX = x, fromZ = z): void {
    this.from.set(fromX, 0, fromZ);
    this.to.set(x, 0, z);
    this.group.position.copy(this.from);
    this.t0 = now;
    this.group.visible = true;
    for (let k = 0; k < DEBRIS; k++) {
      this.delays[k] = Math.random() * 0.55;
      this.radii[k] = 3.2 + Math.random() * 2.6;
      this.debris.setColorAt(k, C.setHex(colors[k % colors.length]));
    }
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
  }

  update(now: number): void {
    if (this.t0 < 0) return;
    const u = (now - this.t0) / this.dur;
    if (u >= 1) {
      this.group.visible = false;
      this.t0 = -1;
      return;
    }
    const t = now - this.t0;
    this.uniforms.uTime.value = t;
    // It leaves the crawler and races to its patch during the snap-up (ease-out).
    const travel = Math.min(1, u / 0.18);
    this.group.position.lerpVectors(this.from, this.to, 1 - (1 - travel) ** 3);
    // Anticipation → snap up out of the ground → sustain → lift off and fade.
    const grow = u < 0.16 ? easeOutBack(u / 0.16) : 1;
    const leave = u > 0.72 ? (u - 0.72) / 0.28 : 0;
    this.funnel.scale.set(Math.max(0.05, grow) * (1 - 0.5 * leave), Math.max(0.05, grow), Math.max(0.05, grow) * (1 - 0.5 * leave));
    this.uniforms.uLift.value = leave * leave * 3.5;
    this.uniforms.uAlpha.value = 1 - leave;

    // Debris: spirals inward and upward from the surrounding field, then is flung out of the top.
    for (let k = 0; k < DEBRIS; k++) {
      const p = Math.min(1, Math.max(0, (u - this.delays[k]) / 0.45));
      if (p <= 0 || p >= 1) {
        this.debris.setMatrixAt(k, M4.makeScale(0, 0, 0));
        continue;
      }
      const r = this.radii[k] * (1 - p) ** 1.6 + 0.6 + p * 1.4;
      const a = k * 2.39996 + t * (6 + 6 * p);
      V.set(Math.cos(a) * r, 0.2 + p * p * HEIGHT * 0.9, Math.sin(a) * r);
      E.set(t * 7 + k, t * 5, 0);
      Q.setFromEuler(E);
      S.setScalar(1 - 0.5 * p);
      this.debris.setMatrixAt(k, M4.compose(V, Q, S));
    }
    this.debris.instanceMatrix.needsUpdate = true;
  }
}
