import { describe, expect, it } from 'vitest';
import { fileFor, loopsFor, MUSIC, parseMusicSource, type MusicSource } from './music.ts';

const playlist: MusicSource = { kind: 'playlist', files: ['a.ogg', 'b.ogg', 'c.ogg'], byBiome: { volcanic: 'lava.ogg' } };

describe('music source', () => {
  it('stays procedural by default (no files, no bundle growth)', () => {
    expect(MUSIC.source).toEqual({ kind: 'procedural' });
    expect(fileFor(MUSIC.source, 'meadow', 0)).toBeNull();
  });

  it('a single track plays everywhere and loops', () => {
    const t: MusicSource = { kind: 'track', file: 'theme.ogg' };
    expect(fileFor(t, 'meadow', 0)).toBe('theme.ogg');
    expect(fileFor(t, 'lunar', 7)).toBe('theme.ogg');
    expect(loopsFor(t, 'meadow')).toBe(true);
  });

  it('a playlist plays in order, wraps around, and lets a biome have its own looping track', () => {
    expect([0, 1, 2, 3, 4].map((i) => fileFor(playlist, 'meadow', i))).toEqual(['a.ogg', 'b.ogg', 'c.ogg', 'a.ogg', 'b.ogg']);
    expect(loopsFor(playlist, 'meadow')).toBe(false);
    expect(fileFor(playlist, 'volcanic', 2)).toBe('lava.ogg');
    expect(loopsFor(playlist, 'volcanic')).toBe(true);
    expect(fileFor({ kind: 'playlist', files: [] }, 'meadow', 0)).toBeNull();
    expect(loopsFor({ kind: 'playlist', files: ['only.ogg'] }, 'meadow')).toBe(true);
  });

  it('debug overrides accept plain audio file names only', () => {
    expect(parseMusicSource('{"kind":"track","file":"x.ogg"}')).toEqual({ kind: 'track', file: 'x.ogg' });
    expect(parseMusicSource('{"kind":"playlist","files":["a.wav","b.mp3"],"byBiome":{"pumpkin":"c.m4a"}}')).toEqual({
      kind: 'playlist',
      files: ['a.wav', 'b.mp3'],
      byBiome: { pumpkin: 'c.m4a' },
    });
    for (const bad of ['{"kind":"track","file":"../x.ogg"}', '{"kind":"track","file":"https://evil.example/x.ogg"}', '{"kind":"track","file":"x.js"}', '{"kind":"playlist","files":"a.ogg"}', 'track:a.ogg', '{"kind":"radio"}']) {
      expect(parseMusicSource(bad), bad).toBeNull();
    }
  });
});
