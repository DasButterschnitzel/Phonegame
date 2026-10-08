import { describe, it, expect } from 'vitest';
import { Sim, newGameState } from '../sim.ts';
import { SIM } from '../config.ts';
import { serialize } from './serialize.ts';
import { parseSave } from './migrations.ts';
import { newMeta } from './schema.ts';
import type { SimEvent } from '../types.ts';

const step = (sim: Sim, n: number, sink?: SimEvent[]) => {
  for (let i = 0; i < n; i++) {
    sim.step(SIM.DT, { throttleHeld: true });
    const ev = sim.drainEvents();
    if (sink) sink.push(...ev);
  }
};

const reload = (sim: Sim): Sim => {
  const res = parseSave(JSON.stringify(serialize(sim, newMeta(1000), { lang: 'de' }, 2000)), 3000);
  if (!res.ok) throw new Error(res.reason);
  return new Sim(res.save.game);
};

const fieldHash = (sim: Sim) => `${sim.terr.claimed.join('')}|${sim.field.dead.join('')}|${Array.from(sim.field.hp, (h) => h.toFixed(2)).join(',')}`;

describe('save', () => {
  it('round-trips game state, cleared territory, destroyed crops and crop damage', () => {
    const sim = new Sim();
    sim.state.progress.segments = Array.from({ length: 5 }, (_, i) => ({ id: 50 + i, level: 5 }));
    sim.state.progress.capacityLevel = 20;
    step(sim, 30 * 60);
    sim.execute({ c: 'clearFrontier', n: 2 });
    step(sim, 30 * 5);
    expect(sim.terr.claimedCount).toBeGreaterThan(8);
    const sim2 = reload(sim);
    expect(sim2.state.coins).toBeCloseTo(sim.state.coins);
    expect(sim2.state.progress.segments.length).toBe(5);
    expect(sim2.field.deadCount).toBe(sim.field.deadCount);
    expect(fieldHash(sim2)).toBe(fieldHash(sim));
    expect(sim2.path.length).toBeCloseTo(sim.path.length, 6);
  });
  it('reload mid-expansion and mid-unload continues exactly like the original', () => {
    const sim = new Sim();
    sim.state.progress.segments = Array.from({ length: 6 }, (_, i) => ({ id: 50 + i, level: 4 }));
    sim.state.progress.capacityLevel = 12;
    // Run until a plot is waiting to be claimed while cargo is rolling off at the depot (or as close as it gets).
    let best = 0;
    for (let i = 0; i < 30 * 240; i++) {
      step(sim, 1);
      const pending = sim.terr.readySince.some((t) => t >= 0);
      if (pending && sim.state.depot.active) {
        best = 2;
        break;
      }
      if (pending && best === 0) best = 1;
    }
    expect(best).toBeGreaterThan(0);
    const sim2 = reload(sim);
    expect(sim2.state.depot).toEqual(sim.state.depot);
    expect(Array.from(sim2.terr.readySince)).toEqual(Array.from(sim.terr.readySince));
    const a: SimEvent[] = [];
    const b: SimEvent[] = [];
    step(sim, 30 * 30, a);
    step(sim2, 30 * 30, b);
    expect(sim2.state.coins).toBeCloseTo(sim.state.coins, 6);
    expect(fieldHash(sim2)).toBe(fieldHash(sim));
    expect(b.filter((e) => e.t === 'routeGrew').length).toBe(a.filter((e) => e.t === 'routeGrew').length);
  });
  it('migrates a v1 save (stages → zones, regrowth list dropped)', () => {
    const v1 = {
      v: 1,
      savedAtWall: 1234,
      game: {
        ...newGameState(),
        coins: 777,
        progress: { stage: 2, finished: false, addCount: 4, mergeCount: 1, speedLevel: 3, capacityLevel: 4, segments: [{ id: 1, level: 2 }, { id: 2, level: 1 }] },
        farmsProgress: { pumpkin: { stage: 1, finished: false, addCount: 0, mergeCount: 0, speedLevel: 1, capacityLevel: 1, segments: [{ id: 9, level: 1 }] } },
        unlockedFarms: ['meadow', 'pumpkin'],
        depot: undefined,
      },
      crops: [[123, 4, 10, 0]],
      meta: { sessions: 3 },
      settings: { lang: 'de' },
    };
    const res = parseSave(JSON.stringify(v1), 5000);
    expect(res.ok && res.migratedFrom).toBe(1);
    if (!res.ok) return;
    expect(res.save.v).toBe(3);
    expect('crops' in res.save).toBe(false);
    const g = res.save.game;
    expect(g.coins).toBe(777);
    expect(g.progress.zone).toBe(2);
    expect((g.progress as unknown as Record<string, unknown>).stage).toBeUndefined();
    expect(g.farmsProgress.pumpkin?.zone).toBe(1);
    expect(g.depot.active).toBe(false);
    const sim = new Sim(g);
    expect(sim.state.progress.capacityLevel).toBe(4);
    // Zones 0..2 are open, so their crops are in the bins; the start territory is the cleared land.
    expect(sim.terr.claimedCount).toBe(sim.farm.layout.start.reduce((a, b) => a + b, 0));
    step(sim, 30 * 10);
    expect(sim.state.headS).toBeGreaterThan(0);
  });
  it('migrates a v0 save', () => {
    const res = parseSave(JSON.stringify({ coins: 42, segments: [{ id: 1, level: 3 }] }), 100);
    expect(res.ok && res.migratedFrom).toBe(0);
    if (res.ok) {
      expect(res.save.game.coins).toBe(42);
      expect(res.save.game.progress.segments[0].level).toBe(3);
      expect(res.save.game.progress.zone).toBe(0);
    }
  });
  it('ignores a corrupt or outdated field snapshot instead of crashing', () => {
    const sim = new Sim();
    step(sim, 30 * 20);
    sim.syncField();
    const g = JSON.parse(JSON.stringify(sim.state));
    // A territory with a hole in it.
    const l = sim.farm.layout;
    const holey = new Uint8Array(l.cols * l.rows);
    for (let r = 1; r < 6; r++) for (let c = 1; c < 6; c++) holey[r * l.cols + c] = r === 3 && c === 3 ? 0 : 1;
    const bits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let s = '';
    for (let i = 0; i < holey.length; i += 6) {
      let v = 0;
      for (let k = 0; k < 6; k++) if (holey[i + k]) v |= 1 << k;
      s += bits[v];
    }
    g.progress.field.claimed = s;
    const res = parseSave(JSON.stringify({ v: 2, savedAtWall: 1, game: g, meta: {}, settings: {} }), 2);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const sim2 = new Sim(res.save.game);
    expect(sim2.terr.claimedCount).toBe(l.start.reduce((a, b) => a + b, 0));
    // Outdated layout version: field state is dropped, the game still loads.
    g.progress.field.ver = 12345;
    const res2 = parseSave(JSON.stringify({ v: 2, savedAtWall: 1, game: g, meta: {}, settings: {} }), 2);
    expect(res2.ok && new Sim(res2.save.game).field.deadCount).toBe(0);
  });
  it('rejects corrupt and future saves', () => {
    expect(parseSave('{nope', 0)).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(parseSave(JSON.stringify({ v: 99 }), 0)).toMatchObject({ ok: false, reason: 'future' });
    expect(parseSave(null, 0)).toMatchObject({ ok: false, reason: 'empty' });
  });
  // ── v2 → v3 (endless World Tour) ──────────────────────────────────────────────────────────────────────────────
  /** A v2 save of a game in this state (v3 minus the journey, blueprints and arrival times). */
  const asV2 = (sim: Sim): string => {
    sim.syncField();
    const g = JSON.parse(JSON.stringify(sim.state));
    delete g.journey;
    delete g.progress.arrivedAt;
    for (const p of Object.values(g.farmsProgress) as { arrivedAt?: number }[]) delete p.arrivedAt;
    return JSON.stringify({ v: 2, savedAtWall: 1, game: g, meta: { sessions: 3 }, settings: { lang: 'de' } });
  };
  const finishHere = (sim: Sim) => {
    sim.execute({ c: 'grantCoins', amount: 1e15, reason: 'debug' });
    while (sim.state.progress.zone < 3) sim.execute({ c: 'buy', id: 'expand' });
    sim.execute({ c: 'clearAll' });
    sim.execute({ c: 'buy', id: 'finish' });
    sim.drainEvents();
  };
  it('v2 → v3: a fresh Meadow save loads as the start of the Starter Tour', () => {
    const res = parseSave(asV2(new Sim()), 5);
    expect(res.ok && res.migratedFrom).toBe(2);
    if (!res.ok) return;
    expect(res.save.v).toBe(3);
    expect(res.save.game.farmId).toBe('meadow');
    expect(res.save.game.journey).toMatchObject({ seed: 0, ordinal: 1, tours: 0, completed: 0 });
    expect(res.save.settings).toEqual({ lang: 'de' });
    expect(res.save.meta.sessions).toBe(3);
  });
  it('v2 → v3: mid-Pumpkin keeps the farm, its cleared land, coins, upgrades and the progress on Meadow', () => {
    const sim = new Sim();
    finishHere(sim);
    sim.execute({ c: 'travel', farm: 'pumpkin' });
    sim.state.progress.segments = Array.from({ length: 5 }, (_, i) => ({ id: 80 + i, level: 3 }));
    sim.state.progress.speedLevel = 6;
    step(sim, 30 * 20);
    sim.execute({ c: 'clearFrontier', n: 2 });
    step(sim, 30 * 4);
    const coins = sim.state.coins;
    const res = parseSave(asV2(sim), 5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const g = res.save.game;
    expect(g.farmId).toBe('pumpkin');
    expect(g.coins).toBeCloseTo(coins);
    expect(g.progress.speedLevel).toBe(6);
    expect(g.completedFarms).toEqual(['meadow']);
    expect(g.farmsProgress.meadow?.finished).toBe(true);
    expect(g.journey).toMatchObject({ ordinal: 2, tours: 0, completed: 1, seed: 0 });
    expect(g.journey.biomes).toEqual(expect.arrayContaining(['meadow', 'pumpkin']));
    const sim2 = new Sim(g);
    expect(sim2.field.deadCount).toBe(sim.field.deadCount);
    expect(fieldHash(sim2)).toBe(fieldHash(sim));
  });
  it('v2 → v3: all five done opens the World Tour (Core Rank 1) and keeps playing on Cactus Ranch', () => {
    const sim = new Sim();
    for (const id of ['pumpkin', 'sunflower', 'snowyberry', 'desert', null] as const) {
      finishHere(sim);
      if (id) sim.execute({ c: 'travel', farm: id });
    }
    // Build the v2 picture: what an old build would have saved after Cactus Ranch.
    const res = parseSave(asV2(sim), 5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const g = res.save.game;
    expect(g.farmId).toBe('desert');
    expect(g.journey.tours).toBe(1);
    expect(g.journey.seed).not.toBe(0);
    expect(g.journey.ordinal).toBe(6);
    expect(g.journey.completed).toBe(5);
    const sim2 = new Sim(g);
    expect(sim2.nextDestination).toBeTruthy();
    sim2.execute({ c: 'travel', farm: sim2.nextDestination! });
    expect(sim2.farm.ordinal).toBe(6);
  });
  it('v3 recovers: a damaged blueprint is rebuilt from its key, an unknown farm lands on the frontier, a broken journey resets', () => {
    const sim = new Sim();
    for (let i = 0; i < 5; i++) {
      finishHere(sim);
      const next = sim.nextDestination ?? ['pumpkin', 'sunflower', 'snowyberry', 'desert'][i];
      sim.execute({ c: 'travel', farm: next });
    }
    const key = sim.state.farmId;
    const map = sim.farm.map;
    const v3 = serialize(sim, newMeta(1), {}, 2);
    const g1 = JSON.parse(JSON.stringify(v3));
    g1.game.progress.bp.map = ['broken'];
    const r1 = parseSave(JSON.stringify(g1), 3);
    expect(r1.ok && r1.save.game.farmId).toBe(key);
    if (r1.ok) expect(new Sim(r1.save.game).farm.map).toEqual(map);
    const g2 = JSON.parse(JSON.stringify(v3));
    g2.game.farmId = 'w9999-nowhere-00000000';
    delete g2.game.progress.bp;
    const r2 = parseSave(JSON.stringify(g2), 3);
    expect(r2.ok && r2.save.game.farmId).toBe(key);
    const g3 = JSON.parse(JSON.stringify(v3));
    g3.game.journey = { seed: 'x', ordinal: -4, recent: 'nope' };
    g3.game.farmId = 'meadow';
    const r3 = parseSave(JSON.stringify(g3), 3);
    expect(r3.ok).toBe(true);
    if (r3.ok) {
      expect(r3.save.game.journey.recent).toEqual([]);
      expect(r3.save.game.farmId).toBe('meadow');
      expect(() => new Sim(r3.save.game)).not.toThrow();
    }
  });
  it('fills defaults for partial saves', () => {
    const res = parseSave(JSON.stringify({ v: 2, game: { coins: 'x', farmId: 'mars', depot: { active: true, segs: 0 } } }), 5);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.save.game.coins).toBe(0);
      expect(res.save.game.farmId).toBe('meadow');
      expect(res.save.game.depot.active).toBe(false);
      expect(new Sim(res.save.game).state.headS).toBeGreaterThan(0);
    }
  });
});
