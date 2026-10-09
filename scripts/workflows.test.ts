import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Static audit of the CI workflows: where secrets may appear, and which workflow may build for production. */
const dir = new URL('../.github/workflows/', import.meta.url);
const workflows = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.yml')).map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]));
/** The `on:` block of a workflow. */
const triggers = (yml: string) => /^on:\n([\s\S]*?)^\S/m.exec(yml)?.[1] ?? '';

describe('workflows', () => {
  it('reference secrets only as step env values, never inside a script', () => {
    const bad: string[] = [];
    for (const [f, yml] of Object.entries(workflows)) {
      for (const line of yml.split('\n')) {
        if (!line.includes('secrets.')) continue;
        if (!/^\s+[A-Z][A-Z0-9_]*: \$\{\{ [^}]*secrets\.[A-Z0-9_]+[^}]* \}\}\s*$/.test(line)) bad.push(`${f}: ${line.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('never trace shell commands (that would echo secret values)', () => {
    for (const [f, yml] of Object.entries(workflows)) expect(yml, f).not.toMatch(/set -x|set -o xtrace|ACTIONS_STEP_DEBUG/);
  });

  it('a push can never build with live ads or production signing', () => {
    for (const [f, yml] of Object.entries(workflows)) {
      if (f === 'android-release.yml') continue;
      expect(yml, f).not.toContain('secrets.');
      expect(yml, f).not.toMatch(/--mode production/);
      // A step that builds a release never asks for production ads (the debug build may: it must ignore them).
      for (const step of yml.split(/\n {6}- /).filter((st) => /bundleRelease|assembleRelease/.test(st))) {
        expect(step, f).not.toMatch(/ADMOB_MODE: production|ADMOB_REAL: 'true'/);
      }
    }
  });

  it('production releases are manual and run in the protected production environment', () => {
    const yml = workflows['android-release.yml'];
    const on = triggers(yml);
    expect(on).toContain('workflow_dispatch');
    expect(on).not.toMatch(/push|pull_request|schedule|workflow_run|release:/);
    expect(yml).toContain('environment: production');
    expect(yml).toContain('--check-tags');
    expect(yml).toMatch(/--mode production --signed/);
  });

  it('every Android build is audited', () => {
    const android = workflows['android.yml'];
    expect(android).toContain('audit-android.ts --apk android/app/build/outputs/apk/debug/app-debug.apk --mode test --debuggable');
    expect(android).toMatch(/audit-android\.ts --apk "\$O\/apk_from_bundle\/release\/app-release-universal\.apk" --aab/);
    expect(workflows['android-release.yml']).toMatch(/audit-android\.ts --apk "\$O\/apk_from_bundle\/release\/app-release-universal\.apk" --aab/);
  });
});
