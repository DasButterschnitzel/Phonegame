/**
 * Long sessions and ad pressure — the bot plays, the real interstitial policy decides, on sim time:
 *   node scripts/sessions.ts [--profiles noAds,active,casual,ads,idle,twoFinger] [--hours 10] [--seed 1] [--md out.md] [--assert]
 *
 * One long run per profile (in parallel) records every moment the app offers an interstitial — the end of a barn
 * unload (checked 1.1 s later, skipped while the throttle or a tap was used in the last 3 s) and closing a lucky-bug
 * dialog — plus what the policy watches: unloads, big moments (route growth, merges, new fields, FINAL HARVEST, farm
 * finished) and rewarded ads. A farm's completion leads into travel and never gets one. The policy (AdPolicy.ts) is
 * then replayed over sessions of 30 min, 1 h and 2 h that start on a fresh install, at the start of the World Tour
 * and at farm #20, each with its own warm-up. The question: does the endless World Tour add ad pressure?
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROFILES, runBot } from '../src/game/bot/bot.ts';
import type { ProfileId } from '../src/game/bot/bot.ts';
import { ordinalOf } from '../src/game/world/journey.ts';
import { DEFAULT_POLICY as cfg, canShowInterstitial, newPolicyState, onInterstitialShown, onRewardedShown, onUnload } from '../src/platform/ads/AdPolicy.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const HOURS = Number(arg('hours', '10'));
const SEED = Number(arg('seed', '1'));
const BIG = new Set(['routeGrew', 'merged', 'zoneOpened', 'finalHarvest', 'farmFinished']);

/** What happened when (sim seconds). */
interface Timeline {
  unloads: number[];
  gifts: number[];
  big: number[];
  rewarded: number[];
  actions: number[];
  /** Arrival time per farm number. */
  arrivals: Record<number, number>;
  /** Sampled throttle: held at t (10 Hz). */
  held: number[];
  end: number;
}

function child(id: ProfileId): void {
  const pr = PROFILES[id];
  const tl: Timeline = { unloads: [], gifts: [], big: [], rewarded: [], actions: [], arrivals: { 1: 0 }, held: [], end: 0 };
  const rep = runBot(pr, {
    farms: 1000,
    startFarm: 'meadow',
    minutes: HOURS * 60,
    dt: 1 / 15,
    seed: SEED,
    onEvent: (e, t) => {
      if (e.t === 'unload') tl.unloads.push(t);
      if (BIG.has(e.t)) tl.big.push(t);
      if (e.t === 'traveled') tl.arrivals[ordinalOf(e.farm)] = t;
    },
    onAction: (a, t) => {
      tl.actions.push(t);
      if (a.kind === 'gift') tl.gifts.push(t);
      if (a.kind === 'ad') tl.rewarded.push(t);
    },
  });
  for (let t = 0; t < HOURS * 3600; t += 0.1) tl.held.push(pr.held(t) ? 1 : 0);
  tl.end = rep.farms.reduce((s, f) => s + f.seconds, 0);
  process.stdout.write(JSON.stringify(tl));
}

/** Seconds since the throttle was last held, or a tap/purchase happened, before t (capped at 99). */
function sinceInput(tl: Timeline, t: number, actionIdx: { i: number }): number {
  let s = 99;
  for (let k = Math.floor(t * 10); k >= 0 && t - k / 10 < 99; k--)
    if (tl.held[k]) {
      s = t - k / 10;
      break;
    }
  while (actionIdx.i + 1 < tl.actions.length && tl.actions[actionIdx.i + 1] <= t) actionIdx.i++;
  const last = tl.actions[actionIdx.i];
  if (last !== undefined && last <= t) s = Math.min(s, t - last);
  return s;
}

interface SessionResult {
  start: string;
  t0: number;
  counts: Record<'m30' | 'h1' | 'h2', number>;
  maxRollingHour: number;
}

/** Replay the interstitial policy over one session [t0, t0 + 2 h). */
function session(tl: Timeline, t0: number, label: string): SessionResult | null {
  if (!(t0 + 1800 <= tl.end)) return null;
  const st = newPolicyState(t0);
  st.sessionStart = t0;
  // Breaks in time order: the unload check 1.1 s after the coins land, a lucky-bug dialog closing 0.35 s after.
  type Ev = { t: number; kind: 'unload' | 'break_unload' | 'break_dialog' | 'rewarded' };
  const evs: Ev[] = [];
  for (const t of tl.unloads) if (t >= t0) evs.push({ t, kind: 'unload' }, { t: t + 1.1, kind: 'break_unload' });
  for (const t of tl.gifts) if (t >= t0) evs.push({ t: t + 0.35, kind: 'break_dialog' });
  for (const t of tl.rewarded) if (t >= t0) evs.push({ t, kind: 'rewarded' });
  evs.sort((a, b) => a.t - b.t);
  const shown: number[] = [];
  const actionIdx = { i: -1 };
  let bigIdx = -1;
  for (const e of evs) {
    if (e.t >= t0 + 7200 || e.t >= tl.end) break;
    st.playtimeSec = e.t;
    if (e.kind === 'unload') {
      onUnload(st);
      continue;
    }
    if (e.kind === 'rewarded') {
      onRewardedShown(st, e.t, 'income_x2');
      continue;
    }
    while (bigIdx + 1 < tl.big.length && tl.big[bigIdx + 1] <= e.t) bigIdx++;
    const sinceBig = bigIdx >= 0 ? e.t - tl.big[bigIdx] : Infinity;
    const ok = canShowInterstitial(st, cfg, e.t, {
      kind: e.kind === 'break_unload' ? 'barn_unload' : 'dialog_closed',
      sinceThrottle: e.kind === 'break_unload' ? sinceInput(tl, e.t, actionIdx) : 99,
      tutorialActive: e.t < 300,
      modalOpen: false,
      wallNow: e.t,
      sinceBigMoment: sinceBig,
    }).ok;
    if (ok) {
      onInterstitialShown(st, e.t, e.t);
      shown.push(e.t);
    }
  }
  const within = (s: number) => shown.filter((t) => t < t0 + s).length;
  let maxRollingHour = 0;
  for (const t of shown) maxRollingHour = Math.max(maxRollingHour, shown.filter((u) => u >= t && u < t + 3600).length);
  return { start: label, t0, counts: { m30: within(1800), h1: within(3600), h2: within(7200) }, maxRollingHour };
}

const self = fileURLToPath(import.meta.url);
if (args.includes('--child')) child(arg('profile', 'noAds') as ProfileId);
else {
  const ids = arg('profiles', 'noAds,active,casual,ads,idle,twoFinger').split(',') as ProfileId[];
  const results = await Promise.all(
    ids.map(
      (id) =>
        new Promise<[ProfileId, Timeline]>((resolve, reject) => {
          const p = spawn(process.execPath, [self, '--child', '--profile', id, '--hours', String(HOURS), '--seed', String(SEED)], { stdio: ['ignore', 'pipe', 'inherit'] });
          let out = '';
          p.stdout.on('data', (d) => (out += d));
          p.on('exit', (code) => (code === 0 ? resolve([id, JSON.parse(out) as Timeline]) : reject(new Error(`${id} exited ${code}`))));
        }),
    ),
  );
  const lines = [`Long sessions and interstitials — policy: ≤ ${cfg.maxInterstitialsPerHour}/h, ${cfg.interstitialCooldownSec / 60} min apart, ${cfg.afterRewardedQuietSec / 60} min quiet after a rewarded ad (seed ${SEED}, ${HOURS} h per profile)`];
  lines.push('profile                    session starts at        30 min  1 h  2 h  max/rolling h');
  const errors: string[] = [];
  for (const [id, tl] of results) {
    const label = PROFILES[id].label;
    const starts: [string, number | undefined][] = [
      ['fresh install', 0],
      ['Starter Tour, farm #3', tl.arrivals[3]],
      ['World Tour start (#6)', tl.arrivals[6]],
      ['farm #20', tl.arrivals[20]],
    ];
    const rows: SessionResult[] = [];
    for (const [name, t0] of starts) {
      const r = t0 === undefined ? null : session(tl, t0, name);
      if (!r) {
        lines.push(`${label.padEnd(26)} ${name.padEnd(24)} (not reached in ${HOURS} h)`);
        continue;
      }
      rows.push(r);
      lines.push(`${label.padEnd(26)} ${name.padEnd(24)} ${String(r.counts.m30).padStart(6)} ${String(r.counts.h1).padStart(4)} ${String(r.counts.h2).padStart(4)} ${String(r.maxRollingHour).padStart(14)}`);
      if (r.maxRollingHour > cfg.maxInterstitialsPerHour) errors.push(`${label}: ${r.maxRollingHour} interstitials in an hour (${name})`);
    }
    // No added pressure: a World Tour session sees no more than a returning player's Starter Tour session of the same
    // length (a fresh install has its own first-play grace, so it is not the fair comparison).
    const base = rows.find((r) => r.start === 'Starter Tour, farm #3');
    for (const r of rows.filter((x) => x !== base))
      if (base && r.start !== 'fresh install' && r.counts.h2 > Math.max(base.counts.h2, 1) + 1) errors.push(`${label}: ${r.counts.h2} interstitials in 2 h from ${r.start} vs ${base.counts.h2} on the Starter Tour`);
  }
  lines.push('', `errors: ${errors.length}`, ...errors.map((e) => `  ${e}`));
  console.log(lines.join('\n'));
  const md = arg('md', '');
  if (md) writeFileSync(md, ['```', ...lines, '```', ''].join('\n'));
  if (args.includes('--assert') && errors.length) process.exitCode = 1;
}
