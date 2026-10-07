import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ready, g } from './helpers.ts';

// Audio QA: every procedural sound rendered offline and measured. The motor must sit under everything else.
test('mix levels: motor is among the quietest sounds, rewards are the loudest', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel7', 'one device is enough');
  await ready(page);
  const r = await g<Record<string, { rms: number; peak: number }>>(page, 'g.audioQA()');
  mkdirSync('e2e-screens', { recursive: true });
  writeFileSync('e2e-screens/audio-qa.json', JSON.stringify(r, null, 2));
  const louder = ['chomp', 'collapse', 'routeGrow', 'zoneOpen', 'unloadStart', 'unloadSeg', 'unloadDone', 'merge', 'coin'];
  for (const k of louder) expect.soft(r.motorFull.rms, `motor vs ${k}`).toBeLessThan(r[k].rms - 6);
  expect(r.motorIdle.rms).toBeLessThan(r.motorFull.rms);
  // Payoff moments carry the mix.
  expect(r.unloadDone.rms).toBeGreaterThan(r.chomp.rms - 3);
  for (const v of Object.values(r)) expect(v.peak).toBeLessThan(0.5);
});
