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

/** The in-game HUD. Built once; `update` diffs text/classes so it is cheap to call at 10 Hz. */
export class Hud {
  readonly el: HTMLElement;
  readonly coinPill: HTMLElement;
  private coinText: HTMLElement;
  private rateText: HTMLElement;
  private farmName: HTMLElement;
  private dots: HTMLElement[];
  private basket: HTMLElement;
  private basketFill: HTMLElement;
  private basketText: HTMLElement;
  private fullBadge: HTMLElement;
  private ups = new Map<string, UpEls>();
  private goal: HTMLButtonElement;
  private goalTitle: HTMLElement;
  private goalCost: HTMLElement;
  private tornadoBtn: HTMLButtonElement;
  private tornadoCount: HTMLElement;
  private chips: Record<BoostId, { el: HTMLButtonElement; label: HTMLElement; timer: HTMLElement }>;
  private dailyDot: HTMLElement;
  readonly holdHint: HTMLElement;
  private shownCoins = 0;
  private freeOffer: UpgradeId | null = null;
  private lastVm: HudVM | null = null;
  adsAvailable = true;

  constructor(root: HTMLElement, actions: HudActions) {
    this.coinText = h('span', { class: 'outline' }, '0');
    this.coinPill = h('div', { class: 'pill coin-pill' }, icon('coin'), this.coinText);
    this.rateText = h('div', { class: 'rate outline' });
    this.farmName = h('div', { class: 'farm-name' });
    this.dots = [0, 1, 2, 3].map(() => h('i'));
    const top = h(
      'div',
      { class: 'hud-top' },
      h('div', { class: 'pill farm-pill' }, this.farmName, h('div', { class: 'stage-dots' }, ...this.dots)),
      h('div', { class: 'coin-box' }, this.coinPill, this.rateText),
    );

    this.dailyDot = h('div', { class: 'badge-dot' }, '!');
    const side = h(
      'div',
      { class: 'side-buttons' },
      button('round btn-map', () => actions.openMap(), icon('map')),
      button('round btn-daily', () => actions.openDaily(), icon('gift'), this.dailyDot),
      button('round btn-collection', () => actions.openCollection(), icon('collection')),
      button('round btn-settings', () => actions.openSettings(), icon('gear')),
    );

    this.basketFill = h('div', { class: 'basket-fill' });
    this.basketText = h('div', { class: 'basket-text outline' });
    this.fullBadge = h('div', { class: 'full-badge' });
    this.basket = h(
      'div',
      { class: 'basket' },
      icon('basket'),
      h('div', { class: 'basket-bar' }, h('div', { class: 'basket-track' }, this.basketFill, this.basketText)),
      this.fullBadge,
    );

    const mkChip = (id: BoostId, ico: IconName) => {
      const label = h('span');
      const timer = h('span', { class: 'timer' });
      label.className = 'label';
      const el = button(`chip chip-${id}`, () => actions.boost(id), icon(ico), label, timer, icon('ad', 'ico ad-ico'));
      return { el, label, timer };
    };
    this.chips = { incomeX2: mkChip('incomeX2', 'x2'), autopilot: mkChip('autopilot', 'autopilot') };
    this.tornadoCount = h('span', { class: 'count' }, '0');
    this.tornadoBtn = button('tornado-btn', () => actions.tornado(), icon('tornado'), h('span', { class: 'outline' }, t('tornado')), this.tornadoCount);
    const railL = h('div', { class: 'rail-left' }, this.chips.incomeX2.el, this.chips.autopilot.el);
    const railR = h('div', { class: 'rail-right' }, this.tornadoBtn);

    this.goalTitle = h('div', { class: 'title outline' });
    this.goalCost = h('span');
    this.goal = button('goal', () => {
      if (this.lastVm?.goal) actions.buy(this.lastVm.goal.id, false);
    }, this.goalTitle, h('div', { class: 'cost' }, icon('coin'), this.goalCost));

    const bar = h('div', { class: 'upgrades' });
    for (const u of UPS) {
      const title = h('div', { class: 'title outline' }, t(u.key));
      const costText = h('span');
      const cost = h('div', { class: 'cost' }, icon('coin'), costText);
      const free = h('div', { class: 'free-badge', style: 'display:none' }, icon('ad'), t('up.free'));
      const btn = button(`up up-${u.id}`, () => {
        const isFree = this.freeOffer === u.id && !this.lastVm?.upgrades[u.id].affordable;
        actions.buy(u.id, isFree);
      }, title, icon(u.icon), cost, free);
      const lvl = h('div', { class: 'up-lvl' });
      const wrap = h('div', { class: 'up-wrap' }, btn, lvl);
      bar.append(wrap);
      this.ups.set(u.id, { wrap, btn, title, cost, costText, lvl, free });
    }

    this.holdHint = h('div', { class: 'hold-hint outline' }, icon('finger'), h('span', {}, t('hud.holdToCrawl')));

    this.el = h('div', { class: 'hud' }, top, side, this.basket, railL, railR, this.goal, bar, this.holdHint);
    root.append(this.el);
  }

  /** Re-apply static labels after a language switch. */
  relabel(): void {
    for (const u of UPS) setText(this.ups.get(u.id)!.title, t(u.key));
    setText(this.holdHint.querySelector('span')!, t('hud.holdToCrawl'));
    setText(this.tornadoBtn.querySelector('.outline') as HTMLElement, t('tornado'));
    if (this.lastVm) this.update(this.lastVm, this.freeOffer, false);
  }

  setFreeOffer(id: UpgradeId | null): void {
    this.freeOffer = id;
  }

  setDailyAvailable(on: boolean): void {
    this.dailyDot.style.display = on ? '' : 'none';
  }

  /** Coin counter tweens towards the real value every frame. */
  tickCoins(target: number, dt: number): void {
    const diff = target - this.shownCoins;
    if (Math.abs(diff) < 0.5 || diff < 0) this.shownCoins = target;
    else this.shownCoins += diff * (1 - Math.exp(-dt / 0.18));
    setText(this.coinText, fmt(this.shownCoins));
  }

  bumpCoins(): void {
    this.coinPill.classList.remove('bump');
    void this.coinPill.offsetWidth;
    this.coinPill.classList.add('bump');
  }

  update(vm: HudVM, freeOffer: UpgradeId | null, dailyAvailable: boolean): void {
    this.lastVm = vm;
    this.freeOffer = freeOffer;
    setText(this.rateText, vm.rate > 0 ? t('hud.perSec', { n: fmt(vm.rate) }) : '');
    setText(this.farmName, t(`farm.${vm.farmId}` as I18nKey));
    this.dots.forEach((d, i) => toggleClass(d, 'on', i <= vm.stage));
    this.basketFill.style.height = `${Math.min(100, vm.fill * 100).toFixed(1)}%`;
    setText(this.basketText, `${Math.floor(vm.mass)}/${fmt(vm.cap)}`);
    toggleClass(this.basket, 'full', vm.full);
    setText(this.fullBadge, vm.overflow ? t('hud.overflow') : t('hud.full'));
    for (const u of UPS) this.updateUp(this.ups.get(u.id)!, vm.upgrades[u.id], freeOffer === u.id);
    if (vm.goal) {
      this.goal.classList.remove('hidden');
      setText(this.goalTitle, t(vm.goal.id === 'expand' ? 'up.expand' : 'up.finish'));
      setText(this.goalCost, fmt(vm.goal.cost));
      toggleClass(this.goal, 'ready', vm.goal.ok);
      toggleClass(this.goal, 'locked', !vm.goal.ok);
    } else this.goal.classList.add('hidden');
    setText(this.tornadoCount, String(vm.tornadoes));
    toggleClass(this.tornadoBtn, 'empty', vm.tornadoes === 0);
    for (const id of ['incomeX2', 'autopilot'] as BoostId[]) {
      const c = this.chips[id];
      const left = id === 'incomeX2' ? vm.incomeX2 : vm.autopilot;
      setText(c.label, t(id === 'incomeX2' ? 'boost.incomeX2' : 'boost.autopilot'));
      c.el.title = c.label.textContent ?? '';
      setText(c.timer, left > 0 ? formatDuration(left) : '+3:00');
      toggleClass(c.el, 'active', left > 0);
      c.el.style.display = this.adsAvailable || left > 0 ? '' : 'none';
    }
    this.setDailyAvailable(dailyAvailable);
  }

  private updateUp(e: UpEls, u: UpgradeVM, free: boolean): void {
    if (u.maxed) setText(e.costText, u.reason === 'noPair' && u.id === 'merge' ? '—' : t('up.max'));
    else setText(e.costText, fmt(u.cost));
    toggleClass(e.btn, 'maxed', u.maxed);
    toggleClass(e.btn, 'poor', !u.ok && !(free && !u.maxed));
    e.free.style.display = free && !u.affordable && !u.maxed ? '' : 'none';
    let lvl = t('up.lvl', { n: u.level });
    if (u.id === 'add') lvl = `${u.a}/${u.b}`;
    if (u.id === 'merge') lvl = u.a ? t('up.toLvl', { n: u.a }) : '—';
    if (u.id === 'speed' && u.maxed) lvl = t('up.max');
    setText(e.lvl, lvl);
  }

  /** Screen-space centre of an element (for coin fly targets). */
  center(el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
}
