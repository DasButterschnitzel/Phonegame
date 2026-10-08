import { h, toggleClass } from './dom.ts';
import { icon } from './icons.ts';
import { t } from '../platform/i18n/i18n.ts';

const NS = 'http://www.w3.org/2000/svg';
/** 140° of a circle (centre 38,40, r 30) from lower left over the top to lower right, in a 76 × 36 box. */
const ARC = 'M 9.81 29.74 A 30 30 0 0 1 66.19 29.74';

export type HeatBand = 'cool' | 'warm' | 'hot' | 'max';
/** Heat bands: cool (cyan/green) → warm (yellow) → hot (orange, 60–80 %) → max (red, 80–100 %, "HOT!"). */
export const heatBand = (heat: number): HeatBand => (heat >= 0.8 ? 'max' : heat >= 0.6 ? 'hot' : heat >= 0.3 ? 'warm' : 'cool');

/**
 * OVERDRIVE at a glance, right above the crawler's head (never a permanent HUD bar): an arc that fills with motor
 * heat and changes colour as it climbs, a bolt that is bright while the boost is full and dims as heat takes it away,
 * and HOT! at the top of the scale. It pops in the moment the second finger lands (in the input event itself, not a
 * frame later) and fades away once the motor has cooled. Pushed all the way the motor burns out: the arc jolts, turns
 * smoky with BURNOUT! and drains as the lock runs out.
 */
export class HeatArc {
  /** Follows the head (translated every frame). */
  readonly el: HTMLElement;
  /** Pops in / shakes "too hot" (its own transform, so it never fights the translation). */
  private body: HTMLElement;
  private fill: SVGPathElement;
  private bolt: HTMLElement;
  private band: HeatBand | '' = '';
  private shown = false;
  private burnt = false;
  private last = { x: NaN, y: NaN, dash: -1, bolt: '' };

  constructor(root: HTMLElement) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 76 36');
    // A light rim under a dark track: the gauge reads on any ground (black volcanic soil as on snow).
    const rim = document.createElementNS(NS, 'path');
    rim.setAttribute('d', ARC);
    rim.setAttribute('class', 'rim');
    const track = document.createElementNS(NS, 'path');
    track.setAttribute('d', ARC);
    track.setAttribute('class', 'track');
    this.fill = document.createElementNS(NS, 'path');
    this.fill.setAttribute('d', ARC);
    this.fill.setAttribute('class', 'fill');
    this.fill.setAttribute('pathLength', '100');
    svg.append(rim, track, this.fill);
    this.bolt = icon('bolt', 'ico od-bolt');
    this.body = h('div', { class: 'od-body' }, svg, this.bolt, h('div', { class: 'od-hot outline' }, t('od.hot')), h('div', { class: 'od-burn outline' }, t('od.burnout')));
    this.el = h('div', { class: 'od-arc', 'aria-hidden': 'true' }, this.body);
    root.append(this.el);
  }

  get visible(): boolean {
    return this.shown;
  }

  /** The second finger landed: show at once with a pop — or a shake when the motor is too hot to push. */
  kick(denied = false): void {
    this.shown = true;
    this.el.classList.add('on');
    this.body.classList.remove('pop', 'deny', 'burn');
    void this.body.offsetWidth;
    this.body.classList.add(denied ? 'deny' : 'pop');
  }

  /** The motor just burnt out: a jolt (the arc then shows the lock draining). */
  burn(): void {
    this.body.classList.remove('pop', 'deny', 'burn');
    void this.body.offsetWidth;
    this.body.classList.add('burn');
  }

  /**
   * Per frame. `x`/`y`: the point above the head on screen (null when off screen); `share`: how much of the boost is
   * left (0..1); `burnout`: how much of a burnout lock is left (0..1, 0 when fine). Shown while OVERDRIVE is on, the
   * motor is still warm or it is burnt out.
   */
  update(x: number | null, y: number, heat: number, active: boolean, share: number, burnout = 0): void {
    const show = x !== null && (active || heat > 0.02 || burnout > 0);
    if (show !== this.shown) {
      this.shown = show;
      toggleClass(this.el, 'on', show);
    }
    if (!show || x === null) return;
    const L = this.last;
    const px = Math.round(x);
    const py = Math.round(y);
    if (px !== L.x || py !== L.y) {
      L.x = px;
      L.y = py;
      this.el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    }
    const burnt = burnout > 0;
    if (burnt !== this.burnt) {
      this.burnt = burnt;
      toggleClass(this.el, 'burnout', burnt);
    }
    const dash = Math.max(1, Math.round((burnt ? burnout : heat) * 100));
    if (dash !== L.dash) {
      L.dash = dash;
      this.fill.style.strokeDasharray = `${dash} 100`;
    }
    const band = heatBand(heat);
    if (band !== this.band) {
      if (this.band) this.el.classList.remove(this.band);
      this.el.classList.add(band);
      this.band = band;
    }
    toggleClass(this.el, 'cooling', !active);
    const bolt = active && !burnt ? (0.3 + 0.7 * share).toFixed(2) : '0';
    if (bolt !== L.bolt) {
      L.bolt = bolt;
      this.bolt.style.opacity = bolt;
    }
  }
}
