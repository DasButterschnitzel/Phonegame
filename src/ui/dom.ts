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

/** Button helper: pointerdown feedback + click handler; swallows game input. */
export function button(cls: string, onClick: (e: Event) => void, ...children: Child[]): HTMLButtonElement {
  const b = h('button', { class: `btn ${cls}`, 'data-ui': true, type: 'button' }, ...children);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(e);
  });
  return b;
}
