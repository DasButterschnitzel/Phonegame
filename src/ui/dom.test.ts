import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showWhen } from './dom.ts';

/** Just what showWhen touches: whether the element is in the document, and its display. */
const fakeEl = () => ({ isConnected: false, style: { display: '' } }) as unknown as HTMLElement & { isConnected: boolean };

describe('showWhen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps an offer in sync while its dialog is open', async () => {
    const el = fakeEl();
    let ready = false;
    showWhen(el, () => ready);
    el.isConnected = true; // the dialog opens right after its content is built
    await Promise.resolve();
    expect(el.style.display).toBe('none');
    ready = true;
    vi.advanceTimersByTime(500);
    expect(el.style.display).toBe('');
  });

  it('stops polling (and lets the dialog go) when it is closed before the first poll', async () => {
    const el = fakeEl();
    const available = vi.fn(() => true);
    showWhen(el, available);
    el.isConnected = true;
    await Promise.resolve();
    el.isConnected = false; // a quick tap on "Next farm"
    vi.advanceTimersByTime(500);
    const calls = available.mock.calls.length;
    vi.advanceTimersByTime(60_000);
    expect(available.mock.calls.length).toBe(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives up on an element that never shows up', () => {
    const el = fakeEl();
    showWhen(el, () => true);
    vi.advanceTimersByTime(10_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
