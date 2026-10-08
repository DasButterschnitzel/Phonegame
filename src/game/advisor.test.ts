import { describe, expect, it } from 'vitest';
import { recommend, upgradeValues, type CoreUpgrade, type UpgradeValue } from './advisor.ts';
import { Sim } from './sim.ts';

const v = (id: CoreUpgrade, payback: number, ok = true): UpgradeValue => ({ id, cost: 100, ok, blocked: false, rel: 0.1, payback });

describe('shop hint (recommend)', () => {
  it('points at the affordable upgrade with the best payback', () => {
    expect(recommend([v('add', 90), v('speed', 40), v('capacity', 300)], null)).toBe('speed');
    // The best deal overall is not affordable: the best affordable one.
    expect(recommend([v('add', 90), v('speed', 40, false)], null)).toBe('add');
  });
  it('is sticky between near-equal deals, but moves for a clearly better one', () => {
    expect(recommend([v('add', 48), v('speed', 40)], 'add')).toBe('add');
    expect(recommend([v('add', 60), v('speed', 40)], 'add')).toBe('speed');
    // The current pick stopped being affordable.
    expect(recommend([v('add', 30, false), v('speed', 40)], 'add')).toBe('speed');
  });
  it('says nothing when nothing affordable is worth anything', () => {
    expect(recommend([v('add', 90, false), v('capacity', Infinity)], null)).toBe(null);
    expect(recommend([], 'speed')).toBe(null);
  });
  it('a fresh game with coins for both points at ADD before SPEED (as the bots play)', () => {
    const sim = new Sim();
    sim.execute({ c: 'grantCoins', amount: 200, reason: 'debug' });
    expect(recommend(upgradeValues(sim, 0), null)).toBe('add');
  });
});
