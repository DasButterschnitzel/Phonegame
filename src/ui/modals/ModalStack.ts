import { button, h } from '../dom.ts';
import { icon } from '../icons.ts';

export interface ModalHandle {
  el: HTMLElement;
  close: () => void;
  onClose?: () => void;
}

/** Stack of modal dialogs. Back button pops the top one. Notifies when the stack empties (resume sim). */
export class ModalStack {
  private stack: ModalHandle[] = [];
  private root: HTMLElement;
  private listeners: ((open: boolean) => void)[] = [];
  private closedListeners: ((name: string) => void)[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
  }

  get open(): boolean {
    return this.stack.length > 0;
  }

  onChange(fn: (open: boolean) => void): void {
    this.listeners.push(fn);
  }

  /** Fires with the modal's name after it closes (used for interstitial break points). */
  onClosed(fn: (name: string) => void): void {
    this.closedListeners.push(fn);
  }

  push(name: string, content: (close: () => void) => (HTMLElement | null)[], opts: { closable?: boolean; onClose?: () => void } = {}): ModalHandle {
    const closable = opts.closable ?? true;
    const modal = h('div', { class: `modal modal-${name}`, 'data-ui': true, role: 'dialog', 'aria-modal': 'true' });
    const layer = h('div', { class: 'modal-layer', 'data-ui': true }, modal);
    const handle: ModalHandle = {
      el: modal,
      close: () => {
        const i = this.stack.indexOf(handle);
        if (i < 0) return;
        this.stack.splice(i, 1);
        layer.remove();
        handle.onClose?.();
        for (const l of this.closedListeners) l(name);
        if (this.stack.length === 0) for (const l of this.listeners) l(false);
      },
      onClose: opts.onClose,
    };
    if (closable) modal.append(button('close-x', () => handle.close(), icon('close')));
    for (const c of content(handle.close)) if (c) modal.append(c);
    layer.addEventListener('pointerdown', (e) => {
      if (e.target === layer && closable) handle.close();
    });
    this.root.append(layer);
    this.stack.push(handle);
    if (this.stack.length === 1) for (const l of this.listeners) l(true);
    return handle;
  }

  /** Back button: close the top modal. Returns false if nothing was open. */
  back(): boolean {
    const top = this.stack[this.stack.length - 1];
    if (!top) return false;
    top.close();
    return true;
  }

  has(name: string): boolean {
    return this.stack.some((m) => m.el.classList.contains(`modal-${name}`));
  }
}
