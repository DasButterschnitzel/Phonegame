import { h, onTap } from './dom.ts';

const LADYBUG = `<svg viewBox="0 0 64 64"><ellipse cx="32" cy="36" rx="20" ry="22" fill="#e63946" stroke="#2b2d42" stroke-width="3"/><path d="M32 14v44" stroke="#2b2d42" stroke-width="3"/><circle cx="32" cy="14" r="10" fill="#2b2d42"/><circle cx="28" cy="12" r="2.5" fill="#fff"/><circle cx="36" cy="12" r="2.5" fill="#fff"/><circle cx="22" cy="30" r="4" fill="#2b2d42"/><circle cx="42" cy="30" r="4" fill="#2b2d42"/><circle cx="22" cy="44" r="4" fill="#2b2d42"/><circle cx="42" cy="44" r="4" fill="#2b2d42"/><path d="M26 6l-4-5M38 6l4-5" stroke="#2b2d42" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const BUTTERFLY = `<svg viewBox="0 0 64 64"><g class="wing"><path d="M32 30C20 8 4 10 6 24s16 12 26 8z" fill="#9b5de5" stroke="#2b2d42" stroke-width="2.5"/><path d="M32 34C20 50 8 52 10 42s14-10 22-8z" fill="#f15bb5" stroke="#2b2d42" stroke-width="2.5"/></g><g class="wing r"><path d="M32 30C44 8 60 10 58 24s-16 12-26 8z" fill="#9b5de5" stroke="#2b2d42" stroke-width="2.5"/><path d="M32 34C44 50 56 52 54 42s-14-10-22-8z" fill="#f15bb5" stroke="#2b2d42" stroke-width="2.5"/></g><rect x="29" y="20" width="6" height="28" rx="3" fill="#2b2d42"/><circle cx="20" cy="22" r="3" fill="#ffd23f"/><circle cx="44" cy="22" r="3" fill="#ffd23f"/></svg>`;

/** A lucky bug flying across the screen; tap it for a reward. */
export class Gift {
  private el: HTMLButtonElement;
  private t0 = 0;
  private dur = 9;
  private active = false;
  private fromLeft = true;
  private y0 = 0.3;
  private last = 0;
  private w = 0;
  private hgt = 0;
  onTap: () => void = () => {};

  constructor(root: HTMLElement) {
    this.el = h('button', { class: 'gift', 'data-ui': true, type: 'button', 'aria-label': 'gift', style: 'display:none' });
    // Tappable with a second finger while the first one keeps crawling.
    onTap(this.el, () => {
      this.hide();
      this.onTap();
    });
    root.append(this.el);
    const measure = () => {
      this.w = root.clientWidth;
      this.hgt = root.clientHeight;
    };
    new ResizeObserver(measure).observe(root);
    measure();
  }

  show(kind: 'ladybug' | 'butterfly', duration: number): void {
    this.el.innerHTML = kind === 'ladybug' ? LADYBUG : BUTTERFLY;
    this.t0 = performance.now() / 1000;
    this.last = this.t0;
    this.dur = duration;
    this.active = true;
    this.fromLeft = Math.random() < 0.5;
    this.y0 = 0.22 + Math.random() * 0.3;
    this.el.style.display = '';
  }

  hide(): void {
    this.active = false;
    this.el.style.display = 'none';
  }

  get visible(): boolean {
    return this.active;
  }

  /** Per frame while visible. While a dialog/ad pauses the game the bug hovers in place instead of escaping. */
  update(paused: boolean): void {
    if (!this.active) return;
    const now = performance.now() / 1000;
    if (paused) this.t0 += now - this.last;
    this.last = now;
    const w = this.w;
    const hgt = this.hgt;
    const u = (now - this.t0) / this.dur;
    if (u >= 1) return this.hide();
    const x = (this.fromLeft ? u : 1 - u) * (w + 80) - 70;
    const y = (this.y0 + Math.sin(u * Math.PI * 4) * 0.05) * hgt;
    const flap = 1 + Math.sin(performance.now() / 60) * 0.12;
    this.el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${Math.sin(u * 20) * 12 + (this.fromLeft ? 90 : -90)}deg) scale(${flap.toFixed(3)}, 1)`;
  }
}
