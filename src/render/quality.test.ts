import { describe, it, expect } from 'vitest';
import { DynamicResolution, pixelBudgetRatio, settingsFor, tierFromGpu } from './quality.ts';

describe('GPU tier detection', () => {
  it.each([
    ['Adreno (TM) 610', 'low'],
    ['Adreno (TM) 613', 'low'],
    ['Adreno (TM) 619', 'med'],
    ['Adreno (TM) 642L', 'med'],
    ['Adreno (TM) 730', 'high'],
    ['Mali-G52 MC2', 'low'],
    ['Mali-G57 MC2', 'med'],
    ['Mali-G76 MP4', 'med'],
    ['Mali-G610 MC6', 'med'],
    ['Mali-G710 MC10', 'high'],
    ['Mali-T830', 'low'],
    ['Immortalis-G715', 'high'],
    ['PowerVR Rogue GE8320', 'low'],
    ['Imagination DXT-48-1536', 'med'],
    ['Google SwiftShader', 'low'],
  ])('%s → %s', (gpu, tier) => {
    expect(tierFromGpu(gpu)).toBe(tier);
  });
  it('unknown desktop GPUs are left to the heuristics', () => {
    expect(tierFromGpu('ANGLE (NVIDIA GeForce RTX 3060)')).toBeNull();
  });
  it('every tier has settings, unknown input falls back to medium', () => {
    expect(settingsFor('low').wind).toBe(false);
    expect(settingsFor('foo' as 'low').tier).toBe('med');
  });
});

describe('dynamic resolution', () => {
  it('steps down when frames miss the budget and back up with headroom', () => {
    const d = new DynamicResolution(1.5);
    let r: number | null = null;
    for (let i = 0; i < 200 && r === null; i++) r = d.sample(25, 16.7);
    expect(r).toBe(1.25);
    r = null;
    for (let i = 0; i < 2000 && r === null; i++) r = d.sample(16.7, 16.7);
    expect(r).toBe(1.5);
  });
  it('tablets get a pixel budget', () => {
    expect(pixelBudgetRatio(2, 412, 915)).toBe(2);
    expect(pixelBudgetRatio(2, 800, 1280)).toBeCloseTo(1.25, 2);
  });
});
