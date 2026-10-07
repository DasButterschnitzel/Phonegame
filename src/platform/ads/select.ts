import type { AdService } from './AdService.ts';
import { NoAds } from './providers/None.ts';
import { DevStubAds } from './providers/DevStub.ts';
import { t } from '../i18n/i18n.ts';

export type ProviderName = 'none' | 'devstub' | 'admob' | 'crazygames' | 'youtube';

/** Picks the ad provider for this build/runtime. Network SDKs are loaded lazily, only in their own flavor. */
export async function createAdService(name: ProviderName): Promise<AdService> {
  const q = new URLSearchParams(location.search);
  const debugOverride = q.get('ads');
  if (debugOverride && (import.meta.env.VITE_DEBUG_HOOKS === 'true' || q.has('debug'))) return new DevStubAds(() => t('ad.simulated'), () => t('ad.skip'));
  switch (name) {
    case 'devstub':
      return new DevStubAds(() => t('ad.simulated'), () => t('ad.skip'));
    case 'admob': {
      const { AdMobAds } = await import('./providers/AdMob.ts');
      return new AdMobAds();
    }
    case 'crazygames': {
      const { CrazyGamesAds } = await import('./providers/CrazyGames.ts');
      return new CrazyGamesAds();
    }
    case 'youtube': {
      const { YouTubeAds } = await import('./providers/YouTube.ts');
      return new YouTubeAds();
    }
    default:
      return new NoAds();
  }
}
