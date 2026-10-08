import { SAVE_VERSION, type SaveData } from './schema.ts';
import { validateGame, validateMeta } from './serialize.ts';
import { STARTER_FARMS, type FarmStamp, type Journey } from '../types.ts';
import { makeWorldSeed } from '../world/journey.ts';

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
  /**
   * v2 → v3: the five farms become the Starter Tour. A journey is built from what the player did: farms completed,
   * biomes visited, the frontier; with all five done, the World Tour is open (seeded from the save's own RNG).
   */
  2: (x) => {
    const game = { ...obj(x.game) };
    const starter = (a: unknown): string[] => (Array.isArray(a) ? a.filter((k): k is string => typeof k === 'string' && (STARTER_FARMS as readonly string[]).includes(k)) : []);
    const completed = starter(game.completedFarms);
    const unlocked = starter(game.unlockedFarms);
    const here = typeof game.farmId === 'string' ? game.farmId : 'meadow';
    const visited = [...new Set([here, ...Object.keys(obj(game.farmsProgress))])].filter((k) => (STARTER_FARMS as readonly string[]).includes(k));
    const allDone = STARTER_FARMS.every((f) => completed.includes(f));
    const frontier = Math.max(1, ...unlocked.map((k) => STARTER_FARMS.indexOf(k as never) + 1));
    const rng = typeof game.rng === 'number' ? game.rng : 0x5eed;
    const recent: FarmStamp[] = STARTER_FARMS.filter((f) => completed.includes(f)).map((f) => ({ key: f, ordinal: STARTER_FARMS.indexOf(f) + 1, biome: f, name: -1, seconds: 0 }));
    const journey: Journey = {
      seed: allDone ? makeWorldSeed(rng, 5) : 0,
      ordinal: allDone ? STARTER_FARMS.length + 1 : frontier,
      tours: allDone ? 1 : 0,
      completed: completed.length,
      biomes: (visited.length ? visited : ['meadow']) as Journey['biomes'],
      recent,
      best: { fastestS: 0 },
    };
    game.journey = journey;
    return { v: 3, savedAtWall: x.savedAtWall, game, meta: x.meta, settings: x.settings };
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
    v: 3,
    savedAtWall: typeof x.savedAtWall === 'number' ? x.savedAtWall : wallNow,
    game: validateGame(x.game as never),
    meta: validateMeta(x.meta as never, wallNow),
    settings: x.settings && typeof x.settings === 'object' ? (x.settings as Obj) : {},
  };
  return { ok: true, save, migratedFrom: from !== SAVE_VERSION ? from : undefined };
}
