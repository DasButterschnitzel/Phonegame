import type { UpgradeId } from '../game/types.ts';
import type { HudVM } from '../ui/viewModel.ts';

/**
 * Decides which upgrade shows a "FREE (watch ad)" badge, offered only after the player has been unable to afford
 * anything for a while (so it feels helpful, not naggy). It picks the most valuable upgrade within ~2.5 minutes of
 * income — worth an ad — falling back to the cheapest one.
 */
const REACH_S = 150;

export class Offers {
  private poorSince = Infinity;
  current: UpgradeId | null = null;
  readonly delaySec: number;

  constructor(delaySec = 20) {
    this.delaySec = delaySec;
  }

  update(vm: HudVM, now: number, canOffer: boolean): UpgradeId | null {
    const core = (['add', 'merge', 'speed', 'capacity'] as const).map((id) => vm.upgrades[id]).filter((u) => !u.maxed);
    const anyAffordable = core.some((u) => u.affordable);
    if (anyAffordable || core.length === 0) {
      this.poorSince = Infinity;
      this.current = null;
      return null;
    }
    if (this.poorSince === Infinity) this.poorSince = now;
    if (!canOffer || now - this.poorSince < this.delaySec) {
      this.current = null;
      return null;
    }
    if (!this.current || !core.some((u) => u.id === this.current)) {
      const reach = vm.coins + vm.rate * REACH_S;
      const within = core.filter((u) => u.cost <= reach).sort((a, b) => b.cost - a.cost);
      this.current = within[0]?.id ?? core.sort((a, b) => a.cost - b.cost)[0].id;
    }
    return this.current;
  }

  /** After the free upgrade is used, start the timer again. */
  consumed(now: number): void {
    this.current = null;
    this.poorSince = now;
  }
}
