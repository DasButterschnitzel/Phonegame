import type { Sim } from '../game/sim.ts';
import type { BoostId, FarmId, SimEvent, UpgradeId } from '../game/types.ts';
import { MISC } from '../game/config.ts';
import type { GameRenderer } from '../render/Renderer.ts';
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
import { icon } from '../ui/icons.ts';
import type { AdManager } from '../platform/ads/AdManager.ts';
import type { Placement } from '../platform/ads/AdService.ts';
import { fmt, onLangChange, setLang, t, type I18nKey } from '../platform/i18n/i18n.ts';
import type { Settings } from '../platform/settings.ts';
import { bodyOffset } from '../game/caterpillar.ts';
import { sampleAt } from '../game/path.ts';

export interface GameDeps {
  sim: Sim;
  renderer: GameRenderer;
  pause: PauseController;
  input: ThrottleInput;
  ads: AdManager;
  settings: Settings;
  /** Persist settings now (resolves once written). */
  saveSettings: () => Promise<void>;
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
  private ui: HTMLElement;
  private hudAcc = 0;
  /** Chunk value aggregation per body for floaters. */
  private agg = new Map<number, { value: number; golden: boolean; tier: number; t: number }>();
  /** Event subscribers added by later modules (audio, haptics, tutorial…). */
  readonly listeners: ((e: SimEvent) => void)[] = [];
  private pendingUnloadBreak = false;
  /** Last HUD purchase/boost tap (an interstitial must never interrupt a tapping spree). */
  private lastActionAt = -Infinity;
  private lastToastAt = 0;

  constructor(d: GameDeps) {
    this.d = d;
    const ui = document.getElementById('ui')!;
    this.ui = ui;
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

  readonly settingsListeners: ((s: Settings) => void)[] = [];

  applySettings(s: Settings): void {
    setLang(s.lang);
    this.d.input.toggleMode = s.toggleHold;
    this.hud.setToggleMode(s.toggleHold);
    this.d.renderer.rig.reduceMotion = s.reduceMotion;
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
    for (const l of this.settingsListeners ?? []) l(s);
  }

  /** One toast at a time for repeated "can't" taps. */
  private nag(key: I18nKey): void {
    const now = performance.now();
    if (now - this.lastToastAt < 1500) return;
    this.lastToastAt = now;
    this.toasts.show(t(key));
  }

  // ——— HUD actions ———

  async rewarded(p: Placement): Promise<boolean> {
    if (!this.d.ads.rewardedAvailable) {
      this.toasts.show(t('ad.notReady'));
      return false;
    }
    const ok = await this.d.ads.rewarded(p);
    if (!ok) this.toasts.show(t(this.d.ads.lastFailure === 'failed' ? 'ad.failed' : 'ad.noReward'));
    return ok;
  }

  async buy(id: UpgradeId, free: boolean): Promise<void> {
    const sim = this.d.sim;
    this.lastActionAt = performance.now();
    if (free) {
      if (!(await this.rewarded('free_upgrade'))) return;
      this.offers.consumed(performance.now() / 1000);
      sim.execute({ c: 'buy', id, free: true });
      this.hud.popUpgrade(id, this.d.settings.reduceMotion);
      return;
    }
    const chk = sim.check(id);
    if (!chk.ok) {
      this.hud.shake(id);
      if (chk.reason === 'maxSegments') this.nag(sim.state.progress.stage >= 3 ? 'up.reason.mergeRoom' : 'up.reason.maxSegments');
      else if (chk.reason === 'noPair') this.nag('up.reason.noPair');
      else if (chk.reason === 'maxLevel') this.nag('up.max');
      else this.nag('up.reason.coins');
      return;
    }
    sim.execute({ c: 'buy', id });
    this.hud.popUpgrade(id, this.d.settings.reduceMotion);
  }

  async tornado(): Promise<void> {
    const sim = this.d.sim;
    this.lastActionAt = performance.now();
    if (sim.state.tornadoes > 0) {
      sim.execute({ c: 'useTornado' });
      return;
    }
    if (!this.d.ads.canOffer('free_tornado')) {
      this.hud.shake('tornado');
      this.nag(this.d.ads.rewardedAvailable ? 'ad.later' : 'ad.notReady');
      return;
    }
    if (await this.rewarded('free_tornado')) {
      sim.execute({ c: 'grantTornado', n: 1 });
      sim.execute({ c: 'useTornado' });
    }
  }

  async boost(id: BoostId): Promise<void> {
    this.lastActionAt = performance.now();
    // Only offer the ad when it can add its full value.
    if (this.d.sim.state.boosts[id] > MISC.BOOST_CAP_S - MISC.BOOST_ADD_S) {
      this.hud.shake(id);
      this.nag('boost.max');
      return;
    }
    if (await this.rewarded(id === 'incomeX2' ? 'income_x2' : 'autopilot')) this.d.sim.execute({ c: 'boost', id, seconds: MISC.BOOST_ADD_S });
  }

  openSettings(): void {
    openSettings(this.modals, {
      settings: this.d.settings,
      apply: async (s, changed) => {
        this.applySettings(s);
        await this.d.saveSettings();
        if (changed === 'quality') location.reload();
      },
      privacyOptionsAvailable: this.d.ads.provider.privacyOptionsAvailable,
      showPrivacyOptions: () => void this.d.ads.provider.showPrivacyOptions?.(),
      privacyUrl: import.meta.env.VITE_FLAVOR === 'youtube' || import.meta.env.VITE_FLAVOR === 'crazygames' ? '' : 'https://dasbutterschnitzel.github.io/Phonegame/privacy.html',
      resetProgress: () => this.d.resetProgress(),
      version: __APP_VERSION__,
    });
  }

  /** Cloud wipe that hides the farm swap, then a welcome banner. */
  travelTo(id: FarmId, run: () => void): void {
    const wipe = h('div', { class: 'travel-wipe', 'data-ui': true }, h('div', { class: 'card outline' }, icon('map', 'ico wipe-ico'), t(`farm.${id}` as I18nKey)));
    this.ui.append(wipe);
    const reveal = () => {
      run();
      // Let the new farm render a frame or two behind the curtain before it lifts.
      setTimeout(() => {
        wipe.classList.add('out');
        setTimeout(() => wipe.remove(), 600);
        this.toasts.banner(t('banner.newFarm', { farm: t(`farm.${id}` as I18nKey) }), t('hud.stage', { n: this.d.sim.state.progress.stage + 1 }));
      }, 380);
    };
    if (this.d.settings.reduceMotion) reveal();
    else setTimeout(reveal, 450);
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
          a.tier = Math.max(a.tier, e.tier);
        } else this.agg.set(e.body, { value: e.value, golden: e.golden, tier: e.tier, t: performance.now() });
        break;
      }
      case 'unload': {
        const barn = sim.farm.barn;
        if (renderer.project(barn.bx, 2.6, barn.bz, tmpP)) {
          this.floaters.spawn(tmpP.x, tmpP.y - 20, `+${fmt(e.value)}`, 'big', 1.3);
          const target = this.hud.center(this.hud.coinPill);
          coinFly(this.fxLayer, { x: tmpP.x, y: tmpP.y }, target, Math.ceil(Math.log2(1 + e.mass)), () => this.hud.bumpCoins(), this.d.settings.reduceMotion);
        }
        this.hud.bumpBasket();
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
      case 'stageChanged': {
        renderer.rig.addShake(0.25);
        const crop = sim.farm.crops[Math.min(3, e.stage)];
        this.toasts.banner(t('banner.stage', { n: e.stage + 1 }), t('banner.newCrop', { crop: t(`crop.${crop}` as I18nKey) }));
        break;
      }
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
      if (renderer.project(tmpS.x, 1.3, tmpS.z, tmpP)) this.floaters.spawn(tmpP.x, tmpP.y, `+${fmt(a.value)}`, a.golden ? 'gold' : `t${a.tier}`);
    }
    this.floaters.update();
    this.hud.tickCoins(sim.state.coins, dt);
    this.hudAcc += dt;
    if (this.hudAcc >= 0.1) {
      this.hudAcc = 0;
      const vm = buildHud(sim);
      const ads = this.d.ads;
      const free = this.offers.update(vm, now / 1000, ads.canOffer('free_upgrade'));
      this.hud.adsAvailable = ads.rewardedAvailable;
      this.hud.tornadoAd = ads.canOffer('free_tornado');
      this.hud.update(vm, free, this.d.isDailyAvailable());
      this.hud.holdHint.classList.toggle('hide', input.totalHeld > 2.5 || sim.state.boosts.autopilot > 0 || this.toasts.hinting);
      this.toasts.placeFinger();
    }
    // Interstitial break after an unload, once the coins have landed and the player isn't steering or tapping.
    if (this.pendingUnloadBreak && !this.modals.open) {
      this.pendingUnloadBreak = false;
      setTimeout(() => {
        const t0 = performance.now();
        void this.d.ads.maybeInterstitial({
          kind: 'barn_unload',
          sinceThrottle: Math.min(t0 - input.lastHeldAt, t0 - this.lastActionAt) / 1000,
          tutorialActive: this.tutorialActive(),
          modalOpen: this.modals.open,
        });
      }, 1100);
    }
  }

  tutorialActive: () => boolean = () => false;
}
