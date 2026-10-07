import { boot } from './app/boot.ts';

boot().catch((err: unknown) => {
  console.error(err);
  const div = document.createElement('div');
  div.className = 'fatal';
  div.textContent = 'Oops — Crop Crawler failed to start. Please reload.';
  document.getElementById('app')?.appendChild(div);
});
