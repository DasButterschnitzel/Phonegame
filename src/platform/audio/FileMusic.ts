import type { BiomeId } from '../../game/types.ts';
import { fileFor, loopsFor, type MusicSource } from './music.ts';

/** One playing file: a streamed media element routed through its own fade gain. */
interface Deck {
  file: string;
  el: HTMLAudioElement;
  node: MediaElementAudioSourceNode;
  gain: GainNode;
}

export interface FileMusicState {
  file: string | null;
  playing: boolean;
  /** Decks still fading out. */
  fading: number;
  index: number;
}

/**
 * The owner's music files (music.ts), streamed through WebAudio: media element → its fade gain → this player's level →
 * the engine's music bus (so the music setting, ad mutes and background suspend all apply). Loaded only when the
 * music source is not procedural.
 */
export class FileMusic {
  private ctx: AudioContext;
  private out: GainNode;
  private src: MusicSource;
  private fadeS: number;
  private base: string;
  private deck: Deck | null = null;
  private fading = new Set<Deck>();
  private biome: BiomeId | null = null;
  private index = 0;
  private paused = true;
  private failed = false;
  /** A file cannot be played: the engine falls back to the procedural tunes. */
  onFail: (why: string) => void = () => {};

  constructor(ctx: AudioContext, bus: AudioNode, src: MusicSource, opts: { gain: number; crossfadeS: number; base: string }) {
    this.ctx = ctx;
    this.src = src;
    this.fadeS = opts.crossfadeS;
    this.base = opts.base;
    this.out = ctx.createGain();
    this.out.gain.value = opts.gain;
    this.out.connect(bus);
  }

  setBiome(biome: BiomeId): void {
    this.biome = biome;
    this.play(fileFor(this.src, biome, this.index));
  }

  /** Ads, the background, the music setting: stop where it is and go on from there. */
  setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    for (const d of [this.deck, ...this.fading]) {
      if (!d) continue;
      if (p) d.el.pause();
      else this.start(d);
    }
  }

  state(): FileMusicState {
    return { file: this.deck?.file ?? null, playing: !!this.deck && !this.deck.el.paused, fading: this.fading.size, index: this.index };
  }

  dispose(): void {
    for (const d of [this.deck, ...this.fading]) if (d) this.drop(d);
    this.deck = null;
    this.fading.clear();
    this.out.disconnect();
  }

  private play(file: string | null): void {
    if (this.failed) return;
    if (!file) return this.fail('no music file for this farm');
    if (this.deck?.file === file) return;
    const old = this.deck;
    const el = new Audio(this.base + file);
    el.preload = 'auto';
    el.loop = this.biome !== null && loopsFor(this.src, this.biome);
    el.addEventListener('ended', () => {
      if (this.deck?.el !== el || this.biome === null) return;
      this.index++;
      this.play(fileFor(this.src, this.biome, this.index));
    });
    el.addEventListener('error', () => this.fail(`cannot play ${file}`));
    const node = this.ctx.createMediaElementSource(el);
    const gain = this.ctx.createGain();
    node.connect(gain).connect(this.out);
    const d: Deck = { file, el, node, gain };
    this.deck = d;
    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(old ? 0 : 1, t);
    if (old) {
      // Crossfade: the new file rises while the old one falls, then the old one is let go.
      gain.gain.linearRampToValueAtTime(1, t + this.fadeS);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + this.fadeS);
      this.fading.add(old);
      setTimeout(() => {
        this.fading.delete(old);
        this.drop(old);
      }, this.fadeS * 1000 + 250);
    }
    if (!this.paused) this.start(d);
  }

  private start(d: Deck): void {
    d.el.play().catch((e: unknown) => {
      // Autoplay refusals while backgrounded are retried on the next resume; anything else means the file is unusable.
      if (e instanceof DOMException && e.name === 'NotAllowedError') return;
      this.fail(`cannot play ${d.file}`);
    });
  }

  private drop(d: Deck): void {
    d.el.pause();
    d.el.removeAttribute('src');
    d.el.load();
    d.node.disconnect();
    d.gain.disconnect();
  }

  private fail(why: string): void {
    if (this.failed) return;
    this.failed = true;
    this.onFail(why);
  }
}
