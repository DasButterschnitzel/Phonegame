import type { AdService } from '../AdService.ts';

/** No ad network (plain web / desktop builds): ad-gated offers are hidden. */
export class NoAds implements AdService {
  readonly name: string = 'none';
  readonly privacyOptionsAvailable: boolean = false;
  async init(): Promise<void> {}
  isRewardedReady(): boolean {
    return false;
  }
  async showRewarded(): Promise<boolean> {
    return false;
  }
  async showInterstitial(): Promise<void> {}
}
