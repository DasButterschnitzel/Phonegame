import { SIM } from '../game/config.ts';
import { RingStats } from '../shared/frameStats.ts';

/**
 * Fixed-timestep driver: the simulation steps at 30 Hz, rendering interpolates between steps.
 * Large gaps (backgrounded tab) are clamped; real offline time is handled by the offline-earnings path.
 */
export class Loop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  running = false;
  simPaused = false;
  timeScale = 1;
  frames = 0;
  /** Frame cap: 120 Hz phones would otherwise render twice as often as the art needs (battery, heat). */
  maxFps = 60;
  /** Rolling timing of the last ~10 s of rendered frames (ms): wall interval between frames and main-thread work. */
  readonly interval = new RingStats(600);
  readonly work = new RingStats(600);
  private stepFn: (dt: number) => void;
  private frameFn: (alpha: number, dt: number, now: number, budgetMs: number) => void;

  constructor(step: (dt: number) => void, frame: (alpha: number, dt: number, now: number, budgetMs: number) => void) {
    this.stepFn = step;
    this.frameFn = frame;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    // A resume gap is not a hitch: don't let it into the frame statistics.
    this.interval.clear();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Advance the simulation by `seconds` immediately (debug fast-forward). */
  fastForward(seconds: number): void {
    const n = Math.round(seconds / SIM.DT);
    for (let i = 0; i < n; i++) this.stepFn(SIM.DT);
  }

  private tick = (t: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    // Skip vsyncs that come sooner than the cap allows (2 ms slack absorbs vsync jitter).
    if (t - this.last < 1000 / this.maxFps - 2) return;
    const realDt = Math.min(0.25, Math.max(0, (t - this.last) / 1000));
    this.interval.push(t - this.last);
    this.last = t;
    const w0 = performance.now();
    if (!this.simPaused) {
      this.acc += realDt * this.timeScale;
      let steps = 0;
      while (this.acc >= SIM.DT && steps < SIM.MAX_STEPS * Math.max(1, this.timeScale)) {
        this.stepFn(SIM.DT);
        this.acc -= SIM.DT;
        steps++;
      }
      if (this.acc >= SIM.DT) this.acc = 0;
    }
    this.frames++;
    this.frameFn(this.simPaused ? 1 : this.acc / SIM.DT, realDt, t / 1000, 1000 / this.maxFps);
    this.work.push(performance.now() - w0);
  };
}
