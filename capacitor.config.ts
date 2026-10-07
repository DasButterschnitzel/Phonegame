import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.butterweichmedia.cropcrawler',
  appName: 'Crop Crawler',
  webDir: 'dist/native',
  backgroundColor: '#7cc56b',
  // Shown instead of the game when the device WebView is too old to run it.
  server: { errorPath: 'webview-update.html' },
  android: {
    backgroundColor: '#7cc56b',
    // Matches the bundle's syntax target (vite.config.ts: chrome87); WebGL 2 is checked at runtime.
    minWebViewVersion: 87,
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
