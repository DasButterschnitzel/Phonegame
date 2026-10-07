import type { AdService } from './AdService.ts';
import { NoAds } from './providers/None.ts';
import { DevStubAds } from './providers/DevStub.ts';
import { t } from '../i18n/i18n.ts';

export type ProviderName = 'none' | 'devstub' | 'admob' | 'crazygames' | 'youtube';

const devStub = () => new DevStubAds(() => t('ad.simulated'), () => t('ad.skip'));

/**
 * Picks the ad provider for this build flavor. The comparisons use the statically replaced
 * `import.meta.env.VITE_AD_PROVIDER`, so other networks' code is dead-code-eliminated from each bundle.
 */
export async function createAdService(): Promise<AdService> {
  const q = new URLSearchParams(location.search);
  if (q.get('ads') && import.meta.env.VITE_DEBUG_HOOKS === 'true') return devStub();
  if (import.meta.env.VITE_AD_PROVIDER === 'admob') {
    const { AdMobAds } = await import('./providers/AdMob.ts');
    return new AdMobAds();
  }
  if (import.meta.env.VITE_AD_PROVIDER === 'crazygames') {
    const { CrazyGamesAds } = await import('./providers/CrazyGames.ts');
    return new CrazyGamesAds();
  }
  if (import.meta.env.VITE_AD_PROVIDER === 'youtube') {
    const { YouTubeAds } = await import('./providers/YouTube.ts');
    return new YouTubeAds();
  }
  if (import.meta.env.VITE_AD_PROVIDER === 'devstub') return devStub();
  return new NoAds();
}
