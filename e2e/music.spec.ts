import { test, expect, type Page } from '@playwright/test';
import { ready, g } from './helpers.ts';

/** A short, quiet tone as a WAV file, made here: the repository ships no music files. */
function wav(seconds: number, hz: number): Buffer {
  const rate = 8000;
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 1500), 44 + i * 2);
  return b;
}

type MusicState = { source: string; files: { file: string | null; playing: boolean; fading: number; index: number } | null };
const music = (page: Page) => g<MusicState>(page, 'g.app.audio.musicState()');

test('custom music: a playlist plays in order, crossfades on biome change, pauses for ads and the background, falls back to procedural', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel7', 'one device is enough');
  test.setTimeout(60_000);
  await page.route('**/music/*.wav', (r) => {
    const name = new URL(r.request().url()).pathname.split('/').pop();
    if (name === 'missing.wav') return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: 'audio/wav', body: wav(name === 'c.wav' ? 3 : 0.7, name === 'b.wav' ? 523 : 440) });
  });
  const source = { kind: 'playlist', files: ['a.wav', 'b.wav'], byBiome: { pumpkin: 'c.wav' } };
  await ready(page, `&adms=2500&music=${encodeURIComponent(JSON.stringify(source))}`);
  // Audio starts with the first touch (autoplay rules).
  await page.mouse.click(30, 300);
  await expect.poll(() => music(page)).toMatchObject({ source: 'playlist', files: { file: 'a.wav', playing: true } });
  // The playlist moves on when a file ends, and wraps around.
  await expect.poll(() => music(page), { timeout: 8000 }).toMatchObject({ files: { file: 'b.wav' } });
  await expect.poll(() => music(page), { timeout: 8000 }).toMatchObject({ files: { file: 'a.wav', index: 2 } });

  // A rewarded ad pauses the music; it resumes after.
  await g(page, 'g.grant(1e6)');
  await page.locator('.chip-autopilot').click();
  await page.locator('.modal-bonus .bonus-ad').click();
  await expect(page.locator('.ad-overlay')).toBeVisible();
  await expect.poll(() => music(page)).toMatchObject({ files: { playing: false } });
  await expect(page.locator('.ad-overlay')).toBeHidden({ timeout: 8000 });
  await expect.poll(() => music(page)).toMatchObject({ files: { playing: true } });

  // The background suspends it; the music setting switches it off and on.
  await g(page, "g.app.pause.add('background')");
  await expect.poll(() => music(page)).toMatchObject({ files: { playing: false } });
  await g(page, "g.app.pause.remove('background')");
  await expect.poll(() => music(page)).toMatchObject({ files: { playing: true } });
  await g(page, 'g.app.audio.setEnabled(true, false)');
  await expect.poll(() => music(page)).toMatchObject({ files: { playing: false } });
  await g(page, 'g.app.audio.setEnabled(true, true)');
  await expect.poll(() => music(page)).toMatchObject({ files: { playing: true } });

  // Travel to a biome with its own track: crossfade, then it loops.
  await g(page, "g.app.audio.setFlavour('pumpkin')");
  await expect.poll(() => music(page)).toMatchObject({ files: { file: 'c.wav', fading: 1 } });
  await expect.poll(() => music(page), { timeout: 6000 }).toMatchObject({ files: { file: 'c.wav', fading: 0, playing: true } });

  // A file that cannot play hands the music back to the procedural tunes.
  await g(page, "g.app.audio.useMusic({ kind: 'track', file: 'missing.wav' })");
  await expect.poll(() => music(page)).toMatchObject({ source: 'track', files: null });
});
