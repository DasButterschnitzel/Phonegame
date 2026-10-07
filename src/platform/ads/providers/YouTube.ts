import type { AdService, BreakKind, Placement } from '../AdService.ts';
import type { PortalHooks } from '../../portal.ts';
import type { KeyValueStore } from '../../storage/Storage.ts';

interface YtGame {
  IN_PLAYABLES_ENV?: boolean;
  game: { firstFrameReady(): void; gameReady(): void; loadData(): Promise<string>; saveData(d: string): Promise<void> };
  system: {
    isAudioEnabled(): boolean;
    onAudioEnabledChange(cb: (on: boolean) => void): () => void;
    onPause(cb: () => void): () => void;
    onResume(cb: () => void): () => void;
    getLanguage(): Promise<string>;
  };
  ads: { requestInterstitialAd(): Promise<void>; requestRewardedAd(id: string): Promise<boolean> };
  engagement?: { sendScore(s: { value: number }): Promise<void> };
}

const yt = (): YtGame | undefined => (window as unknown as { ytgame?: YtGame }).ytgame;

/** All save keys live in one Playables cloud blob (must stay < 3 MiB). */
class YtStore implements KeyValueStore {
  readonly name = 'youtube';
  private data: Record<string, string> | null = null;
  private async all(): Promise<Record<string, string>> {
    if (this.data) return this.data;
    try {
      const raw = await yt()!.game.loadData();
      this.data = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      this.data = {};
    }
    return this.data;
  }
  async get(key: string): Promise<string | null> {
    return (await this.all())[key] ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    const d = await this.all();
    d[key] = value;
    // Keep only the main save + backup to stay well under the size limit.
    for (const k of Object.keys(d)) if (k.includes('.corrupt.')) delete d[k];
    await yt()!.game.saveData(JSON.stringify(d));
  }
  async remove(key: string): Promise<void> {
    const d = await this.all();
    delete d[key];
    await yt()!.game.saveData(JSON.stringify(d));
  }
}

/** YouTube Playables: SDK ads (availability is gated by YouTube) + mandatory lifecycle hooks. */
export class YouTubeAds implements AdService, PortalHooks {
  readonly name = 'youtube';
  readonly privacyOptionsAvailable = false;
  private available = true;

  async init(): Promise<void> {
    if (!yt()) this.available = false;
  }

  isRewardedReady(): boolean {
    return this.available && !!yt();
  }

  async showRewarded(p: Placement): Promise<boolean> {
    try {
      return Boolean(await yt()!.ads.requestRewardedAd(p));
    } catch {
      // Ads are not enabled for this game (or unavailable) — hide ad offers for the session.
      this.available = false;
      return false;
    }
  }

  async showInterstitial(_k: BreakKind): Promise<void> {
    try {
      await yt()?.ads.requestInterstitialAd();
    } catch {
      /* no ad */
    }
  }

  firstFrame(): void {
    yt()?.game.firstFrameReady();
  }
  gameReady(): void {
    yt()?.game.gameReady();
  }
  gameplay(): void {}
  happy(): void {}
  store(): KeyValueStore {
    return new YtStore();
  }
  onPause(cb: (paused: boolean) => void): void {
    yt()?.system.onPause(() => cb(true));
    yt()?.system.onResume(() => cb(false));
  }
  onAudio(cb: (enabled: boolean) => void): void {
    const y = yt();
    if (!y) return;
    cb(y.system.isAudioEnabled());
    y.system.onAudioEnabledChange(cb);
  }
  async language(): Promise<string | null> {
    try {
      return (await yt()?.system.getLanguage()) ?? null;
    } catch {
      return null;
    }
  }
}
