import { h } from './dom.ts';

interface Pct {
  median: number;
  p95: number;
  p99: number;
  worst: number;
}

/**
 * What the overlay shows; gathered by the app from the loop and the renderer. Local performance data only — the
 * overlay can be opened in release builds, so it must never carry ad IDs, consent state, device identifiers, user
 * data or environment secrets (PerfOverlay.test.ts holds the list).
 */
export interface PerfSnapshot {
  fps: number;
  cap: number;
  /** Wall time between rendered frames (ms). */
  interval: Pct;
  /** Main-thread work per frame: simulation + rendering + HUD (ms). */
  work: Pct;
  /** Frames in the window slower than 50 ms. */
  hitches: number;
  bufferW: number;
  bufferH: number;
  pixelRatio: number;
  maxRatio: number;
  tier: string;
  drawCalls: number;
  triangles: number;
  gpu: string;
  heapMB: { used: number; limit: number } | null;
}

/**
 * Developer performance readout for testing on a physical phone. Off unless switched on (Settings: tap the version
 * seven times, or ?perf=1); never shown to players by default. Tap it to copy the numbers to the clipboard.
 */
export class PerfOverlay {
  readonly el: HTMLElement;
  private text: HTMLElement;
  private last = '';
  private copiedUntil = 0;

  constructor(root: HTMLElement) {
    this.text = h('pre', {});
    this.el = h('div', { class: 'perf-overlay', 'data-ui': true }, this.text);
    this.el.addEventListener('click', () => {
      void navigator.clipboard?.writeText(this.last).catch(() => undefined);
      this.copiedUntil = performance.now() + 1200;
    });
    root.append(this.el);
  }

  update(s: PerfSnapshot): void {
    this.last = perfText(s);
    this.text.textContent = performance.now() < this.copiedUntil ? `${this.last}\n✓ copied` : this.last;
  }

  remove(): void {
    this.el.remove();
  }
}

/** The overlay's text (also what a tap copies to the clipboard). */
export function perfText(s: PerfSnapshot): string {
  const f = (x: number) => x.toFixed(1);
  const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  return [
    `${Math.round(s.fps)} fps (cap ${s.cap})  hitches>50ms: ${s.hitches}`,
    `frame ${f(s.interval.median)}  p95 ${f(s.interval.p95)}  p99 ${f(s.interval.p99)}  max ${f(s.interval.worst)}`,
    `main  ${f(s.work.median)}  p95 ${f(s.work.p95)}  p99 ${f(s.work.p99)}  max ${f(s.work.worst)}`,
    `${s.bufferW}×${s.bufferH} @${s.pixelRatio.toFixed(2)} (max ${s.maxRatio.toFixed(2)})  tier ${s.tier}`,
    `calls ${s.drawCalls}  tris ${k(s.triangles)}${s.heapMB ? `  heap ${s.heapMB.used}/${s.heapMB.limit} MB` : ''}`,
    `GPU ${s.gpu}`,
  ].join('\n');
}
