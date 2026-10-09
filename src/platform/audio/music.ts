import type { BiomeId } from '../../game/types.ts';

/**
 * Where the game's music comes from. PROCEDURAL (the default) is the generated tune of each biome family; the owner's
 * own files plug in here without touching the engine:
 *   - TRACK: one file, looped on every farm;
 *   - PLAYLIST: files played in order (the list loops), optionally with a file of its own per biome family that
 *     loops while you are there.
 * Changing the file (travel to another biome, the next playlist entry) crossfades. Files go in public/music/: they are
 * copied as they are and streamed on demand, never part of the JavaScript bundle. A file that cannot play hands the
 * music back to the procedural tunes.
 */
export type MusicSource =
  | { kind: 'procedural' }
  | { kind: 'track'; file: string }
  | { kind: 'playlist'; files: string[]; byBiome?: Partial<Record<BiomeId, string>> };

export const MUSIC = {
  source: { kind: 'procedural' } as MusicSource,
  /** Files against the music bus, which is set for the quiet procedural voices (tune by ear when files arrive). */
  fileGain: 2.5,
  /** Seconds a change of file takes to crossfade. */
  crossfadeS: 2,
  /** Where files are served from (public/music/ in every build). */
  base: './music/',
};

/** The file that should play: the biome's own, else the current playlist entry, else the single track. */
export function fileFor(src: MusicSource, biome: BiomeId, index: number): string | null {
  if (src.kind === 'track') return src.file || null;
  if (src.kind === 'playlist') {
    const own = src.byBiome?.[biome];
    if (own) return own;
    return src.files.length ? src.files[((index % src.files.length) + src.files.length) % src.files.length] : null;
  }
  return null;
}

/** Whether that file loops by itself; otherwise the playlist moves on when it ends. */
export function loopsFor(src: MusicSource, biome: BiomeId): boolean {
  if (src.kind === 'track') return true;
  if (src.kind === 'playlist') return !!src.byBiome?.[biome] || src.files.length === 1;
  return false;
}

const FILE = /^[\w.-]+\.(ogg|oga|mp3|m4a|aac|wav|opus|webm)$/i;

/** A debug-build override (`?music=<JSON>`): accepted only if it is a well-formed source of plain file names. */
export function parseMusicSource(json: string): MusicSource | null {
  try {
    const v = JSON.parse(json) as Record<string, unknown>;
    const ok = (f: unknown): f is string => typeof f === 'string' && FILE.test(f);
    if (v.kind === 'procedural') return { kind: 'procedural' };
    if (v.kind === 'track' && ok(v.file)) return { kind: 'track', file: v.file };
    if (v.kind === 'playlist' && Array.isArray(v.files) && v.files.every(ok)) {
      const by = (v.byBiome ?? {}) as Record<string, unknown>;
      if (typeof by !== 'object' || !Object.values(by).every(ok)) return null;
      return { kind: 'playlist', files: v.files, byBiome: by as Partial<Record<BiomeId, string>> };
    }
  } catch {
    /* not JSON */
  }
  return null;
}
