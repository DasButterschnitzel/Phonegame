import * as THREE from 'three';

interface Wave {
  mesh: THREE.Mesh;
  t0: number;
  dur: number;
  size: number;
}

/** Expanding ground rings for impacts (merge, expand, tornado, unload). Small fixed pool. */
export class Shockwaves {
  readonly group = new THREE.Group();
  private waves: Wave[] = [];

  constructor(pool = 6) {
    const geo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
    for (let i = 0; i < pool; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 3;
      mesh.visible = false;
      this.group.add(mesh);
      this.waves.push({ mesh, t0: -1, dur: 0.6, size: 3 });
    }
  }

  spawn(x: number, z: number, color: number, size: number, now: number, dur = 0.6): void {
    const w = this.waves.reduce((a, b) => (a.t0 < b.t0 ? a : b));
    w.t0 = now;
    w.dur = dur;
    w.size = size;
    w.mesh.position.set(x, 0.08, z);
    (w.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    w.mesh.visible = true;
  }

  update(now: number): void {
    for (const w of this.waves) {
      if (w.t0 < 0) continue;
      const u = (now - w.t0) / w.dur;
      if (u >= 1) {
        w.t0 = -1;
        w.mesh.visible = false;
        continue;
      }
      const e = 1 - (1 - u) ** 3;
      w.mesh.scale.setScalar(0.2 + e * w.size);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - u);
    }
  }

  /** Make every pooled mesh renderable for shader warm-up. */
  setAllVisible(v: boolean): void {
    for (const w of this.waves) if (w.t0 < 0) w.mesh.visible = v;
  }
}
