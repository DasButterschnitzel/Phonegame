import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '../ui/styles/base.css';
import '../ui/styles/hud.css';
import '../ui/styles/modals.css';
import { Capacitor } from '@capacitor/core';
import { Sim, newGameState } from '../game/sim.ts';
import type { SimEvent } from '../game/types.ts';
import { offlineReward } from '../game/economy.ts';
import { serialize } from '../game/save/serialize.ts';
import { newMeta, type SaveMeta } from '../game/save/schema.ts';
import { canClaimDaily } from '../game/daily.ts';
import { OVERDRIVE } from '../game/config.ts';
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
import { PerfOverlay } from '../ui/PerfOverlay.ts';

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

/** Last boot milestone, shown by the loading-screen watchdog in index.html if startup stalls. */
const step = (s: string) => ((window as unknown as { __bootStep?: string }).__bootStep = s);

const SAVE_EVENTS = new Set<SimEvent['t']>(['segAdded', 'merged', 'upgraded', 'zoneOpened', 'routeGrew', 'unload', 'farmFinished', 'traveled', 'coins', 'boost']);

export async function boot(): Promise<App | null> {
  const root = document.getElementById('app')!;
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  // Cheat hooks and URL overrides exist only in dev/e2e builds — never in a store or portal release.
  const debug = import.meta.env.VITE_DEBUG_HOOKS === 'true';

  step('ads');
  const provider = await createAdService();
  const portal: PortalHooks = 'firstFrame' in provider ? (provider as unknown as PortalHooks) : noPortal;
  // CrazyGames' cloud data needs the SDK initialised before the save is read.
  if (provider.name === 'crazygames') await provider.init();
  const store: KeyValueStore = portal.store?.() ?? (Capacitor.isNativePlatform() ? new PreferencesStore() : new LocalStore());
  let buildSave: () => string = () => '';
  const saves = new SaveManager(store, () => buildSave());
  step('save');
  const loaded = debug && params.has('fresh') ? ({ ok: false, reason: 'empty' } as const) : await saves.load(clock.wall());

  const settings: Settings = { ...defaultSettings(), ...(loaded.ok ? (loaded.save.settings as Partial<Settings>) : {}) };
  const langParam = params.get('lang');
  if (langParam === 'en' || langParam === 'de') settings.lang = langParam;
  setLang(settings.lang, (await portal.language?.()) ?? undefined);
  step('webgl');
  if (!hasWebGL()) {
    root.append(h('div', { class: 'fatal' }, t('webgl.missing')));
    return null;
  }

  const meta: SaveMeta = loaded.ok ? loaded.save.meta : newMeta(clock.wall());
  meta.sessions++;
  const sim = new Sim(loaded.ok ? loaded.save.game : newGameState(Number(params.get('seed')) || (Date.now() & 0xffff)));
  const qParam = debug ? params.get('quality') : null;
  const quality = qParam === 'low' || qParam === 'med' || qParam === 'high' ? qParam : settings.quality === 'auto' ? undefined : settings.quality;
  // Level badges are drawn into a canvas atlas: make sure the bundled font is ready first (bounded wait).
  step('fonts');
  await Promise.race([document.fonts?.load('700 64px Fredoka').catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
  step('renderer');
  const renderer = new GameRenderer(canvas, sim, quality);
  step('game');
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
  audio.setFlavour(sim.farm.biome);
  game.onArrive = (newBiome) => {
    audio.arrive(newBiome);
    haptics.fire(newBiome ? 'success' : 'light');
  };
  game.onTourDone = () => {
    audio.tourFanfare();
    haptics.fire('success');
  };
  const haptics = new Haptics();
  const unlockAudio = () => audio.unlock();
  root.addEventListener('pointerdown', unlockAudio, { capture: true });
  // Any touch counts as activity (power saver) and is answered on the very next frame: the head leans into a press
  // before the simulation's speed has had a step to change.
  let lastInputAt = performance.now();
  const odPt = { x: 0, y: 0 };
  let wasHeld = false;
  root.addEventListener('pointerdown', () => (lastInputAt = performance.now()), { capture: true });
  window.addEventListener('keydown', () => (lastInputAt = performance.now()));
  input.onChange((held) => {
    lastInputAt = performance.now();
    if (held !== wasHeld) renderer.cat.throttle(held);
    wasHeld = held;
  });
  window.addEventListener('keydown', unlockAudio);
  root.addEventListener('ui-tap', () => {
    audio.tap();
    haptics.fire('selection');
  });
  const applyAudio = (s: Settings) => {
    audio.setEnabled(s.sound, s.music);
    haptics.enabled = s.haptics;
  };
  game.settingsListeners.push(applyAudio);
  applyAudio(settings);
  const tutorial = new Tutorial(sim, game.toasts, meta.tutorial, () => saves.saveSoon(), (step) => game.hud.target(step));
  tutorial.touch = matchMedia('(pointer: coarse)').matches;
  game.tutorialActive = () => tutorial.active;
  // OVERDRIVE: the second finger lands → the head digs in, the servo winds up, a tick in the hand; the first few
  // times the word itself pops over the head. A motor that is too hot or burnt out ignores the finger until it lifts.
  let odLive = false;
  input.onOverdrive((on) => {
    lastInputAt = performance.now();
    // The heat arc answers in this very event (before any frame): a pop — or a red shake when the motor is too hot or
    // burnt out (the simulation ignores that finger until it lifts).
    const refused = sim.burnout > 0 || sim.state.heat > OVERDRIVE.REFUSE_AT;
    if (on) game.heatArc.kick(refused);
    if (on && refused) return;
    // Letting go of a press that was refused or burnt out has nothing left to switch off.
    if (!on && !odLive) return;
    odLive = on;
    renderer.cat.overdriveKick(on);
    if (on) renderer.overdriveBurst();
    audio.overdrive(on);
    if (!on) return;
    haptics.fire('light');
    tutorial.overdriveUsed();
    const seen = ['od1', 'od2', 'od3'].find((k) => !meta.tutorial[k]);
    const h = renderer.cat.poses[0];
    if (seen && renderer.project(h.x, 2.2, h.z, odPt)) {
      meta.tutorial[seen] = true;
      game.floaters.spawn(odPt.x, odPt.y, t('od.label'), 'od', 1.2);
    }
  });
  game.onCoinLand = (i) => audio.coinTick(i);
  renderer.stacks.onChunkLand = (_seg, height) => audio.land(height);
  game.openCollection = () => openCollection(game.modals, sim.state.maxLevelReached);
  game.listeners.push((e) => {
    juice(e, sim, renderer, audio, haptics);
    tutorial.onEvent(e);
    if (e.t === 'burnout') {
      odLive = false;
      // The first burnout explains itself.
      if (!meta.tutorial.odBurnout) {
        meta.tutorial.odBurnout = true;
        game.toasts.show(t('od.burnoutHint'), 5000);
        saves.saveSoon();
      }
    }
    if ((e.t === 'merged' && e.firstTime) || e.t === 'farmFinished') portal.happy();
    if (e.t === 'merged' && e.firstTime) {
      // Let the player see the merge land before the celebration dialog covers it.
      setTimeout(() => {
        audio.levelUp();
        openNewLevel(game.modals, e.level);
      }, 700);
    }
  });
  const metaFlows = installMetaFlows(sim, game, meta, saves);
  let tutAcc = 0;
  // Developer performance overlay (Settings → tap the version 7×, or ?perf=1): off for players.
  let perf: PerfOverlay | null = null;
  let perfAcc = 0;
  let perfFrames = 0;
  const syncPerf = (s: Settings) => {
    const on = s.perfOverlay || params.has('perf');
    if (on && !perf) perf = new PerfOverlay(root);
    if (!on && perf) {
      perf.remove();
      perf = null;
    }
  };
  game.settingsListeners.push(syncPerf);
  syncPerf(settings);

  // The route the renderer is showing (to find the freshly grown stretches when it changes).
  let shownPath = sim.path;
  const onEvent = (e: SimEvent) => {
    if (e.t === 'routeGrew') {
      renderer.onRouteGrew(e.plots, shownPath);
      shownPath = sim.path;
    }
    if (e.t === 'traveled') {
      renderer.onFarmChanged();
      audio.setFlavour(sim.farm.biome);
      shownPath = sim.path;
    }
    game.onEvent(e);
    if (SAVE_EVENTS.has(e.t)) saves.saveSoon();
  };

  // A per-frame exception must never fail silently (blank screen): log it and surface it, at most every 10 s.
  let lastErrAt = -Infinity;
  const reportError = (where: string, e: unknown) => {
    console.error(where, e);
    const now = performance.now();
    if (now - lastErrAt < 10_000) return;
    lastErrAt = now;
    game.toasts.show(`${where}: ${e instanceof Error ? e.message : String(e)}`, 6000);
  };

  const loop = new Loop(
    (dt) => {
      // During the farm-finished celebration the crawler coasts, whatever the fingers do.
      const held = input.effective && !game.celebrating;
      if (held) {
        input.totalHeld += dt;
        input.lastHeldAt = performance.now();
      }
      try {
        sim.step(dt, { throttleHeld: held, overdrive: held && input.effectiveOverdrive });
        ads.addPlaytime(dt);
        for (const e of sim.drainEvents()) onEvent(e);
      } catch (e) {
        reportError('step', e);
      }
    },
    (alpha, dt, now, budgetMs) => {
      try {
        for (const e of sim.drainEvents()) onEvent(e);
        renderer.frame(alpha, dt, now, budgetMs);
        game.frame(dt);
        juiceFrame(sim, audio, input.effective || sim.state.boosts.autopilot > 0, renderer, loop.simPaused);
        // Battery: a dialog, or half a minute without a touch (and no autopilot), only needs 30 fps.
        const idle = sim.state.boosts.autopilot <= 0 && !input.effective && performance.now() - lastInputAt > 30_000;
        const cap = pause.has('modal') || idle ? 30 : 60;
        if (loop.maxFps !== cap) loop.maxFps = cap;
        metaFlows.frame();
        if (perf) {
          perfAcc += dt;
          if (perfAcc >= 0.5) {
            const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
            const gl = renderer.renderer.domElement;
            perf.update({
              fps: (loop.frames - perfFrames) / perfAcc,
              cap: loop.maxFps,
              interval: loop.interval.summary(120),
              work: loop.work.summary(120),
              hitches: loop.interval.countAbove(50),
              bufferW: gl.width,
              bufferH: gl.height,
              pixelRatio: renderer.renderer.getPixelRatio(),
              maxRatio: renderer.dyn.max,
              tier: renderer.quality.tier,
              ...renderer.info,
              gpu: renderer.gpu,
              heapMB: memory ? { used: Math.round(memory.usedJSHeapSize / 1048576), limit: Math.round(memory.jsHeapSizeLimit / 1048576) } : null,
            });
            perfAcc = 0;
            perfFrames = loop.frames;
          }
        }
        tutAcc += dt;
        if (tutAcc > 0.5) {
          tutAcc = 0;
          if (!game.modals.open) tutorial.update();
        }
      } catch (e) {
        reportError('frame', e);
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
    if (!reasons.has('modal')) lastInputAt = performance.now();
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
      adAvailable: () => ads.ready('offline_x3'),
      collect: async (mult) => {
        if (mult > 1 && !(await game.rewarded('offline_x3'))) return false;
        sim.execute({ c: 'grantCoins', amount: r.coins * mult, reason: 'offline' });
        saves.saveSoon(200);
        return true;
      },
    });
  };

  let hiddenAt = 0;
  step('lifecycle');
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
        ads.foreground();
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

  // Compile every shader behind the loading screen (in parallel where the driver can) so first-time effects
  // don't stutter — bounded, so a slow driver can never keep the loading screen up.
  step('shaders');
  await Promise.race([renderer.warmupAsync().catch((e: unknown) => console.warn('warmup', e)), new Promise((r) => setTimeout(r, 6000))]);

  step('start');
  loop.start();
  void hideSystemBars();
  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    step('running');
    document.documentElement.dataset.ready = '1';
    const splash = document.getElementById('boot-splash');
    splash?.classList.add('hide');
    setTimeout(() => splash?.remove(), 400);
    try {
      portal.firstFrame();
      portal.gameReady();
      portal.gameplay(true);
    } catch (e) {
      console.warn('portal', e);
    }
    if (loaded.ok) checkOffline(clock.wall() - loaded.save.savedAtWall);
    setTimeout(() => metaFlows.maybeShowDaily(), 1200);
  };
  requestAnimationFrame(reveal);
  // rAF can stall on Android while the native splash still blocks drawing: never let the loading screen wait on it.
  setTimeout(reveal, 1200);
  if (provider.name !== 'crazygames') void ads.init();
  saves.startAutosave();

  const app: App = { sim, renderer, loop, pause, input, game, ads, saves, meta, settings, checkOffline };
  if (debug) {
    const { installDebug } = await import('./debug.ts');
    installDebug(app);
  }
  return app;
}
