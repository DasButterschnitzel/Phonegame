import { h } from './dom.ts';

export class Toasts {
  private el: HTMLElement;
  private tut: HTMLElement | null = null;
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.el = h('div', { class: 'toasts' });
    root.append(this.el);
  }

  show(text: string, ms = 2200): void {
    const t = h('div', { class: 'toast' }, text);
    this.el.append(t);
    while (this.el.children.length > 3) this.el.firstChild?.remove();
    setTimeout(() => t.remove(), ms);
  }

  /** Tutorial speech bubble above the upgrade bar (one at a time). */
  hint(text: string | null): void {
    if (this.tut && this.tut.textContent === text) return;
    this.tut?.remove();
    this.tut = null;
    if (!text) return;
    this.tut = h('div', { class: 'tut' }, text);
    this.root.append(this.tut);
  }
}
