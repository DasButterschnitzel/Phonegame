type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; html?: string; style?: string };

/** Minimal hyperscript helper. `data-ui` marks elements that should swallow pointer input. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const textCache = new WeakMap<Node, string>();
/** Writes text only when it changed (avoids layout churn at 10 Hz). */
export function setText(el: HTMLElement, s: string): void {
  if (textCache.get(el) === s) return;
  textCache.set(el, s);
  el.textContent = s;
}

export function toggleClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/**
 * Shows `el` only while `available()` holds, re-checking twice a second for as long as it is in the DOM
 * (reward dialogs often open before the first ad has finished loading).
 */
export function showWhen(el: HTMLElement, available: () => boolean): void {
  const sync = () => {
    el.style.display = available() ? '' : 'none';
  };
  sync();
  // Callers attach the element right after this call (a dialog's content is built before the dialog opens), so check
  // once that is done: a dialog closed before the first poll must stop the polling too — it used to keep the timer,
  // and with it the whole closed dialog, alive for good. An element that never shows up stops after 5 s.
  let mounted = false;
  queueMicrotask(() => {
    mounted ||= el.isConnected;
  });
  let polls = 0;
  const id = setInterval(() => {
    polls++;
    if (el.isConnected) mounted = true;
    else if (mounted || polls >= 10) return clearInterval(id);
    sync();
  }, 500);
}

/**
 * Rolls a number up from 0 to `value` (ease-out) using `format`, for reward reveals.
 * Respects the in-game "reduce motion" setting (jumps straight to the value).
 */
export function countUp(el: HTMLElement, value: number, format: (n: number) => string, ms = 900): void {
  if (document.documentElement.classList.contains('reduce-motion') || value <= 0) {
    el.textContent = format(value);
    return;
  }
  const t0 = performance.now();
  const step = (t: number) => {
    const u = Math.min(1, (t - t0) / ms);
    el.textContent = format(value * (1 - (1 - u) ** 3));
    if (u < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = format(0);
  requestAnimationFrame(step);
}

/** Extra distance (px) a finger may drift off a control and still count as a tap on it. */
const TAP_SLOP = 14;

/**
 * Activates `el` on its own pointer: pointerdown on it, pointerup on (or near) it. Unlike `click` this works for a
 * second finger while another one holds the field — mobile browsers only synthesize clicks for single-finger taps.
 * Touch clicks are suppressed (so a dialog opening under the finger never gets a ghost click); keyboard and
 * assistive-technology clicks still activate. Each activation dispatches a bubbling `ui-tap` event (sound, haptics).
 */
export function onTap(el: HTMLElement, fn: (e: Event) => void): void {
  let id = -1;
  let lastPointerTap = -Infinity;
  const fire = (e: Event) => {
    el.dispatchEvent(new CustomEvent('ui-tap', { bubbles: true }));
    fn(e);
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || id !== -1) return;
    id = e.pointerId;
    el.classList.add('pressed');
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
  });
  const release = (e: PointerEvent, activate: boolean) => {
    if (e.pointerId !== id) return;
    id = -1;
    el.classList.remove('pressed');
    if (!activate) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left - TAP_SLOP || e.clientX > r.right + TAP_SLOP || e.clientY < r.top - TAP_SLOP || e.clientY > r.bottom + TAP_SLOP) return;
    lastPointerTap = performance.now();
    e.stopPropagation();
    fire(e);
  };
  el.addEventListener('pointerup', (e) => release(e, true));
  el.addEventListener('pointercancel', (e) => release(e, false));
  el.addEventListener('lostpointercapture', (e) => {
    if (e.pointerId === id) {
      id = -1;
      el.classList.remove('pressed');
    }
  });
  // No synthesized click for touches (they already activated on pointerup).
  el.addEventListener('touchend', (e) => e.cancelable && e.preventDefault(), { passive: false });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    // The click that trails a mouse/pen tap was already handled; keyboard (Enter/Space) clicks arrive alone.
    if (performance.now() - lastPointerTap < 700) return;
    fire(e);
  });
}

/** Button helper: press feedback + tap handler (works as a second finger too); swallows game input. */
export function button(cls: string, onClick: (e: Event) => void, ...children: Child[]): HTMLButtonElement {
  const b = h('button', { class: `btn ${cls}`, 'data-ui': true, type: 'button' }, ...children);
  onTap(b, onClick);
  return b;
}
