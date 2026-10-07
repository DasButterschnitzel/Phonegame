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
import { createAdService } from '../platform/ads/select.ts';
import { defaultSettings, type Settings } from '../platform/settings.ts';
import { setLang, t } from '../platform/i18n/i18n.ts';
import { LocalStore, PreferencesStore, type KeyValueStore } from '../platform/storage/Storage.ts';
import { SaveManager } from '../platform/storage/SaveManager.ts';
import { clock } from '../platform/clock.ts';
import { exitApp, installLifecycle } from '../platform/lifecycle.ts';
import { noPortal, type PortalHooks } from '../platform/portal.ts';
import { hideSystemBars } from '../platform/native.ts';
import { openOffline } from '../ui/modals/Offline.ts';
import { button, h } from '../ui/dom.ts';
import { openCollection, openNewLevel } from '../ui/modals/NewLevel.ts';
import { AudioEngine } from '../platform/audio/AudioEngine.ts';
import { Haptics } from '../platform/haptics.ts';
import { Tutorial } from './tutorial.ts';
import { juice, juiceFrame } from './juice.ts';
import { installMetaFlows } from './metaFlows.ts';

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
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    // Release the probe context right away (Android WebViews share a small live-context budget with ad SDKs).
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

const SAVE_EVENTS = new Set<SimEvent['t']>(['segAdded', 'merged', 'upgraded', 'stageChanged', 'farmFinished', 'traveled', 'coins', 'boost']);

export async function boot(): Promise<App | null> {
  const root = document.getElementById('app')!;
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  // Cheat hooks and URL overrides exist only in dev/e2e builds — never in a store or portal release.
  const debug = import.meta.env.VITE_DEBUG_HOOKS === 'true';

  const provider = await createAdService();
  const portal: PortalHooks = 'firstFrame' in provider ? (provider as unknown as PortalHooks) : noPortal;
  // CrazyGames' cloud data needs the SDK initialised before the save is read.
  if (provider.name === 'crazygames') await provider.init();
  const store: KeyValueStore = portal.store?.() ?? (Capacitor.isNativePlatform() ? new PreferencesStore() : new LocalStore());
  let buildSave: () => string = () => '';
  const saves = new SaveManager(store, () => buildSave());
  const loaded = debug && params.has('fresh') ? ({ ok: false, reason: 'empty' } as const) : await saves.load(clock.wall());

  const settings: Settings = { ...defaultSettings(), ...(loaded.ok ? (loaded.save.settings as Partial<Settings>) : {}) };
  const langParam = params.get('lang');
  if (langParam === 'en' || langParam === 'de') settings.lang = langParam;
  setLang(settings.lang, (await portal.language?.()) ?? undefined);
  if (!hasWebGL()) {
    root.append(h('div', { class: 'fatal' }, t('webgl.missing')));
    return null;
  }

  const meta: SaveMeta = loaded.ok ? loaded.save.meta : newMeta(clock.wall());
  meta.sessions++;
  const sim = new Sim(loaded.ok ? loaded.save.game : newGameState(Number(params.get('seed')) || (Date.now() & 0xffff)));
  if (loaded.ok) applyCrops(sim, loaded.save.crops);
  const qParam = debug ? params.get('quality') : null;
  const quality = qParam === 'low' || qParam === 'med' || qParam === 'high' ? qParam : settings.quality === 'auto' ? undefined : settings.quality;
  // Level badges are drawn into a canvas atlas: make sure the bundled font is ready first (bounded wait).
  await Promise.race([document.fonts?.load('700 64px Fredoka').catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
  const renderer = new GameRenderer(canvas, sim, quality);
  const pause = new PauseController();
  const input = new ThrottleInput(root);

  const ads = new AdManager(provider, newPolicyState(meta.adPlaytimeSec, meta.adInterstitialWall), {
    onAdStart: () => pause.add('ad'),
    onAdEnd: () => {
      pause.remove('ad');
      void hideSystemBars();
    },
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
    saveSettings: () => saves.saveNow(),
    resetProgress: async () => {
      await saves.wipe();
      location.reload();
    },
    isDailyAvailable: () => canClaimDaily(meta.daily, clock.dateKey()),
  });
  if (saves.readOnly) game.toasts.show(t('toast.readOnly'), 5000);

  // Sound, haptics, tutorial and juice.
  const audio = new AudioEngine();
  const haptics = new Haptics();
  const unlockAudio = () => audio.unlock();
  root.addEventListener('pointerdown', unlockAudio, { capture: true });
  window.addEventListener('keydown', unlockAudio);
  root.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('button')) {
      audio.tap();
      haptics.fire('selection');
    }
  });
  const applyAudio = (s: Settings) => {
    audio.setEnabled(s.sound, s.music);
    haptics.enabled = s.haptics;
  };
  game.settingsListeners.push(applyAudio);
  applyAudio(settings);
  const tutorial = new Tutorial(sim, game.toasts, meta.tutorial, () => saves.saveSoon(), (step) => game.hud.target(step));
  game.tutorialActive = () => tutorial.active;
  game.openCollection = () => openCollection(game.modals, sim.state.maxLevelReached);
  game.listeners.push((e) => {
    juice(e, sim, renderer, audio, haptics);
    tutorial.onEvent(e);
    if ((e.t === 'merged' && e.firstTime) || e.t === 'farmFinished') portal.happy();
    if (e.t === 'merged' && e.firstTime) {
      audio.levelUp();
      openNewLevel(game.modals, e.level);
    }
  });
  const metaFlows = installMetaFlows(sim, game, meta, saves);
  let tutAcc = 0;

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
    (alpha, dt, now, budgetMs) => {
      for (const e of sim.drainEvents()) onEvent(e);
      renderer.frame(alpha, dt, now, budgetMs);
      game.frame(dt);
      juiceFrame(sim, audio);
      metaFlows.frame();
      tutAcc += dt;
      if (tutAcc > 0.5) {
        tutAcc = 0;
        if (!game.modals.open) tutorial.update();
      }
    },
  );
  let portalMuted = false;
  portal.onAudio?.((on) => {
    portalMuted = !on;
    audio.setMuted(portalMuted || pause.has('ad') || pause.has('background') || pause.has('yt'));
  });
  portal.onPause?.((p) => (p ? pause.add('yt') : pause.remove('yt')));
  ads.isPaused = () => pause.has('background') || pause.has('yt');
  pause.onChange((paused, reasons) => {
    loop.simPaused = paused;
    // Under a modal the scene only needs a gentle idle animation: halve the frame rate to save battery.
    loop.maxFps = reasons.has('modal') ? 30 : 60;
    portal.gameplay(!paused);
    audio.setMuted(portalMuted || reasons.has('ad') || reasons.has('background') || reasons.has('yt'));
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
      adAvailable: () => ads.rewardedAvailable,
      collect: async (mult) => {
        if (mult > 1 && !(await game.rewarded('offline_x3'))) return false;
        sim.execute({ c: 'grantCoins', amount: r.coins * mult, reason: 'offline' });
        saves.saveSoon(200);
        return true;
      },
    });
  };

  let hiddenAt = 0;
  await installLifecycle(
    {
      onHide: () => {
        // An ad pausing the activity is not "time away" — no offline earnings for it.
        hiddenAt = ads.inAd ? 0 : clock.wall();
        input.reset();
        pause.add('background');
        void saves.saveNow();
        saves.suspended = true;
      },
      onShow: () => {
        saves.suspended = false;
        pause.remove('background');
        void hideSystemBars();
        const away = hiddenAt > 0 ? clock.wall() - hiddenAt : 0;
        hiddenAt = 0;
        // A long break is a fresh session: the interstitial warm-up applies again.
        if (away > 300) ads.newSession();
        if (!ads.inAd && away > 0) checkOffline(away);
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
    },
    { pageVisibility: provider.name !== 'youtube' },
  );

  // WebGL context loss (GPU process killed, driver reset): pause behind a notice; reload if it never comes back.
  let glTimer: ReturnType<typeof setTimeout> | null = null;
  let glNotice: HTMLElement | null = null;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    pause.add('gl');
    glNotice ??= h('div', { class: 'gl-lost', 'data-ui': true }, h('div', { class: 'spinner' }), t('restore.title'));
    root.append(glNotice);
    glTimer = setTimeout(async () => {
      await saves.saveNow();
      location.reload();
    }, 5000);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (glTimer) clearTimeout(glTimer);
    glTimer = null;
    renderer.onContextRestored();
    glNotice?.remove();
    pause.remove('gl');
  });

  loop.start();
  void hideSystemBars();
  requestAnimationFrame(() => {
    portal.firstFrame();
    // Compile every shader now (behind the loading screen) so first-time effects don't stutter.
    renderer.warmup();
    const splash = document.getElementById('boot-splash');
    splash?.classList.add('hide');
    setTimeout(() => splash?.remove(), 400);
    if (loaded.ok) checkOffline(clock.wall() - loaded.save.savedAtWall);
    setTimeout(() => metaFlows.maybeShowDaily(), 1200);
    portal.gameReady();
    portal.gameplay(true);
    document.documentElement.dataset.ready = '1';
  });
  if (provider.name !== 'crazygames') void ads.init();
  saves.startAutosave();

  const app: App = { sim, renderer, loop, pause, input, game, ads, saves, meta, settings, checkOffline };
  if (debug) {
    const { installDebug } = await import('./debug.ts');
    installDebug(app);
  }
  return app;
}
