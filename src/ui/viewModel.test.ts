import { describe, it, expect } from 'vitest';
import { Sim } from '../game/sim.ts';
import { buildHud } from './viewModel.ts';

describe('HUD view model', () => {
  it('reflects affordability and merge targets', () => {
    const sim = new Sim();
    let vm = buildHud(sim);
    expect(vm.upgrades.add.affordable).toBe(false);
    expect(vm.upgrades.merge.maxed).toBe(true); // no pair yet
    sim.execute({ c: 'grantCoins', amount: 1000, reason: 'debug' });
    sim.execute({ c: 'buy', id: 'add' });
    vm = buildHud(sim);
    expect(vm.upgrades.add.a).toBe(2);
    expect(vm.upgrades.merge.a).toBe(2);
    expect(vm.upgrades.merge.ok).toBe(true);
    expect(vm.goal?.id).toBe('expand');
  });
});
