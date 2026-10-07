import { h } from './dom.ts';

interface F {
  el: HTMLElement;
  anim: Animation | null;
  t0: number;
}

/** Pooled DOM "+N" texts; each runs a single WAAPI animation on the compositor (no per-frame JS). */
export class Floaters {
  private pool: F[] = [];
  private layer: HTMLElement;
  private next = 0;

  constructor(root: HTMLElement, size = 28) {
    this.layer = h('div', { style: 'position:absolute;inset:0;pointer-events:none;overflow:hidden' });
    root.append(this.layer);
    for (let i = 0; i < size; i++) {
      const el = h('div', { class: 'floater outline', style: 'display:none' });
      this.layer.append(el);
      this.pool.push({ el, anim: null, t0: 0 });
    }
  }

  spawn(x: number, y: number, text: string, cls = '', dur = 0.9): void {
    // Round-robin: the oldest floater is recycled when all are busy.
    const f = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    f.anim?.cancel();
    const px = x + (Math.random() - 0.5) * 16;
    f.el.className = `floater outline ${cls}`;
    f.el.textContent = text;
    f.el.style.display = '';
    const at = (dy: number, s: number) => `translate3d(${px.toFixed(1)}px, ${(y - dy).toFixed(1)}px, 0) translate(-50%, -50%) scale(${s})`;
    f.anim = f.el.animate(
      [
        { transform: at(0, 0.5), opacity: 1 },
        { transform: at(22, 1.15), opacity: 1, offset: 0.15 },
        { transform: at(46, 1), opacity: 1, offset: 0.7 },
        { transform: at(60, 0.95), opacity: 0 },
      ],
      { duration: dur * 1000, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' },
    );
    f.anim.onfinish = () => {
      f.el.style.display = 'none';
      f.anim = null;
    };
  }

  /** Kept for API compatibility; animations run on their own. */
  update(): void {}
}
