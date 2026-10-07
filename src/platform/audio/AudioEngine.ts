/**
 * Procedural WebAudio sound: no audio files. SFX pitch and motor/music tempo follow the caterpillar's speed.
 */
type Ctx = AudioContext;

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

export class AudioEngine {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private motorOsc: OscillatorNode | null = null;
  private motorGain!: GainNode;
  private motorFilter!: BiquadFilterNode;
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

  /** Must be called from a user gesture (iOS/Chrome autoplay rules). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
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
      this.motorFilter = this.ctx.createBiquadFilter();
      this.motorFilter.type = 'lowpass';
      this.motorFilter.frequency.value = 300;
      this.motorGain = this.ctx.createGain();
      this.motorGain.gain.value = 0;
      this.motorFilter.connect(this.motorGain).connect(this.sfx);
      this.motorOsc = this.ctx.createOscillator();
      this.motorOsc.type = 'sawtooth';
      this.motorOsc.frequency.value = 55;
      this.motorOsc.connect(this.motorFilter);
      this.motorOsc.start();
      this.applyGain();
    }
    this.syncRunning();
  }

  /**
   * The audio graph (motor oscillator, compressor) and the music timer run only while something can be heard:
   * suspended when muted (ads, background, portal) or when both sound and music are off.
   */
  private syncRunning(): void {
    if (!this.ctx) return;
    const run = !this.muted && (this.soundOn || this.musicOn);
    if (run && this.ctx.state === 'suspended') void this.ctx.resume();
    if (!run && this.ctx.state === 'running') void this.ctx.suspend();
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

  /** 0..1 speed fraction; drives motor hum and music tempo. */
  setSpeed(frac: number): void {
    this.speed = frac;
    if (!this.ctx || !this.motorOsc || this.ctx.state !== 'running') return;
    // Automation events cross to the audio thread: send only real changes, at most ~15 Hz.
    const now = performance.now();
    if (Math.abs(frac - this.sentSpeed) < 0.02 || now - this.sentAt < 66) return;
    this.sentSpeed = frac;
    this.sentAt = now;
    const t = this.ctx.currentTime;
    this.motorOsc.frequency.setTargetAtTime(45 + 40 * frac, t, 0.1);
    this.motorFilter.frequency.setTargetAtTime(120 + 500 * frac, t, 0.1);
    this.motorGain.gain.setTargetAtTime(0.025 + 0.06 * frac, t, 0.15);
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
    this.noiseHit(0.07, 1800 * p, 2.5, 0.25);
    this.tone(220 * p, 0.06, 'square', 0.04, 0, 140 * p);
    if (golden) this.tone(1568, 0.25, 'sine', 0.12, 0.02);
  }

  pop(): void {
    if (!this.ctx || !this.can('pop', 60)) return;
    this.tone(500 + Math.random() * 200, 0.08, 'sine', 0.12, 0, 900);
  }

  coin(): void {
    if (!this.ctx || !this.can('coin', 50)) return;
    this.tone(988, 0.07, 'square', 0.06);
    this.tone(1319, 0.18, 'square', 0.06, 0.06);
  }

  unload(n: number): void {
    if (!this.ctx || !this.can('unload', 300)) return;
    const notes = Math.min(8, 3 + Math.floor(Math.log2(1 + n)));
    for (let i = 0; i < notes; i++) this.tone(midi(76 + PENTA[i % PENTA.length]), 0.12, 'triangle', 0.1, i * 0.055);
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
    const base = 60 + Math.min(12, level);
    [0, 4, 7, 12].forEach((s, i) => this.tone(midi(base + s), 0.18, 'triangle', 0.13, i * 0.07));
    this.noiseHit(0.3, 6000, 1, 0.05, 0.25);
  }

  levelUp(): void {
    if (!this.ctx) return;
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

  expand(): void {
    if (!this.ctx) return;
    this.noiseHit(0.6, 200, 0.8, 0.4);
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
    void this.ctx?.close();
  }
}
