import type { AdService, BreakKind, Placement } from '../AdService.ts';

/**
 * Simulated ads for development, tests and the web demo: a full-screen countdown overlay.
 * Query params: ?ads=fail (never ready) | ?ads=noreward (closes without reward), ?adms=300 (duration).
 */
export class DevStubAds implements AdService {
  readonly name = 'devstub';
  readonly privacyOptionsAvailable = false;
  private mode: string;
  private ms: number;
  private label: () => string;
  private skipLabel: () => string;

  constructor(label: () => string, skipLabel: () => string) {
    const q = new URLSearchParams(location.search);
    this.mode = q.get('ads') ?? 'ok';
    this.ms = Number(q.get('adms')) || 2500;
    this.label = label;
    this.skipLabel = skipLabel;
  }

  async init(): Promise<void> {}

  isRewardedReady(): boolean {
    return this.mode !== 'fail';
  }

  showRewarded(p: Placement): Promise<boolean> {
    if (this.mode === 'fail') return Promise.resolve(false);
    return this.overlay(`rewarded:${p}`, true).then((completed) => completed && this.mode !== 'noreward');
  }

  async showInterstitial(kind: BreakKind): Promise<void> {
    if (this.mode === 'fail') return;
    await this.overlay(`interstitial:${kind}`, false);
  }

  private overlay(tag: string, closable: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'ad-overlay';
      el.dataset.ui = '';
      el.dataset.ad = tag;
      const title = document.createElement('div');
      title.textContent = this.label();
      const count = document.createElement('div');
      count.className = 'count';
      const close = document.createElement('button');
      close.className = 'btn-big grey';
      close.style.flex = '0 0 auto';
      close.textContent = this.skipLabel();
      el.append(title, count, close);
      document.getElementById('app')!.append(el);
      const t0 = performance.now();
      let done = false;
      const finish = (completed: boolean) => {
        if (done) return;
        done = true;
        clearInterval(iv);
        el.remove();
        resolve(completed);
      };
      const iv = setInterval(() => {
        const left = Math.max(0, this.ms - (performance.now() - t0));
        count.textContent = String(Math.ceil(left / 1000));
        if (left <= 0) finish(true);
      }, 50);
      count.textContent = String(Math.ceil(this.ms / 1000));
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        finish(!closable);
      });
    });
  }
}
