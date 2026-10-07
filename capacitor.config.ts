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
      launchAutoHide: false,
      launchFadeOutDuration: 250,
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
