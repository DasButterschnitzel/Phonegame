import type { Sim } from '../game/sim.ts';
import type { BoostId, SimEvent, UpgradeId } from '../game/types.ts';
import { MISC } from '../game/config.ts';
import type { GameRenderer } from '../render/Renderer.ts';
import type { Loop } from './loop.ts';
import type { PauseController } from './pause.ts';
import type { ThrottleInput } from './input.ts';
import { Offers } from './offers.ts';
import { Hud } from '../ui/Hud.ts';
import { Floaters } from '../ui/Floaters.ts';
import { Toasts } from '../ui/Toasts.ts';
import { coinFly } from '../ui/CoinFly.ts';
import { ModalStack } from '../ui/modals/ModalStack.ts';
import { openSettings } from '../ui/modals/Settings.ts';
import { buildHud } from '../ui/viewModel.ts';
import { h } from '../ui/dom.ts';
import type { AdManager } from '../platform/ads/AdManager.ts';
import type { Placement } from '../platform/ads/AdService.ts';
import { fmt, onLangChange, setLang, t } from '../platform/i18n/i18n.ts';
import type { Settings } from '../platform/settings.ts';
import { bodyOffset } from '../game/caterpillar.ts';
import { sampleAt } from '../game/path.ts';

export interface GameDeps {
  sim: Sim;
  renderer: GameRenderer;
  loop: Loop;
  pause: PauseController;
  input: ThrottleInput;
  ads: AdManager;
  settings: Settings;
  saveSettings: () => void;
  resetProgress: () => void;
  isDailyAvailable: () => boolean;
}

const tmpP = { x: 0, y: 0 };
const tmpS = { x: 0, z: 0, tx: 0, tz: 0 };

/** Glue between simulation events and the UI/juice layer; owns HUD actions. */
export class GameController {
  readonly d: GameDeps;
  readonly hud: Hud;
  readonly floaters: Floaters;
  readonly toasts: Toasts;
  readonly modals: ModalStack;
  readonly offers = new Offers();
  private fxLayer: HTMLElement;
  private hudAcc = 0;
  /** Chunk value aggregation per body for floaters. */
  private agg = new Map<number, { value: number; golden: boolean; t: number }>();
  /** Event subscribers added by later modules (audio, haptics, tutorial…). */
  readonly listeners: ((e: SimEvent) => void)[] = [];
  private pendingUnloadBreak = false;

  constructor(d: GameDeps) {
    this.d = d;
    const ui = document.getElementById('ui')!;
    this.fxLayer = h('div', { style: 'position:absolute;inset:0;pointer-events:none' });
    this.floaters = new Floaters(ui);
    this.hud = new Hud(ui, {
      buy: (id, free) => void this.buy(id, free),
      tornado: () => void this.tornado(),
      boost: (id) => void this.boost(id),
      openMap: () => this.openMap(),
      openDaily: () => this.openDaily(),
      openCollection: () => this.openCollection(),
      openSettings: () => this.openSettings(),
    });
    ui.append(this.fxLayer);
    this.toasts = new Toasts(ui);
    this.modals = new ModalStack(ui);
    this.modals.onChange((open) => (open ? d.pause.add('modal') : d.pause.remove('modal')));
    onLangChange(() => this.hud.relabel());
    this.applySettings(d.settings);
  }

  applySettings(s: Settings): void {
    setLang(s.lang);
    this.d.input.toggleMode = s.toggleHold;
    this.d.renderer.rig.reduceMotion = s.reduceMotion;
  }

  // ——— HUD actions ———

  async rewarded(p: Placement): Promise<boolean> {
    if (!this.d.ads.rewardedAvailable) {
      this.toasts.show(t('ad.notReady'));
      return false;
    }
    const ok = await this.d.ads.rewarded(p);
    if (!ok) this.toasts.show(t('ad.noReward'));
    return ok;
  }

  async buy(id: UpgradeId, free: boolean): Promise<void> {
    const sim = this.d.sim;
    if (free) {
      if (!(await this.rewarded('free_upgrade'))) return;
      this.offers.consumed(performance.now() / 1000);
      sim.execute({ c: 'buy', id, free: true });
      return;
    }
    const chk = sim.check(id);
    if (!chk.ok) {
      if (chk.reason === 'maxSegments') this.toasts.show(t('up.reason.maxSegments'));
      else if (chk.reason === 'noPair') this.toasts.show(t('up.reason.noPair'));
      return;
    }
    sim.execute({ c: 'buy', id });
  }

  async tornado(): Promise<void> {
    const sim = this.d.sim;
    if (sim.state.tornadoes > 0) {
      sim.execute({ c: 'useTornado' });
      return;
    }
    if (await this.rewarded('free_tornado')) {
      sim.execute({ c: 'grantTornado', n: 1 });
      sim.execute({ c: 'useTornado' });
    }
  }

  async boost(id: BoostId): Promise<void> {
    if (this.d.sim.state.boosts[id] >= MISC.BOOST_CAP_S - 1) return;
    if (await this.rewarded(id === 'incomeX2' ? 'income_x2' : 'autopilot')) this.d.sim.execute({ c: 'boost', id, seconds: MISC.BOOST_ADD_S });
  }

  openSettings(): void {
    openSettings(this.modals, {
      settings: this.d.settings,
      apply: (s, changed) => {
        this.applySettings(s);
        this.d.saveSettings();
        if (changed === 'quality') location.reload();
      },
      privacyOptionsAvailable: this.d.ads.provider.privacyOptionsAvailable,
      showPrivacyOptions: () => void this.d.ads.provider.showPrivacyOptions?.(),
      privacyUrl: 'https://dasbutterschnitzel.github.io/Phonegame/privacy.html',
      resetProgress: () => this.d.resetProgress(),
      version: __APP_VERSION__,
    });
  }

  // Filled in by later modules (map / daily / collection modals).
  openMap: () => void = () => {};
  openDaily: () => void = () => {};
  openCollection: () => void = () => {};

  // ——— Simulation events ———

  onEvent(e: SimEvent): void {
    const { renderer, sim } = this.d;
    switch (e.t) {
      case 'chunk': {
        if (e.wasted) break;
        const a = this.agg.get(e.body);
        if (a) {
          a.value += e.value;
          a.golden ||= e.golden;
        } else this.agg.set(e.body, { value: e.value, golden: e.golden, t: performance.now() });
        break;
      }
      case 'unload': {
        const barn = sim.farm.barn;
        if (renderer.project(barn.bx, 2.6, barn.bz, tmpP)) {
          this.floaters.spawn(tmpP.x, tmpP.y - 20, `+${fmt(e.value)}`, 'big', 1.3);
          const target = this.hud.center(this.hud.coinPill);
          coinFly(this.fxLayer, { x: tmpP.x, y: tmpP.y }, target, Math.ceil(Math.log2(1 + e.mass)), () => this.hud.bumpCoins(), this.d.settings.reduceMotion);
        }
        this.d.ads.noteUnload();
        this.pendingUnloadBreak = true;
        break;
      }
      case 'merged':
        renderer.cat.pulse(e.into, performance.now() / 1000);
        renderer.rig.addKick(0.05);
        break;
      case 'segAdded':
        renderer.cat.pulse(e.id, performance.now() / 1000);
        break;
      case 'stageChanged':
        renderer.rig.addShake(0.25);
        break;
      case 'tornadoGranted':
        this.toasts.show(t('toast.tornadoDrop'));
        break;
      default:
        break;
    }
    for (const l of this.listeners) l(e);
  }

  /** Per rendered frame. */
  frame(dt: number): void {
    const { sim, renderer, input } = this.d;
    const now = performance.now();
    // Flush aggregated chunk floaters above the segment that chomped them.
    for (const [body, a] of this.agg) {
      if (now - a.t < 140) continue;
      this.agg.delete(body);
      const s = sim.state.headS - bodyOffset(body);
      sampleAt(sim.path, s, tmpS);
      if (renderer.project(tmpS.x, 1.3, tmpS.z, tmpP)) this.floaters.spawn(tmpP.x, tmpP.y, `+${fmt(a.value)}`, a.golden ? 'gold' : '');
    }
    this.floaters.update();
    this.hud.tickCoins(sim.state.coins, dt);
    this.hud.holdHint.classList.toggle('hide', input.totalHeld > 2.5 || sim.state.boosts.autopilot > 0);
    this.hudAcc += dt;
    if (this.hudAcc >= 0.1) {
      this.hudAcc = 0;
      const vm = buildHud(sim);
      const free = this.offers.update(vm, now / 1000, this.d.ads.canOffer('free_upgrade'));
      this.hud.adsAvailable = this.d.ads.rewardedAvailable;
      this.hud.update(vm, free, this.d.isDailyAvailable());
    }
    // Interstitial break after an unload, once the coins have landed and the player isn't steering.
    if (this.pendingUnloadBreak && !this.modals.open) {
      this.pendingUnloadBreak = false;
      setTimeout(() => {
        void this.d.ads.maybeInterstitial({
          kind: 'barn_unload',
          sinceThrottle: (performance.now() - input.lastHeldAt) / 1000,
          tutorialActive: this.tutorialActive(),
          modalOpen: this.modals.open,
        });
      }, 1100);
    }
  }

  tutorialActive: () => boolean = () => false;
}
