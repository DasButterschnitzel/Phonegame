import { h } from './dom.ts';
import { icon } from './icons.ts';

export class Toasts {
  private el: HTMLElement;
  private tut: HTMLElement | null = null;
  private finger: HTMLElement;
  private ring: HTMLElement;
  private fingerTarget: HTMLElement | null = null;
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.el = h('div', { class: 'toasts' });
    this.finger = h('div', { class: 'tut-finger', style: 'display:none' }, icon('finger'));
    this.ring = h('div', { class: 'coach-ring', style: 'display:none' });
    root.append(this.el, this.ring, this.finger);
  }

  show(text: string, ms = 2200): void {
    const t = h('div', { class: 'toast' }, text);
    this.el.append(t);
    while (this.el.children.length > 3) this.el.firstChild?.remove();
    setTimeout(() => t.remove(), ms);
  }

  get hinting(): boolean {
    return this.tut !== null;
  }

  /** The element the current hint points at (null when no hint or no target). */
  get hintTarget(): HTMLElement | null {
    return this.tut ? this.fingerTarget : null;
  }

  /**
   * Tutorial speech bubble with a finger tapping the target button (one at a time). The bubble sits just above the
   * target and its tail points at it; the target gets a pulsing coach ring.
   */
  hint(text: string | null, target: HTMLElement | null = null): void {
    this.fingerTarget = text ? target : null;
    this.finger.style.display = this.fingerTarget ? '' : 'none';
    this.ring.style.display = this.fingerTarget ? '' : 'none';
    if (!(this.tut && this.tut.textContent === text)) {
      this.tut?.remove();
      this.tut = null;
      if (text) {
        this.tut = h('div', { class: 'tut' }, text);
        this.root.append(this.tut);
      }
    }
    this.placeFinger();
  }

  /** Keep finger + bubble over the target (cheap: only while a hint is shown, called at 10 Hz). */
  placeFinger(): void {
    const t = this.fingerTarget;
    if (!t || !this.tut) return;
    const r = t.getBoundingClientRect();
    const root = this.root.getBoundingClientRect();
    const cx = r.left + r.width / 2 - root.left;
    this.finger.style.transform = `translate3d(${(cx + r.width * 0.05).toFixed(0)}px, ${(r.top - root.top + r.height * 0.3).toFixed(0)}px, 0)`;
    const rs = this.ring.style;
    rs.left = `${(r.left - root.left - 5).toFixed(0)}px`;
    rs.top = `${(r.top - root.top - 5).toFixed(0)}px`;
    rs.width = `${(r.width + 10).toFixed(0)}px`;
    rs.height = `${(r.height + 10).toFixed(0)}px`;
    // Bubble: centred over the target but clamped on screen; the tail tracks the target.
    const w = this.tut.offsetWidth;
    const left = Math.max(10, Math.min(root.width - w - 10, cx - w / 2));
    this.tut.classList.add('anchored');
    this.tut.style.left = `${left.toFixed(0)}px`;
    this.tut.style.bottom = `${(root.bottom - r.top + 18).toFixed(0)}px`;
    this.tut.style.setProperty('--tail-x', `${(cx - left).toFixed(0)}px`);
  }

  /** Big centred banner (stage unlocked, new farm…), removes itself. */
  banner(big: string, small?: string): void {
    const b = h('div', { class: 'banner' }, h('div', { class: 'ribbon' }, h('div', { class: 'big outline' }, big)), small ? h('div', { class: 'small' }, small) : null);
    this.root.append(b);
    setTimeout(() => b.remove(), 2700);
  }
}
