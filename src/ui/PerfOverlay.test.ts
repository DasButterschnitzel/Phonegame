import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { perfText, type PerfSnapshot } from './PerfOverlay.ts';

const pct = { median: 16.7, p95: 18, p99: 22, worst: 40 };
/** Every field the overlay may show. Adding one to PerfSnapshot makes this fail to typecheck — review it here. */
const sample: Required<PerfSnapshot> = {
  fps: 59.6,
  cap: 60,
  interval: pct,
  work: pct,
  hitches: 1,
  bufferW: 1080,
  bufferH: 2400,
  pixelRatio: 2.5,
  maxRatio: 2.75,
  tier: 'medium',
  drawCalls: 38,
  triangles: 151_000,
  gpu: 'Adreno (TM) 730',
  heapMB: { used: 81, limit: 512 },
};
const ALLOWED = ['fps', 'cap', 'interval', 'work', 'hitches', 'bufferW', 'bufferH', 'pixelRatio', 'maxRatio', 'tier', 'drawCalls', 'triangles', 'gpu', 'heapMB'];

describe('performance overlay (reachable in release builds)', () => {
  it('shows local performance data only', () => {
    expect(Object.keys(sample).sort()).toEqual([...ALLOWED].sort());
    const text = perfText(sample);
    expect(text.split('\n')).toHaveLength(6);
    expect(text).toContain('60 fps');
    expect(text).toContain('GPU Adreno (TM) 730');
  });

  it('cannot reach ad configuration, consent state or identifiers', () => {
    const src = readFileSync(new URL('./PerfOverlay.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from '[^']*(ads|consent|admob|storage|settings)[^']*'/i);
    expect(perfText(sample)).not.toMatch(/ca-app-pub|pub-\d|consent|advertis|android_id|device ?id/i);
  });
});
