/**
 * Hold-to-crawl input: any pointer held on the game area (not on a UI control) or Space = throttle.
 * Optional "toggle" accessibility mode: tap to start/stop.
 */
export class ThrottleInput {
  private pointers = new Set<number>();
  private key = false;
  private toggled = false;
  toggleMode = false;
  lastHeldAt = -Infinity;
  totalHeld = 0;
  private listeners: ((held: boolean) => void)[] = [];

  constructor(root: HTMLElement) {
    root.addEventListener('pointerdown', (e) => {
      if (this.isUi(e.target)) return;
      if (this.toggleMode) {
        this.toggled = !this.toggled;
        this.emit();
        return;
      }
      this.pointers.add(e.pointerId);
      this.emit();
    });
    const up = (e: PointerEvent) => {
      if (this.pointers.delete(e.pointerId)) this.emit();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => {
      this.pointers.clear();
      this.key = false;
      this.emit();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && !this.isUi(e.target)) {
        this.key = true;
        e.preventDefault();
        this.emit();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.key = false;
        this.emit();
      }
    });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private isUi(t: EventTarget | null): boolean {
    return t instanceof Element && !!t.closest('[data-ui]');
  }

  get held(): boolean {
    return this.toggleMode ? this.toggled : this.pointers.size > 0 || this.key;
  }

  /** Programmatic throttle (debug / tests). */
  force: boolean | null = null;

  get effective(): boolean {
    return this.force ?? this.held;
  }

  onChange(fn: (held: boolean) => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.held);
  }
}
