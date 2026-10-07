import { h, setText } from './dom.ts';
import { fmt } from '../platform/i18n/i18n.ts';

/**
 * One "+N" label riding above the depot hopper during a rolling unload: it counts up as each segment pays out
 * (pop per segment), then lifts off and fades when the pass is done.
 */
export class UnloadCounter {
  private el: HTMLElement;
  private shown = 0;
  private target = 0;
  private active = false;
  private endAt = -1;
  private x = -999;
  private y = -999;

  constructor(root: HTMLElement) {
    this.el = h('div', { class: 'unload-counter outline', style: 'display:none' });
    root.append(this.el);
  }

  /** A pass begins; the label appears with the first payment (never as "+0"). */
  start(): void {
    this.active = true;
    this.endAt = -1;
    this.shown = 0;
    this.target = 0;
    this.el.style.display = 'none';
    this.el.classList.remove('done');
  }

  add(value: number, reduceMotion: boolean): void {
    if (!this.active) this.start();
    this.el.style.display = '';
    this.target += value;
    if (!reduceMotion) this.el.animate([{ scale: '1.25' }, { scale: '1' }], { duration: 180, easing: 'ease-out' });
  }

  end(now: number): void {
    this.target = Math.max(this.target, this.shown);
    this.endAt = now;
    this.el.classList.add('done');
  }

  /** `at`: projected hopper position (null when off screen). */
  frame(now: number, dt: number, at: { x: number; y: number } | null): void {
    if (!this.active || this.target <= 0) return;
    this.shown += (this.target - this.shown) * (1 - Math.exp(-dt / 0.08));
    if (this.target - this.shown < 0.5) this.shown = this.target;
    setText(this.el, `+${fmt(this.shown)}`);
    let lift = 0;
    let alpha = 1;
    if (this.endAt >= 0) {
      const u = (now - this.endAt) / 0.9;
      if (u >= 1) {
        this.active = false;
        this.el.style.display = 'none';
        return;
      }
      lift = u > 0.35 ? ((u - 0.35) / 0.65) * 50 : 0;
      alpha = u > 0.35 ? 1 - (u - 0.35) / 0.65 : 1;
    }
    if (at) {
      this.x = at.x;
      this.y = at.y;
    }
    this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${(this.y - lift).toFixed(1)}px, 0) translate(-50%, -100%)`;
    this.el.style.opacity = alpha.toFixed(2);
  }
}
