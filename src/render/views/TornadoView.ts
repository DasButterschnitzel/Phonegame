import * as THREE from 'three';

/** A short-lived swirling funnel where the tornado consumable lands. */
export class TornadoView {
  readonly group = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private t0 = -1;
  private readonly dur = 1.7;

  constructor() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xe8eef5, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
    const dark = new THREE.MeshLambertMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const r0 = 0.35 + i * 0.45;
      const geo = new THREE.CylinderGeometry(r0 + 0.45, r0, 0.9, 9, 1, true);
      const m = new THREE.Mesh(geo, i % 2 ? dark : mat);
      m.position.y = 0.45 + i * 0.85;
      this.rings.push(m);
      this.group.add(m);
    }
    this.group.visible = false;
  }

  play(x: number, z: number, now: number): void {
    this.group.position.set(x, 0, z);
    this.t0 = now;
    this.group.visible = true;
  }

  update(now: number): void {
    if (this.t0 < 0) return;
    const u = (now - this.t0) / this.dur;
    if (u >= 1) {
      this.group.visible = false;
      this.t0 = -1;
      return;
    }
    const grow = u < 0.2 ? u / 0.2 : u > 0.75 ? (1 - u) / 0.25 : 1;
    this.group.scale.set(grow, 0.3 + 0.7 * grow, grow);
    this.rings.forEach((m, i) => {
      m.rotation.y = now * (8 - i) * (i % 2 ? -1 : 1);
      m.position.x = Math.sin(now * 6 + i) * 0.15 * i;
    });
  }
}
