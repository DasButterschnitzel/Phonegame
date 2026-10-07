import { SAVE_VERSION, type SaveData } from './schema.ts';
import { validateGame, validateMeta } from './serialize.ts';

export type LoadResult =
  | { ok: true; save: SaveData; migratedFrom?: number }
  | { ok: false; reason: 'empty' | 'corrupt' | 'future'; raw?: string };

type Obj = Record<string, unknown>;
type Migration = (x: Obj) => Obj;

const obj = (x: unknown): Obj => (x && typeof x === 'object' ? (x as Obj) : {});

/** v1 farm progress → v2: the stage you had reached becomes the outermost open zone; cleared land starts fresh. */
function progressV1toV2(p: unknown): Obj {
  const o = { ...obj(p) };
  const stage = typeof o.stage === 'number' && Number.isFinite(o.stage) ? Math.max(0, Math.min(3, Math.floor(o.stage))) : 0;
  delete o.stage;
  delete o.field;
  return { ...o, zone: stage };
}

const MIGRATIONS: Record<number, Migration> = {
  /** v0 (pre-release prototype): { coins, segments }. */
  0: (x) => ({
    v: 1,
    savedAtWall: x.savedAtWall ?? 0,
    game: { coins: x.coins ?? 0, progress: { segments: x.segments } },
    crops: [],
    meta: {},
    settings: {},
  }),
  /** v1 → v2: regrowth is gone, so the per-crop regrowth list is dropped. */
  1: (x) => {
    const game = { ...obj(x.game) };
    game.progress = progressV1toV2(game.progress);
    const fp: Obj = {};
    for (const [k, v] of Object.entries(obj(game.farmsProgress))) fp[k] = progressV1toV2(v);
    game.farmsProgress = fp;
    delete game.depot;
    return { v: 2, savedAtWall: x.savedAtWall, game, meta: x.meta, settings: x.settings };
  },
};

export function parseSave(raw: string | null, wallNow: number): LoadResult {
  if (!raw) return { ok: false, reason: 'empty' };
  let x: Obj;
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
  const save: SaveData = {
    v: 2,
    savedAtWall: typeof x.savedAtWall === 'number' ? x.savedAtWall : wallNow,
    game: validateGame(x.game as never),
    meta: validateMeta(x.meta as never, wallNow),
    settings: x.settings && typeof x.settings === 'object' ? (x.settings as Obj) : {},
  };
  return { ok: true, save, migratedFrom: from !== SAVE_VERSION ? from : undefined };
}
