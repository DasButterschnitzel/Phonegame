import type { Sim } from '../game/sim.ts';
import type { SimEvent } from '../game/types.ts';
import type { Toasts } from '../ui/Toasts.ts';
import { t, type I18nKey } from '../platform/i18n/i18n.ts';

type Step = 'add' | 'merge' | 'full' | 'capacity' | 'expand' | 'tornado' | 'grow';

/** First-time-user hints, one at a time, remembered in the save. */
export class Tutorial {
  private flags: Record<string, boolean>;
  private sim: Sim;
  private toasts: Toasts;
  private current: Step | null = null;
  private shownAt = 0;
  private fullPending = false;
  private capacityPending = false;
  private save: () => void;
  private target: (step: string) => HTMLElement | null;

  constructor(sim: Sim, toasts: Toasts, flags: Record<string, boolean>, save: () => void, target: (step: string) => HTMLElement | null = () => null) {
    this.sim = sim;
    this.toasts = toasts;
    this.flags = flags;
    this.save = save;
    this.target = target;
  }

  get active(): boolean {
    return this.current !== null;
  }

  private done(step: Step): void {
    if (this.flags[step]) return;
    this.flags[step] = true;
    if (this.current === step) this.show(null);
    this.save();
  }

  private show(step: Step | null): void {
    this.current = step;
    this.shownAt = this.sim.state.simTime;
    this.toasts.hint(step ? t(`tut.${step}` as I18nKey) : null, step ? this.target(step) : null);
  }

  onEvent(e: SimEvent): void {
    if (e.t === 'segAdded') this.done('add');
    if (e.t === 'merged') this.done('merge');
    if (e.t === 'zoneOpened') this.done('expand');
    // Teach by reaction: the first time the route grows, name what just happened.
    if (e.t === 'routeGrew' && !this.flags.grow && !this.current) {
      this.show('grow');
      this.flags.grow = true;
      this.save();
    }
    if (e.t === 'tornado') this.done('tornado');
    if (e.t === 'basketFull' && !this.flags.full) this.fullPending = true;
    else if (e.t === 'basketFull' && !this.flags.capacity) this.capacityPending = true;
    if (e.t === 'upgraded' && e.id === 'capacity') this.done('capacity');
  }

  update(): void {
    const st = this.sim.state;
    const f = this.flags;
    const age = st.simTime - this.shownAt;
    // A step can be completed elsewhere (another device's save, debug) — never leave its hint hanging.
    if (this.current && f[this.current]) this.show(null);
    if (this.current === 'full' && age > 5) this.done('full');
    if (this.current === 'capacity' && age > 8) this.done('capacity');
    if (this.current === 'tornado' && age > 12) this.done('tornado');
    if (this.current === 'grow' && age > 4) this.show(null);
    if (this.current) return;
    if (!f.add && this.sim.check('add').ok) return this.show('add');
    if (f.add && !f.merge && this.sim.check('merge').ok) return this.show('merge');
    if (this.fullPending && !f.full) {
      this.fullPending = false;
      return this.show('full');
    }
    if (this.capacityPending && f.full && !f.capacity && this.sim.check('capacity').ok) {
      this.capacityPending = false;
      return this.show('capacity');
    }
    if (!f.expand && this.sim.check('expand').ok) return this.show('expand');
    if (f.add && !f.tornado && st.simTime > 100 && st.tornadoes > 0) return this.show('tornado');
  }
}
