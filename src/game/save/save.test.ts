import { describe, it, expect } from 'vitest';
import { Sim } from '../sim.ts';
import { SIM } from '../config.ts';
import { serialize, applyCrops } from './serialize.ts';
import { parseSave } from './migrations.ts';
import { newMeta } from './schema.ts';

describe('save', () => {
  it('round-trips game state and crop damage', () => {
    const sim = new Sim();
    sim.execute({ c: 'grantCoins', amount: 500, reason: 'debug' });
    sim.execute({ c: 'buy', id: 'add' });
    for (let i = 0; i < 30 * 40; i++) sim.step(SIM.DT, { throttleHeld: true });
    const save = serialize(sim, newMeta(1000), { lang: 'de' }, 2000);
    const json = JSON.stringify(save);
    const res = parseSave(json, 3000);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const sim2 = new Sim(res.save.game);
    applyCrops(sim2, res.save.crops);
    expect(sim2.state.coins).toBeCloseTo(sim.state.coins);
    expect(sim2.state.progress.segments.length).toBe(2);
    expect(sim2.field.deadCount).toBe(sim.field.deadCount);
    let diff = 0;
    for (let i = 0; i < sim.field.count; i++) diff += Math.abs(sim.field.hp[i] - sim2.field.hp[i]);
    expect(diff).toBeLessThan(1);
    expect(res.save.settings.lang).toBe('de');
    expect(res.save.savedAtWall).toBe(2000);
  });
  it('migrates a v0 save', () => {
    const res = parseSave(JSON.stringify({ coins: 42, segments: [{ id: 1, level: 3 }] }), 100);
    expect(res.ok && res.migratedFrom).toBe(0);
    if (res.ok) {
      expect(res.save.game.coins).toBe(42);
      expect(res.save.game.progress.segments[0].level).toBe(3);
      expect(res.save.game.progress.stage).toBe(0);
    }
  });
  it('rejects corrupt and future saves', () => {
    expect(parseSave('{nope', 0)).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(parseSave(JSON.stringify({ v: 99 }), 0)).toMatchObject({ ok: false, reason: 'future' });
    expect(parseSave(null, 0)).toMatchObject({ ok: false, reason: 'empty' });
  });
  it('fills defaults for partial saves', () => {
    const res = parseSave(JSON.stringify({ v: 1, game: { coins: 'x', farmId: 'mars' } }), 5);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.save.game.coins).toBe(0);
      expect(res.save.game.farmId).toBe('meadow');
      expect(new Sim(res.save.game).state.headS).toBeGreaterThan(0);
    }
  });
});
