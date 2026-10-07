export type PauseReason = 'modal' | 'ad' | 'background' | 'yt' | 'debug';

/** Collects pause reasons; the simulation runs only when none are active. */
export class PauseController {
  private reasons = new Set<PauseReason>();
  private listeners: ((paused: boolean, reasons: ReadonlySet<PauseReason>) => void)[] = [];

  add(r: PauseReason): void {
    if (this.reasons.has(r)) return;
    this.reasons.add(r);
    this.emit();
  }

  remove(r: PauseReason): void {
    if (!this.reasons.delete(r)) return;
    this.emit();
  }

  has(r: PauseReason): boolean {
    return this.reasons.has(r);
  }

  get paused(): boolean {
    return this.reasons.size > 0;
  }

  onChange(fn: (paused: boolean, reasons: ReadonlySet<PauseReason>) => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.paused, this.reasons);
  }
}
