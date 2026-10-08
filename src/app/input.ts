/** A finger landing this close (px) to a control counts for the throttle but never for OVERDRIVE. */
const NEAR_UI_PX = 22;

const isUi = (t: EventTarget | null): boolean => t instanceof Element && !!t.closest('[data-ui]');

/** True when a control sits right next to (x, y): a near-miss on a button. */
function nearUi(x: number, y: number): boolean {
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    if (isUi(document.elementFromPoint(x + dx * NEAR_UI_PX, y + dy * NEAR_UI_PX))) return true;
  }
  return false;
}

/**
 * Hold-to-crawl input: any pointer held on the game area (not on a UI control) or Space = throttle.
 * A second finger on the field (or Shift with Space) = OVERDRIVE; more fingers add nothing. Fingers on controls
 * never count (that finger is buying an upgrade), nor do fingers that land right next to one.
 * Optional "toggle" accessibility mode: a single-finger tap starts/stops the crawl (on release, so a touch that
 * becomes a two-finger hold is OVERDRIVE instead of a toggle).
 */
export class ThrottleInput {
  private pointers = new Set<number>();
  /** Field pointers that may count towards OVERDRIVE. */
  private odPointers = new Set<number>();
  /** Pointers that were part of a multi-finger touch (never a toggle tap). */
  private multi = new Set<number>();
  private key = false;
  private shift = false;
  private toggled = false;
  toggleMode = false;
  lastHeldAt = -Infinity;
  totalHeld = 0;
  private listeners: ((held: boolean) => void)[] = [];
  private odListeners: ((on: boolean) => void)[] = [];
  private lastOd = false;

  constructor(root: HTMLElement) {
    root.addEventListener('pointerdown', (e) => {
      if (isUi(e.target)) return;
      this.pointers.add(e.pointerId);
      if (!nearUi(e.clientX, e.clientY)) this.odPointers.add(e.pointerId);
      // Toggle mode: a touch that turns into a two-finger hold is OVERDRIVE, not a tap.
      if (this.pointers.size > 1) for (const id of this.pointers) this.multi.add(id);
      this.emit();
    });
    const up = (e: PointerEvent, cancelled: boolean) => {
      this.odPointers.delete(e.pointerId);
      const wasMulti = this.multi.delete(e.pointerId);
      if (!this.pointers.delete(e.pointerId)) return;
      // Toggle mode: a single-finger tap (released, not cancelled) starts or stops the crawl.
      if (this.toggleMode && !cancelled && !wasMulti) this.toggled = !this.toggled;
      this.emit();
    };
    window.addEventListener('pointerup', (e) => up(e, false));
    window.addEventListener('pointercancel', (e) => up(e, true));
    window.addEventListener('blur', () => {
      this.pointers.clear();
      this.odPointers.clear();
      this.multi.clear();
      this.key = false;
      this.shift = false;
      this.emit();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.shift = true;
        this.emit();
      }
      if (e.code === 'Space' && !e.repeat && !isUi(e.target)) {
        this.key = true;
        e.preventDefault();
        this.emit();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.shift = false;
      if (e.code === 'Space') this.key = false;
      this.emit();
    });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get held(): boolean {
    return this.toggleMode ? this.toggled : this.pointers.size > 0 || this.key;
  }

  /** Second finger on the field (or Shift + Space) while crawling. */
  get overdrive(): boolean {
    return this.held && (this.odPointers.size >= 2 || (this.key && this.shift));
  }

  /** Programmatic throttle / overdrive (debug / tests). */
  force: boolean | null = null;
  forceOverdrive: boolean | null = null;

  /** Debug/tests: force OVERDRIVE on/off (null = real input) with the same feedback as a real second finger. */
  setForceOverdrive(on: boolean | null): void {
    const before = this.effectiveOverdrive;
    this.forceOverdrive = on;
    const after = this.effectiveOverdrive;
    if (after !== before) for (const l of this.odListeners) l(after);
  }

  get effective(): boolean {
    return this.force ?? this.held;
  }

  get effectiveOverdrive(): boolean {
    return this.forceOverdrive ?? (this.force === false ? false : this.overdrive);
  }

  /** Forget every held pointer/key (app backgrounded mid-hold: pointerup may never arrive). */
  reset(): void {
    this.pointers.clear();
    this.odPointers.clear();
    this.multi.clear();
    this.key = false;
    this.shift = false;
    this.toggled = false;
    this.emit();
  }

  onChange(fn: (held: boolean) => void): void {
    this.listeners.push(fn);
  }

  /** OVERDRIVE switched on (second finger landed) or off. */
  onOverdrive(fn: (on: boolean) => void): void {
    this.odListeners.push(fn);
  }

  private emit(): void {
    const held = this.held;
    const od = this.overdrive;
    for (const l of this.listeners) l(held);
    if (od !== this.lastOd) for (const l of this.odListeners) l(od);
    this.lastOd = od;
  }
}
