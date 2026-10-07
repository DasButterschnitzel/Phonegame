import { h } from './dom.ts';

interface F {
  el: HTMLElement;
  t0: number;
  dur: number;
  x: number;
  y: number;
  busy: boolean;
}

/** Pooled DOM "+N" texts animated with compositor-only transforms. */
export class Floaters {
  private pool: F[] = [];
  private layer: HTMLElement;

  constructor(root: HTMLElement, size = 28) {
    this.layer = h('div', { style: 'position:absolute;inset:0;pointer-events:none;overflow:hidden' });
    root.append(this.layer);
    for (let i = 0; i < size; i++) {
      const el = h('div', { class: 'floater outline', style: 'display:none' });
      this.layer.append(el);
      this.pool.push({ el, t0: 0, dur: 0.9, x: 0, y: 0, busy: false });
    }
  }

  spawn(x: number, y: number, text: string, cls = '', dur = 0.9): void {
    const f = this.pool.find((p) => !p.busy) ?? this.pool.reduce((a, b) => (a.t0 < b.t0 ? a : b));
    f.busy = true;
    f.t0 = performance.now() / 1000;
    f.dur = dur;
    f.x = x + (Math.random() - 0.5) * 16;
    f.y = y;
    f.el.className = `floater outline ${cls}`;
    f.el.textContent = text;
    f.el.style.display = '';
  }

  update(): void {
    const now = performance.now() / 1000;
    for (const f of this.pool) {
      if (!f.busy) continue;
      const u = (now - f.t0) / f.dur;
      if (u >= 1) {
        f.busy = false;
        f.el.style.display = 'none';
        continue;
      }
      const rise = 60 * (1 - (1 - u) ** 2);
      const s = u < 0.15 ? 0.6 + (u / 0.15) * 0.5 : 1.1 - Math.min(0.1, (u - 0.15) * 0.3);
      f.el.style.transform = `translate3d(${f.x}px, ${f.y - rise}px, 0) translate(-50%, -50%) scale(${s.toFixed(3)})`;
      f.el.style.opacity = u > 0.7 ? String(1 - (u - 0.7) / 0.3) : '1';
    }
  }
}
