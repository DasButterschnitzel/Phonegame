import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

function imports(src: string): string[] {
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  const out: string[] = [];
  for (const m of src.matchAll(re)) out.push(m[1] ?? m[2] ?? '');
  return out;
}

function files(sub: string): string[] {
  try {
    return walk(join(root, 'src', sub));
  } catch {
    return [];
  }
}

describe('architecture boundaries', () => {
  it('game/ and shared/ are pure (no three, DOM layers, wall clock or Math.random)', () => {
    const bad: string[] = [];
    for (const f of [...files('game'), ...files('shared')]) {
      const src = readFileSync(f, 'utf8');
      for (const spec of imports(src)) {
        if (spec === 'three' || /\/(render|ui|platform|app)\//.test(spec) || spec.startsWith('@capacitor')) {
          bad.push(`${relative(root, f)} imports ${spec}`);
        }
      }
      const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/\bDate\.now\b|\bMath\.random\b|\bperformance\.now\b|\bnew Date\(/.test(code)) {
        bad.push(`${relative(root, f)} uses non-deterministic time/random`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('render/ never imports ui/ or platform/; ui/ never imports three', () => {
    const bad: string[] = [];
    for (const f of files('render')) {
      for (const spec of imports(readFileSync(f, 'utf8'))) {
        if (/\/(ui|platform|app)\//.test(spec)) bad.push(`${relative(root, f)} imports ${spec}`);
      }
    }
    for (const f of files('ui')) {
      for (const spec of imports(readFileSync(f, 'utf8'))) {
        if (spec === 'three' || spec.startsWith('three/')) bad.push(`${relative(root, f)} imports ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
