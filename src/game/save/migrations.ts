import { SAVE_VERSION, type SaveV1 } from './schema.ts';
import { validateGame, validateMeta } from './serialize.ts';

export type LoadResult =
  | { ok: true; save: SaveV1; migratedFrom?: number }
  | { ok: false; reason: 'empty' | 'corrupt' | 'future'; raw?: string };

type Migration = (x: Record<string, unknown>) => Record<string, unknown>;

/** v0 (pre-release prototype): { coins, segments } → v1. Kept as the template for future migrations. */
const MIGRATIONS: Record<number, Migration> = {
  0: (x) => ({
    v: 1,
    savedAtWall: x.savedAtWall ?? 0,
    game: { coins: x.coins ?? 0, progress: { segments: x.segments } },
    crops: [],
    meta: {},
    settings: {},
  }),
};

export function parseSave(raw: string | null, wallNow: number): LoadResult {
  if (!raw) return { ok: false, reason: 'empty' };
  let x: Record<string, unknown>;
  try {
    x = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt', raw };
  }
  if (!x || typeof x !== 'object') return { ok: false, reason: 'corrupt', raw };
  let v = typeof x.v === 'number' ? x.v : 0;
  if (v > SAVE_VERSION) return { ok: false, reason: 'future', raw };
  const from = v;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) return { ok: false, reason: 'corrupt', raw };
    x = m(x);
    v = typeof x.v === 'number' ? x.v : v + 1;
  }
  const save: SaveV1 = {
    v: 1,
    savedAtWall: typeof x.savedAtWall === 'number' ? x.savedAtWall : wallNow,
    game: validateGame(x.game as never),
    crops: Array.isArray(x.crops) ? (x.crops as SaveV1['crops']).filter((c) => Array.isArray(c) && c.length === 4) : [],
    meta: validateMeta(x.meta as never, wallNow),
    settings: x.settings && typeof x.settings === 'object' ? (x.settings as Record<string, unknown>) : {},
  };
  return { ok: true, save, migratedFrom: from !== SAVE_VERSION ? from : undefined };
}
