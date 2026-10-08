import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ready, g } from './helpers.ts';

type Measure = { rms: number; mean: number; peak: number; ms: number; centroid: number; low150: number; low300: number };

// Audio QA: every procedural sound rendered offline and measured. Loudness and spectra are guardrails, not a verdict
// on how it sounds — that still needs ears on a phone.
test('mix levels and spectra: a quiet, clean motor under every gameplay sound; varied bites', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel7', 'one device is enough');
  await ready(page);
  const r = await g<Record<string, Measure> & { variety: { spread: number } }>(page, 'g.audioQA()');
  mkdirSync('e2e-screens', { recursive: true });
  writeFileSync('e2e-screens/audio-qa.json', JSON.stringify(r, null, 2));
  // The motor sits under chomp, collapse, unload, coins, upgrade, merge and route growth.
  const louder = ['chomp', 'collapse', 'routeGrow', 'zoneOpen', 'unloadStart', 'unloadSeg', 'unloadDone', 'merge', 'coin', 'upgrade'];
  for (const k of louder) expect.soft(r.motorFull.rms, `motor vs ${k}`).toBeLessThan(r[k].rms - 6);
  expect(r.motorIdle.rms).toBeLessThan(r.motorFull.rms);
  // Phone speakers play little below ~150–300 Hz: the motor has nothing down there (no buzz, no "moped").
  for (const k of ['motorIdle', 'motorFull'] as const) {
    expect.soft(r[k].low300, `${k} energy below 300 Hz`).toBeLessThan(0.03);
    expect.soft(r[k].centroid, `${k} centroid`).toBeGreaterThan(700);
  }
  // No gameplay sound leans on sub-bass.
  for (const [k, v] of Object.entries(r)) if ('low150' in v) expect.soft((v as Measure).low150, `${k} energy below 150 Hz`).toBeLessThan(0.1);
  // Repeated bites vary; bigger crops sound lower; the last bite is its own, longer sound.
  expect.soft(r.variety.spread, 'bite variety').toBeGreaterThan(0.04);
  expect.soft(r.variety.spread, 'bite variety stays constrained').toBeLessThan(0.8);
  expect.soft(r.chompBig.centroid, 'big crops lower').toBeLessThan(r.chomp.centroid);
  expect.soft(r.collapse.ms, 'collapse rings longer than a bite').toBeGreaterThan(r.chomp.ms * 1.2);
  // Payoff moments carry the mix.
  expect(r.unloadDone.rms).toBeGreaterThan(r.chomp.rms - 3);
  // Arriving at a farm is a welcome, not a fanfare: clearly heard over the motor, under the zone-open crash.
  expect.soft(r.arrive.rms, 'arrival chime over the motor').toBeGreaterThan(r.motorFull.rms + 6);
  expect.soft(r.arrive.rms, 'arrival chime under the zone fanfare').toBeLessThan(r.zoneOpen.rms);
  // Music flavours: every family's tune plays as loud as the meadow tune and leans no more on bass.
  const { music, ambience } = r as unknown as { music: Record<string, Measure>; ambience: Record<string, Measure> };
  expect(Object.keys(music).length).toBeGreaterThanOrEqual(18);
  for (const [id, m] of Object.entries(music)) {
    expect.soft(Math.abs(m.mean - music.meadow.mean), `${id} loudness vs the meadow tune`).toBeLessThan(2);
    expect.soft(m.low150, `${id} energy below 150 Hz`).toBeLessThan(music.meadow.low150 + 0.05);
  }
  // Ambience is quiet — well under a bite, around the motor — but never silent, and has nothing low.
  for (const [k, a] of Object.entries(ambience)) {
    expect.soft(a.rms, `${k} under a bite`).toBeLessThan(r.chomp.rms - 8);
    expect.soft(a.rms, `${k} audible`).toBeGreaterThan(r.motorIdle.rms - 6);
    expect.soft(a.low150, `${k} energy below 150 Hz`).toBeLessThan(0.05);
  }
});
