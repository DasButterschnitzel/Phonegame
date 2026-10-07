import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.butterweichmedia.cropcrawler',
  appName: 'Crop Crawler',
  webDir: 'dist/native',
  backgroundColor: '#7cc56b',
  android: {
    backgroundColor: '#7cc56b',
    minWebViewVersion: 100,
  },
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#7cc56b',
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      // Auto-hide: the web page shows its own animated loading screen right away. (A manual hide from
      // requestAnimationFrame deadlocks on Android 12+: the native splash blocks WebView drawing, so rAF never fires.)
      launchAutoHide: true,
      launchShowDuration: 300,
      launchFadeOutDuration: 200,
      backgroundColor: '#7cc56b',
      showSpinner: false,
    },
    SystemBars: {
      insetsHandling: 'css',
      hidden: true,
      style: 'DARK',
    },
  },
};

export default config;
