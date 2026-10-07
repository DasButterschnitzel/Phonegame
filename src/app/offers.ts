import type { UpgradeId } from '../game/types.ts';
import type { HudVM } from '../ui/viewModel.ts';

/**
 * Decides which upgrade shows a "FREE (watch ad)" badge: the cheapest unaffordable core upgrade, offered only after
 * the player has been unable to afford anything for a while (so the offer feels helpful, not naggy).
 */
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
      core.sort((a, b) => a.cost - b.cost);
      this.current = core[0].id;
    }
    return this.current;
  }

  /** After the free upgrade is used, start the timer again. */
  consumed(now: number): void {
    this.current = null;
    this.poorSince = now;
  }
}
