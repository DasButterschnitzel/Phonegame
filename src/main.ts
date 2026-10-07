import { boot } from './app/boot.ts';
import { hideNativeSplash } from './platform/native.ts';

// Hide the native launch splash immediately — index.html already shows a loading screen.
// Never tie this to requestAnimationFrame: the native splash blocks WebView drawing on Android 12+.
void hideNativeSplash();

boot().catch((err: unknown) => {
  console.error(err);
  void hideNativeSplash();
  document.getElementById('boot-splash')?.remove();
  const div = document.createElement('div');
  div.className = 'fatal';
  div.textContent = `Oops — Crop Crawler failed to start. Please reload. (${err instanceof Error ? err.message : String(err)})`;
  document.getElementById('app')?.appendChild(div);
});
