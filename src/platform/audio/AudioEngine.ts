/**
 * Procedural WebAudio sound: no audio files. SFX pitch and motor/music tempo follow the caterpillar's speed.
 */
type Ctx = BaseAudioContext;

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
/** Crunch recipes for bites: bright crunch band, its Q, a body band, a pitched snap (Hz), extra length (s). */
const BITES = [
  { bright: 2300, q: 1.7, body: 700, snap: 460, len: 0 },
  { bright: 1950, q: 1.4, body: 620, snap: 420, len: 0.012 },
  { bright: 2600, q: 1.9, body: 760, snap: 500, len: -0.008 },
  { bright: 2050, q: 1.3, body: 660, snap: 440, len: 0.018 },
];
/** Bigger crops (higher tiers) sound lower and hollower. */
const TIER_PITCH = [1, 0.86, 0.74, 0.62];

export class AudioEngine {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  /**
   * Motor = a soft band-passed noise "movement texture" plus a faint electric sine whine (and its octave) with a
   * slow vibrato — a tiny, slightly futuristic servo. Nothing in it sits below ~400 Hz (phone speakers don't play
   * that, and low buzz is what makes a motor sound like a moped). Leg ticks add the mechanical rhythm. All of it goes
   * through a ducking gain so big moments push it down.
   */
  private whine: OscillatorNode | null = null;
  private whine2: OscillatorNode | null = null;
  private whineGain!: GainNode;
  private texFilter!: BiquadFilterNode;
  private texGain!: GainNode;
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
  private lastBite = 0;

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
      // Half a second of noise; sources longer than what is left after their random start offset loop it.
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // Motor bus (ducked under big moments).
      const ac = this.ctx;
      this.duckGain = ac.createGain();
      this.duckGain.connect(this.sfx);
      // Electric whine: a pure sine and its octave, wobbling ±4 Hz.
      this.whine = ac.createOscillator();
      this.whine.type = 'sine';
      this.whine.frequency.value = 640;
      this.whine2 = ac.createOscillator();
      this.whine2.type = 'sine';
      this.whine2.frequency.value = 1280;
      const vib = ac.createOscillator();
      vib.frequency.value = 5.3;
      const vibDepth = ac.createGain();
      vibDepth.gain.value = 4;
      vib.connect(vibDepth);
      vibDepth.connect(this.whine.frequency);
      vibDepth.connect(this.whine2.frequency);
      const oct = ac.createGain();
      oct.gain.value = 0.22;
      this.whineGain = ac.createGain();
      this.whineGain.gain.value = 0;
      this.whine.connect(this.whineGain);
      this.whine2.connect(oct).connect(this.whineGain);
      this.whineGain.connect(this.duckGain);
      // Movement texture: soft band-passed noise, high-passed so no rumble gets through.
      const tex = ac.createBufferSource();
      tex.buffer = this.noise;
      tex.loop = true;
      this.texFilter = ac.createBiquadFilter();
      this.texFilter.type = 'bandpass';
      this.texFilter.frequency.value = 1000;
      this.texFilter.Q.value = 1.4;
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 450;
      this.texGain = ac.createGain();
      this.texGain.gain.value = 0;
      tex.connect(this.texFilter).connect(hp).connect(this.texGain).connect(this.duckGain);
      for (const o of [this.whine, this.whine2, vib]) o.start();
      tex.start();
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

  /** 0..1 speed fraction; drives the motor (pitch and level) and the music tempo. */
  setSpeed(frac: number): void {
    this.speed = frac;
    if (!this.ctx || !this.whine || (this.ctx.state !== 'running' && !this.offline)) return;
    // Automation events cross to the audio thread: send only real changes, at most ~15 Hz.
    const now = performance.now();
    if (Math.abs(frac - this.sentSpeed) < 0.02 || now - this.sentAt < 66) return;
    this.sentSpeed = frac;
    this.sentAt = now;
    const t = this.ctx.currentTime;
    // Rises gently with speed; kept among the quietest sounds in the mix.
    const f = 640 + 360 * frac;
    this.whine.frequency.setTargetAtTime(f, t, 0.15);
    this.whine2!.frequency.setTargetAtTime(f * 2, t, 0.15);
    this.whineGain.gain.setTargetAtTime(frac < 0.03 ? 0 : 0.0008 + 0.0018 * frac, t, 0.2);
    this.texFilter.frequency.setTargetAtTime(950 + 850 * frac, t, 0.15);
    this.texGain.gain.setTargetAtTime(frac < 0.03 ? 0 : 0.0035 + 0.006 * frac, t, 0.2);
  }

  /**
   * Per frame: a servo tick per foot plant (left/right alternate, distance based — slow crawling ticks slowly, never
   * faster than ~9 per second so it can't fuse into a buzz) and chirps when the throttle engages or releases.
   */
  motion(odometer: number, held: boolean): void {
    if (!this.ctx || (this.ctx.state !== 'running' && !this.offline)) return;
    const step = Math.floor(odometer / 0.35);
    if (step !== this.lastStep) {
      if (this.lastStep >= 0 && this.speed > 0.05 && this.can('leg', 110)) this.legTick(step % 2 === 0);
      this.lastStep = step;
    }
    if (held !== this.wasHeld) {
      this.wasHeld = held;
      if (this.can('chirp', 180)) this.tone(held ? 420 : 760, 0.11, 'sine', 0.03, 0, held ? 880 : 360);
    }
  }

  private legTick(left: boolean, when = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = left ? 3200 : 2600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.005 + 0.006 * this.speed, t);
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
    src.loop = true;
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

  /**
   * A chunk bitten off. One of four crunch recipes (never the same twice in a row), pitched by crop tier — big crops
   * lower and hollower — with small random pitch, filter, attack and timing changes, so a row of bites never sounds
   * like one sample on repeat. Back-to-back bites climb a touch.
   */
  /** Band-passed noise whose centre glides from f0 to f1 (whooshes). */
  private sweep(dur: number, f0: number, f1: number, q: number, vol: number, when = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.2);
    src.stop(t + dur + 0.02);
  }

  chomp(golden = false, tier = 0, final = false): void {
    if (!this.ctx || !this.can('chomp', 60)) return;
    const now = performance.now();
    this.combo = now - this.lastChompAt < 450 ? Math.min(10, this.combo + 1) : 0;
    this.lastChompAt = now;
    let v = Math.floor(Math.random() * (BITES.length - 1));
    if (v >= this.lastBite) v++;
    this.lastBite = v;
    const r = BITES[v];
    const p = TIER_PITCH[Math.min(3, tier)] * (0.94 + Math.random() * 0.12) * (1 + this.combo * 0.02) * (0.96 + 0.08 * this.speed);
    const when = Math.random() * 0.008;
    const amp = (1.05 + Math.random() * 0.3) * (final ? 1.15 : 1);
    this.noiseHit(0.06 + r.len, r.bright * p, r.q, 0.5 * amp, when);
    this.noiseHit(0.045, r.body * p, 1.3, 0.28 * amp, when);
    // The pitched snap follows the tier only half way: it stays where phone speakers can play it.
    const snap = r.snap * (0.5 + 0.5 * p);
    this.tone(snap, 0.05, 'triangle', 0.07 * amp, when, snap * 0.75);
    if (golden) this.tone(1568, 0.25, 'sine', 0.12, 0.02);
  }

  /** A chunk lands on a stack: a tiny wooden "tok", a little higher as the stack grows. Kept well under the chomp. */
  land(height: number): void {
    if (!this.ctx || !this.can('land', 70)) return;
    const f = 900 * 2 ** (Math.min(18, height) / 36) * (0.97 + Math.random() * 0.06);
    this.tone(f, 0.035, 'triangle', 0.022, 0, f * 0.82);
    this.noiseHit(0.012, 3800, 1.2, 0.035);
  }

  /**
   * The last bite: the crop gives way. A leafy rustle sweeping down, a soft hollow thunk and a little pop, pitched by
   * tier. Its own family — a bite and a collapse never sound alike — and a notch above the chomp.
   */
  pop(tier = 0): void {
    if (!this.ctx || !this.can('pop', 50)) return;
    const k = TIER_PITCH[Math.min(3, tier)] * (0.95 + Math.random() * 0.1);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.6;
    f.frequency.setValueAtTime(3400 * k, t);
    f.frequency.exponentialRampToValueAtTime(1300 * k, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.3);
    src.stop(t + 0.18);
    this.tone(430 * k, 0.09, 'triangle', 0.12, 0.01, 250 * k);
    this.tone((560 + Math.random() * 120) * k, 0.07, 'sine', 0.09, 0.03, 900 * k);
  }

  coin(): void {
    if (!this.ctx || !this.can('coin', 50)) return;
    this.tone(988, 0.07, 'square', 0.06);
    this.tone(1319, 0.18, 'square', 0.06, 0.06);
  }

  /** The pass is over: a ka-ching sized to the load. */
  /** The ka-ching at the end of an unload; `tier` (payout size vs recent income) adds a coin cascade and a held top. */
  unload(n: number, tier = 0): void {
    if (!this.ctx || !this.can('unload', 300)) return;
    this.duck(0.3 + 0.1 * tier, 0.6 + 0.3 * tier);
    this.tone(1568, 0.09, 'square', 0.07);
    this.tone(2093, 0.22, 'square', 0.07, 0.07);
    this.noiseHit(0.25, 7000, 0.8, 0.05, 0.07);
    if (n > 40 || tier >= 1) this.tone(midi(88), 0.3, 'triangle', 0.08, 0.16);
    if (tier >= 2) {
      [0, 4, 7, 12, 16].forEach((s, i) => this.tone(midi(84 + s), 0.12, 'sine', 0.06, 0.2 + i * 0.05));
      this.tone(midi(100), 0.5, 'sine', 0.04, 0.48);
    }
  }

  /** The hopper opens as the wave starts: a wooden clack, a flap of air and a little electric rise. */
  unloadStart(): void {
    if (!this.ctx || !this.can('unloadStart', 400)) return;
    this.duck(0.45, 0.4);
    this.tone(330, 0.08, 'triangle', 0.16, 0, 210);
    this.noiseHit(0.12, 900, 1.5, 0.2, 0.02);
    this.tone(520, 0.14, 'sine', 0.05, 0.03, 940);
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
    src.loop = true;
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

  /** Purchase confirmation; speed whooshes and revs up, capacity clunks like a bigger basket. */
  upgrade(kind: 'add' | 'speed' | 'capacity' = 'add'): void {
    if (!this.ctx || !this.can('upgrade', 50)) return;
    this.tone(660, 0.08, 'triangle', 0.12, 0, 990);
    if (kind === 'speed') {
      this.sweep(0.3, 600, 3200, 3, 0.12, 0.02);
      this.tone(330, 0.3, 'sine', 0.06, 0.03, 1320);
    }
    if (kind === 'capacity') {
      this.tone(196, 0.1, 'triangle', 0.13, 0.05);
      this.tone(294, 0.14, 'triangle', 0.12, 0.13);
      this.noiseHit(0.08, 900, 1.5, 0.08, 0.05);
    }
  }

  /**
   * OVERDRIVE: a servo wind-up when the second finger lands (a rising whirr), a soft settle when it lifts. Quiet —
   * it lives in the motor's family, under every gameplay sound.
   */
  overdrive(on: boolean): void {
    if (!this.ctx || !this.can('overdrive', 120)) return;
    if (on) {
      this.sweep(0.32, 700, 2600, 4, 0.06);
      this.tone(520, 0.3, 'triangle', 0.035, 0, 1180);
    } else {
      this.tone(980, 0.22, 'sine', 0.025, 0, 560);
    }
  }

  /** The motor got hot: a short hiss of steam. */
  overheat(): void {
    if (!this.ctx || !this.can('overheat', 2000)) return;
    this.noiseHit(0.45, 5200, 0.7, 0.035, 0);
  }

  tap(): void {
    if (!this.ctx || !this.can('tap', 40)) return;
    this.tone(880, 0.04, 'sine', 0.08);
  }

  /** Basket full: the blades grind on a crop that won't fit, then a soft descending "bonk-bonk". */
  full(): void {
    if (!this.ctx || !this.can('full', 1500)) return;
    this.noiseHit(0.18, 1100, 5, 0.12);
    this.tone(523, 0.11, 'triangle', 0.1, 0.02, 440);
    this.tone(415, 0.16, 'triangle', 0.1, 0.14, 330);
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
    this.noiseHit(0.6, 380, 0.8, 0.4);
    this.noiseHit(0.25, 1400, 3, 0.15, 0.05);
    [0, 7, 12, 19].forEach((s, i) => this.tone(midi(55 + s), 0.3, 'triangle', 0.12, 0.1 + i * 0.09));
  }

  /** FINAL HARVEST begins: a bright rising run and a held top note (the last stretch of the farm). */
  finalHarvest(): void {
    if (!this.ctx) return;
    this.duck(0.25, 1.4);
    [0, 4, 7, 11, 12, 16].forEach((s, i) => this.tone(midi(64 + s), 0.16, 'triangle', 0.11, i * 0.06));
    this.tone(midi(88), 0.7, 'sine', 0.07, 0.38);
    this.sweep(0.5, 900, 5200, 2, 0.06, 0.05);
  }

  /** The farm is finished: a boom and a cymbal, a rising run, then a held major chord — the biggest cue in the game. */
  farmComplete(): void {
    if (!this.ctx) return;
    this.duck(0.15, 2.4);
    this.noiseHit(0.5, 150, 1, 0.5);
    this.noiseHit(1.3, 6500, 0.7, 0.14, 0.02);
    [0, 4, 7, 12, 16, 19].forEach((s, i) => this.tone(midi(60 + s), 0.16, 'square', 0.06, i * 0.07));
    [0, 4, 7, 12].forEach((s) => this.tone(midi(72 + s), 1.1, 'triangle', 0.075, 0.48));
    this.tone(midi(96), 0.9, 'sine', 0.045, 0.52);
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
      // Bass an octave up from where it was: phone speakers don't play 65 Hz.
      if (b % 4 === 0) this.musicNote(midi(roots[bar] - 12), 0.35, t, 'triangle', 0.5);
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
