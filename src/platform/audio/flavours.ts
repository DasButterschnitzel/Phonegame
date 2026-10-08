import type { BiomeId } from '../../game/types.ts';

/**
 * Music flavour and ambience per biome family. Every family plays through the same small engine (one melody voice,
 * a bass, an optional accent) and the same three synth timbres; a family changes only the mood: tempo, key, the scale
 * the melody walks on, its contour, note length and how busy it is. There is no imitation of any traditional music
 * or instrument — a farm inspired by a region gets a mood, never a costume.
 */

/** Eight-step ladders (semitones above the bar's root) the melody pattern walks on. */
const MAJ_PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const MIN_PENTA = [0, 3, 5, 7, 10, 12, 15, 17];
const MAJ6 = [0, 2, 4, 5, 7, 9, 12, 14];
const DORIAN = [0, 2, 3, 5, 7, 9, 10, 12];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11, 12];

export type AmbienceKind = 'birds' | 'crickets' | 'wind' | 'water' | 'bees' | 'frogs' | 'crackle' | 'blips';
export const AMBIENCE_KINDS: readonly AmbienceKind[] = ['birds', 'crickets', 'wind', 'water', 'bees', 'frogs', 'crackle', 'blips'];

export interface MusicFlavour {
  bpm: number;
  /** MIDI root of each of the four bars. */
  roots: readonly [number, number, number, number];
  scale: readonly number[];
  /** The melody: one step of `scale` per beat, over two bars. */
  pattern: readonly number[];
  lead: 'triangle' | 'sine';
  /** Melody note length (s): short is bouncy, long is legato. */
  leadLen: number;
  /** Bass every two beats (2) or once a bar (4). */
  bassEvery: 2 | 4;
  /** A soft accent on beat three of every bar, one or two octaves up. */
  sparkle: { type: 'square' | 'sine'; oct: 12 | 24; vol: number } | null;
  /** Pick-up notes on the off-beats of beats two and four (busier, bouncier). */
  fills: boolean;
  /** Level trim, so every family plays at the same loudness (measured by the audio QA). */
  gain: number;
  /** A quiet, occasional background sound (`pitch` shifts it a little per family). */
  ambience: { kind: AmbienceKind; pitch: number } | null;
}

/** Sunny Meadow: the game's original tune, unchanged — the default for any family without its own. */
const MEADOW: MusicFlavour = {
  bpm: 92,
  roots: [60, 65, 67, 64],
  scale: MAJ_PENTA,
  pattern: [0, 2, 4, 2, 5, 4, 2, 1],
  lead: 'triangle',
  leadLen: 0.22,
  bassEvery: 2,
  sparkle: { type: 'square', oct: 12, vol: 0.12 },
  fills: false,
  gain: 1,
  ambience: { kind: 'birds', pitch: 1 },
};

const SQ = { type: 'square', oct: 12, vol: 0.12 } as const;
const TWINKLE = { type: 'sine', oct: 24, vol: 0.1 } as const;

export const FLAVOURS: Partial<Record<BiomeId, MusicFlavour>> = {
  meadow: MEADOW,
  // Starter Tour: small steps away from the meadow tune.
  pumpkin: { ...MEADOW, bpm: 86, roots: [57, 62, 64, 57], scale: MIN_PENTA, pattern: [0, 1, 2, 4, 3, 2, 1, 0], leadLen: 0.28, sparkle: null, ambience: { kind: 'crickets', pitch: 1 } },
  sunflower: { ...MEADOW, bpm: 100, roots: [62, 67, 69, 67], pattern: [0, 2, 4, 5, 7, 5, 4, 2], leadLen: 0.16, fills: true, ambience: { kind: 'bees', pitch: 1 } },
  snowyberry: { ...MEADOW, bpm: 78, roots: [64, 60, 67, 62], pattern: [4, 2, 0, 2, 4, 5, 4, 2], lead: 'sine', leadLen: 0.3, bassEvery: 4, sparkle: TWINKLE, gain: 0.85, ambience: { kind: 'wind', pitch: 1.1 } },
  desert: { ...MEADOW, bpm: 82, roots: [64, 62, 64, 59], scale: DORIAN, pattern: [0, 3, 4, 3, 0, 2, 1, 0], leadLen: 0.26, sparkle: null, ambience: { kind: 'wind', pitch: 0.9 } },
  // World Tour families.
  orchard: { ...MEADOW, bpm: 96, roots: [65, 70, 72, 65], pattern: [2, 4, 5, 4, 2, 0, 2, 4], leadLen: 0.2, fills: true, ambience: { kind: 'birds', pitch: 1.1 } },
  rice: { ...MEADOW, bpm: 74, roots: [60, 57, 65, 62], scale: MAJ6, pattern: [0, 1, 2, 4, 5, 4, 2, 1], lead: 'sine', leadLen: 0.34, bassEvery: 4, sparkle: TWINKLE, gain: 0.85, ambience: { kind: 'water', pitch: 1 } },
  vineyard: { ...MEADOW, bpm: 90, roots: [65, 70, 62, 67], scale: MAJ6, pattern: [0, 2, 4, 3, 2, 4, 5, 4], leadLen: 0.24, fills: true, ambience: { kind: 'crickets', pitch: 1.08 } },
  tropical: { ...MEADOW, bpm: 104, roots: [67, 72, 74, 72], pattern: [0, 2, 4, 7, 4, 2, 4, 5], leadLen: 0.15, fills: true, ambience: { kind: 'birds', pitch: 1.25 } },
  evergreen: { ...MEADOW, bpm: 84, roots: [62, 67, 64, 69], pattern: [4, 2, 4, 7, 5, 4, 2, 0], lead: 'sine', leadLen: 0.3, sparkle: TWINKLE, gain: 0.85, ambience: { kind: 'wind', pitch: 1 } },
  blossom: { ...MEADOW, bpm: 70, roots: [64, 61, 66, 59], scale: MAJ6, pattern: [0, 2, 4, 5, 4, 2, 1, 2], lead: 'sine', leadLen: 0.4, bassEvery: 4, sparkle: TWINKLE, gain: 0.85, ambience: { kind: 'water', pitch: 1.15 } },
  highland: { ...MEADOW, bpm: 86, roots: [62, 57, 59, 55], pattern: [0, 4, 2, 5, 4, 7, 5, 2], leadLen: 0.26, bassEvery: 4, sparkle: null, ambience: { kind: 'wind', pitch: 0.8 } },
  nordic: { ...MEADOW, bpm: 80, roots: [57, 64, 62, 60], scale: DORIAN, pattern: [0, 2, 3, 4, 3, 2, 0, 1], lead: 'sine', leadLen: 0.3, sparkle: null, gain: 0.85, ambience: { kind: 'water', pitch: 0.85 } },
  lavender: { ...MEADOW, bpm: 88, roots: [65, 62, 70, 67], scale: MAJ6, pattern: [2, 4, 5, 4, 2, 1, 0, 1], leadLen: 0.28, sparkle: { type: 'sine', oct: 12, vol: 0.14 }, ambience: { kind: 'bees', pitch: 1.1 } },
  marsh: { ...MEADOW, bpm: 70, roots: [57, 53, 55, 52], scale: MIN_PENTA, pattern: [0, 2, 1, 3, 2, 4, 3, 1], lead: 'sine', leadLen: 0.34, bassEvery: 4, sparkle: TWINKLE, gain: 0.85, ambience: { kind: 'frogs', pitch: 1 } },
  volcanic: { ...MEADOW, bpm: 100, roots: [57, 55, 53, 55], scale: MIN_PENTA, pattern: [0, 2, 3, 4, 3, 2, 0, 2], leadLen: 0.18, fills: true, sparkle: SQ, ambience: { kind: 'crackle', pitch: 1 } },
  giant: { ...MEADOW, bpm: 88, roots: [55, 52, 53, 55], pattern: [0, 4, 2, 4, 7, 4, 2, 0], leadLen: 0.16, fills: true, ambience: { kind: 'birds', pitch: 0.8 } },
  lunar: { ...MEADOW, bpm: 66, roots: [60, 62, 64, 62], scale: LYDIAN, pattern: [0, 4, 6, 4, 2, 4, 7, 4], lead: 'sine', leadLen: 0.45, bassEvery: 4, sparkle: TWINKLE, gain: 0.8, ambience: { kind: 'blips', pitch: 1 } },
};

export const flavourOf = (biome: BiomeId): MusicFlavour => FLAVOURS[biome] ?? MEADOW;

/** Bass: an octave under the root, but never below C3 (131 Hz) — phone speakers don't play lower. */
export const bassNote = (root: number): number => {
  let n = root - 12;
  while (n < 48) n += 12;
  return n;
};
