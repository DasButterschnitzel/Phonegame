/**
 * Procedural WebAudio sound: no audio files. SFX pitch and motor/music tempo follow the caterpillar's speed.
 */
type Ctx = BaseAudioContext;

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

export class AudioEngine {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  /** Motor = a quiet servo whine (two oscillators) + a breath of filtered air, under a ducking gain. */
  private servoA: OscillatorNode | null = null;
  private servoB: OscillatorNode | null = null;
  private motorGain!: GainNode;
  private motorFilter!: BiquadFilterNode;
  private whirrGain!: GainNode;
  private duckGain!: GainNode;
  private lastStep = -1;
  private wasHeld = false;
  private lastPlay = new Map<string, number>();
  private soundOn = true;
  private musicOn = true;
  private muted = false;
  private speed = 0;
  private beat = 0;
  private nextBeat = 0;
  private sched: ReturnType<typeof setInterval> | null = null;
  private sentSpeed = -1;
  private sentAt = 0;
  /** Back-to-back chomps climb in pitch a little (resets after a short pause). */
  private combo = 0;
  private lastChompAt = 0;

  /** Rendering into an OfflineAudioContext (audio QA): automation is allowed while not "running". */
  private offline = false;

  /** Must be called from a user gesture (iOS/Chrome autoplay rules). `ctx` is injected only by the audio QA. */
  unlock(ctx?: BaseAudioContext): void {
    if (!this.ctx) {
      if (ctx) {
        this.ctx = ctx;
        this.offline = true;
      } else {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      const comp = this.ctx.createDynamicsCompressor();
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.connect(comp);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.6;
      this.sfx.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.16;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // Motor bus (ducked under big moments).
      this.duckGain = this.ctx.createGain();
      this.duckGain.connect(this.sfx);
      this.motorFilter = this.ctx.createBiquadFilter();
      this.motorFilter.type = 'bandpass';
      this.motorFilter.Q.value = 1.1;
      this.motorFilter.frequency.value = 600;
      this.motorGain = this.ctx.createGain();
      this.motorGain.gain.value = 0;
      this.motorFilter.connect(this.motorGain).connect(this.duckGain);
      this.servoA = this.ctx.createOscillator();
      this.servoA.type = 'triangle';
      this.servoA.frequency.value = 180;
      this.servoB = this.ctx.createOscillator();
      this.servoB.type = 'sine';
      this.servoB.frequency.value = 362;
      const bGain = this.ctx.createGain();
      bGain.gain.value = 0.45;
      this.servoA.connect(this.motorFilter);
      this.servoB.connect(bGain).connect(this.motorFilter);
      this.servoA.start();
      this.servoB.start();
      const air = this.ctx.createBufferSource();
      air.buffer = this.noise;
      air.loop = true;
      const airF = this.ctx.createBiquadFilter();
      airF.type = 'bandpass';
      airF.frequency.value = 2600;
      airF.Q.value = 0.7;
      this.whirrGain = this.ctx.createGain();
      this.whirrGain.gain.value = 0;
      air.connect(airF).connect(this.whirrGain).connect(this.duckGain);
      air.start();
      this.applyGain();
    }
    this.syncRunning();
  }

  /**
   * The audio graph (motor oscillator, compressor) and the music timer run only while something can be heard:
   * suspended when muted (ads, background, portal) or when both sound and music are off.
   */
  private syncRunning(): void {
    if (!this.ctx || this.offline) return;
    const ac = this.ctx as AudioContext;
    const run = !this.muted && (this.soundOn || this.musicOn);
    if (run && ac.state === 'suspended') void ac.resume();
    if (!run && ac.state === 'running') void ac.suspend();
    const wantMusic = run && this.musicOn;
    if (wantMusic && !this.sched) this.sched = setInterval(() => this.scheduleMusic(), 90);
    if (!wantMusic && this.sched) {
      clearInterval(this.sched);
      this.sched = null;
    }
  }

  get ready(): boolean {
    return !!this.ctx;
  }

  setEnabled(sound: boolean, music: boolean): void {
    this.soundOn = sound;
    this.musicOn = music;
    this.applyGain();
    this.syncRunning();
  }

  /** Mute while ads play / app is backgrounded. */
  setMuted(m: boolean): void {
    this.muted = m;
    this.syncRunning();
  }

  private applyGain(): void {
    if (!this.ctx) return;
    this.sfx.gain.value = this.soundOn ? 0.6 : 0;
    this.musicBus.gain.value = this.musicOn ? 0.14 : 0;
  }

  /** 0..1 speed fraction; drives the servo whirr and music tempo. */
  setSpeed(frac: number): void {
    this.speed = frac;
    if (!this.ctx || !this.servoA || (this.ctx.state !== 'running' && !this.offline)) return;
    // Automation events cross to the audio thread: send only real changes, at most ~15 Hz.
    const now = performance.now();
    if (Math.abs(frac - this.sentSpeed) < 0.02 || now - this.sentAt < 66) return;
    this.sentSpeed = frac;
    this.sentAt = now;
    const t = this.ctx.currentTime;
    // A light electric whine that rises with speed — kept among the quietest sounds in the mix.
    const f = 165 + 230 * frac;
    this.servoA.frequency.setTargetAtTime(f, t, 0.12);
    this.servoB!.frequency.setTargetAtTime(f * 2.01, t, 0.12);
    this.motorFilter.frequency.setTargetAtTime(f * 2.4, t, 0.12);
    this.motorGain.gain.setTargetAtTime(frac < 0.03 ? 0 : 0.0018 + 0.0052 * frac, t, 0.18);
    this.whirrGain.gain.setTargetAtTime(frac < 0.03 ? 0 : 0.0008 + 0.0028 * frac, t, 0.18);
  }

  /**
   * Per frame: leg ticks at the stepping cadence (odometer based) and servo chirps when the throttle engages or
   * releases.
   */
  motion(odometer: number, held: boolean): void {
    if (!this.ctx || (this.ctx.state !== 'running' && !this.offline)) return;
    const step = Math.floor(odometer / 0.55);
    if (step !== this.lastStep) {
      if (this.lastStep >= 0 && this.speed > 0.05 && this.can('leg', 45)) this.legTick(step % 2 === 0);
      this.lastStep = step;
    }
    if (held !== this.wasHeld) {
      this.wasHeld = held;
      if (this.can('chirp', 180)) this.tone(held ? 420 : 760, 0.11, 'sine', 0.03, 0, held ? 880 : 360);
    }
  }

  private legTick(left: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = left ? 3200 : 2700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.006 + 0.009 * this.speed, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    src.connect(f).connect(g).connect(this.duckGain);
    src.start(t, Math.random() * 0.3);
    src.stop(t + 0.02);
  }

  /** Big moments push the motor down for a beat. */
  private duck(amount = 0.25, dur = 0.5): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setTargetAtTime(amount, t, 0.03);
    this.duckGain.gain.setTargetAtTime(1, t + dur, 0.2);
  }

  private can(key: string, minGapMs: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlay.get(key) ?? 0) < minGapMs) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseHit(dur: number, freq: number, q: number, vol: number, when = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  }

  chomp(golden = false): void {
    if (!this.ctx || !this.can('chomp', 70)) return;
    const now = performance.now();
    this.combo = now - this.lastChompAt < 450 ? Math.min(10, this.combo + 1) : 0;
    this.lastChompAt = now;
    const p = (0.9 + 0.35 * this.speed + Math.random() * 0.15) * (1 + this.combo * 0.025);
    // Crunch: a bright bite plus a short low body.
    this.noiseHit(0.07, 1800 * p, 1.6, 0.55);
    this.noiseHit(0.05, 420 * p, 1.2, 0.3);
    this.tone(220 * p, 0.06, 'square', 0.07, 0, 140 * p);
    if (golden) this.tone(1568, 0.25, 'sine', 0.12, 0.02);
  }

  /** A chunk lands on a stack: a tiny wooden "tok", a little higher as the stack grows. Kept well under the chomp. */
  land(height: number): void {
    if (!this.ctx || !this.can('land', 70)) return;
    const f = 900 * 2 ** (Math.min(18, height) / 36) * (0.97 + Math.random() * 0.06);
    this.tone(f, 0.035, 'triangle', 0.022, 0, f * 0.82);
    this.noiseHit(0.012, 3800, 1.2, 0.035);
  }

  /** A crop collapses: leafy crunch + a small pop (heavier crops sound lower). */
  pop(tier = 0): void {
    if (!this.ctx || !this.can('pop', 60)) return;
    const k = 1 - tier * 0.12;
    this.noiseHit(0.09, 2400 * k, 1.4, 0.16);
    this.tone((480 + Math.random() * 160) * k, 0.08, 'sine', 0.12, 0.01, 820 * k);
  }

  coin(): void {
    if (!this.ctx || !this.can('coin', 50)) return;
    this.tone(988, 0.07, 'square', 0.06);
    this.tone(1319, 0.18, 'square', 0.06, 0.06);
  }

  /** The pass is over: a ka-ching sized to the load. */
  unload(n: number): void {
    if (!this.ctx || !this.can('unload', 300)) return;
    this.duck(0.3, 0.6);
    this.tone(1568, 0.09, 'square', 0.07);
    this.tone(2093, 0.22, 'square', 0.07, 0.07);
    this.noiseHit(0.25, 7000, 0.8, 0.05, 0.07);
    if (n > 40) this.tone(midi(88), 0.3, 'triangle', 0.08, 0.16);
  }

  /** Hopper flap + conveyor kick in as the first segment reaches the chute. */
  unloadStart(): void {
    if (!this.ctx || !this.can('unloadStart', 400)) return;
    this.duck(0.45, 0.4);
    this.tone(120, 0.12, 'triangle', 0.2, 0, 80);
    this.noiseHit(0.12, 700, 1.5, 0.22, 0.02);
  }

  /** One segment tipping its stack: a cargo thump and a coin plink that climbs with each segment. */
  unloadSeg(i: number, last: boolean): void {
    if (!this.ctx || !this.can('unloadSeg', 45)) return;
    this.noiseHit(0.06, 380, 1.2, 0.26);
    const step = Math.min(i, 15);
    this.tone(midi(76 + PENTA[step % PENTA.length] + 12 * Math.floor(step / PENTA.length)), 0.1, 'triangle', last ? 0.2 : 0.15, 0.01);
  }

  /** Getting close to the depot with cargo: soft blips at 50 %, 25 % and "almost there". */
  approach(level: number): void {
    if (!this.ctx || !this.can('approach', 400)) return;
    for (let k = 0; k <= level; k++) this.tone(midi(79 + k * 5), 0.06, 'sine', 0.035 + 0.01 * level, k * 0.07);
  }

  /** A plot is cleared and about to join the territory. */
  plotReady(): void {
    if (!this.ctx || !this.can('plotReady', 250)) return;
    this.tone(midi(93), 0.18, 'sine', 0.05);
    this.tone(midi(100), 0.25, 'sine', 0.035, 0.05);
  }

  /** The route grows: a swoosh along the new stretch and a bright rising sting. */
  routeGrow(n: number): void {
    if (!this.ctx || !this.can('routeGrow', 300)) return;
    this.duck(0.4, 0.5);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.2);
    src.stop(t + 0.55);
    const base = 72 + Math.min(5, n - 1) * 2;
    [0, 4, 7, 12].forEach((s2, i) => this.tone(midi(base + s2), 0.16, 'triangle', 0.09, 0.08 + i * 0.06));
  }

  /** Coins landing in the counter: quick ascending ticks. */
  coinTick(i: number): void {
    if (!this.ctx || !this.can('coinTick', 35)) return;
    this.tone(1175 * 2 ** (Math.min(12, i) / 24), 0.05, 'square', 0.035);
  }

  /** Anticipation as two segments are pulled together (the impact follows with merge()). */
  mergeCharge(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(3800, t + 0.26);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.22);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.2);
    src.stop(t + 0.3);
  }

  merge(level: number): void {
    if (!this.ctx) return;
    this.duck(0.35, 0.5);
    const base = 60 + Math.min(12, level);
    [0, 4, 7, 12].forEach((s, i) => this.tone(midi(base + s), 0.18, 'triangle', 0.13, i * 0.07));
    this.noiseHit(0.3, 6000, 1, 0.05, 0.25);
  }

  levelUp(): void {
    if (!this.ctx) return;
    this.duck(0.25, 0.9);
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(midi(67 + s), 0.25, 'square', 0.07, i * 0.08));
  }

  /** Purchase confirmation; speed revs the motor, capacity clunks like a bigger basket. */
  upgrade(kind: 'add' | 'speed' | 'capacity' = 'add'): void {
    if (!this.ctx || !this.can('upgrade', 50)) return;
    this.tone(660, 0.08, 'triangle', 0.12, 0, 990);
    if (kind === 'speed') this.tone(110, 0.32, 'sawtooth', 0.05, 0.03, 440);
    if (kind === 'capacity') {
      this.tone(196, 0.1, 'triangle', 0.13, 0.05);
      this.tone(294, 0.14, 'triangle', 0.12, 0.13);
      this.noiseHit(0.08, 900, 1.5, 0.08, 0.05);
    }
  }

  tap(): void {
    if (!this.ctx || !this.can('tap', 40)) return;
    this.tone(880, 0.04, 'sine', 0.08);
  }

  full(): void {
    if (!this.ctx || !this.can('full', 1500)) return;
    this.tone(220, 0.12, 'square', 0.06);
    this.tone(175, 0.18, 'square', 0.06, 0.12);
  }

  tornado(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2500, t + 0.8);
    f.frequency.exponentialRampToValueAtTime(400, t + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + 1.8);
  }

  /** A zone fence opens: the fence crashes down, then a fanfare. */
  expand(): void {
    if (!this.ctx) return;
    this.duck(0.2, 1.2);
    this.noiseHit(0.6, 200, 0.8, 0.4);
    this.noiseHit(0.25, 1400, 3, 0.15, 0.05);
    [0, 7, 12, 19].forEach((s, i) => this.tone(midi(55 + s), 0.3, 'triangle', 0.12, 0.1 + i * 0.09));
  }

  gift(): void {
    if (!this.ctx) return;
    [0, 7, 12, 16].forEach((s, i) => this.tone(midi(84 + s), 0.15, 'sine', 0.1, i * 0.05));
  }

  private scheduleMusic(): void {
    if (!this.ctx || !this.musicOn || this.muted) return;
    const ctx = this.ctx;
    const bpm = 92 * (0.95 + 0.2 * this.speed);
    const spb = 60 / bpm / 2;
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.05;
    while (this.nextBeat < ctx.currentTime + 0.25) {
      const b = this.beat++;
      const bar = Math.floor(b / 8) % 4;
      const roots = [60, 65, 67, 64];
      const t = this.nextBeat - ctx.currentTime;
      if (b % 2 === 0) {
        const step = [0, 2, 4, 2, 5, 4, 2, 1][Math.floor(b / 2) % 8];
        this.musicNote(midi(roots[bar] + PENTA[step]), 0.22, t, 'triangle', 0.5);
      }
      if (b % 4 === 0) this.musicNote(midi(roots[bar] - 24), 0.35, t, 'sine', 0.9);
      if (b % 8 === 4) this.musicNote(midi(roots[bar] + 12), 0.1, t, 'square', 0.12);
      this.nextBeat += spb;
    }
  }

  private musicNote(freq: number, dur: number, when: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  dispose(): void {
    if (this.sched) clearInterval(this.sched);
    if (!this.offline) void (this.ctx as AudioContext | null)?.close();
  }
}
