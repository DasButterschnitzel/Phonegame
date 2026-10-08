import { describe, expect, it } from 'vitest';
import { BIOMES as LOOKS, RED_BARN, type Biome } from './palette.ts';
import { readyBiomes, type BiomeDef } from '../game/world/biomes.ts';

/**
 * The duplication detector: two biome families must differ in at least three major ways — what grows there, the
 * trees, the props, the landmark, the rocks, the weather, the barn, the shape of the farms — so a family can never be
 * a palette swap of another.
 */
const MIN_DIFFERENCES = 3;

const jaccard = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n || 1);
};
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const cosine = (a: Record<string, number>, b: Record<string, number>) => {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    ab += (a[k] ?? 0) * (b[k] ?? 0);
    aa += (a[k] ?? 0) ** 2;
    bb += (b[k] ?? 0) ** 2;
  }
  return ab / Math.sqrt(aa * bb || 1);
};

/** The major ways two families differ (palette changes do not count). */
export function differences(a: BiomeDef, la: Biome, b: BiomeDef, lb: Biome): string[] {
  const out: string[] = [];
  if (jaccard(new Set(a.crops.flat()), new Set(b.crops.flat())) < 0.5) out.push('crops');
  if (!sameSet(new Set([la.decor, la.decor2 ?? la.decor]), new Set([lb.decor, lb.decor2 ?? lb.decor]))) out.push('trees');
  if (!sameSet(new Set((la.props ?? []).map((p) => p.kind)), new Set((lb.props ?? []).map((p) => p.kind)))) out.push('props');
  if ((la.landmark ?? 'windmill') !== (lb.landmark ?? 'windmill')) out.push('landmark');
  if ((la.rock ?? 'stone') !== (lb.rock ?? 'stone')) out.push('rocks');
  if ((la.weather ?? 'none') !== (lb.weather ?? 'none')) out.push('weather');
  const da = la.depot ?? RED_BARN;
  const db = lb.depot ?? RED_BARN;
  if (da.wall !== db.wall || da.roof !== db.roof) out.push('barn');
  if (cosine(a.layouts, b.layouts) < 0.95) out.push('layouts');
  return out;
}

describe('biome families', () => {
  const fams = readyBiomes();

  it('every scheduled family has its own look', () => {
    for (const b of fams) expect(LOOKS[b.id], b.id).toBeTruthy();
  });

  it(`no family is a near-copy of another (≥ ${MIN_DIFFERENCES} major differences, palette not counted)`, () => {
    const weak: string[] = [];
    for (let i = 0; i < fams.length; i++)
      for (let j = i + 1; j < fams.length; j++) {
        const a = fams[i];
        const b = fams[j];
        const d = differences(a, LOOKS[a.id]!, b, LOOKS[b.id]!);
        if (d.length < MIN_DIFFERENCES) weak.push(`${a.id} ~ ${b.id}: only ${d.join(', ') || 'nothing'}`);
      }
    expect(weak).toEqual([]);
  });

  it('a palette swap is caught', () => {
    const a = fams.find((b) => b.id === 'vineyard')!;
    const swapped: Biome = { ...LOOKS.vineyard!, sky: 0xff00ff, groundA: 0x00ff00, outside: 0x0000ff };
    expect(differences(a, LOOKS.vineyard!, { ...a }, swapped)).toEqual([]);
  });
});
