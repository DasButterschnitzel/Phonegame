import type { BoostId, UpgradeId } from '../game/types.ts';
import type { HudVM, UpgradeVM } from './viewModel.ts';
import { button, h, setText, toggleClass } from './dom.ts';
import { icon, type IconName } from './icons.ts';
import { fmt, t, type I18nKey } from '../platform/i18n/i18n.ts';
import { formatDuration } from '../shared/format.ts';

export interface HudActions {
  buy(id: UpgradeId, free: boolean): void;
  tornado(): void;
  boost(id: BoostId): void;
  openMap(): void;
  openDaily(): void;
  openCollection(): void;
  openSettings(): void;
}

interface UpEls {
  wrap: HTMLElement;
  btn: HTMLButtonElement;
  title: HTMLElement;
  cost: HTMLElement;
  costText: HTMLElement;
  lvl: HTMLElement;
  free: HTMLElement;
}

const UPS: { id: 'add' | 'merge' | 'speed' | 'capacity'; icon: IconName; key: I18nKey }[] = [
  { id: 'add', icon: 'add', key: 'up.add' },
  { id: 'merge', icon: 'merge', key: 'up.merge' },
  { id: 'speed', icon: 'speed', key: 'up.speed' },
  { id: 'capacity', icon: 'capacity', key: 'up.capacity' },
];

const POP: Keyframe[] = [{ transform: 'scale(1)' }, { transform: 'scale(1.14)', offset: 0.4 }, { transform: 'scale(1)' }];
const POP_OPTS: KeyframeAnimationOptions = { duration: 300, easing: 'cubic-bezier(.3,1.6,.5,1)' };
const SHAKE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-7px) rotate(-2deg)' },
  { transform: 'translateX(6px) rotate(2deg)' },
  { transform: 'translateX(-4px)' },
  { transform: 'translateX(0)' },
];
const SPARK_COLORS = ['#ffd23f', '#ffffff', '#7ed957', '#ff8fa3', '#3fa7f5'];

/** Diffed style writes (avoid style recalcs at 10 Hz). */
const styleCache = new WeakMap<HTMLElement, Record<string, string>>();
function setStyle(el: HTMLElement, prop: 'display' | 'transform', v: string): void {
  let c = styleCache.get(el);
  if (!c) styleCache.set(el, (c = {}));
  if (c[prop] === v) return;
  c[prop] = v;
  el.style[prop] = v;
}

/** The in-game HUD. Built once; `update` diffs text/classes so it is cheap to call at 10 Hz. */
export class Hud {
  readonly el: HTMLElement;
  readonly coinPill: HTMLElement;
  private coinText: HTMLElement;
  private rateText: HTMLElement;
  private farmName: HTMLElement;
  private dots: HTMLElement[];
  private progFill: HTMLElement;
  private progText: HTMLElement;
  private basket: HTMLElement;
  private basketFill: HTMLElement;
  private basketText: HTMLElement;
  private fullBadge: HTMLElement;
  private ups = new Map<string, UpEls>();
  readonly goal: HTMLButtonElement;
  private goalFill: HTMLElement;
  private goalTitle: HTMLElement;
  private goalCostRow: HTMLElement;
  private goalCost: HTMLElement;
  readonly tornadoBtn: HTMLButtonElement;
  private tornadoCount: HTMLElement;
  private chips: Record<BoostId, { el: HTMLButtonElement; label: HTMLElement; timer: HTMLElement }>;
  private dailyDot: HTMLElement;
  readonly holdHint: HTMLElement;
  private holdText: HTMLElement;
  private shownCoins = 0;
  private coinAcc = 0;
  private freeOffer: UpgradeId | null = null;
  private lastVm: HudVM | null = null;
  adsAvailable = true;
  /** Whether an empty tornado button may offer a rewarded ad right now (policy cooldown). */
  tornadoAd = true;
  private coinCenter: { x: number; y: number } | null = null;

  constructor(root: HTMLElement, actions: HudActions) {
    this.coinText = h('span', { class: 'outline' }, '0');
    this.coinPill = h('div', { class: 'pill coin-pill' }, icon('coin'), this.coinText);
    this.rateText = h('div', { class: 'rate outline' });
    this.farmName = h('div', { class: 'farm-name' });
    this.dots = [0, 1, 2, 3].map(() => h('i'));
    this.progFill = h('div', { class: 'farm-prog-fill' });
    this.progText = h('span', { class: 'farm-prog-text' });
    const top = h(
      'div',
      { class: 'hud-top' },
      h(
        'div',
        { class: 'pill farm-pill' },
        h('div', { class: 'farm-row' }, this.farmName, h('div', { class: 'stage-dots' }, ...this.dots)),
        h('div', { class: 'farm-prog' }, h('div', { class: 'farm-prog-track' }, this.progFill), this.progText),
      ),
      h('div', { class: 'coin-box' }, this.coinPill, this.rateText),
    );

    this.dailyDot = h('div', { class: 'badge-dot' }, '!');
    const side = h(
      'div',
      { class: 'side-buttons' },
      button('g3d round btn-map', () => actions.openMap(), icon('map')),
      button('g3d round btn-daily', () => actions.openDaily(), icon('gift'), this.dailyDot),
      button('g3d round btn-collection', () => actions.openCollection(), icon('collection')),
      button('g3d round btn-settings', () => actions.openSettings(), icon('gear')),
    );

    this.basketFill = h('div', { class: 'basket-fill' });
    this.basketText = h('div', { class: 'basket-text' });
    this.fullBadge = h('div', { class: 'full-badge' });
    this.basket = h(
      'div',
      { class: 'basket' },
      icon('basket'),
      h('div', { class: 'basket-bar' }, h('div', { class: 'basket-track' }, this.basketFill)),
      this.basketText,
      this.fullBadge,
    );

    const mkChip = (id: BoostId, ico: IconName) => {
      const label = h('span', { class: 'label' });
      const timer = h('span', { class: 'timer' });
      const el = button(`g3d chip chip-${id}`, () => actions.boost(id), icon(ico), label, timer, icon('ad', 'ico ad-ico'));
      return { el, label, timer };
    };
    this.chips = { incomeX2: mkChip('incomeX2', 'x2'), autopilot: mkChip('autopilot', 'autopilot') };
    this.tornadoCount = h('span', { class: 'count' }, '0');
    this.tornadoBtn = button(
      'g3d tornado-btn',
      () => actions.tornado(),
      icon('tornado'),
      h('span', { class: 'outline' }, t('tornado')),
      this.tornadoCount,
      icon('ad', 'ico ad-ico'),
    );
    const railL = h('div', { class: 'rail-left' }, this.chips.incomeX2.el, this.chips.autopilot.el);
    const railR = h('div', { class: 'rail-right' }, this.tornadoBtn);

    this.goalTitle = h('div', { class: 'title outline' });
    this.goalCost = h('span');
    this.goalFill = h('div', { class: 'goal-fill' });
    this.goalCostRow = h('div', { class: 'cost' }, icon('coin'), this.goalCost);
    this.goal = button('g3d goal', () => {
      const g = this.lastVm?.goal;
      if (!g) return;
      if (g.id === 'travel') actions.openMap();
      else actions.buy(g.id, false);
    }, this.goalFill, this.goalTitle, this.goalCostRow);
    const goalWrap = h('div', { class: 'goal-wrap' }, this.goal);

    const bar = h('div', { class: 'upgrades' });
    for (const u of UPS) {
      const title = h('div', { class: 'title outline' }, t(u.key));
      const costText = h('span');
      const cost = h('div', { class: 'cost' }, h('i', { class: 'afford' }), icon('coin'), costText);
      // The FREE badge lives on the wrapper (not inside the clipped button) and lets taps fall through.
      const free = h('div', { class: 'free-badge', style: 'display:none' }, icon('ad'), t('up.free'));
      const btn = button(`g3d up up-${u.id}`, () => {
        const isFree = this.freeOffer === u.id && !this.lastVm?.upgrades[u.id].affordable;
        actions.buy(u.id, isFree);
      }, title, icon(u.icon), cost);
      const lvl = h('div', { class: 'up-lvl' });
      const wrap = h('div', { class: 'up-wrap' }, btn, lvl, free);
      bar.append(wrap);
      this.ups.set(u.id, { wrap, btn, title, cost, costText, lvl, free });
    }

    this.holdText = h('span', {}, t('hud.holdToCrawl'));
    this.holdHint = h('div', { class: 'hold-hint outline' }, icon('finger'), this.holdText);

    this.el = h('div', { class: 'hud' }, top, side, this.basket, railL, railR, goalWrap, bar, this.holdHint);
    root.append(this.el);
    window.addEventListener('resize', () => (this.coinCenter = null));
  }

  private toggleMode = false;

  /** "HOLD TO CRAWL" vs "TAP TO CRAWL" (accessibility toggle mode). */
  setToggleMode(on: boolean): void {
    this.toggleMode = on;
    setText(this.holdText, t(on ? 'hud.tapToCrawl' : 'hud.holdToCrawl'));
  }

  /** Re-apply static labels after a language switch. */
  relabel(): void {
    for (const u of UPS) setText(this.ups.get(u.id)!.title, t(u.key));
    this.setToggleMode(this.toggleMode);
    setText(this.tornadoBtn.querySelector('.outline') as HTMLElement, t('tornado'));
    for (const id of ['incomeX2', 'autopilot'] as BoostId[]) setText(this.chips[id].label, t(id === 'incomeX2' ? 'boost.incomeX2' : 'boost.autopilot'));
    for (const e of this.ups.values()) setText(e.free.lastChild as unknown as HTMLElement, t('up.free'));
    if (this.lastVm) this.update(this.lastVm, this.freeOffer, false);
  }

  /** Element a tutorial step points at. */
  target(step: string): HTMLElement | null {
    if (step === 'add' || step === 'merge') return this.ups.get(step)!.btn;
    if (step === 'capacity') return this.ups.get('capacity')!.btn;
    if (step === 'expand') return this.goal;
    if (step === 'tornado') return this.tornadoBtn;
    return null;
  }

  setDailyAvailable(on: boolean): void {
    setStyle(this.dailyDot, 'display', on ? '' : 'none');
  }

  /** Coin counter tweens towards the real value (text writes throttled to ~30 Hz). */
  tickCoins(target: number, dt: number): void {
    const diff = target - this.shownCoins;
    if (Math.abs(diff) < 0.5 || diff < 0) this.shownCoins = target;
    else this.shownCoins += diff * (1 - Math.exp(-dt / 0.18));
    this.coinAcc += dt;
    if (this.coinAcc < 0.033 && this.shownCoins !== target) return;
    this.coinAcc = 0;
    setText(this.coinText, fmt(this.shownCoins));
  }

  private elFor(id: string): HTMLElement | null {
    const e = this.ups.get(id);
    return e?.btn ?? (id === 'expand' || id === 'finish' ? this.goal : null);
  }

  /** Purchase feedback: button pops, its level pill flashes and a few sparkles fly. */
  popUpgrade(id: string, reduceMotion = false): void {
    const el = this.elFor(id);
    if (!el) return;
    el.animate(POP, POP_OPTS);
    const lvl = this.ups.get(id)?.lvl;
    lvl?.animate([{ transform: 'scale(1.35)', background: '#ffd23f', color: '#2b2d42' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
    if (reduceMotion) return;
    const r = el.getBoundingClientRect();
    const host = this.el.parentElement!;
    for (let i = 0; i < 10; i++) {
      const s = h('div', { class: 'spark' });
      s.style.background = SPARK_COLORS[i % SPARK_COLORS.length];
      s.style.left = `${r.left + r.width / 2}px`;
      s.style.top = `${r.top + r.height * 0.35}px`;
      host.append(s);
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      const d = 40 + Math.random() * 40;
      const anim = s.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d - 20}px)) scale(0.3) rotate(${180 + Math.random() * 180}deg)`, opacity: 0 },
        ],
        { duration: 450 + Math.random() * 200, easing: 'cubic-bezier(.2,.8,.3,1)' },
      );
      anim.onfinish = () => s.remove();
    }
  }

  /** "Can't do that yet" feedback: a quick head-shake and a red flash on the price. */
  shake(id: string): void {
    const el = id === 'tornado' ? this.tornadoBtn : id === 'incomeX2' || id === 'autopilot' ? this.chips[id].el : this.elFor(id);
    if (!el) return;
    el.animate(SHAKE, { duration: 260, easing: 'ease-out' });
    const cost = el.querySelector('.cost') as HTMLElement | null;
    cost?.animate([{ background: 'rgba(230,57,70,.95)', color: '#fff' }, {}], { duration: 500, easing: 'ease-out' });
  }

  /** Basket icon bounce when a load is sold. */
  bumpBasket(): void {
    this.basket.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12) rotate(-4deg)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
  }

  bumpCoins(): void {
    this.coinPill.animate(
      [
        { transform: 'scale(1)', filter: 'brightness(1)' },
        { transform: 'scale(1.18)', filter: 'brightness(1.25)', offset: 0.3 },
        { transform: 'scale(1)', filter: 'brightness(1)' },
      ],
      { duration: 280, easing: 'cubic-bezier(.3,1.6,.5,1)' },
    );
  }

  update(vm: HudVM, freeOffer: UpgradeId | null, dailyAvailable: boolean): void {
    this.lastVm = vm;
    this.freeOffer = freeOffer;
    setText(this.rateText, vm.rate > 0 ? t('hud.perSec', { n: fmt(vm.rate) }) : '');
    setText(this.farmName, t(`farm.${vm.farmId}` as I18nKey));
    this.dots.forEach((d, i) => toggleClass(d, 'on', i <= vm.zone));
    // Farm progress: how much of the farm has been cleared.
    setStyle(this.progFill, 'transform', `scaleX(${Math.min(1, vm.cleared).toFixed(3)})`);
    setText(this.progText, `${Math.floor(vm.cleared * 100)}%`);
    // transform (not height) so the fill animates on the compositor without layout.
    setStyle(this.basketFill, 'transform', `scaleY(${Math.min(1, vm.fill).toFixed(3)})`);
    setText(this.basketText, `${fmt(vm.mass)}/${fmt(vm.cap)}`);
    toggleClass(this.basket, 'full', vm.full);
    toggleClass(this.basket, 'warm', !vm.full && vm.fill > 0.7);
    setText(this.fullBadge, vm.overflow ? t('hud.overflow') : t('hud.full'));
    for (const u of UPS) this.updateUp(this.ups.get(u.id)!, vm.upgrades[u.id], freeOffer === u.id, vm.coins);
    const g = vm.goal;
    toggleClass(this.goal, 'hidden', !g);
    if (g) {
      const travel = g.id === 'travel';
      setText(this.goalTitle, travel ? t('up.travel', { farm: t(`farm.${g.farm}` as I18nKey) }) : t(g.id === 'expand' ? 'up.expand' : 'up.finish'));
      setStyle(this.goalCostRow, 'display', travel ? 'none' : '');
      // OPEN FIELD: a coin price that drops to FREE once the open area is mostly cleared. FINISH: clearing progress.
      const free = !travel && g.id === 'expand' && g.cost === 0;
      if (!travel) setText(this.goalCost, g.id === 'finish' ? `${Math.floor(g.progress * 90)}% / 90%` : free ? t('up.free') : fmt(g.cost));
      toggleClass(this.goalCostRow, 'progress-only', g.id === 'finish' || free);
      toggleClass(this.goal, 'travel', travel);
      toggleClass(this.goal, 'ready', g.ok && !travel);
      toggleClass(this.goal, 'shine', g.ok);
      const fill = travel ? 0 : g.id === 'finish' ? g.progress : Math.max(g.progress, Math.min(1, vm.coins / Math.max(1, g.cost)));
      setStyle(this.goalFill, 'transform', `scaleX(${fill.toFixed(3)})`);
    }
    setText(this.tornadoCount, vm.tornadoes > 0 ? String(vm.tornadoes) : this.adsAvailable && this.tornadoAd ? '+1' : '0');
    toggleClass(this.tornadoBtn, 'empty', vm.tornadoes === 0);
    toggleClass(this.tornadoBtn, 'offer', vm.tornadoes === 0 && this.adsAvailable && this.tornadoAd);
    for (const id of ['incomeX2', 'autopilot'] as BoostId[]) {
      const c = this.chips[id];
      const left = id === 'incomeX2' ? vm.incomeX2 : vm.autopilot;
      setText(c.label, t(id === 'incomeX2' ? 'boost.incomeX2' : 'boost.autopilot'));
      setText(c.timer, left > 0 ? formatDuration(left) : '+3:00');
      toggleClass(c.el, 'active', left > 0);
      setStyle(c.el, 'display', this.adsAvailable || left > 0 ? '' : 'none');
    }
    this.setDailyAvailable(dailyAvailable);
  }

  private updateUp(e: UpEls, u: UpgradeVM, free: boolean, coins: number): void {
    const noPair = u.id === 'merge' && u.reason === 'noPair';
    if (noPair) setText(e.costText, t('up.needPair'));
    else if (u.maxed) setText(e.costText, t('up.max'));
    else setText(e.costText, fmt(u.cost));
    toggleClass(e.btn, 'maxed', u.maxed);
    toggleClass(e.btn, 'locked', noPair);
    toggleClass(e.btn, 'poor', !u.ok && !u.maxed && !free);
    toggleClass(e.btn, 'shine', u.ok);
    toggleClass(e.btn, 'ok', u.ok);
    // Savings progress towards the price, drawn inside the cost pill.
    const afford = u.maxed || u.ok ? 1 : Math.min(1, coins / Math.max(1, u.cost));
    setStyle(e.cost.firstChild as HTMLElement, 'transform', `scaleX(${afford.toFixed(2)})`);
    setStyle(e.free, 'display', free && !u.affordable && !u.maxed ? '' : 'none');
    let lvl = t('up.lvl', { n: u.level });
    if (u.id === 'add') lvl = `${u.a}/${u.b}`;
    if (u.id === 'merge') lvl = u.a ? t('up.toLvl', { n: u.a }) : '—';
    if (u.id === 'speed' && u.maxed) lvl = t('up.max');
    setText(e.lvl, lvl);
  }

  /** Screen-space centre of an element (for coin fly targets); the coin pill's is cached until resize. */
  center(el: HTMLElement): { x: number; y: number } {
    if (el === this.coinPill && this.coinCenter) return this.coinCenter;
    const r = el.getBoundingClientRect();
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (el === this.coinPill) this.coinCenter = c;
    return c;
  }
}
