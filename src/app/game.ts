import type { Sim } from '../game/sim.ts';
import type { BoostId, FarmId, SimEvent, UpgradeId } from '../game/types.ts';
import { MISC, capacityOf } from '../game/config.ts';
import { payoutTier } from '../game/economy.ts';
import { recommend, upgradeValues, type CoreUpgrade } from '../game/advisor.ts';
import type { GameRenderer } from '../render/Renderer.ts';
import type { PauseController } from './pause.ts';
import type { ThrottleInput } from './input.ts';
import { Offers } from './offers.ts';
import { Hud } from '../ui/Hud.ts';
import { Floaters } from '../ui/Floaters.ts';
import { Toasts } from '../ui/Toasts.ts';
import { UnloadCounter } from '../ui/UnloadCounter.ts';
import { coinFly, iconFly } from '../ui/CoinFly.ts';
import { ModalStack } from '../ui/modals/ModalStack.ts';
import { openSettings } from '../ui/modals/Settings.ts';
import { openBonusChoice } from '../ui/modals/BonusChoice.ts';
import { buildHud } from '../ui/viewModel.ts';
import { h } from '../ui/dom.ts';
import { titleForKey, titleOf } from '../ui/farmNames.ts';
import { ICONS, icon } from '../ui/icons.ts';
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
  private unloadCounter: UnloadCounter;
  readonly offers = new Offers();
  private fxLayer: HTMLElement;
  private ui: HTMLElement;
  private hudAcc = 0;
  /** Chunk value aggregation per body for floaters. */
  private agg = new Map<number, { value: number; golden: boolean; tier: number; t: number }>();
  /** Event subscribers added by later modules (audio, haptics, tutorial…). */
  readonly listeners: ((e: SimEvent) => void)[] = [];
  private pendingUnloadBreak = false;
  private unloadCoin = 0;
  private unloadSegs = 1;
  /** How big the current depot payout feels (0 routine, 1 good, 2 big). */
  private payTier: 0 | 1 | 2 = 0;
  /** Last HUD purchase/boost tap (an interstitial must never interrupt a tapping spree). */
  private lastActionAt = -Infinity;
  /** Last big moment (route growth, merge, new field, FINAL HARVEST, farm finished): no interstitial right after. */
  lastBigMomentAt = -Infinity;
  /** Seconds since the last big moment. */
  sinceBigMoment(): number {
    return (performance.now() - this.lastBigMomentAt) / 1000;
  }
  private lastToastAt = 0;
  /** Recent share of time the basket was full (same smoothing as the balance bots): the advisor values CAPACITY by it. */
  private fullRecent = 0;
  /** The upgrade the shop quietly points at (one shimmer), and since when (ms). */
  private rec: CoreUpgrade | null = null;
  private recSince = 0;
  private recTick = 0;
  /** The farm-finished celebration plays until then (performance.now ms): the throttle rests, the map waits. */
  celebrateUntil = -Infinity;
  get celebrating(): boolean {
    return performance.now() < this.celebrateUntil;
  }

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
    this.unloadCounter = new UnloadCounter(this.fxLayer);
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
      if (chk.reason === 'maxSegments') this.nag(sim.state.progress.zone >= 3 ? 'up.reason.mergeRoom' : 'up.reason.maxSegments');
      else if (chk.reason === 'notCleared') this.nag('up.reason.notCleared');
      else if (chk.reason === 'noPair') this.nag('up.reason.noPair');
      else if (chk.reason === 'maxLevel') this.nag('up.max');
      else this.nag('up.reason.coins');
      return;
    }
    sim.execute({ c: 'buy', id });
    this.hud.popUpgrade(id, this.d.settings.reduceMotion);
  }

  /**
   * Tornado: use one when you have it; otherwise a quick choice — pay coins (each one on a farm costs more) or watch
   * an ad (on its own cooldown). A failed or skipped ad gives nothing and costs nothing.
   */
  async tornado(): Promise<void> {
    const sim = this.d.sim;
    this.lastActionAt = performance.now();
    if (sim.state.tornadoes > 0) {
      sim.execute({ c: 'useTornado' });
      return;
    }
    const adOk = () => this.d.ads.canOffer('free_tornado');
    openBonusChoice(this.modals, {
      kind: 'tornado',
      price: sim.tornadoPrice,
      coins: () => sim.state.coins,
      adAvailable: adOk,
      notEnough: (el) => this.notEnough(el),
      buy: () => {
        sim.execute({ c: 'buyTornado' });
        if (sim.state.tornadoes > 0) sim.execute({ c: 'useTornado' });
      },
      watchAd: async () => {
        if (!adOk()) return this.nag(this.d.ads.rewardedAvailable ? 'ad.later' : 'ad.notReady');
        if (await this.rewarded('free_tornado')) {
          sim.execute({ c: 'grantTornado', n: 1 });
          sim.execute({ c: 'useTornado' });
        }
      },
    });
  }

  /**
   * Boosts: a free charge starts at once (one tap); otherwise a quick choice. Autopilot can be paid with coins or an
   * ad; ×2 coins only with an ad (buying income with income would be a chore) — or the free charge every farm gives.
   */
  async boost(id: BoostId): Promise<void> {
    const sim = this.d.sim;
    this.lastActionAt = performance.now();
    // Only offer more when it can add its full value.
    if (!sim.boostRoom(id)) {
      this.hud.shake(id);
      this.nag('boost.max');
      return;
    }
    if (sim.state.charges[id] > 0) {
      sim.execute({ c: 'useCharge', id });
      this.hud.popBonus(id);
      return;
    }
    const placement = id === 'incomeX2' ? 'income_x2' : 'autopilot';
    if (id === 'incomeX2' && !this.d.ads.rewardedAvailable) {
      this.hud.shake(id);
      this.nag('bonus.noAdX2');
      return;
    }
    openBonusChoice(this.modals, {
      kind: id,
      price: id === 'autopilot' ? sim.autopilotPrice : null,
      coins: () => sim.state.coins,
      adAvailable: () => this.d.ads.rewardedAvailable,
      notEnough: (el) => this.notEnough(el),
      buy: () => sim.execute({ c: 'buyBoost', id: 'autopilot' }),
      watchAd: async () => {
        if (await this.rewarded(placement)) sim.execute({ c: 'boost', id, seconds: MISC.BOOST_ADD_S });
      },
    });
  }

  private notEnough(el: HTMLElement): void {
    el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 });
    this.nag('bonus.notEnough');
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
      notify: (m) => this.toasts.show(m),
    });
  }

  /** Cloud wipe that hides the farm swap, then a welcome banner. */
  travelTo(id: FarmId, run: () => void): void {
    const wipe = h('div', { class: 'travel-wipe', 'data-ui': true }, h('div', { class: 'card outline' }, icon('map', 'ico wipe-ico'), titleForKey(id, this.d.sim.state.journey.seed)));
    this.ui.append(wipe);
    const reveal = async () => {
      run();
      // Compile the new farm's shaders behind the curtain (bounded), so the reveal doesn't hitch.
      await Promise.race([this.d.renderer.warmupAsync().catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
      setTimeout(() => {
        wipe.classList.add('out');
        setTimeout(() => wipe.remove(), 600);
        this.toasts.banner(t('banner.newFarm', { farm: titleOf(this.d.sim.farm) }), t('hud.cleared', { n: Math.floor(this.d.sim.cleared * 100) }));
      }, 380);
    };
    if (this.d.settings.reduceMotion) void reveal();
    else setTimeout(() => void reveal(), 450);
  }

  // Filled in by later modules (map / daily / collection modals).
  openMap: () => void = () => {};
  openDaily: () => void = () => {};
  openCollection: () => void = () => {};

  // ——— Simulation events ———

  onEvent(e: SimEvent): void {
    const { renderer, sim } = this.d;
    if (e.t === 'routeGrew' || e.t === 'merged' || e.t === 'zoneOpened' || e.t === 'finalHarvest' || e.t === 'farmFinished') this.lastBigMomentAt = performance.now();
    switch (e.t) {
      case 'chunk': {
        const a = this.agg.get(e.body);
        if (a) {
          a.value += e.value;
          a.golden ||= e.golden;
          a.tier = Math.max(a.tier, e.tier);
        } else this.agg.set(e.body, { value: e.value, golden: e.golden, tier: e.tier, t: performance.now() });
        break;
      }
      case 'unloadSeg': {
        // Rolling payout: the counter above the hopper climbs with every segment; coins fly to the total for about
        // eight of them (a long wave would otherwise spawn ~100 animated DOM coins in a second) and for the last.
        // The size of the payout (relative to recent income) sets the show: a routine load sends a few coins, a
        // good one more, a big one a gold cascade and a stronger tick.
        this.unloadCounter.add(e.value, this.d.settings.reduceMotion);
        const h = renderer.depot.hopperTop;
        const tier = this.payTier;
        const every = Math.max(1, Math.ceil(this.unloadSegs / (tier === 0 ? 3 : 8)));
        if ((e.last || e.seg % every === 0) && renderer.project(h.x, h.y + 0.6, h.z, tmpP)) {
          const target = this.hud.center(this.hud.coinPill);
          const last = e.last;
          const n = last ? [3, 5, 9][tier] : tier === 0 ? 1 : 2;
          coinFly(this.fxLayer, { x: tmpP.x, y: tmpP.y }, target, n, () => this.hud.bumpCoins(last, last ? tier : 0), this.d.settings.reduceMotion, (i) => this.onCoinLand(this.unloadCoin++ + i));
        }
        break;
      }
      case 'unloadStart':
        this.unloadCoin = 0;
        this.unloadSegs = e.segs;
        this.payTier = payoutTier(e.value, sim.state, sim.valueMult);
        this.unloadCounter.start(this.payTier);
        break;
      case 'unload': {
        this.unloadCounter.end(performance.now() / 1000);
        this.hud.bumpBasket();
        this.d.ads.noteUnload();
        this.pendingUnloadBreak = true;
        break;
      }
      case 'segAdded':
        renderer.cat.pulse(e.id, performance.now() / 1000);
        break;
      case 'zoneOpened': {
        renderer.rig.addShake(0.25);
        renderer.onZoneOpened();
        const crop = sim.farm.crops[Math.min(3, e.zone)];
        this.toasts.banner(t('banner.zone'), t('banner.newCrop', { crop: t(`crop.${crop}` as I18nKey) }));
        break;
      }
      case 'tornadoGranted':
        this.toasts.show(t('toast.tornadoDrop'));
        break;
      case 'freebie':
        this.showFreebie(e);
        break;
      case 'finalHarvest':
        this.toasts.banner(t('banner.final'), t('banner.finalSub'));
        break;
      default:
        break;
    }
    for (const l of this.listeners) l(e);
  }

  /**
   * Something for free: the reason is spelled out and the gift flies from where it was earned (the farm progress, a
   * new field) to the button it now sits on, which bounces with a FREE tag.
   */
  private showFreebie(e: Extract<SimEvent, { t: 'freebie' }>): void {
    const { renderer } = this.d;
    const rm = this.d.settings.reduceMotion;
    if (e.kind === 'coins') {
      // A new field's bonus: coins burst from the head into the counter.
      const h = renderer.cat.poses[0];
      if (!renderer.project(h.x, 1.6, h.z, tmpP)) return;
      this.floaters.spawn(tmpP.x, tmpP.y - 30, `+${fmt(e.amount ?? 0)}`, 'big', 1.3);
      coinFly(this.fxLayer, { x: tmpP.x, y: tmpP.y }, this.hud.center(this.hud.coinPill), 8, () => this.hud.bumpCoins(true), rm, (i) => this.onCoinLand(i));
      return;
    }
    // The farm-complete dialog presents its own gift.
    if (e.reason === 'farmComplete') return;
    const kind = e.kind;
    const show = () => {
      const msg = e.reason === 'newFarm' ? t('bonus.newFarm') : t(`bonus.got.${kind}` as I18nKey);
      this.toasts.show(e.reason === 'progress' ? `${t('bonus.milestone', { n: Math.round((e.at ?? 0) * 100) })}  ${msg}` : msg, 3200);
      const target = this.hud.bonusTarget(kind);
      const from = e.reason === 'progress' ? this.hud.center(this.hud.progressEl) : { x: innerWidth / 2, y: innerHeight * 0.45 };
      iconFly(this.fxLayer, from, this.hud.center(target), ICONS[kind === 'incomeX2' ? 'x2' : kind === 'autopilot' ? 'autopilot' : 'tornado'], () => this.hud.popBonus(kind), rm);
    };
    // On a new farm the gift waits for the travel curtain to lift.
    if (e.reason === 'newFarm') setTimeout(show, 2200);
    else show();
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
    const hop = renderer.depot.hopperTop;
    this.unloadCounter.frame(now / 1000, dt, renderer.project(hop.x, hop.y + 2.3, hop.z, tmpP) ? tmpP : null);
    this.hud.tickCoins(sim.state.coins, dt);
    if (!this.modals.open) {
      const full = sim.state.basket.mass >= capacityOf(sim.state) - 0.5;
      this.fullRecent += ((full ? 1 : 0) - this.fullRecent) * (1 - Math.exp(-dt / 13));
    }
    this.hudAcc += dt;
    if (this.hudAcc >= 0.1) {
      this.hudAcc = 0;
      // Twice a second: which affordable upgrade is the best deal right now. Never while a hint is coaching, and a
      // pick stays at least 2.5 s unless it stops being affordable (no flicker between near-equal deals).
      if (this.recTick++ % 5 === 0) {
        const values = upgradeValues(sim, this.fullRecent);
        const next = this.toasts.hinting ? null : recommend(values, this.rec);
        const curOk = values.some((v) => v.id === this.rec && v.ok);
        if (next !== this.rec && (!curOk || now - this.recSince > 2500 || this.toasts.hinting)) {
          this.rec = next;
          this.recSince = now;
        }
      }
      const vm = buildHud(sim);
      const ads = this.d.ads;
      const free = this.offers.update(vm, now / 1000, ads.canOffer('free_upgrade'));
      this.hud.adsAvailable = ads.rewardedAvailable;
      this.hud.tornadoAd = ads.canOffer('free_tornado');
      this.hud.update(vm, free, this.d.isDailyAvailable(), this.rec);
      this.hud.holdHint.classList.toggle('hide', input.totalHeld > 2.5 || sim.state.boosts.autopilot > 0 || this.toasts.hinting);
      // A hint pointing into the upgrade bar sits where the goal button is: the goal steps aside meanwhile.
      this.hud.el.classList.toggle('coaching-bar', !!this.toasts.hintTarget?.closest('.upgrades'));
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
          sinceBigMoment: this.sinceBigMoment(),
        });
      }, 1100);
    }
  }

  tutorialActive: () => boolean = () => false;
  /** Each payout coin reaching the counter (audio tick, set by the app). */
  onCoinLand: (i: number) => void = () => {};
}
