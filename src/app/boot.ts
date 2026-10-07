import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '../ui/styles/base.css';
import '../ui/styles/hud.css';
import '../ui/styles/modals.css';
import { Capacitor } from '@capacitor/core';
import { Sim, newGameState } from '../game/sim.ts';
import type { SimEvent } from '../game/types.ts';
import { offlineReward } from '../game/economy.ts';
import { applyCrops, serialize } from '../game/save/serialize.ts';
import { newMeta, type SaveMeta } from '../game/save/schema.ts';
import { canClaimDaily } from '../game/daily.ts';
import { GameRenderer } from '../render/Renderer.ts';
import { Loop } from './loop.ts';
import { PauseController } from './pause.ts';
import { ThrottleInput } from './input.ts';
import { GameController } from './game.ts';
import { AdManager } from '../platform/ads/AdManager.ts';
import { newPolicyState } from '../platform/ads/AdPolicy.ts';
import { createAdService, type ProviderName } from '../platform/ads/select.ts';
import { defaultSettings, type Settings } from '../platform/settings.ts';
import { setLang, t } from '../platform/i18n/i18n.ts';
import { LocalStore, PreferencesStore, type KeyValueStore } from '../platform/storage/Storage.ts';
import { SaveManager } from '../platform/storage/SaveManager.ts';
import { clock } from '../platform/clock.ts';
import { exitApp, installLifecycle } from '../platform/lifecycle.ts';
import { openOffline } from '../ui/modals/Offline.ts';
import { button, h } from '../ui/dom.ts';

export interface App {
  sim: Sim;
  renderer: GameRenderer;
  loop: Loop;
  pause: PauseController;
  input: ThrottleInput;
  game: GameController;
  ads: AdManager;
  saves: SaveManager;
  meta: SaveMeta;
  settings: Settings;
  checkOffline: (elapsed: number) => void;
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const SAVE_EVENTS = new Set<SimEvent['t']>(['segAdded', 'merged', 'upgraded', 'stageChanged', 'farmFinished', 'traveled', 'coins', 'boost']);

export async function boot(): Promise<App | null> {
  const root = document.getElementById('app')!;
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  const debug = import.meta.env.VITE_DEBUG_HOOKS === 'true' || params.has('debug');

  const store: KeyValueStore = Capacitor.isNativePlatform() ? new PreferencesStore() : new LocalStore();
  let buildSave: () => string = () => '';
  const saves = new SaveManager(store, () => buildSave());
  const loaded = params.has('fresh') ? ({ ok: false, reason: 'empty' } as const) : await saves.load(clock.wall());

  const settings: Settings = { ...defaultSettings(), ...(loaded.ok ? (loaded.save.settings as Partial<Settings>) : {}) };
  const langParam = params.get('lang');
  if (langParam === 'en' || langParam === 'de') settings.lang = langParam;
  setLang(settings.lang);
  if (!hasWebGL()) {
    root.append(h('div', { class: 'fatal' }, t('webgl.missing')));
    return null;
  }

  const meta: SaveMeta = loaded.ok ? loaded.save.meta : newMeta(clock.wall());
  meta.sessions++;
  const sim = new Sim(loaded.ok ? loaded.save.game : newGameState(Number(params.get('seed')) || (Date.now() & 0xffff)));
  if (loaded.ok) applyCrops(sim, loaded.save.crops);
  const quality = (params.get('quality') as 'low' | 'med' | 'high' | null) ?? (settings.quality === 'auto' ? undefined : settings.quality);
  const renderer = new GameRenderer(canvas, sim, quality);
  const pause = new PauseController();
  const input = new ThrottleInput(root);

  const provider = await createAdService(import.meta.env.VITE_AD_PROVIDER as ProviderName);
  const ads = new AdManager(provider, newPolicyState(meta.adPlaytimeSec, meta.adInterstitialWall), {
    onAdStart: () => pause.add('ad'),
    onAdEnd: () => pause.remove('ad'),
    now: clock.mono,
    wallNow: clock.wall,
  });

  buildSave = () => {
    meta.adPlaytimeSec = ads.policy.playtimeSec;
    meta.adInterstitialWall = ads.policy.interstitialWall;
    return JSON.stringify(serialize(sim, meta, settings as unknown as Record<string, unknown>, clock.wall()));
  };

  const game = new GameController({
    sim,
    renderer,
    pause,
    input,
    ads,
    settings,
    saveSettings: () => saves.saveSoon(300),
    resetProgress: async () => {
      await saves.wipe();
      location.reload();
    },
    isDailyAvailable: () => canClaimDaily(meta.daily, clock.dateKey()),
  });
  if (saves.readOnly) game.toasts.show(t('toast.readOnly'), 5000);

  const onEvent = (e: SimEvent) => {
    if (e.t === 'stageChanged') renderer.onStageChanged();
    if (e.t === 'traveled') renderer.onFarmChanged();
    game.onEvent(e);
    if (SAVE_EVENTS.has(e.t)) saves.saveSoon();
  };

  const loop = new Loop(
    (dt) => {
      const held = input.effective;
      if (held) {
        input.totalHeld += dt;
        input.lastHeldAt = performance.now();
      }
      sim.step(dt, { throttleHeld: held });
      ads.addPlaytime(dt);
      for (const e of sim.drainEvents()) onEvent(e);
    },
    (alpha, dt, now, frameMs) => {
      for (const e of sim.drainEvents()) onEvent(e);
      renderer.frame(alpha, dt, now, frameMs);
      game.frame(dt);
    },
  );
  pause.onChange((paused, reasons) => {
    loop.simPaused = paused;
    if (reasons.has('background')) loop.stop();
    else if (!loop.running) loop.start();
  });

  const resize = () => renderer.resize(root.clientWidth, root.clientHeight);
  new ResizeObserver(resize).observe(root);
  resize();

  /** Offer offline earnings for time spent away (never for the app's own ad activities). */
  const checkOffline = (elapsed: number) => {
    const r = offlineReward(sim.state, elapsed);
    if (r.coins <= 0 || game.modals.has('offline')) return;
    openOffline(game.modals, {
      ...r,
      adAvailable: ads.rewardedAvailable,
      collect: async (mult) => {
        if (mult > 1 && !(await game.rewarded('offline_x3'))) return false;
        sim.execute({ c: 'grantCoins', amount: r.coins * mult, reason: 'offline' });
        saves.saveSoon(200);
        return true;
      },
    });
  };

  let hiddenAt = 0;
  await installLifecycle({
    onHide: () => {
      hiddenAt = clock.wall();
      pause.add('background');
      void saves.saveNow();
    },
    onShow: () => {
      pause.remove('background');
      const away = clock.wall() - hiddenAt;
      if (!ads.inAd && hiddenAt > 0) checkOffline(away);
    },
    onBack: () => game.modals.back(),
    onExitRequest: () => {
      game.modals.push('quit', (close) => [
        h('h2', {}, t('quit.title')),
        h('p', {}, t('quit.body')),
        h(
          'div',
          { class: 'btn-row' },
          button('btn-big grey', () => close(), t('common.no')),
          button('btn-big danger', async () => {
            await saves.saveNow();
            await exitApp();
          }, t('common.yes')),
        ),
      ]);
    },
  });

  loop.start();
  requestAnimationFrame(() => {
    const splash = document.getElementById('boot-splash');
    splash?.classList.add('hide');
    setTimeout(() => splash?.remove(), 400);
    if (loaded.ok) checkOffline(clock.wall() - loaded.save.savedAtWall);
  });
  void ads.init();
  saves.startAutosave();

  const app: App = { sim, renderer, loop, pause, input, game, ads, saves, meta, settings, checkOffline };
  if (debug) {
    const { installDebug } = await import('./debug.ts');
    installDebug(app);
  }
  return app;
}
