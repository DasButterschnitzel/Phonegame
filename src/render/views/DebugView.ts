import * as THREE from 'three';
import type { Sim } from '../../game/sim.ts';
import type { PathTable } from '../../game/types.ts';
import { BODY } from '../../game/config.ts';
import { isFrontier } from '../../game/territory.ts';
import { sampleAt } from '../../game/path.ts';

const CELL_PX = 64;

/**
 * Debug overlay (only built with `?debug=1`, toggled from the console): the route polyline, every plot's state
 * (claimed / ready / frontier / closed zone / rock) with its index, zone and blocker count, the depot chute line,
 * and each body's chomp reach.
 */
export class DebugView {
  readonly group = new THREE.Group();
  private sim: Sim;
  private route: THREE.LineLoop | null = null;
  private routeOf: PathTable | null = null;
  private labels: THREE.Mesh | null = null;
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture | null = null;
  private reach: THREE.LineSegments;
  private reachPos: Float32Array;
  private chute: THREE.Line;
  private last = -1;

  constructor(sim: Sim) {
    this.sim = sim;
    this.group.renderOrder = 10;
    const segs = 24;
    this.reachPos = new Float32Array(34 * segs * 2 * 3);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.reachPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.reach = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xff3df0, depthTest: false, transparent: true, opacity: 0.6 }));
    this.reach.frustumCulled = false;
    this.chute = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x00e5ff, depthTest: false }));
    this.group.add(this.reach, this.chute);
  }

  private rebuildRoute(): void {
    const p = this.sim.path;
    if (this.route) {
      this.group.remove(this.route);
      this.route.geometry.dispose();
    }
    const pts = new Float32Array(p.n * 3);
    for (let i = 0; i < p.n; i++) pts.set([p.x[i], 0.12, p.z[i]], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.route = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.route.frustumCulled = false;
    this.group.add(this.route);
    this.routeOf = p;
    // Chute trigger: a line across the route at the depot.
    const b = sampleAt(p, p.barnS, { x: 0, z: 0, tx: 0, tz: 0 });
    const n = [-b.tz * 1.6, b.tx * 1.6];
    this.chute.geometry.dispose();
    this.chute.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(b.x - n[0], 0.15, b.z - n[1]), new THREE.Vector3(b.x + n[0], 0.15, b.z + n[1])]);
  }

  private drawLabels(): void {
    const { farm, terr, state } = this.sim;
    const l = farm.layout;
    const c = this.canvas;
    if (c.width !== l.cols * CELL_PX) {
      c.width = l.cols * CELL_PX;
      c.height = l.rows * CELL_PX;
    }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.font = 'bold 15px monospace';
    g.textAlign = 'center';
    for (let p = 0; p < l.cols * l.rows; p++) {
      const x = (p % l.cols) * CELL_PX;
      const y = Math.floor(p / l.cols) * CELL_PX;
      const z = l.zone[p];
      const color = z < 0 ? '#777' : terr.claimed[p] ? '#2ecc40' : terr.readySince[p] >= 0 ? '#ffdc00' : isFrontier(terr, p, state.progress.zone) ? '#39cccc' : z > state.progress.zone ? '#ff4136' : '#ffffff';
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.strokeRect(x + 3, y + 3, CELL_PX - 6, CELL_PX - 6);
      if (z < 0) continue;
      g.fillStyle = color;
      g.fillText(`#${p} z${z}`, x + CELL_PX / 2, y + 26);
      if (!terr.claimed[p]) g.fillText(`b${terr.blockers[p]} d${terr.deadIn[p]}`, x + CELL_PX / 2, y + 46);
    }
    if (!this.tex) {
      this.tex = new THREE.CanvasTexture(c);
      this.labels = new THREE.Mesh(
        new THREE.PlaneGeometry(l.cols * l.plot, l.rows * l.plot).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false }),
      );
      this.labels.position.set(l.x0 + (l.cols * l.plot) / 2, 0.1, l.z0 + (l.rows * l.plot) / 2);
      this.group.add(this.labels);
    }
    this.tex.needsUpdate = true;
  }

  /** Farm changed: drop the label plane (sized per farm). */
  reset(): void {
    if (this.labels) {
      this.group.remove(this.labels);
      this.labels.geometry.dispose();
    }
    this.labels = null;
    this.tex?.dispose();
    this.tex = null;
    this.routeOf = null;
  }

  update(now: number, poses?: readonly { x: number; z: number }[]): void {
    if (!this.group.visible) return;
    if (this.routeOf !== this.sim.path) this.rebuildRoute();
    if (now - this.last > 0.25) {
      this.last = now;
      this.drawLabels();
    }
    if (!poses) return;
    const n = Math.min(34, this.sim.state.progress.segments.length + 1);
    const segs = 24;
    let o = 0;
    for (let b = 0; b < n; b++) {
      const p = poses[b];
      for (let k = 0; k < segs; k++) {
        const a0 = (k / segs) * Math.PI * 2;
        const a1 = ((k + 1) / segs) * Math.PI * 2;
        this.reachPos.set([p.x + Math.cos(a0) * BODY.REACH, 0.14, p.z + Math.sin(a0) * BODY.REACH, p.x + Math.cos(a1) * BODY.REACH, 0.14, p.z + Math.sin(a1) * BODY.REACH], o);
        o += 6;
      }
    }
    this.reach.geometry.setDrawRange(0, o / 3);
    (this.reach.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
