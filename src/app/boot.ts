import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '../ui/styles/base.css';
import '../ui/styles/hud.css';
import '../ui/styles/modals.css';
import { Sim, newGameState } from '../game/sim.ts';
import type { SimEvent } from '../game/types.ts';
import { GameRenderer } from '../render/Renderer.ts';
import { Loop } from './loop.ts';
import { PauseController } from './pause.ts';
import { ThrottleInput } from './input.ts';
import { GameController } from './game.ts';
import { AdManager } from '../platform/ads/AdManager.ts';
import { newPolicyState } from '../platform/ads/AdPolicy.ts';
import { createAdService, type ProviderName } from '../platform/ads/select.ts';
import { defaultSettings } from '../platform/settings.ts';
import { setLang, t } from '../platform/i18n/i18n.ts';

export interface App {
  sim: Sim;
  renderer: GameRenderer;
  loop: Loop;
  pause: PauseController;
  input: ThrottleInput;
  game: GameController;
  ads: AdManager;
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export async function boot(): Promise<App | null> {
  const root = document.getElementById('app')!;
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  const settings = defaultSettings();
  const langParam = params.get('lang');
  if (langParam === 'en' || langParam === 'de') settings.lang = langParam;
  setLang(settings.lang);
  if (!hasWebGL()) {
    const div = document.createElement('div');
    div.className = 'fatal';
    div.textContent = t('webgl.missing');
    root.appendChild(div);
    return null;
  }
  const sim = new Sim(newGameState(Number(params.get('seed')) || 0x5eed));
  const quality = (params.get('quality') as 'low' | 'med' | 'high' | null) ?? (settings.quality === 'auto' ? undefined : settings.quality);
  const renderer = new GameRenderer(canvas, sim, quality);
  const pause = new PauseController();
  const input = new ThrottleInput(root);

  const provider = await createAdService(import.meta.env.VITE_AD_PROVIDER as ProviderName);
  const ads = new AdManager(provider, newPolicyState(), {
    onAdStart: () => pause.add('ad'),
    onAdEnd: () => pause.remove('ad'),
    now: () => performance.now() / 1000,
    wallNow: () => Date.now() / 1000,
  });

  const game = new GameController({
    sim,
    renderer,
    loop: null as unknown as Loop,
    pause,
    input,
    ads,
    settings,
    saveSettings: () => {},
    resetProgress: () => location.reload(),
    isDailyAvailable: () => false,
  });

  const onEvent = (e: SimEvent) => {
    if (e.t === 'stageChanged') renderer.onStageChanged();
    if (e.t === 'traveled') renderer.onFarmChanged();
    game.onEvent(e);
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
      // Events from direct UI commands (sim.execute) arrive between steps.
      for (const e of sim.drainEvents()) onEvent(e);
      renderer.frame(alpha, dt, now, frameMs);
      game.frame(dt);
    },
  );
  (game.d as { loop: Loop }).loop = loop;
  pause.onChange((paused, reasons) => {
    loop.simPaused = paused;
    if (reasons.has('background')) loop.stop();
    else if (!loop.running) loop.start();
  });

  const resize = () => renderer.resize(root.clientWidth, root.clientHeight);
  new ResizeObserver(resize).observe(root);
  resize();

  loop.start();
  requestAnimationFrame(() => {
    const splash = document.getElementById('boot-splash');
    splash?.classList.add('hide');
    setTimeout(() => splash?.remove(), 400);
  });
  void ads.init();

  const app: App = { sim, renderer, loop, pause, input, game, ads };
  if (import.meta.env.VITE_DEBUG_HOOKS === 'true' || params.has('debug')) {
    const { installDebug } = await import('./debug.ts');
    installDebug(sim, renderer, loop, input);
  }
  return app;
}
