import type { AdService, BreakKind, Placement } from '../AdService.ts';
import type { PortalHooks } from '../../portal.ts';
import type { KeyValueStore } from '../../storage/Storage.ts';

interface CgSdk {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  ad: {
    requestAd(type: 'rewarded' | 'midgame', cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void }): void;
    hasAdblock(): Promise<boolean>;
  };
  game: { gameplayStart(): void; gameplayStop(): void; loadingStart(): void; loadingStop(): void; happytime(): void };
  data: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
}

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const sdk = (): CgSdk | undefined => (window as unknown as { CrazyGames?: { SDK: CgSdk } }).CrazyGames?.SDK;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.append(s);
  });
}

class CgStore implements KeyValueStore {
  readonly name = 'crazygames';
  async get(k: string): Promise<string | null> {
    return sdk()?.data.getItem(k) ?? null;
  }
  async set(k: string, v: string): Promise<void> {
    sdk()?.data.setItem(k, v);
  }
  async remove(k: string): Promise<void> {
    sdk()?.data.removeItem(k);
  }
}

/** CrazyGames SDK v3: rewarded + midgame ads, gameplay/loading events, cloud data. */
export class CrazyGamesAds implements AdService, PortalHooks {
  readonly name = 'crazygames';
  readonly privacyOptionsAvailable = false;
  private ready = false;
  private adblock = false;
  private inited: Promise<void> | null = null;

  /** The SDK must be initialised before the save is read (cloud data), so boot awaits this early. */
  async init(): Promise<void> {
    this.inited ??= (async () => {
      try {
        if (!sdk()) await loadScript(SDK_URL);
        await sdk()!.init();
        sdk()!.game.loadingStart();
        this.ready = sdk()!.environment !== 'disabled';
        this.adblock = await sdk()!.ad.hasAdblock().catch(() => false);
      } catch (e) {
        console.warn('CrazyGames SDK unavailable', e);
        this.ready = false;
      }
    })();
    return this.inited;
  }

  isRewardedReady(): boolean {
    return this.ready && !this.adblock;
  }

  private request(type: 'rewarded' | 'midgame'): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.ready) return resolve(false);
      sdk()!.ad.requestAd(type, {
        adFinished: () => resolve(true),
        adError: () => resolve(false),
      });
    });
  }

  showRewarded(_p: Placement): Promise<boolean> {
    return this.request('rewarded');
  }

  async showInterstitial(_k: BreakKind): Promise<void> {
    await this.request('midgame');
  }

  firstFrame(): void {}
  gameReady(): void {
    if (this.ready) sdk()?.game.loadingStop();
  }
  gameplay(active: boolean): void {
    if (!this.ready) return;
    if (active) sdk()?.game.gameplayStart();
    else sdk()?.game.gameplayStop();
  }
  happy(): void {
    if (this.ready) sdk()?.game.happytime();
  }
  store(): KeyValueStore | undefined {
    return this.ready ? new CgStore() : undefined;
  }
}
