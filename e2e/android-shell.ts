import { readFileSync } from 'node:fs';

/**
 * A stand-in for the Android app shell, for running the *native* build in Chromium.
 *
 * It injects the same scripts Capacitor's Android bridge injects into the WebView — the real `native-bridge.js`,
 * `window.Capacitor` globals and plugin headers — and answers plugin calls from a fake `androidBridge`, like
 * the Java side would. Every native-only code path (Preferences storage, SplashScreen, App lifecycle, SystemBars,
 * Haptics, AdMob) therefore runs exactly as on a phone, minus the real OS. Plugins or methods missing here fail
 * the same way the real bridge fails: `"X.y()" is not implemented on android`.
 */

const BRIDGE = readFileSync(new URL('../node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js', import.meta.url), 'utf8');

type Rtype = 'promise' | 'callback';
const P: Rtype = 'promise';
const CB: Rtype = 'callback';
const withListeners = (methods: [string, Rtype][]) => [...methods, ['addListener', CB] as [string, Rtype], ['removeListener', P] as [string, Rtype], ['removeAllListeners', P] as [string, Rtype]];

/** Plugin headers as the Android side exports them (name + methods with return type). */
const HEADERS: Record<string, [string, Rtype][]> = {
  Preferences: withListeners([['configure', P], ['get', P], ['set', P], ['remove', P], ['clear', P], ['keys', P], ['migrate', P], ['removeOld', P]]),
  SplashScreen: withListeners([['show', P], ['hide', P]]),
  SystemBars: withListeners([['setStyle', P], ['show', P], ['hide', P], ['setAnimation', P]]),
  Haptics: withListeners([['impact', P], ['notification', P], ['vibrate', P], ['selectionStart', P], ['selectionChanged', P], ['selectionEnd', P]]),
  App: withListeners([['exitApp', P], ['getInfo', P], ['getLaunchUrl', P], ['getState', P], ['minimizeApp', P], ['toggleBackButtonHandler', P]]),
  AdMob: withListeners([
    ['initialize', P],
    ['requestConsentInfo', P],
    ['showConsentForm', P],
    ['showPrivacyOptionsForm', P],
    ['resetConsentInfo', P],
    ['prepareRewardVideoAd', P],
    ['showRewardVideoAd', P],
    ['prepareInterstitial', P],
    ['showInterstitial', P],
    ['setApplicationMuted', P],
    ['setApplicationVolume', P],
  ]),
  // The app's own plugin (android/app/src/main/java/.../AdConfigPlugin.java).
  AdConfig: withListeners([['get', P], ['consent', P]]),
};

export interface ShellOptions {
  /** Initial SharedPreferences contents (e.g. an existing save). */
  prefs?: Record<string, string>;
  /** Make every AdMob load fail (no fill / offline). */
  adsFail?: boolean;
  /** What app/admob.gradle baked into this build (default: a release build in TEST mode with Google's demo units). */
  adConfig?: Record<string, unknown>;
}

/** Runs in the page before any app script (Playwright addInitScript). */
function fakeAndroid(opts: ShellOptions): void {
  // SharedPreferences survive an app restart: persist across reloads of the same tab.
  const persisted = sessionStorage.getItem('__prefs');
  const store: Record<string, string> = persisted ? (JSON.parse(persisted) as Record<string, string>) : { ...(opts.prefs ?? {}) };
  const persist = () => sessionStorage.setItem('__prefs', JSON.stringify(store));
  const calls: string[] = [];
  /** Options of the last call per plugin method (e.g. which ad unit was prepared). */
  const args: Record<string, unknown> = {};
  const listeners: Record<string, string[]> = {};
  const w = window as unknown as Record<string, unknown> & { androidBridge: { postMessage(s: string): void; onmessage?: (e: { data: string }) => void } };
  const native = { store, calls, args, splashHidden: false, exited: false, fire: (_p: string, _e: string, _d?: unknown) => {} };
  w.__native = native;
  const send = (msg: Record<string, unknown>) =>
    setTimeout(() => w.androidBridge.onmessage?.({ data: JSON.stringify(msg) }), 4);
  const fire = (plugin: string, event: string, data: unknown = {}) => {
    for (const id of listeners[`${plugin}:${event}`] ?? []) send({ callbackId: id, pluginId: plugin, methodName: 'addListener', success: true, data, save: true });
  };
  native.fire = fire;
  const ok = {};
  const impl: Record<string, Record<string, (o: Record<string, unknown>) => unknown>> = {
    Preferences: {
      configure: () => ok,
      get: (o) => ({ value: Object.prototype.hasOwnProperty.call(store, String(o.key)) ? store[String(o.key)] : null }),
      set: (o) => ((store[String(o.key)] = String(o.value)), persist(), ok),
      remove: (o) => (delete store[String(o.key)], persist(), ok),
      clear: () => (Object.keys(store).forEach((k) => delete store[k]), persist(), ok),
      keys: () => ({ keys: Object.keys(store) }),
      migrate: () => ({ migrated: [], existing: [] }),
      removeOld: () => ok,
    },
    SplashScreen: { show: () => ok, hide: () => ((native.splashHidden = true), ok) },
    SystemBars: { setStyle: () => ok, show: () => ok, hide: () => ok, setAnimation: () => ok },
    Haptics: { impact: () => ok, notification: () => ok, vibrate: () => ok, selectionStart: () => ok, selectionChanged: () => ok, selectionEnd: () => ok },
    App: {
      exitApp: () => ((native.exited = true), ok),
      getInfo: () => ({ name: 'Crop Crawler', id: 'com.butterweichmedia.cropcrawler', build: '1', version: '0.1.0' }),
      getLaunchUrl: () => ok,
      getState: () => ({ isActive: true }),
      minimizeApp: () => ok,
      toggleBackButtonHandler: () => ok,
    },
    AdConfig: {
      get: () => ({
        debuggable: false,
        mode: 'test',
        appId: 'ca-app-pub-3940256099942544~3347511713',
        rewarded: 'ca-app-pub-3940256099942544/5224354917',
        rewardedBoost: '',
        rewardedUpgrade: '',
        rewardedBonus: '',
        interstitial: 'ca-app-pub-3940256099942544/1033173712',
        testDevices: '',
        umpDebugGeography: '',
        ...(opts.adConfig ?? {}),
      }),
      consent: () => ({ canRequestAds: true, privacyOptionsRequired: false }),
    },
    AdMob: {
      initialize: () => ok,
      requestConsentInfo: () => ({ status: 'NOT_REQUIRED', isConsentFormAvailable: false, canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' }),
      showConsentForm: () => ({ status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' }),
      showPrivacyOptionsForm: () => ok,
      resetConsentInfo: () => ok,
      prepareRewardVideoAd: (o) => {
        if (opts.adsFail) throw new Error('No fill');
        return { adUnitId: o.adId };
      },
      showRewardVideoAd: () => {
        fire('AdMob', 'onRewardedVideoAdShowed');
        setTimeout(() => {
          fire('AdMob', 'onRewardedVideoAdReward', { type: 'coins', amount: 1 });
          fire('AdMob', 'onRewardedVideoAdDismissed');
        }, 60);
        return { type: 'coins', amount: 1 };
      },
      prepareInterstitial: (o) => {
        if (opts.adsFail) throw new Error('No fill');
        return { adUnitId: o.adId };
      },
      showInterstitial: () => {
        setTimeout(() => fire('AdMob', 'interstitialAdDismissed'), 60);
        return ok;
      },
      setApplicationMuted: () => ok,
      setApplicationVolume: () => ok,
    },
  };
  w.androidBridge = {
    postMessage(json: string) {
      const m = JSON.parse(json) as { type?: string; callbackId: string; pluginId: string; methodName: string; options?: Record<string, unknown> };
      if (m.type === 'js.error' || !m.pluginId) return;
      calls.push(`${m.pluginId}.${m.methodName}`);
      args[`${m.pluginId}.${m.methodName}`] = m.options ?? {};
      const reply = (success: boolean, data: unknown, error?: { message: string }) =>
        send({ callbackId: m.callbackId, pluginId: m.pluginId, methodName: m.methodName, success, data, error });
      if (m.methodName === 'addListener') {
        const k = `${m.pluginId}:${String(m.options?.eventName)}`;
        (listeners[k] ??= []).push(m.callbackId);
        return;
      }
      if (m.methodName === 'removeListener' || m.methodName === 'removeAllListeners') return reply(true, {});
      const fn = impl[m.pluginId]?.[m.methodName];
      if (!fn) return reply(false, null, { message: `"${m.pluginId}.${m.methodName}()" is not implemented on android` });
      try {
        reply(true, fn(m.options ?? {}));
      } catch (e) {
        reply(false, null, { message: e instanceof Error ? e.message : String(e) });
      }
    },
  };
  // What Capacitor's JSExport.getGlobalJS() injects first.
  w.Capacitor = { DEBUG: false, isLoggingEnabled: false, Plugins: {} };
}

/** Init script: fake Java side → real native-bridge.js → plugin JS + headers (same order as Capacitor's JSInjector). */
export function androidShell(opts: ShellOptions = {}): string {
  const headers = Object.entries(HEADERS).map(([name, methods]) => ({
    name,
    methods: methods.map(([n, rtype]) => ({ name: n, rtype })),
  }));
  const pluginJs = Object.keys(HEADERS)
    .map((id) => `(function(w){var a=(w.Capacitor=w.Capacitor||{});var p=(a.Plugins=a.Plugins||{});p['${id}']={};})(window);`)
    .join('\n');
  return `(${fakeAndroid.toString()})(${JSON.stringify(opts)});\n${BRIDGE}\n${pluginJs}\nwindow.Capacitor.PluginHeaders = ${JSON.stringify(headers)};`;
}
